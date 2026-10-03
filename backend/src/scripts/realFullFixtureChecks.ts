// Manually-invoked script — NOT part of `npm test`, NOT run in CI.
//
// Two things the local-fake-backed regression tests (permissions.test.ts,
// lifecycle.test.ts, export.test.ts, restore.test.ts) cannot prove by
// themselves, per docs/backend/evidence-matrix.md's "AWS checks still not
// run" table:
//
//   1. The FULL four-fixture set (active, expired-consent, disputed-
//      authority, preservation-only) has only ever been seeded against
//      InMemoryFixtureStore — realBackupRestoreDrill.ts seeds just the one
//      `active` case. This script seeds all four for real.
//   2. Three of the reviewer's five correctness findings (grant-level
//      consent revocation, concurrent lifecycle actions, export-time
//      authorization) were fixed and regression-tested only against the
//      in-memory fake. This script re-exercises each of the three against
//      the REAL deployed DynamoDB tables, using the real DynamoFixtureStore/
//      DynamoRestrictionRegisterStore adapters — real ConditionExpression /
//      TransactWriteCommand semantics, not the fake's synchronous
//      approximation of them.
//
// Unlike realBackupRestoreDrill.ts, this script creates no disposable AWS
// resources (no temporary table, no backup) — it only writes a handful of
// small synthetic items into the already-deployed primary/register tables,
// which are then left in place as part of the real-AWS fixture baseline
// (same precedent as the one `active` record realBackupRestoreDrill.ts left
// behind). At this scale that costs nothing meaningful; see
// docs/backend/decision-and-cost.md.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... npx tsx backend/src/scripts/realFullFixtureChecks.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { startDeletion, restrict, revokeConsentGrant } from "../services/lifecycle";
import { evaluatePermission } from "../services/permissions";
import { exportFixtureSet } from "../services/export";
import { VersionConflictError } from "../store/store";

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

type CheckResult = { name: string; passed: boolean };

