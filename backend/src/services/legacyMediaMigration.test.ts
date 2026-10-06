import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCustodyCopyCommitter, InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { DeletionInProgressError } from "../store/store";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { startDeletion, completeDeletion } from "../services/lifecycle";
import { inventoryLegacyMedia, applyLegacyMediaRebind } from "./legacyMediaMigration";

async function setupActive() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const committer = new InMemoryCustodyCopyCommitter(fixtureStore, registerStore);
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  return {
    fixtureStore,
    registerStore,
    mediaStore,
    committer,
    recordId: active.record.recordId,
    mediaId: active.record.mediaRefs[0].mediaId,
  };
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
  const { fixtureStore, registerStore, mediaStore, committer, recordId, mediaId } = await setupActive();
  const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore, committer);
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
    const { fixtureStore, registerStore, mediaStore, committer, recordId, mediaId } = await setupActive();
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

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore, committer);
    assert.equal(result.outcome, "skipped-ineligible");

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await mediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 0, "nothing should ever be uploaded to S3 for a record that is ineligible — the eligibility check must run BEFORE any upload, not after");

    const record = await fixtureStore.getRecord(recordId);
    const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
    assert.equal(media?.versionId, null, "the media reference must stay untouched");
  },
);

// Fails BEFORE ever actually writing — simulates a genuine, certain
// non-commit (e.g. a rejected transaction), distinct from
// CommitsThenReportsFailureFixtureStore below (which commits for real and
// THEN throws, simulating an uncertain/false failure signal).
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
  "applyLegacyMediaRebind cleans up the uploaded object when the atomic write genuinely never committed, leaving nothing untracked behind (reviewer-caught finding: a failed custody-copy write must not let a later deletion report completion while media survives)",
  async () => {
    const fixtureStore = new FlakyCustodyCopyFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const committer = new InMemoryCustodyCopyCommitter(fixtureStore, registerStore);
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const mediaId = active.record.mediaRefs[0].mediaId;

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore, committer);
    // An uncertain error (not DeletionInProgressError/VersionConflictError)
    // whose recheck confirms the write genuinely never committed, and
    // whose cleanup succeeds, is reported as "skipped-ineligible" — the
    // orphan was fully resolved, nothing needs a human's attention.
    assert.equal(result.outcome, "skipped-ineligible");

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

test(
  "CustodyCopyCommitter.commitIfNotDeleting refuses, atomically, once custody has moved into the deletion workflow (reviewer-caught finding: migration can still race deletion)",
  async () => {
    const { fixtureStore, registerStore, committer, recordId, mediaId } = await setupActive();
    const record = await fixtureStore.getRecord(recordId);
    if (!record) throw new Error("sanity check failed");

    await startDeletion(fixtureStore, registerStore, {
      requestId: "req-legacy-migration-committer-deletion-pending",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    await assert.rejects(
      () =>
        committer.commitIfNotDeleting(record, record.version, {
          recordId,
          copyId: "fake-copy-id",
          location: "primary",
          objectVersionId: "fake-version-id",
          mediaId,
          createdAt: new Date().toISOString(),
          reconciledAt: null,
        }),
      DeletionInProgressError,
    );

    const after = await fixtureStore.getRecord(recordId);
    assert.deepEqual(after?.mediaRefs, record.mediaRefs, "the record must be completely untouched when the commit is refused");
    const copies = await fixtureStore.listCustodyCopies(recordId);
    assert.ok(
      !copies.some((c) => c.copyId === "fake-copy-id"),
      "the rejected custody copy must not have been created when the commit is refused (the fixture's own pre-existing bookkeeping copy is expected to still be there)",
    );
  },
);

test(
  "applyLegacyMediaRebind refuses, atomically, even when deletion lands entirely in the gap between the early check and the upload finishing (reviewer-caught finding: migration can still race deletion)",
  async () => {
    const { fixtureStore, registerStore, committer, recordId, mediaId } = await setupActive();

    // Simulates startDeletion() landing in the exact window a separate
    // "check, then upload, then write" sequence cannot close: AFTER the
    // early fresh custody check passed, but BEFORE the atomic commit. The
    // upload itself is the most realistic place for this to happen, since
    // it is the one step that takes real wall-clock time against S3.
    const racingMediaStore = new InMemoryMediaStore();
    const originalPutObject = racingMediaStore.putObject.bind(racingMediaStore);
    let triggered = false;
    racingMediaStore.putObject = async (...args) => {
      const result = await originalPutObject(...args);
      if (!triggered) {
        triggered = true;
        await startDeletion(fixtureStore, registerStore, {
          requestId: "req-legacy-migration-apply-race-delete",
          recordId,
          requesterCapacity: "[SYNTHETIC] steward",
          reason: "[SYNTHETIC] test",
        });
      }
      return result;
    };

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, racingMediaStore, committer);
    // A DEFINITE refusal (DeletionInProgressError) whose cleanup succeeds
    // is "skipped-ineligible" — confirmed below via the real S3 listing,
    // not a cleanedUp field (that only exists on needs-reconciliation).
    assert.equal(result.outcome, "skipped-ineligible");

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await racingMediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 0, "no untracked S3 object must survive — the atomic commit never let the record+copy write land");

    const record = await fixtureStore.getRecord(recordId);
    const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
    assert.equal(media?.versionId, null, "the record must stay untouched by the refused commit");
    const copies = await fixtureStore.listCustodyCopies(recordId);
    assert.ok(
      !copies.some((c) => c.mediaId === mediaId),
      "no custody copy tracking this media must survive a refused commit",
    );
  },
);

