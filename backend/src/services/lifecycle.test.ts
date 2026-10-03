import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import type { RestrictionRegisterStore } from "../store/store";
import type { RestrictionRegisterEntry } from "../domain/types";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { withdraw, restrict, retainForPreservationOnly, startDeletion, completeDeletion } from "./lifecycle";
import { evaluatePermission } from "./permissions";

async function setupActive() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  return { fixtureStore, registerStore, recordId: active.record.recordId };
}

// A register store that fails setCurrent every time — used to prove the
// lifecycle request is never marked "completed" when the durable write fails.
class AlwaysFailingRegisterStore implements RestrictionRegisterStore {
  async getCurrent(): Promise<RestrictionRegisterEntry | null> {
    return null;
  }
  async setCurrent(): Promise<void> {
    throw new Error("simulated durable-write failure");
  }
  async listAll(): Promise<RestrictionRegisterEntry[]> {
    return [];
  }
}

test("withdraw transitions publication status and denies subsequent public access", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();

  await withdraw(fixtureStore, registerStore, {
    requestId: "req-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("withdraw is idempotent on requestId — replaying it does not error or duplicate effects", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();
  const input = {
    requestId: "req-idempotent",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  };

  const first = await withdraw(fixtureStore, registerStore, input);
  const second = await withdraw(fixtureStore, registerStore, input);

  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(first.completedAt, second.completedAt, "replay must not re-run the action or move the completion time");

  const receipts = await fixtureStore.listAuditReceipts(recordId);
  assert.equal(receipts.filter((r) => r.action === "withdraw" && r.outcome === "completed").length, 1);
});

test("a failed durable write leaves the request in-progress, never falsely completed", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const failingRegister = new AlwaysFailingRegisterStore();
  const [active] = buildSeedFixtures();
  // Seed only the fixture store (the failing register has nothing to seed).
  await fixtureStore.putRecord(active.record, undefined);

  await assert.rejects(
    () =>
      withdraw(fixtureStore, failingRegister, {
        requestId: "req-will-fail",
        recordId: active.record.recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
      }),
    /simulated durable-write failure/,
  );

  const request = await fixtureStore.getLifecycleRequest("req-will-fail");
  assert.ok(request);
  assert.equal(request?.status, "in-progress", "must stay in-progress, not completed, when the register write fails");
  assert.equal(request?.completedAt, null);

  const receipts = await fixtureStore.listAuditReceipts(active.record.recordId);
  assert.equal(receipts.some((r) => r.outcome === "failed"), true);
  assert.equal(receipts.some((r) => r.outcome === "completed"), false);
});

test("retain-for-preservation-only restricts every non-preservation purpose", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();

  await retainForPreservationOnly(fixtureStore, registerStore, {
    requestId: "req-retain",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });

  const publicationDenied = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(publicationDenied.allowed, false);
});

test("restrict narrows only the specified purposes, leaving others untouched", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();

  await restrict(
    fixtureStore,
    registerStore,
    { requestId: "req-restrict", recordId, requesterCapacity: "[SYNTHETIC] staff", reason: "[SYNTHETIC] test" },
    ["model-training"],
  );

  const trainingDenied = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "model-training",
    audience: "public",
    now: new Date(),
  });
  const publicationStillAllowed = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(trainingDenied.allowed, false);
  assert.equal(publicationStillAllowed.allowed, true);
});

test("deletion stays deletion-pending until custody copies are reconciled", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();

  // The active fixture already has one reconciled custody copy; add an
  // unreconciled one to prove deletion blocks on it.
  await fixtureStore.putCustodyCopy({
    recordId,
    copyId: "outstanding-copy",
    location: "backup",
    objectVersionId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  });

  await startDeletion(fixtureStore, registerStore, {
    requestId: "req-delete-pending",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });

  const firstAttempt = await completeDeletion(fixtureStore, registerStore, recordId);
  assert.equal(firstAttempt.deleted, false);

  await fixtureStore.putCustodyCopy({
    recordId,
    copyId: "outstanding-copy",
    location: "backup",
    objectVersionId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: new Date().toISOString(),
  });

  const secondAttempt = await completeDeletion(fixtureStore, registerStore, recordId);
  assert.equal(secondAttempt.deleted, true);

  const current = await registerStore.getCurrent(recordId);
  assert.equal(current?.currentCustodyStatus, "deleted");
});
