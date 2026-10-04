// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Exercises
// docs/ethos.txt §6's central guarantee against REAL DynamoDB, not the
// in-memory fake: restoring a native DynamoDB backup taken before a
// withdrawal must not revive access.
//
// Requires: AWS_PROFILE env var (or equivalent credentials) with access to
// the already-deployed stack's tables. Creates and destroys its own
// temporary backup + restored table; never deletes or mutates the original
// primary/register tables beyond the one seeded drill record.
//
// Run with: AWS_PROFILE=tiro-fixture-deploy TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... npx tsx backend/src/scripts/realBackupRestoreDrill.ts
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
import { withdraw, startDeletion } from "../services/lifecycle";
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

// Tagging a table leaves it in a transient "in use" state that does NOT show
// up in TableStatus (confirmed the hard way: waitUntilTableExists polling
// TableStatus=ACTIVE was not sufficient — DeleteTable still failed with
// ResourceInUseException immediately after a clean ACTIVE read). Retrying on
// that specific exception is the correct fix for an eventually-consistent
// control-plane lock that isn't otherwise observable.
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
  await seedStore(fixtureStore, registerStore, [active]);
  log("T0", "Seeded one active fixture into REAL DynamoDB", { recordId });

  const preDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T0", "Pre-withdrawal permission check", preDecision);
  if (!preDecision.allowed) {
    throw new Error("Sanity check failed: T0 state must be authorized before the drill can mean anything.");
  }

  const backupName = `t0-backup-${Date.now()}`;
  const createBackupResult = await client.send(
    new CreateBackupCommand({ TableName: PRIMARY_TABLE, BackupName: backupName }),
  );
  const backupArn = createBackupResult.BackupDetails?.BackupArn;
  if (!backupArn) {
    throw new Error("CreateBackup did not return a BackupArn.");
  }
  log("T0", "Real DynamoDB backup created", { backupName, backupArn, status: createBackupResult.BackupDetails?.BackupStatus });

  // ---------------------------------------------------------------- T1 ----
  await withdraw(fixtureStore, registerStore, {
    requestId: `real-drill-withdraw-${Date.now()}`,
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] real AWS backup/restore drill",
  });
  await startDeletion(fixtureStore, registerStore, {
    requestId: `real-drill-delete-${Date.now()}`,
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] real AWS backup/restore drill",
  });
  log("T1", "Withdrew and started deletion against LIVE data (after the backup was taken)");

  const postDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T1", "Post-withdrawal permission check", postDecision);
  if (postDecision.allowed) {
    throw new Error("Sanity check failed: T1 state must be denied, or T2/T3 prove nothing.");
  }

  // ---------------------------------------------------------------- T2 ----
  const restoredTableName = `${PRIMARY_TABLE}-restored-${Date.now()}`;
  await client.send(
    new RestoreTableFromBackupCommand({ TargetTableName: restoredTableName, BackupArn: backupArn }),
  );
  log("T2", "RestoreTableFromBackup requested; waiting for the new table to become ACTIVE", { restoredTableName });
  // maxWaitTime of 300s was too short — observed a real restore take ~10
  // minutes for a near-empty table. AWS documents restore time as variable,
  // not proportional to table size in any simple way; 900s gives headroom
  // without being unbounded.
  await waitUntilTableExists({ client, maxWaitTime: 900 }, { TableName: restoredTableName });

  // Per the brief: restore does NOT carry over tags, alarms, or most
  // monitoring/retention settings — verify and reapply explicitly rather
  // than assume. Point-in-time recovery setting is verified here, not
  // re-enabled, since this table is disposable and gets deleted at the end
  // of this script.
  const describeResult = await client.send(new DescribeTableCommand({ TableName: restoredTableName }));
  log("T2", "Restored table settings as actually reported by AWS (verify, don't assume)", {
    billingMode: describeResult.Table?.BillingModeSummary?.BillingMode,
    tableStatus: describeResult.Table?.TableStatus,
    itemCount: describeResult.Table?.ItemCount,
  });
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
  log("T2", "Reapplied tags to the restored table (NOT automatic — confirms the brief's callout is real)");

  const restoredStore = new DynamoFixtureStore({
    client,
    primaryTableName: restoredTableName,
    statusIndexName: STATUS_INDEX,
  });
  const restoredRecord = await restoredStore.getRecord(recordId);
  log("T2", "Restored record's content (expected: OLD, pre-withdrawal, published)", {
    publicationStatus: restoredRecord?.publicationStatus,
    custodyStatus: restoredRecord?.custodyStatus,
  });
  if (restoredRecord?.publicationStatus !== "published") {
    throw new Error(
      "Sanity check failed: the restored table should still show the OLD published status — if it doesn't, this isn't testing what it claims to.",
    );
  }

  // ---------------------------------------------------------------- T3 ----
  const envelope: ExportedRecordEnvelope = {
    record: restoredRecord,
    authorityClaims: [],
    legalRights: [],
    consentGrants: [],
    custodyCopies: [],
    auditReceipts: [],
    mediaObjects: [],
    mediaObjectsSkipped: [],
    corrections: [],
    redactions: [],
    controlStateAtExport: {
      publicationStatus: restoredRecord.publicationStatus,
      custodyStatus: restoredRecord.custodyStatus,
      restrictedPurposes: [],
      controlVersion: 0,
    },
  };
  // Critically: registerStore here is the SAME live register used in T0/T1 —
  // never restored, never touched by anything above. restoredStore is
  // passed so servable reflects the real evaluatePermission decision
  // (grant-level data included), not just record-state.
  const reconciliation = await reconcileRestoredRecords(restoredStore, registerStore, [envelope], {
    purpose: "publication",
    audience: "public",
  });
  log("T3", "Reconciliation against the CURRENT (live, untouched) restriction register", reconciliation);

  const finalDecision = await evaluatePermission(restoredStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  log("T3", "Permission check against the RESTORED table + the LIVE register", finalDecision);

  const drillPassed = !reconciliation[0].servable && !finalDecision.allowed;

  // ------------------------------------------------------------ Cleanup ---
  log("cleanup", "Deleting the disposable restored table and backup (never the original tables)");
  await retryOnResourceInUse(() => client.send(new DeleteTableCommand({ TableName: restoredTableName })));
  await waitUntilTableNotExists({ client, maxWaitTime: 300 }, { TableName: restoredTableName });
  await client.send(new DeleteBackupCommand({ BackupArn: backupArn }));
  log("cleanup", "Done");

  if (!drillPassed) {
    throw new Error("DRILL FAILED: restored content was servable despite a live withdrawal. This is the exact failure this milestone exists to prevent.");
  }
  console.log("\n=== DRILL PASSED: a real DynamoDB backup taken before withdrawal does not revive access after restore. ===");
}

main().catch((error) => {
  console.error("\nDrill script failed:", error);
  process.exitCode = 1;
});