// Commits for REAL (delegates to the base implementation) and THEN
// throws — simulating a transaction that actually succeeded on the server
// but whose success response never reached the client (a timeout, a
// dropped connection). Distinct from FlakyCustodyCopyFixtureStore above,
// which never commits at all.
class CommitsThenReportsFailureFixtureStore extends InMemoryFixtureStore {
  override async putRecordWithCustodyCopy(
    ...args: Parameters<InMemoryFixtureStore["putRecordWithCustodyCopy"]>
  ): Promise<void> {
    await super.putRecordWithCustodyCopy(...args);
    throw new Error("simulated network failure after the server actually committed the transaction");
  }
}

test(
  "applyLegacyMediaRebind does NOT clean up a binding that actually committed, even when the client is told it failed (reviewer-caught finding: cleanup can destroy a successful binding)",
  async () => {
    const fixtureStore = new CommitsThenReportsFailureFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const committer = new InMemoryCustodyCopyCommitter(fixtureStore, registerStore);
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const mediaId = active.record.mediaRefs[0].mediaId;

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore, committer);
    assert.equal(result.outcome, "rebound", "the idempotent recheck must detect the write actually committed, not report a false failure");

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await mediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 1, "the real, committed object must NOT be deleted just because the client was told the write failed");

    const record = await fixtureStore.getRecord(recordId);
    const media = record?.mediaRefs.find((m) => m.mediaId === mediaId);
    assert.notEqual(media?.versionId, null, "the record's media reference must reflect the real, committed binding");
    const copies = await fixtureStore.listCustodyCopies(recordId);
    assert.ok(
      copies.some((c) => c.mediaId === mediaId && c.objectVersionId === media?.versionId),
      "the committed CustodyCopy must still exist, still pointing at the real (not deleted) object",
    );
  },
);

// Throws from its second call onward — simulates a recovery read (the
// idempotent recheck) failing, without affecting the FIRST call (the
// early eligibility check, which must always succeed for the test to
// reach the upload/commit stage at all).
class ThrowsOnSecondGetFixtureStore extends InMemoryFixtureStore {
  private getCalls = 0;
  override async getRecord(recordId: string) {
    this.getCalls += 1;
    if (this.getCalls > 1) {
      throw new Error("simulated read failure — a recheck must never be attempted for a DEFINITE non-commit signal");
    }
    return super.getRecord(recordId);
  }
}

test(
  "applyLegacyMediaRebind handles a DEFINITE custody refusal without a second read at all — cleanup still proceeds even though a recheck would fail (reviewer-caught finding: a failed follow-up read bypassed cleanup)",
  async () => {
    const fixtureStore = new ThrowsOnSecondGetFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const committer = new InMemoryCustodyCopyCommitter(fixtureStore, registerStore);
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const mediaId = active.record.mediaRefs[0].mediaId;

    // Same race-injection technique as the earlier "lands entirely in the
    // gap" test: deletion starts right after the upload, AFTER the early
    // check already passed, so the atomic commit is refused with a
    // DEFINITE DeletionInProgressError.
    const racingMediaStore = new InMemoryMediaStore();
    const originalPutObject = racingMediaStore.putObject.bind(racingMediaStore);
    racingMediaStore.putObject = async (...args) => {
      const result = await originalPutObject(...args);
      await startDeletion(fixtureStore, registerStore, {
        requestId: "req-legacy-migration-second-round-race-delete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
      });
      return result;
    };

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, racingMediaStore, committer);
    // Must not throw uncaught (it would, if the implementation still
    // attempted a second read here) and must still clean up correctly.
    assert.equal(result.outcome, "skipped-ineligible");

    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;
    const versions = await racingMediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 0, "cleanup must have succeeded even though a recheck read would have failed if attempted");
  },
);

