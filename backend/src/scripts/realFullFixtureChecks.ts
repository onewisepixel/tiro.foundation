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
import { startDeletion, restrict, revokeConsentGrant, withdraw } from "../services/lifecycle";
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
      // grantAfterRevoke !== undefined is required here, not just != null:
      // `undefined?.revokedAt !== null` evaluates to `undefined !== null`,
      // which is true — so a MISSING grant row would falsely pass this check
      // without the explicit existence test.
      grantAfterRevoke !== undefined &&
      grantAfterRevoke.revokedAt !== null,
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

  // --------------------------- Combinatorial case: revocation racing restriction ----
  // Reviewer-requested combinatorial case, against REAL DynamoDB.
  // revokeConsentGrant() only ever touches revokedConsentIds;
  // restrict() only ever touches restrictedPurposes/
  // currentPublicationStatus — the two are not in SEMANTIC conflict, but
  // both go through transitionControl's single-item optimistic-
  // concurrency write on the SAME register entry.
  const [raceFixture] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [raceFixture]);
  const raceRecordId = raceFixture.record.recordId;
  const raceConsentId = raceFixture.consentGrants[0].consentId;

  // (a) FORCED conflict, deterministic — same technique as Finding 2a
  // above: both candidate writes are computed from the SAME captured
  // expectedVersion, so one is GUARANTEED to lose to a real DynamoDB
  // ConditionExpression regardless of any timing. This is what actually
  // proves the CAS mechanism rejects a stale write for THIS pair of
  // fields; it does not depend on how two independent service calls
  // happen to interleave.
  const beforeForcedRace = await registerStore.getCurrent(raceRecordId);
  if (!beforeForcedRace) {
    throw new Error("Sanity check failed: raceFixture must have a register entry after seeding.");
  }
  const forcedExpectedVersion = beforeForcedRace.controlVersion;
  const forcedRevokeCandidate = {
    ...beforeForcedRace,
    controlVersion: forcedExpectedVersion + 1,
    revokedConsentIds: [...new Set([...beforeForcedRace.revokedConsentIds, raceConsentId])],
    updatedAt: new Date().toISOString(),
  };
  const forcedRestrictCandidate = {
    ...beforeForcedRace,
    controlVersion: forcedExpectedVersion + 1,
    restrictedPurposes: [...new Set([...beforeForcedRace.restrictedPurposes, "research" as const])],
    updatedAt: new Date().toISOString(),
  };
  const [forcedRevoke, forcedRestrict] = await Promise.allSettled([
    registerStore.setCurrent(forcedRevokeCandidate, forcedExpectedVersion),
    registerStore.setCurrent(forcedRestrictCandidate, forcedExpectedVersion),
  ]);
  const forcedStatuses = [forcedRevoke.status, forcedRestrict.status];
  const forcedOneWon =
    forcedStatuses.includes("fulfilled") &&
    forcedStatuses.includes("rejected") &&
    (forcedRevoke.status === "fulfilled" || forcedRevoke.reason instanceof VersionConflictError) &&
    (forcedRestrict.status === "fulfilled" || forcedRestrict.reason instanceof VersionConflictError);
  check(
    "Combinatorial case: revocation racing restriction — FORCED shared-version conflict against REAL DynamoDB correctly rejects the loser's compare-and-swap",
    forcedOneWon,
    {
      forcedRevoke: forcedRevoke.status === "rejected" ? String(forcedRevoke.reason) : "fulfilled",
      forcedRestrict: forcedRestrict.status === "rejected" ? String(forcedRestrict.reason) : "fulfilled",
    },
  );

  // (b) Real service-level race, timing-dependent — reviewer-caught
  // finding: the PREVIOUS version of this check REQUIRED exactly one of
  // these two real calls to reject, which is not actually guaranteed.
  // revokeConsentGrant() and restrict() each do their OWN
  // transitionControl read-then-write round trip; if one call's full
  // round trip completes before the other's read even happens, DynamoDB
  // never sees two writes sharing a stale version at all — both calls
  // genuinely succeed, serialized cleanly, with no conflict to retry.
  // That is a VALID, safe outcome (proven deterministically possible by
  // (a) above when a conflict IS forced) — not a bug, and the drill must
  // not reject it. Expected outcome, defined for EITHER ordering: either
  // a genuine conflict (one rejected, retryable) or both calls serialize
  // cleanly (both fulfilled, no retry needed) — in EITHER case, both
  // changes must be present in the register afterward, never lost.
  const raceRevokeRequestId = `real-full-fixture-combo-revoke-${Date.now()}`;
  const raceRestrictRequestId = `real-full-fixture-combo-restrict-${Date.now()}`;
  const [raceRevoke, raceRestrict] = await Promise.allSettled([
    revokeConsentGrant(fixtureStore, registerStore, {
      requestId: raceRevokeRequestId,
      recordId: raceRecordId,
      requesterCapacity: "[SYNTHETIC] source authority",
      reason: "[SYNTHETIC] combinatorial case: revocation racing restriction",
      consentId: raceConsentId,
    }),
    restrict(
      fixtureStore,
      registerStore,
      {
        requestId: raceRestrictRequestId,
        recordId: raceRecordId,
        requesterCapacity: "[SYNTHETIC] staff",
        reason: "[SYNTHETIC] combinatorial case: revocation racing restriction",
      },
      ["research"],
    ),
  ]);
  const raceStatuses = [raceRevoke.status, raceRestrict.status];
  const raceExactlyOneRejected = raceStatuses.includes("fulfilled") && raceStatuses.includes("rejected");
  const raceBothFulfilled = raceRevoke.status === "fulfilled" && raceRestrict.status === "fulfilled";
  check(
    "Combinatorial case: revocation racing restriction against REAL DynamoDB — EITHER a genuine CAS conflict (one rejected, retryable) OR both calls serialize cleanly and both succeed; both are valid, safe outcomes",
    raceExactlyOneRejected || raceBothFulfilled,
    {
      revoke: raceRevoke.status === "rejected" ? String(raceRevoke.reason) : "fulfilled",
      restrict: raceRestrict.status === "rejected" ? String(raceRestrict.reason) : "fulfilled",
    },
  );

  // If there WAS a genuine conflict, retry the loser using its ORIGINAL
  // requestId — not a fresh one. This system's actual retry contract
  // (services/lifecycle.ts's getOrCreateRequest) is resumption BY the
  // same requestId: the existing "in-progress" LifecycleRequest is found,
  // its fingerprint matches (same action/payload), and runGuarded
  // re-attempts the same work against the now-current register state.
  // Reviewer-caught finding: the PREVIOUS version of this check retried
  // with a brand-new requestId, which abandons the original request
  // permanently "in-progress" instead of ever completing it — exactly the
  // "visibly pending, not silently lost" state becoming a silent leak
  // instead, since nothing ever revisits that original id again.
  let retriedRequestId: string | null = null;
  if (raceRevoke.status === "rejected") {
    retriedRequestId = raceRevokeRequestId;
    await revokeConsentGrant(fixtureStore, registerStore, {
      requestId: raceRevokeRequestId,
      recordId: raceRecordId,
      requesterCapacity: "[SYNTHETIC] source authority",
      reason: "[SYNTHETIC] combinatorial case: revocation racing restriction",
      consentId: raceConsentId,
    });
  } else if (raceRestrict.status === "rejected") {
    retriedRequestId = raceRestrictRequestId;
    await restrict(
      fixtureStore,
      registerStore,
      {
        requestId: raceRestrictRequestId,
        recordId: raceRecordId,
        requesterCapacity: "[SYNTHETIC] staff",
        reason: "[SYNTHETIC] combinatorial case: revocation racing restriction",
      },
      ["research"],
    );
  }
  const raceFinalRegister = await registerStore.getCurrent(raceRecordId);
  check(
    "Combinatorial case: after resolving any conflict, BOTH the revocation and the restriction are present in the register — whether they serialized cleanly or one needed a retry, neither is ever permanently lost",
    (raceFinalRegister?.revokedConsentIds.includes(raceConsentId) ?? false) &&
      (raceFinalRegister?.restrictedPurposes.includes("research") ?? false),
    raceFinalRegister,
  );

  if (retriedRequestId) {
    const retriedRequestFinal = await fixtureStore.getLifecycleRequest(retriedRequestId);
    check(
      "Combinatorial case: retrying the SAME original requestId resumes and completes it against REAL DynamoDB — never left permanently stuck in-progress",
      retriedRequestFinal?.status === "completed",
      retriedRequestFinal,
    );
  }

  // --------------------------------- Combinatorial case: export racing withdrawal ----
  // exportFixtureSet NEVER writes to the register — it only reads it, once
  // per record, via evaluatePermission's own single register read
  // (captured once at the top of that call and reused throughout it) — so
  // there is no writer-writer conflict here, only a reader racing a
  // writer. withdraw() is the only writer, so it always succeeds
  // regardless of timing; the only question is what export sees.
  //
  // Expected outcome, defined for EITHER ordering: if withdraw()'s
  // register write lands BEFORE evaluatePermission's read for this
  // record, the record is EXCLUDED from the export (absent, correctly
  // denied — never included-but-flagged). If it lands AFTER, the record
  // IS included, carrying the consistent PRE-withdrawal snapshot in BOTH
  // its own `record.publicationStatus` and its `controlStateAtExport` —
  // export.ts's own documented contract ("AS OF EXPORT TIME, not a live
  // link... an old export is expected to contain old, possibly
  // since-revoked, state"). Either outcome is correct; what must NEVER
  // happen is a torn result — e.g. included but marked withdrawn, or an
  // unhandled rejection.
  const [withdrawRaceFixture] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [withdrawRaceFixture]);
  const withdrawRaceRecordId = withdrawRaceFixture.record.recordId;

  const [withdrawRaceWithdraw, withdrawRaceExport] = await Promise.allSettled([
    withdraw(fixtureStore, registerStore, {
      requestId: `real-full-fixture-combo-withdraw-${Date.now()}`,
      recordId: withdrawRaceRecordId,
      requesterCapacity: "[SYNTHETIC] source authority",
      reason: "[SYNTHETIC] combinatorial case: export racing withdrawal",
    }),
    exportFixtureSet(
      fixtureStore,
      registerStore,
      [withdrawRaceRecordId],
      "public-redacted",
      `real-full-fixture-combo-export-withdraw-${Date.now()}`,
      "public",
    ),
  ]);
  const exportResultDuringWithdraw = withdrawRaceExport.status === "fulfilled" ? withdrawRaceExport.value : null;
  check(
    "Combinatorial case: export racing withdrawal against REAL DynamoDB — withdraw() always lands (sole writer) and export's result is self-consistent for whichever snapshot it captured",
    withdrawRaceWithdraw.status === "fulfilled" &&
      exportResultDuringWithdraw !== null &&
      (exportResultDuringWithdraw.records.length === 0 ||
        (exportResultDuringWithdraw.records.length === 1 &&
          exportResultDuringWithdraw.records[0].record.publicationStatus === "published" &&
          exportResultDuringWithdraw.records[0].controlStateAtExport?.publicationStatus === "published")),
    {
      withdrawOutcome: withdrawRaceWithdraw.status === "rejected" ? String(withdrawRaceWithdraw.reason) : "fulfilled",
      exportRecordCount: exportResultDuringWithdraw?.records.length,
      exportedPublicationStatus: exportResultDuringWithdraw?.records[0]?.record.publicationStatus,
      controlStateAtExport: exportResultDuringWithdraw?.records[0]?.controlStateAtExport,
    },
  );

  // ---------------------------------- Combinatorial case: export racing deletion ----
  // Same reasoning as the withdrawal case above, for startDeletion()
  // instead — it only flips currentCustodyStatus to "deletion-pending"
  // (completeDeletion() is the separate, later step that actually removes
  // the record), so export's OTHER reads still succeed either way; only
  // evaluatePermission's custody-status check (which denies EVERY
  // purpose/audience once custody is "deletion-pending", not just
  // publication) can exclude the record depending on timing.
  //
  // Expected outcome, defined for EITHER ordering: if startDeletion()
  // lands before evaluatePermission's read, the record is EXCLUDED
  // (custody denies every purpose); if after, it's included with
  // controlStateAtExport.custodyStatus still "preserved" — the consistent
  // pre-deletion snapshot. Never a torn result.
  const [deletionRaceFixture] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [deletionRaceFixture]);
  const deletionRaceRecordId = deletionRaceFixture.record.recordId;

  const [deletionRaceStart, deletionRaceExport] = await Promise.allSettled([
    startDeletion(fixtureStore, registerStore, {
      requestId: `real-full-fixture-combo-delete-${Date.now()}`,
      recordId: deletionRaceRecordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] combinatorial case: export racing deletion",
    }),
    exportFixtureSet(
      fixtureStore,
      registerStore,
      [deletionRaceRecordId],
      "complete-preservation",
      `real-full-fixture-combo-export-delete-${Date.now()}`,
      "public",
    ),
  ]);
  const exportResultDuringDeletion = deletionRaceExport.status === "fulfilled" ? deletionRaceExport.value : null;
  check(
    "Combinatorial case: export racing deletion against REAL DynamoDB — startDeletion() always lands (sole writer) and export's result is self-consistent for whichever snapshot it captured",
    deletionRaceStart.status === "fulfilled" &&
      exportResultDuringDeletion !== null &&
      (exportResultDuringDeletion.records.length === 0 ||
        (exportResultDuringDeletion.records.length === 1 &&
          exportResultDuringDeletion.records[0].controlStateAtExport?.custodyStatus === "preserved")),
    {
      startDeletionOutcome: deletionRaceStart.status === "rejected" ? String(deletionRaceStart.reason) : "fulfilled",
      exportRecordCount: exportResultDuringDeletion?.records.length,
      controlStateAtExport: exportResultDuringDeletion?.records[0]?.controlStateAtExport,
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
