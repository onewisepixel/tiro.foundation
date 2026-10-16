import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { uuidv7 } from "../domain/id";
import { startDeletion } from "./lifecycle";
import { deriveListingItem, parseListingItem } from "./publicListingItem";
import { planListingBackfill, runListingBackfill, type BackfillDeps, type BackfillLogEntry } from "./listingBackfill";
import { readPublicListing } from "./publicView";
import { setCursorSecretKey } from "./cursorCodec";

setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

const CALLER = "staff:test@example.invalid";

// Legacy state: records exist but their listing items don't (written before
// the store maintained them).
async function legacySetup(count: number) {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const fixtures = Array.from({ length: count }, () => buildSeedFixtures()[0]);
  await seedStore(fixtureStore, registerStore, fixtures);
  for (const f of fixtures) fixtureStore.deleteListingItemSync(f.record.recordId);
  return { fixtureStore, registerStore, ids: fixtures.map((f) => f.record.recordId) };
}

// In-memory BackfillDeps applying the SAME conditions as the DynamoDB
// script's transaction: register exists and isn't deleting; listing absent
// (create) or at exactly the expected version (replace).
function memoryDeps(fixtureStore: InMemoryFixtureStore, registerStore: InMemoryRestrictionRegisterStore, hooks: { beforeWrite?: (recordId: string) => Promise<void> } = {}) {
  const writes: string[] = [];
  let sleptMs = 0;
  const deps: BackfillDeps = {
    async listRegisterPage(cursor, limit) {
      const page = await registerStore.listPage({ limit, cursor });
      return { entries: page.entries, nextCursor: page.nextCursor, consumedRcu: 1 };
    },
    async readRecord(recordId) {
      return { record: await fixtureStore.getRecord(recordId), consumedRcu: 3 };
    },
    async readListing(recordId) {
      return { raw: await fixtureStore.getListingItem(recordId), consumedRcu: 1 };
    },
    async writeListing({ item, expectedExistingVersion }) {
      await hooks.beforeWrite?.(item.recordId);
      const control = await registerStore.getCurrent(item.recordId);
      const existing = (await fixtureStore.getListingItem(item.recordId)) as { recordVersion?: number } | null;
      const registerOk = control !== null && control.currentCustodyStatus !== "deletion-pending" && control.currentCustodyStatus !== "deleted";
      const listingOk = expectedExistingVersion === null ? existing === null : existing?.recordVersion === expectedExistingVersion;
      if (!registerOk || !listingOk) {
        return { outcome: "condition-failed", consumedWcu: 2, detail: `register=${registerOk} listing=${listingOk}` };
      }
      fixtureStore.setRawListingItemSync(item.recordId, item);
      writes.push(item.recordId);
      return { outcome: "written", consumedWcu: 4 };
    },
    async sleep(ms) {
      sleptMs += ms;
    },
  };
  return { deps, writes, slept: () => sleptMs };
}

const baseOptions = { apply: false, resumeAfter: null, maxRecords: null, readRcuPerSecond: 2, writeWcuPerSecond: 2, pageSize: 2 };

test("planListingBackfill covers every case without ever planning to overwrite an invalid or same-version item", () => {
  const [f] = buildSeedFixtures();
  const record = { ...f.record, version: 4 };
  const current = deriveListingItem(record, 4);
  assert.equal(planListingBackfill(record, null, "preserved").action, "create");
  assert.deepEqual(planListingBackfill(record, deriveListingItem(record, 2), "preserved"), { action: "replace-stale", item: current, existingVersion: 2 });
  assert.equal(planListingBackfill(record, current, "preserved").action, "up-to-date");
  assert.equal(planListingBackfill(record, { ...current, title: "different" }, "preserved").action, "needs-review");
  assert.equal(planListingBackfill(record, { garbage: true }, "preserved").action, "needs-review");
  assert.equal(planListingBackfill(record, deriveListingItem(record, 9), "preserved").action, "skip-newer");
  assert.equal(planListingBackfill(record, null, "deletion-pending").action, "skip-deleting");
  assert.equal(planListingBackfill(record, null, "deleted").action, "skip-deleting");
  assert.equal(planListingBackfill(null, null, "preserved").action, "skip-no-record");
});

test("a dry run reads and reports but writes nothing", async () => {
  const { fixtureStore, registerStore, ids } = await legacySetup(3);
  const { deps, writes } = memoryDeps(fixtureStore, registerStore);
  const log: BackfillLogEntry[] = [];
  const summary = await runListingBackfill(deps, { ...baseOptions, onRecord: (e) => void log.push(e) });
  assert.equal(summary.finished, true);
  assert.equal(summary.counts.create, 3);
  assert.deepEqual(writes, []);
  assert.ok(log.every((e) => e.write === "dry-run"));
  for (const id of ids) assert.equal(await fixtureStore.getListingItem(id), null);
});

