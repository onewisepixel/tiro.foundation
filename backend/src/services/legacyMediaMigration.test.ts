import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { startDeletion, completeDeletion } from "../services/lifecycle";
import { inventoryLegacyMedia, applyLegacyMediaRebind } from "./legacyMediaMigration";

async function setupActive() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  return { fixtureStore, registerStore, mediaStore, recordId: active.record.recordId, mediaId: active.record.mediaRefs[0].mediaId };
}

test("inventoryLegacyMedia classifies an exact known-placeholder match as rebindable", async () => {
  const { fixtureStore, registerStore, recordId, mediaId } = await setupActive();
  const entries = await registerStore.listAll();
  const inventory = await inventoryLegacyMedia(fixtureStore, entries);
  const item = inventory.find((i) => i.recordId === recordId && i.mediaId === mediaId);
  assert.equal(item?.classification, "rebindable");
});

test("inventoryLegacyMedia classifies a near-miss (differs in one field) as no-trustworthy-origin, never guessed", async () => {
  const { fixtureStore, registerStore, recordId, mediaId } = await setupActive();
  const record = await fixtureStore.getRecord(recordId);
  if (!record) throw new Error("sanity check failed");
  const nearMiss = {
    ...record,
    mediaRefs: record.mediaRefs.map((m) => (m.mediaId === mediaId ? { ...m, checksumSha256: "1".repeat(64) } : m)),
  };
  await fixtureStore.putRecord(nearMiss, record.version);
  const entries = await registerStore.listAll();
  const inventory = await inventoryLegacyMedia(fixtureStore, entries);
  const item = inventory.find((i) => i.recordId === recordId && i.mediaId === mediaId);
  assert.equal(item?.classification, "no-trustworthy-origin");
});

test(
  "inventoryLegacyMedia classifies a record in the deletion workflow as ineligible even though its media matches the known signature exactly (reviewer-caught finding: a recognizable placeholder does not establish migration eligibility)",
  async () => {
    const { fixtureStore, registerStore, recordId, mediaId } = await setupActive();
    await startDeletion(fixtureStore, registerStore, {
      requestId: "req-legacy-migration-deletion-pending",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });
    const entries = await registerStore.listAll();
    const inventory = await inventoryLegacyMedia(fixtureStore, entries);
    const item = inventory.find((i) => i.recordId === recordId && i.mediaId === mediaId);
    assert.equal(item?.classification, "ineligible-deletion-in-progress");
  },
);

test("applyLegacyMediaRebind uploads and atomically rebinds a genuinely eligible item", async () => {
  const { fixtureStore, registerStore, mediaStore, recordId, mediaId } = await setupActive();
  const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore);
  assert.equal(result.outcome, "rebound");

  const record = await fixtureStore.getRecord(recordId);
  const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
  assert.notEqual(media?.versionId, null, "the media reference must now be bound to a real version");

  const copies = await fixtureStore.listCustodyCopies(recordId);
  assert.ok(
    copies.some((c) => c.mediaId === mediaId && c.objectVersionId === media?.versionId),
    "a CustodyCopy tracking the newly uploaded object must exist — without it, completeDeletion's purge would never learn about it",
  );
});

test(
  "applyLegacyMediaRebind refuses, and uploads nothing, when the record entered the deletion workflow after the inventory snapshot was taken (reviewer-caught finding: migration must not create media for an already-deleted record)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, recordId, mediaId } = await setupActive();
    const entries = await registerStore.listAll();
    const inventory = await inventoryLegacyMedia(fixtureStore, entries);
    const staleItem = inventory.find((i) => i.recordId === recordId && i.mediaId === mediaId);
    assert.equal(staleItem?.classification, "rebindable", "sanity check: eligible at inventory time");

    // Custody state changes AFTER the inventory snapshot, before apply runs.
    await startDeletion(fixtureStore, registerStore, {
      requestId: "req-legacy-migration-race-delete",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore);
    assert.equal(result.outcome, "skipped-ineligible");

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await mediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 0, "nothing should ever be uploaded to S3 for a record that is ineligible — the eligibility check must run BEFORE any upload, not after");

    const record = await fixtureStore.getRecord(recordId);
    const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
    assert.equal(media?.versionId, null, "the media reference must stay untouched");
  },
);

class FlakyCustodyCopyFixtureStore extends InMemoryFixtureStore {
  private failed = false;
  override async putRecordWithCustodyCopy(
    ...args: Parameters<InMemoryFixtureStore["putRecordWithCustodyCopy"]>
  ): Promise<void> {
    if (!this.failed) {
      this.failed = true;
      throw new Error("simulated custody-copy write failure");
    }
    return super.putRecordWithCustodyCopy(...args);
  }
}

test(
  "applyLegacyMediaRebind cleans up the uploaded object when the atomic write fails, leaving nothing untracked behind (reviewer-caught finding: a failed custody-copy write must not let a later deletion report completion while media survives)",
  async () => {
    const fixtureStore = new FlakyCustodyCopyFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const mediaId = active.record.mediaRefs[0].mediaId;

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore);
    assert.equal(result.outcome, "failed");
    if (result.outcome === "failed") {
      assert.equal(result.cleanedUp, true, "the just-uploaded object must be cleaned up when the atomic write fails");
    }

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await mediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 0, "no untracked S3 object must survive a failed rebind attempt");

    const record = await fixtureStore.getRecord(recordId);
    const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
    assert.equal(media?.versionId, null, "the record must be completely untouched — the transaction never committed, so nothing partial can leak through");

    // The actual failure mode the reviewer named: prove a SUBSEQUENT real
    // deletion of this record completes cleanly with no orphaned media,
    // because the failed rebind left no partial custody state at all for
    // completeDeletion to miss.
    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-legacy-migration-after-failed-rebind-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });
    const completeResult = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-legacy-migration-after-failed-rebind-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );
    assert.equal(completeResult.status, "completed");
    assert.equal(await fixtureStore.getRecord(recordId), null);
  },
);