// Commits uncertainly (throws a GENERIC error, not DeletionInProgressError/
// VersionConflictError — simulating a timeout or dropped connection with
// no definite signal either way) AND fails the recovery read that would
// normally resolve that uncertainty.
class UncertainCommitAndFailingRecheckFixtureStore extends InMemoryFixtureStore {
  private committed = false;
  private getCalls = 0;
  override async getRecord(recordId: string) {
    this.getCalls += 1;
    if (this.getCalls > 1) {
      throw new Error("simulated recovery-read failure");
    }
    return super.getRecord(recordId);
  }
  override async putRecordWithCustodyCopy(
    ...args: Parameters<InMemoryFixtureStore["putRecordWithCustodyCopy"]>
  ): Promise<void> {
    if (!this.committed) {
      this.committed = true;
      throw new Error("simulated uncertain write failure (not a definite refusal)");
    }
    return super.putRecordWithCustodyCopy(...args);
  }
}

test(
  "applyLegacyMediaRebind reports needs-reconciliation, preserving BOTH failure messages, when an uncertain write's recovery read itself fails (reviewer-caught finding: a failed follow-up read bypassed cleanup)",
  async () => {
    const fixtureStore = new UncertainCommitAndFailingRecheckFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const committer = new InMemoryCustodyCopyCommitter(fixtureStore, registerStore);
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const mediaId = active.record.mediaRefs[0].mediaId;
    const uploadedKey = `fixtures/legacy-migration/${recordId}/${mediaId}.txt`;

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, mediaStore, committer);
    assert.equal(result.outcome, "needs-reconciliation");
    if (result.outcome === "needs-reconciliation") {
      assert.match(result.reason, /simulated uncertain write failure/, "the original write failure must be preserved");
      assert.match(result.reason, /simulated recovery-read failure/, "the recovery-read failure must ALSO be preserved, not lost");
      assert.equal(result.objectKey, uploadedKey);
    }

    // Cleanup must NOT have been attempted — the commit status could not
    // be verified, so deleting the object would risk destroying a real
    // binding. The uploaded object must still be present, untouched.
    const versions = await mediaStore.listObjectVersions(uploadedKey);
    assert.equal(versions.length, 1, "the uploaded object must be left untouched when its commit status cannot be verified");
  },
);

// Always fails the delete call — simulates S3 cleanup itself failing.
class FailingDeleteMediaStore extends InMemoryMediaStore {
  override async deleteObjectVersion(): Promise<void> {
    throw new Error("simulated S3 delete failure");
  }
}

test(
  "applyLegacyMediaRebind reports needs-reconciliation, not skipped-ineligible, when a DEFINITE refusal's cleanup itself fails (reviewer-caught finding: failed cleanup must count as a failure requiring reconciliation, never a quiet success)",
  async () => {
    const { fixtureStore, registerStore, committer, recordId, mediaId } = await setupActive();
    const failingDeleteMediaStore = new FailingDeleteMediaStore();
    const originalPutObject = failingDeleteMediaStore.putObject.bind(failingDeleteMediaStore);
    failingDeleteMediaStore.putObject = async (...args) => {
      const result = await originalPutObject(...args);
      await startDeletion(fixtureStore, registerStore, {
        requestId: "req-legacy-migration-cleanup-fails-delete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
      });
      return result;
    };

    const result = await applyLegacyMediaRebind({ recordId, mediaId }, fixtureStore, registerStore, failingDeleteMediaStore, committer);
    assert.equal(result.outcome, "needs-reconciliation");
    if (result.outcome === "needs-reconciliation") {
      assert.equal(result.objectKey, `fixtures/legacy-migration/${recordId}/${mediaId}.txt`);
      assert.match(result.reason, /CLEANUP FAILED/);
    }
  },
);