test("--apply creates valid listing items, after which the public listing has no failures", async () => {
  const { fixtureStore, registerStore, ids } = await legacySetup(3);
  const before = await readPublicListing(fixtureStore, registerStore, { limit: 10, cursor: null });
  assert.equal(before.hadFailures, true, "precondition: legacy records without listing items fail closed");

  const { deps } = memoryDeps(fixtureStore, registerStore);
  const summary = await runListingBackfill(deps, { ...baseOptions, apply: true, onRecord: () => {} });
  assert.equal(summary.written, 3);
  for (const id of ids) {
    const record = (await fixtureStore.getRecord(id))!;
    assert.deepEqual(parseListingItem(await fixtureStore.getListingItem(id), id), deriveListingItem(record, record.version));
  }
  const after = await readPublicListing(fixtureStore, registerStore, { limit: 10, cursor: null });
  assert.equal(after.hadFailures, false);
  assert.equal(after.items.length, 3);

  // Idempotent: a second run finds everything up to date and writes nothing.
  const { deps: deps2, writes } = memoryDeps(fixtureStore, registerStore);
  const again = await runListingBackfill(deps2, { ...baseOptions, apply: true, onRecord: () => {} });
  assert.equal(again.counts["up-to-date"], 3);
  assert.deepEqual(writes, []);
});

test("a bounded run resumes exactly after its last completed record, processing every record once", async () => {
  const { fixtureStore, registerStore, ids } = await legacySetup(5);
  const seen: string[] = [];
  const first = await runListingBackfill(memoryDeps(fixtureStore, registerStore).deps, {
    ...baseOptions,
    apply: true,
    maxRecords: 3,
    onRecord: (e) => void seen.push(e.recordId),
  });
  assert.equal(first.finished, false);
  assert.equal(first.processed, 3);
  const second = await runListingBackfill(memoryDeps(fixtureStore, registerStore).deps, {
    ...baseOptions,
    apply: true,
    resumeAfter: first.lastCompletedRecordId,
    onRecord: (e) => void seen.push(e.recordId),
  });
  assert.equal(second.finished, true);
  assert.deepEqual([...seen].sort(), [...ids].sort());
  assert.equal(new Set(seen).size, ids.length, "no record processed twice");
});

test("a record write racing the backfill wins: the backfill's conditional write fails and never moves the listing backwards", async () => {
  const { fixtureStore, registerStore, ids } = await legacySetup(1);
  const id = ids[0];
  const { deps } = memoryDeps(fixtureStore, registerStore, {
    beforeWrite: async () => {
      // Deployed code: a record write also writes its listing item.
      const current = (await fixtureStore.getRecord(id))!;
      await fixtureStore.putRecord({ ...current, title: "[SYNTHETIC] changed mid-backfill" }, current.version);
    },
  });
  const log: BackfillLogEntry[] = [];
  const summary = await runListingBackfill(deps, { ...baseOptions, apply: true, onRecord: (e) => void log.push(e) });
  assert.equal(summary.conditionFailed, 1);
  assert.equal(log[0].write, "condition-failed");
  const record = (await fixtureStore.getRecord(id))!;
  assert.deepEqual(parseListingItem(await fixtureStore.getListingItem(id), id), deriveListingItem(record, record.version));
  assert.equal(parseListingItem(await fixtureStore.getListingItem(id), id)!.title, "[SYNTHETIC] changed mid-backfill");
});

test("deletion starting during the backfill blocks its write, leaving no orphan listing item", async () => {
  const { fixtureStore, registerStore, ids } = await legacySetup(1);
  const id = ids[0];
  const { deps } = memoryDeps(fixtureStore, registerStore, {
    beforeWrite: async () => {
      await startDeletion(fixtureStore, registerStore, { requestId: uuidv7(), recordId: id, requesterCapacity: CALLER, reason: "[SYNTHETIC] delete" });
    },
  });
  const summary = await runListingBackfill(deps, { ...baseOptions, apply: true, onRecord: () => {} });
  assert.equal(summary.conditionFailed, 1);
  assert.equal(await fixtureStore.getListingItem(id), null);
});

test("pacing sleeps in proportion to the capacity each operation consumed", async () => {
  const { fixtureStore, registerStore } = await legacySetup(2);
  const { deps, slept } = memoryDeps(fixtureStore, registerStore);
  const summary = await runListingBackfill(deps, { ...baseOptions, apply: true, pageSize: 10, onRecord: () => {} });
  // 1 scan page (1 RCU) + 2 × (record 3 + listing 1) RCU at 2 RCU/s, plus 2 × 4 WCU at 2 WCU/s.
  assert.equal(summary.totalRcu, 9);
  assert.equal(summary.totalWcu, 8);
  assert.equal(slept(), (9 / 2) * 1000 + (8 / 2) * 1000);
});