async function main() {
  const client = new DynamoDBClient({ region: REGION });
  const fixtureStore = new DynamoFixtureStore({
    client,
    primaryTableName: PRIMARY_TABLE,
    statusIndexName: STATUS_INDEX,
  });
  const registerStore = new DynamoRestrictionRegisterStore({ client, tableName: REGISTER_TABLE });

  const results: CheckResult[] = [];
  function check(name: string, passed: boolean, detail?: unknown): void {
    results.push({ name, passed });
    log(passed ? "PASS" : "FAIL", name, detail);
  }

  // ---------------------------------------------------------------- Seed ----
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  log("seed", "Seeded the FULL four-fixture set into REAL DynamoDB (all four cases, not just `active`)", {
    active: active.record.recordId,
    expiredConsent: expired.record.recordId,
    disputedAuthority: disputed.record.recordId,
    preservationOnly: preservationOnly.record.recordId,
  });

  // --------------------------------------------------- Parity sanity checks ----
  // Confirms the same permission outcomes the local fake produces also hold
  // against the real adapter's actual DynamoDB query paths
  // (listAuthorityClaims/listConsentGrants/listLegalRights), before relying
  // on any of them for the findings-specific checks below.
  const activeDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  check("parity: active fixture publication is allowed", activeDecision.allowed === true, activeDecision);

  const expiredDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: expired.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  check("parity: expired-consent fixture is denied", expiredDecision.allowed === false, expiredDecision);

  const disputedDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: disputed.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  check("parity: disputed-authority fixture is denied", disputedDecision.allowed === false, disputedDecision);

  const preservationAllowed = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "preservation",
    audience: "staff",
    now: new Date(),
  });
  const preservationPublicationDenied = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "publication",
    audience: "staff",
    now: new Date(),
  });
  check(
    "parity: preservation-only fixture allows preservation, denies publication",
    preservationAllowed.allowed === true && preservationPublicationDenied.allowed === false,
    { preservationAllowed, preservationPublicationDenied },
  );

  // ------------------------------------------- Finding 1: grant revocation ----
  const consentId = active.consentGrants[0].consentId;
  await revokeConsentGrant(fixtureStore, registerStore, {
    requestId: `real-full-fixture-revoke-${Date.now()}`,
    recordId: active.record.recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] real-AWS grant-revocation check",
    consentId,
  });
  const postRevokeDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  const registerAfterRevoke = await registerStore.getCurrent(active.record.recordId);
  const grantAfterRevoke = (await fixtureStore.listConsentGrants(active.record.recordId)).find(
    (g) => g.consentId === consentId,
  );
  check(
    "Finding 1: revoking a grant denies access against REAL DynamoDB (register's revokedConsentIds + grant's own revokedAt)",
    postRevokeDecision.allowed === false &&
      (registerAfterRevoke?.revokedConsentIds.includes(consentId) ?? false) &&
      grantAfterRevoke?.revokedAt !== null,
    { postRevokeDecision, revokedConsentIds: registerAfterRevoke?.revokedConsentIds, grantRevokedAt: grantAfterRevoke?.revokedAt },
  );

  // ------------------------------------------- Finding 3: export authorization ----
  const exportFixtureSetId = `real-full-fixture-check-${Date.now()}`;
  const publicExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [expired.record.recordId, disputed.record.recordId],
    "public-redacted",
    exportFixtureSetId,
    "public",
  );
  check(
    "Finding 3: public-redacted export excludes expired-consent and disputed-authority records against REAL DynamoDB",
    publicExport.records.length === 0,
    { recordCount: publicExport.records.length },
  );

  const preservationExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [expired.record.recordId, disputed.record.recordId],
    "complete-preservation",
    exportFixtureSetId,
    "public",
  );
  check(
    "Finding 3: complete-preservation export also excludes them, not just public-redacted",
    preservationExport.records.length === 0,
    { recordCount: preservationExport.records.length },
  );

  // ------------------------------------------- Finding 2: concurrency ----
  // (a) Deterministic: race the RestrictionRegisterStore's compare-and-swap
  // directly, both writes captured from the SAME expectedVersion snapshot.
  // This is the precise mechanism Finding 2's fix depends on — real
  // DynamoDB's ConditionExpression on controlVersion must reject the loser
  // regardless of network timing, unlike (b) below which depends on actual
  // call interleaving.
  const beforeDirectRace = await registerStore.getCurrent(preservationOnly.record.recordId);
  if (!beforeDirectRace) {
    throw new Error("Sanity check failed: preservationOnly fixture must have a register entry after seeding.");
  }
  const expectedVersion = beforeDirectRace.controlVersion;
  const candidateA = { ...beforeDirectRace, controlVersion: expectedVersion + 1, currentCustodyStatus: "deletion-pending" as const, updatedAt: new Date().toISOString() };
  const candidateB = { ...beforeDirectRace, controlVersion: expectedVersion + 1, restrictedPurposes: [...beforeDirectRace.restrictedPurposes, "model-training" as const], updatedAt: new Date().toISOString() };
  const [directA, directB] = await Promise.allSettled([
    registerStore.setCurrent(candidateA, expectedVersion),
    registerStore.setCurrent(candidateB, expectedVersion),
  ]);
  const directStatuses = [directA.status, directB.status];
  const directOneWon =
    directStatuses.includes("fulfilled") &&
    directStatuses.includes("rejected") &&
    (directA.status === "fulfilled" || directA.reason instanceof VersionConflictError) &&
    (directB.status === "fulfilled" || directB.reason instanceof VersionConflictError);
  check(
    "Finding 2a: RestrictionRegisterStore.setCurrent exact-match compare-and-swap rejects the loser against REAL DynamoDB",
    directOneWon,
    {
      directA: directA.status === "rejected" ? String(directA.reason) : "fulfilled",
      directB: directB.status === "rejected" ? String(directB.reason) : "fulfilled",
    },
  );

  // (b) Best-effort integration-level race: two real lifecycle actions fired
  // concurrently against the same live record. Expected to reliably exercise
  // the same guarantee in practice — both calls' several sequential
  // round-trips (getLifecycleRequest / createLifecycleRequest / getCurrent)
  // happen well before either reaches setCurrent, given DynamoDB network
  // latency dominates same-process call-dispatch overhead — but this is
  // inherently timing-dependent in a way (a) above is not, so it's reported
  // separately rather than treated as the primary proof.
  const [liveDelete, liveRestrict] = await Promise.allSettled([
    startDeletion(fixtureStore, registerStore, {
      requestId: `real-full-fixture-race-delete-${Date.now()}`,
      recordId: preservationOnly.record.recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] real-AWS concurrency check",
    }),
    restrict(
      fixtureStore,
      registerStore,
      {
        requestId: `real-full-fixture-race-restrict-${Date.now()}`,
        recordId: preservationOnly.record.recordId,
        requesterCapacity: "[SYNTHETIC] staff",
        reason: "[SYNTHETIC] real-AWS concurrency check",
      },
      ["research"],
    ),
  ]);
  const liveStatuses = [liveDelete.status, liveRestrict.status];
  const liveFinalState = await registerStore.getCurrent(preservationOnly.record.recordId);
  check(
    "Finding 2b: concurrent startDeletion + restrict against REAL DynamoDB — exactly one wins, no corrupted merge",
    liveStatuses.includes("fulfilled") && liveStatuses.includes("rejected"),
    {
      startDeletion: liveDelete.status === "rejected" ? String(liveDelete.reason) : "fulfilled",
      restrict: liveRestrict.status === "rejected" ? String(liveRestrict.reason) : "fulfilled",
      finalRegisterState: liveFinalState,
    },
  );

  // ------------------------------------------------------------- Summary ----
  const failed = results.filter((r) => !r.passed);
  log(
    "summary",
    `${results.length - failed.length}/${results.length} checks passed`,
    results.map((r) => ({ name: r.name, passed: r.passed })),
  );

  if (failed.length > 0) {
    throw new Error(`REAL-AWS FULL-FIXTURE CHECKS FAILED: ${failed.map((r) => r.name).join("; ")}`);
  }
  console.log("\n=== ALL REAL-AWS FULL-FIXTURE CHECKS PASSED ===");
}

main().catch((error) => {
  console.error("\nScript failed:", error);
  process.exitCode = 1;
});
