// Manually-invoked script — NOT part of `npm test`, NOT run in CI.
//
// Closes a gap a reviewer correctly flagged: realFullFixtureChecks.ts proves
// a REVOKED grant denies LIVE access against real DynamoDB (Finding 1), but
// it never actually restores stale data — so it is not evidence that a
// restored backup predating the revocation still gets denied. That claim
// requires the real T0→T1→T2→T3 sequence this script runs:
//
//   T0: seed a fresh active record; take a real CreateBackupCommand backup
//       WHILE the grant is still active.
//   T1: revoke ONLY the grant (revokeConsentGrant) against live data — the
//       record itself is left otherwise fully publishable (not withdrawn,
//       not deleted); confirm the live register now denies.
//   T2: RestoreTableFromBackupCommand into a fresh disposable table. The
//       restored grant row is from BEFORE the revocation, so it looks
//       unrevoked (revokedAt: null) — confirmed explicitly, so this test
//       can't trivially pass because the restored data already looks denied.
//   T3: evaluatePermission AND reconcileRestoredRecords, BOTH run against
//       the restored store + the LIVE (untouched) register, must deny —
//       proving the register's revokedConsentIds (not anything in the
//       restored row) is what's actually doing the work.
//
// Same disposability pattern as realBackupRestoreDrill.ts: the temporary
// restored table and backup are deleted at the end; the live primary/
// register tables and the one seeded-then-revoked record are left in place.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... npx tsx backend/src/scripts/realGrantRevocationRestoreDrill.ts
import {
  CreateBackupCommand,
  DeleteBackupCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  RestoreTableFromBackupCommand,
  TagResourceCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { revokeConsentGrant } from "../services/lifecycle";
import { evaluatePermission } from "../services/permissions";
import { reconcileRestoredRecords } from "../services/restore";
import type { ExportedRecordEnvelope } from "../services/export";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
const STATUS_INDEX = process.env.TIRO_STATUS_INDEX ?? "GSI1-status-index";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function log(step: string, message: string, data?: unknown): void {
  console.log(`\n[${step}] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same rationale as realBackupRestoreDrill.ts: tagging a freshly-restored
// table leaves it in a transient "in use" lock not reflected in TableStatus.
async function retryOnResourceInUse<T>(action: () => Promise<T>, maxAttempts = 6): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof ResourceInUseException && attempt < maxAttempts) {
        const delayMs = attempt * 2000;
        log("retry", `ResourceInUseException, attempt ${attempt}/${maxAttempts} — waiting ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const client = new DynamoDBClient({ region: REGION });
  const fixtureStore = new DynamoFixtureStore({
    client,
    primaryTableName: PRIMARY_TABLE,
    statusIndexName: STATUS_INDEX,
  });
  const registerStore = new DynamoRestrictionRegisterStore({ client, tableName: REGISTER_TABLE });

  // ---------------------------------------------------------------- T0 ----
  const [active] = buildSeedFixtures();
  const recordId = active.record.recordId;
  const consentId = active.consentGrants[0].consentId;
  await seedStore(fixtureStore, registerStore, [active]);
  log("T0", "Seeded one active fixture into REAL DynamoDB", { recordId, consentId });

  const preRevokeDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T0", "Pre-revocation permission check", preRevokeDecision);
  if (!preRevokeDecision.allowed) {
    throw new Error("Sanity check failed: T0 state must be authorized before the drill can mean anything.");
  }

  const backupName = `t0-grant-revocation-backup-${Date.now()}`;
  const createBackupResult = await client.send(
    new CreateBackupCommand({ TableName: PRIMARY_TABLE, BackupName: backupName }),
  );
  const backupArn = createBackupResult.BackupDetails?.BackupArn;
  if (!backupArn) {
    throw new Error("CreateBackup did not return a BackupArn.");
  }
  log("T0", "Real DynamoDB backup created WHILE the grant is still active", { backupName, backupArn });

  // ---------------------------------------------------------------- T1 ----
  // Revoke ONLY the grant — never withdraw() or startDeletion(). The record
  // itself must remain otherwise fully publishable; only this one grant's
  // revocation should be what denies access.
  await revokeConsentGrant(fixtureStore, registerStore, {
    requestId: `real-grant-revocation-drill-${Date.now()}`,
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] real AWS grant-revocation restore drill",
    consentId,
  });

  const liveRegisterAfterRevoke = await registerStore.getCurrent(recordId);
  log("T1", "Revoked the grant against LIVE data (after the backup was taken)", liveRegisterAfterRevoke);
  if (liveRegisterAfterRevoke?.currentPublicationStatus !== "published") {
    throw new Error(
      "Sanity check failed: the record must remain otherwise publishable (currentPublicationStatus still " +
        `"published") after a grant-level revocation — got "${liveRegisterAfterRevoke?.currentPublicationStatus}".`,
    );
  }

  const postRevokeDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T1", "Post-revocation permission check against LIVE data", postRevokeDecision);
  if (postRevokeDecision.allowed) {
    throw new Error("Sanity check failed: T1 state must be denied, or T2/T3 prove nothing.");
  }

  // ---------------------------------------------------------------- T2 ----
  const restoredTableName = `${PRIMARY_TABLE}-grant-revocation-restored-${Date.now()}`;
  await client.send(
    new RestoreTableFromBackupCommand({ TargetTableName: restoredTableName, BackupArn: backupArn }),
  );
  log("T2", "RestoreTableFromBackup requested; waiting for the new table to become ACTIVE", { restoredTableName });
  await waitUntilTableExists({ client, maxWaitTime: 900 }, { TableName: restoredTableName });

  const restoredStore = new DynamoFixtureStore({
    client,
    primaryTableName: restoredTableName,
    statusIndexName: STATUS_INDEX,
  });
  const restoredGrant = (await restoredStore.listConsentGrants(recordId)).find((g) => g.consentId === consentId);
  // Not `restoredGrant?.revokedAt ?? "MISSING"` — that's the same undefined/null
  // confusion Finding (3) of this review round caught elsewhere: `??` treats an
  // actually-present `revokedAt: null` (the expected, correct outcome here) the
  // same as a genuinely missing grant, logging "MISSING" either way.
  log("T2", "Restored grant's content (expected: OLD, pre-revocation, revokedAt: null)", {
    revokedAt: restoredGrant === undefined ? "MISSING (grant not found)" : restoredGrant.revokedAt,
  });
  if (restoredGrant === undefined || restoredGrant.revokedAt !== null) {
    throw new Error(
      "Sanity check failed: the restored grant must exist and show revokedAt: null (stale, pre-revocation) — " +
        "if it doesn't, this isn't testing what it claims to.",
    );
  }

  const describeResult = await client.send(new DescribeTableCommand({ TableName: restoredTableName }));
  await client.send(
    new TagResourceCommand({
      ResourceArn: describeResult.Table?.TableArn,
      Tags: [
        { Key: "project", Value: "tiro-fixture-backend" },
        { Key: "drillArtifact", Value: "true" },
        { Key: "syntheticOnly", Value: "true" },
      ],
    }),
  );

  // ---------------------------------------------------------------- T3 ----
  // Both checks run against the RESTORED store + the LIVE (untouched)
  // register — never a register derived from the restore.
  const finalDecision = await evaluatePermission(restoredStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T3", "evaluatePermission against the RESTORED store + the LIVE register", finalDecision);

  const envelope: ExportedRecordEnvelope = {
    record: (await restoredStore.getRecord(recordId))!,
    authorityClaims: [],
    legalRights: [],
    consentGrants: [restoredGrant],
    custodyCopies: [],
    auditReceipts: [],
    mediaObjects: [],
    mediaObjectsSkipped: [],
    corrections: [],
    redactions: [],
    controlStateAtExport: {
      publicationStatus: "published",
      custodyStatus: "preserved",
      restrictedPurposes: [],
      controlVersion: 1,
    },
  };
  const reconciliation = await reconcileRestoredRecords(restoredStore, registerStore, [envelope], {
    purpose: "publication",
    audience: "public",
  });
  log("T3", "reconcileRestoredRecords against the RESTORED store + the LIVE register", reconciliation[0]);

  const drillPassed = !finalDecision.allowed && !reconciliation[0].servable;

  // ------------------------------------------------------------ Cleanup ---
  log("cleanup", "Deleting the disposable restored table and backup (never the original tables)");
  await retryOnResourceInUse(() => client.send(new DeleteTableCommand({ TableName: restoredTableName })));
  await waitUntilTableNotExists({ client, maxWaitTime: 300 }, { TableName: restoredTableName });
  await client.send(new DeleteBackupCommand({ BackupArn: backupArn }));
  log("cleanup", "Done");

  if (!drillPassed) {
    throw new Error(
      "DRILL FAILED: restored content predating a grant revocation was servable despite the live revocation. " +
        "This is the exact failure this drill exists to prevent.",
    );
  }
  console.log(
    "\n=== DRILL PASSED: a real DynamoDB backup taken before a grant-level revocation does not revive " +
      "access after restore (evaluatePermission AND reconcileRestoredRecords both deny, using the live register). ===",
  );
}

main().catch((error) => {
  console.error("\nDrill script failed:", error);
  process.exitCode = 1;
});
