// The central acceptance test for this milestone (docs/ethos.txt §6 /
// the AWS handoff brief §6): restoring an export that predates a withdrawal
// must not revive access. This is a LOGIC-LEVEL proof against the in-memory
// fake — see memoryStore.ts's header comment for exactly what that does and
// does not prove. The real-AWS version of this drill (actual DynamoDB
// backup/restore) is tracked separately in docs/backend/evidence-matrix.md
// and requires a live account connection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { exportFixtureSet } from "./export";
import { importExport, reconcileRestoredRecords, validateExport } from "./restore";
import { withdraw, startDeletion } from "./lifecycle";
import { evaluatePermission } from "./permissions";

test("restoring a pre-withdrawal backup does not revive access (T0-T3)", async () => {
  // --- T0: seed an authorized record, take a backup (export) while access is allowed.
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const preWithdrawalDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(preWithdrawalDecision.allowed, true, "sanity check: T0 state must actually be authorized");

  const backupExport = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "t0-backup");
  assert.equal(validateExport(backupExport).ok, true);

  // --- T1: AFTER that backup, withdraw the record and start deletion.
  const withdrawal = await withdraw(fixtureStore, registerStore, {
    requestId: "req-withdraw-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] test withdrawal",
  });
  assert.equal(withdrawal.status, "completed");

  const deletion = await startDeletion(fixtureStore, registerStore, {
    requestId: "req-delete-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] test deletion",
  });
  assert.equal(deletion.status, "completed");

  const postWithdrawalDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(postWithdrawalDecision.allowed, false, "sanity check: T1 state must actually be denied");

  // --- T2: restore the OLD (pre-withdrawal) backup into a FRESH, isolated target store.
  // Deliberately a brand-new store, not the one that was just withdrawn from —
  // this is what "fresh isolated target, serving disabled" means at the logic level.
  const restoredTarget = new InMemoryFixtureStore();
  const importResult = await importExport(restoredTarget, backupExport);
  assert.equal(importResult.imported, 1);

  // Confirm the restored target really does contain the OLD, pre-withdrawal
  // published status — proving this is a meaningful test of reconciliation,
  // not a trivial pass because the restored data already looks denied.
  const restoredRecord = await restoredTarget.getRecord(recordId);
  assert.equal(restoredRecord?.publicationStatus, "published");

  // --- T3: reconcile against the CURRENT (post-T1) restriction register —
  // NOT the register bundled in the export, and NOT a new one derived from
  // the restored target — before permitting any serving.
  const reconciliation = await reconcileRestoredRecords(registerStore, backupExport.records);
  assert.equal(reconciliation.length, 1);
  assert.equal(reconciliation[0].servable, false, "restored content must not be servable after a later withdrawal");
  assert.equal(reconciliation[0].exportedPublicationStatus, "published", "the export itself is confirmed to carry the old, now-stale status");
  assert.equal(reconciliation[0].currentPublicationStatus, "withdrawn");

  // Belt-and-suspenders: a permission check against the restored target,
  // using the real (untouched) register, must also deny.
  const postRestoreDecision = await evaluatePermission(restoredTarget, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(postRestoreDecision.allowed, false);
});

test("restoring a backup for a record with NO later changes remains servable", async () => {
  // Negative control: the reconciliation logic isn't just "always deny after
  // restore" — an export whose record was never touched afterward should
  // still check out as servable.
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const backupExport = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "control-backup");

  const restoredTarget = new InMemoryFixtureStore();
  await importExport(restoredTarget, backupExport);

  const reconciliation = await reconcileRestoredRecords(registerStore, backupExport.records);
  assert.equal(reconciliation[0].servable, true);
});

test("concurrent restriction during a restore still wins — reconciliation reads current state at call time", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const backupExport = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "race-backup");

  // Simulate a restriction landing WHILE a restore is "in flight" — i.e.
  // between taking the export and calling reconcile.
  await withdraw(fixtureStore, registerStore, {
    requestId: "req-race-withdraw",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] race condition test",
  });

  const reconciliation = await reconcileRestoredRecords(registerStore, backupExport.records);
  assert.equal(reconciliation[0].servable, false);
});

test("repeated reconciliation replay is safe and consistent", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;
  const backupExport = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "replay-backup");

  await withdraw(fixtureStore, registerStore, {
    requestId: "req-replay-withdraw",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] replay test",
  });

  const first = await reconcileRestoredRecords(registerStore, backupExport.records);
  const second = await reconcileRestoredRecords(registerStore, backupExport.records);
  assert.deepEqual(first, second);
  assert.equal(first[0].servable, false);
});
