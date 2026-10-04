import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "../store/store";
import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  Correction,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
  Redaction,
  RestrictionRegisterEntry,
} from "../domain/types";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { InMemoryMediaStore } from "../store/mediaStore";
import {
  withdraw,
  restrict,
  retainForPreservationOnly,
  startDeletion,
  completeDeletion,
  correctRecord,
  disputeCorrection,
  redactText,
  redactMedia,
  MediaPurgeInProgressError,
} from "./lifecycle";
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

// Delegates to a real InMemoryFixtureStore for everything except
// deleteRecord, which throws once (simulating the primary record-removal
// step failing AFTER the register has already durably recorded "deleted")
// and then behaves normally on every call after. Used to prove
// completeDeletion's partial-failure state is actually resumable — see the
// reviewer's "recovery cannot resume" finding.
class FailOnceOnDeleteFixtureStore implements FixtureStore {
  private failed = false;
  constructor(private inner: FixtureStore) {}
  getRecord(recordId: string) {
    return this.inner.getRecord(recordId);
  }
  putRecord(record: Parameters<FixtureStore["putRecord"]>[0], expectedVersion: number | undefined) {
    return this.inner.putRecord(record, expectedVersion);
  }
  async deleteRecord(recordId: string, expectedVersion: number): Promise<void> {
    if (!this.failed) {
      this.failed = true;
      throw new Error("simulated primary-deletion failure");
    }
    return this.inner.deleteRecord(recordId, expectedVersion);
  }
  listAuthorityClaims(recordId: string) {
    return this.inner.listAuthorityClaims(recordId);
  }
  putAuthorityClaim(claim: AuthorityClaim) {
    return this.inner.putAuthorityClaim(claim);
  }
  listLegalRights(recordId: string) {
    return this.inner.listLegalRights(recordId);
  }
  putLegalRight(right: LegalRight) {
    return this.inner.putLegalRight(right);
  }
  listConsentGrants(recordId: string) {
    return this.inner.listConsentGrants(recordId);
  }
  putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined) {
    return this.inner.putConsentGrant(grant, expectedVersion);
  }
  listCustodyCopies(recordId: string) {
    return this.inner.listCustodyCopies(recordId);
  }
  putCustodyCopy(copy: CustodyCopy) {
    return this.inner.putCustodyCopy(copy);
  }
  createLifecycleRequest(request: LifecycleRequest) {
    return this.inner.createLifecycleRequest(request);
  }
  getLifecycleRequest(requestId: string) {
    return this.inner.getLifecycleRequest(requestId);
  }
  updateLifecycleRequest(request: LifecycleRequest) {
    return this.inner.updateLifecycleRequest(request);
  }
  listLifecycleRequestsByStatus(status: LifecycleRequestStatus) {
    return this.inner.listLifecycleRequestsByStatus(status);
  }
  putAuditReceipt(receipt: AuditReceipt) {
    return this.inner.putAuditReceipt(receipt);
  }
  listAuditReceipts(recordId: string) {
    return this.inner.listAuditReceipts(recordId);
  }
  putCorrection(correction: Correction) {
    return this.inner.putCorrection(correction);
  }
  listCorrections(recordId: string) {
    return this.inner.listCorrections(recordId);
  }
  putRedaction(redaction: Redaction) {
    return this.inner.putRedaction(redaction);
  }
  listRedactions(recordId: string) {
    return this.inner.listRedactions(recordId);
  }
  putRecordWithCorrection(record: FixtureRecord, expectedVersion: number | undefined, correction: Correction) {
    return this.inner.putRecordWithCorrection(record, expectedVersion, correction);
  }
  putRecordWithRedaction(record: FixtureRecord, expectedVersion: number | undefined, redaction: Redaction) {
    return this.inner.putRecordWithRedaction(record, expectedVersion, redaction);
  }
}

// Delegates to a real FixtureStore for everything, except its atomic
// putRecordWithCorrection/putRecordWithRedaction, which throw ONCE (then
// behave normally) — simulating the history half of the atomic write
// failing after the field change was computed but before either part
// committed. Used to prove correctRecord()/redactText() genuinely commit
// the field and its history together: a reviewer caught that the
// PREVIOUS version wrote the field first and history separately, so a
// failure in between (or a retry after full success) could lose the true
// original or corrupt history.
class FailOnceOnHistoryWriteFixtureStore implements FixtureStore {
  private failed = false;
  constructor(private inner: FixtureStore) {}
  getRecord(recordId: string) {
    return this.inner.getRecord(recordId);
  }
  putRecord(record: Parameters<FixtureStore["putRecord"]>[0], expectedVersion: number | undefined) {
    return this.inner.putRecord(record, expectedVersion);
  }
  deleteRecord(recordId: string, expectedVersion: number) {
    return this.inner.deleteRecord(recordId, expectedVersion);
  }
  listAuthorityClaims(recordId: string) {
    return this.inner.listAuthorityClaims(recordId);
  }
  putAuthorityClaim(claim: AuthorityClaim) {
    return this.inner.putAuthorityClaim(claim);
  }
  listLegalRights(recordId: string) {
    return this.inner.listLegalRights(recordId);
  }
  putLegalRight(right: LegalRight) {
    return this.inner.putLegalRight(right);
  }
  listConsentGrants(recordId: string) {
    return this.inner.listConsentGrants(recordId);
  }
  putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined) {
    return this.inner.putConsentGrant(grant, expectedVersion);
  }
  listCustodyCopies(recordId: string) {
    return this.inner.listCustodyCopies(recordId);
  }
  putCustodyCopy(copy: CustodyCopy) {
    return this.inner.putCustodyCopy(copy);
  }
  createLifecycleRequest(request: LifecycleRequest) {
    return this.inner.createLifecycleRequest(request);
  }
  getLifecycleRequest(requestId: string) {
    return this.inner.getLifecycleRequest(requestId);
  }
  updateLifecycleRequest(request: LifecycleRequest) {
    return this.inner.updateLifecycleRequest(request);
  }
  listLifecycleRequestsByStatus(status: LifecycleRequestStatus) {
    return this.inner.listLifecycleRequestsByStatus(status);
  }
  putAuditReceipt(receipt: AuditReceipt) {
    return this.inner.putAuditReceipt(receipt);
  }
  listAuditReceipts(recordId: string) {
    return this.inner.listAuditReceipts(recordId);
  }
  putCorrection(correction: Correction) {
    return this.inner.putCorrection(correction);
  }
  listCorrections(recordId: string) {
    return this.inner.listCorrections(recordId);
  }
  putRedaction(redaction: Redaction) {
    return this.inner.putRedaction(redaction);
  }
  listRedactions(recordId: string) {
    return this.inner.listRedactions(recordId);
  }
  async putRecordWithCorrection(record: FixtureRecord, expectedVersion: number | undefined, correction: Correction) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("simulated history-write failure");
    }
    return this.inner.putRecordWithCorrection(record, expectedVersion, correction);
  }
  async putRecordWithRedaction(record: FixtureRecord, expectedVersion: number | undefined, redaction: Redaction) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("simulated history-write failure");
    }
    return this.inner.putRecordWithRedaction(record, expectedVersion, redaction);
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
    mediaId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  });

  const startResult = await startDeletion(fixtureStore, registerStore, {
    requestId: "req-delete-pending",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });

  const firstAttempt = await completeDeletion(fixtureStore, registerStore, {
    requestId: "req-complete-delete-pending",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] complete test",
    deletionRequestId: startResult.requestId,
  });
  assert.equal(firstAttempt.status, "in-progress", "outstanding copies must leave it retryable, not denied or completed");

  await fixtureStore.putCustodyCopy({
    recordId,
    copyId: "outstanding-copy",
    location: "backup",
    objectVersionId: null,
    mediaId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: new Date().toISOString(),
  });

  // Same requestId as the first attempt — retrying the SAME completion
  // request once its precondition (reconciled copies) is actually met.
  const secondAttempt = await completeDeletion(fixtureStore, registerStore, {
    requestId: "req-complete-delete-pending",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] complete test",
    deletionRequestId: startResult.requestId,
  });
  assert.equal(secondAttempt.status, "completed");

  const current = await registerStore.getCurrent(recordId);
  assert.equal(current?.currentCustodyStatus, "deleted");
});

test("completeDeletion actually removes the primary record, not just a status flag (Finding 5a)", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();

  const startResult = await startDeletion(fixtureStore, registerStore, {
    requestId: "req-delete-full",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });

  const result = await completeDeletion(fixtureStore, registerStore, {
    requestId: "req-complete-delete-full",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] complete test",
    deletionRequestId: startResult.requestId,
  });
  assert.equal(result.status, "completed");

  const record = await fixtureStore.getRecord(recordId);
  assert.equal(record, null, "the primary record must actually be gone, not merely flagged deleted in the register");
});

test(
  "completeDeletion resumes a partial failure instead of being permanently denied (recovery finding)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;

    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-delete-partial",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    const flaky = new FailOnceOnDeleteFixtureStore(fixtureStore);

    await assert.rejects(
      () =>
        completeDeletion(flaky, registerStore, {
          requestId: "req-complete-partial",
          recordId,
          requesterCapacity: "[SYNTHETIC] steward",
          reason: "[SYNTHETIC] complete test",
          deletionRequestId: startResult.requestId,
        }),
      /simulated primary-deletion failure/,
    );

    const afterFirstAttempt = await registerStore.getCurrent(recordId);
    assert.equal(
      afterFirstAttempt?.currentCustodyStatus,
      "deleted",
      "the register write durably succeeds even though the record-removal step fails right after",
    );
    const recordStillPresent = await fixtureStore.getRecord(recordId);
    assert.ok(recordStillPresent, "the record must still be present — only the register write landed");

    const requestAfterFailure = await fixtureStore.getLifecycleRequest("req-complete-partial");
    assert.equal(
      requestAfterFailure?.status,
      "in-progress",
      "a transient failure must leave the request retryable, not denied",
    );

    // Retry with the SAME requestId — deleteRecord succeeds this time. The
    // old code denied this because custody was no longer "deletion-pending"
    // (it was already "deleted" from the first attempt) — that's exactly
    // the bug: a partial failure could never be resumed.
    const secondAttempt = await completeDeletion(flaky, registerStore, {
      requestId: "req-complete-partial",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] complete test",
      deletionRequestId: startResult.requestId,
    });
    assert.equal(
      secondAttempt.status,
      "completed",
      "resuming after the partial failure must be able to finish the job",
    );

    const finalRecord = await fixtureStore.getRecord(recordId);
    assert.equal(finalRecord, null, "the record must actually be removed once the retry succeeds");
  },
);

test(
  "completeDeletion refuses when custody changes away from deletion-pending before the final transition, instead of deleting anyway (stale-precondition finding)",
  async () => {
    const { fixtureStore, registerStore, recordId } = await setupActive();

    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-delete-toctou",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    // Simulates a retention action landing in the window between
    // completeDeletion's custody-copies check and its own fresh read of the
    // register at write time — exactly the ordering the reviewer reproduced.
    await retainForPreservationOnly(fixtureStore, registerStore, {
      requestId: "req-retain-race",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] retention overrides deletion",
    });

    const result = await completeDeletion(fixtureStore, registerStore, {
      requestId: "req-complete-toctou",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] complete test",
      deletionRequestId: startResult.requestId,
    });

    assert.equal(
      result.status,
      "denied",
      "a retention action that overrides custody must deny completion, not delete the record anyway",
    );
    const record = await fixtureStore.getRecord(recordId);
    assert.ok(record, "the record must still be present — retention wins the race");
    const current = await registerStore.getCurrent(recordId);
    assert.equal(
      current?.currentCustodyStatus,
      "preserved",
      "custody must remain preserved, not be overwritten to deleted",
    );
  },
);

test(
  "concurrent lifecycle actions derived from the same snapshot: only one wins, never a silently merged/corrupted result (Finding 2)",
  async () => {
    const { fixtureStore, registerStore, recordId } = await setupActive();

    const [deleteResult, restrictResult] = await Promise.allSettled([
      startDeletion(fixtureStore, registerStore, {
        requestId: "req-race-delete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] race test",
      }),
      restrict(
        fixtureStore,
        registerStore,
        { requestId: "req-race-restrict", recordId, requesterCapacity: "[SYNTHETIC] staff", reason: "[SYNTHETIC] race test" },
        ["research"],
      ),
    ]);

    const statuses = [deleteResult.status, restrictResult.status];
    assert.ok(statuses.includes("fulfilled"), "one of the two concurrent actions must succeed");
    assert.ok(
      statuses.includes("rejected"),
      "the losing action must be rejected with a version conflict, not silently dropped or merged — this is " +
        "the reviewer's repro: deletion interleaved with a restriction previously ended up published/preserved",
    );

    const finalState = await registerStore.getCurrent(recordId);
    if (deleteResult.status === "fulfilled") {
      assert.equal(finalState?.currentCustodyStatus, "deletion-pending");
      assert.equal(finalState?.currentPublicationStatus, "withdrawn");
    } else {
      assert.equal(finalState?.currentCustodyStatus, "preserved");
      assert.ok(finalState?.restrictedPurposes.includes("research"));
    }

    // Whichever action won, the register's controlVersion must have advanced
    // exactly once from the seeded baseline (1 -> 2) — never twice, which
    // would mean both writes landed and the exact-match guard didn't actually
    // stop the losing one.
    assert.equal(finalState?.controlVersion, 2);
  },
);

async function setupActiveWithMedia() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);
  return { fixtureStore, registerStore, mediaStore, recordId: active.record.recordId, active };
}

test(
  "completeDeletion purges every S3 version of each media object — including a second, superseded version — before reconciling (media-aware deletion)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, recordId, active } = await setupActiveWithMedia();
    const binaryMedia = active.record.mediaRefs[1];
    // Sanity check: the binary object really does have two versions before
    // deletion runs, exactly the "removing a delete marker alone is
    // insufficient" scenario this is meant to prove isn't a problem here.
    assert.equal((await mediaStore.listObjectVersions(binaryMedia.objectKey)).length, 2);

    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-media-delete-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });
    const result = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-media-delete-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );

    assert.equal(result.status, "completed");
    assert.equal(await fixtureStore.getRecord(recordId), null);
    assert.deepEqual(
      await mediaStore.listObjectVersions(binaryMedia.objectKey),
      [],
      "BOTH versions of the media object must be gone, not just the one the MediaRef was pinned to",
    );
    assert.deepEqual(await mediaStore.listObjectVersions(active.record.mediaRefs[0].objectKey), []);
  },
);

test(
  "completeDeletion without a mediaStore leaves media-tracked copies outstanding — never silently skipped (media-aware deletion)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, recordId } = await setupActiveWithMedia();
    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-media-noMediaStore-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    // No mediaStore passed — must block exactly like any other outstanding
    // copy, not silently proceed as if media had nothing to reconcile.
    const blocked = await completeDeletion(fixtureStore, registerStore, {
      requestId: "req-media-noMediaStore-complete",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
      deletionRequestId: startResult.requestId,
    });
    assert.equal(blocked.status, "in-progress");
    assert.ok(await fixtureStore.getRecord(recordId), "must not delete the record while media copies are untouched");

    // Retrying the SAME request, now WITH the mediaStore, finishes the job.
    const done = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-media-noMediaStore-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );
    assert.equal(done.status, "completed");
    assert.equal(await fixtureStore.getRecord(recordId), null);
  },
);

class FlakyOnceMediaStore extends InMemoryMediaStore {
  private failedFor = new Set<string>();
  flakyKey: string | null = null;
  override async deleteObjectVersion(key: string, versionId: string): Promise<void> {
    if (key === this.flakyKey && !this.failedFor.has(key)) {
      this.failedFor.add(key);
      throw new Error("simulated transient S3 failure");
    }
    return super.deleteObjectVersion(key, versionId);
  }
}

test(
  "completeDeletion resumes correctly when a media purge partially fails — the failed object stays outstanding, others don't block on it (media-aware deletion)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    const flaky = new FlakyOnceMediaStore();
    await bindSeedMedia(flaky, active);
    const binaryMedia = active.record.mediaRefs[1];
    flaky.flakyKey = binaryMedia.objectKey; // now that the real key is known
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;

    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-media-flaky-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    const firstAttempt = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-media-flaky-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      flaky,
    );
    assert.equal(firstAttempt.status, "in-progress", "a transient purge failure must stay retryable, not deny or crash");
    assert.ok(await fixtureStore.getRecord(recordId), "the record must still exist after a partial media-purge failure");

    const secondAttempt = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-media-flaky-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      flaky,
    );
    assert.equal(secondAttempt.status, "completed", "retrying must finish once the transient failure has passed");
    assert.equal(await fixtureStore.getRecord(recordId), null);
  },
);

test(
  "completeDeletion refuses to purge media when retention ran after startDeletion — a denial must never destroy the media it was supposed to retain (reviewer-caught finding)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, recordId, active } = await setupActiveWithMedia();
    const textMedia = active.record.mediaRefs[0];
    const binaryMedia = active.record.mediaRefs[1];
    const versionsBefore = await mediaStore.listObjectVersions(binaryMedia.objectKey);
    assert.equal(versionsBefore.length, 2, "sanity check: the binary object really does have real versions to destroy");

    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-retain-media-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });
    // A real retention action runs AFTER startDeletion but BEFORE
    // completeDeletion — exactly the reviewer's repro.
    await retainForPreservationOnly(fixtureStore, registerStore, {
      requestId: "req-retain-media-retain",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] retention overrides deletion",
    });

    const result = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-retain-media-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );

    assert.equal(result.status, "denied", "retention must deny completion, same as the non-media stale-precondition case");
    assert.ok(await fixtureStore.getRecord(recordId), "the record must still exist");

    // The actual point of this test: the media must be COMPLETELY untouched,
    // not just "the record survived". A denial must never have irreversible
    // side effects.
    const versionsAfter = await mediaStore.listObjectVersions(binaryMedia.objectKey);
    assert.deepEqual(
      versionsAfter.map((v) => v.versionId).sort(),
      versionsBefore.map((v) => v.versionId).sort(),
      "every version of the binary media object must still be present — retention must not be destroyed by a denied deletion",
    );
    const textVersions = await mediaStore.listObjectVersions(textMedia.objectKey);
    assert.equal(textVersions.length, 1, "the text media object must also be untouched");

    const current = await registerStore.getCurrent(recordId);
    assert.equal(current?.currentCustodyStatus, "preserved", "custody must remain preserved, not flip toward deletion");
  },
);

// Wraps a REAL RestrictionRegisterStore and, on its first getCurrent()
// call, runs an "interleave" callback to real completion BEFORE returning
// the (now stale) snapshot — simulating a retention action landing in the
// EXACT gap between completeDeletion's read and its own write, which is
// the reviewer's precise reproduction of the first fix's remaining race.
// Works against either the in-memory fake or the real DynamoDB adapter,
// since it only depends on the RestrictionRegisterStore interface.
class InterleavingRegisterStore implements RestrictionRegisterStore {
  private triggered = false;
  private callCount = 0;
  constructor(
    private readonly inner: RestrictionRegisterStore,
    private readonly interleave: () => Promise<void>,
    // Which getCurrent() call (1-indexed) runs the interleave — defaults
    // to the first, matching every existing use of this class. A later
    // call lets a test land the interleave at a LATER point in a
    // multi-read function (e.g. completeDeletion's claim read is call 1,
    // its final-commit read is call 2) without needing a second class.
    private readonly triggerOnCall: number = 1,
  ) {}
  async getCurrent(recordId: string) {
    this.callCount += 1;
    const snapshot = await this.inner.getCurrent(recordId);
    if (!this.triggered && this.callCount === this.triggerOnCall) {
      this.triggered = true;
      await this.interleave();
    }
    return snapshot;
  }
  setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined) {
    return this.inner.setCurrent(entry, expectedVersion);
  }
  listAll() {
    return this.inner.listAll();
  }
}

test(
  "a retention action that races into the EXACT gap between completeDeletion's custody read and its claim write is still caught — media is never purged (reviewer's second-round finding)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const realRegisterStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, realRegisterStore, [active]);
    const recordId = active.record.recordId;
    const binaryMedia = active.record.mediaRefs[1];
    const versionsBefore = await mediaStore.listObjectVersions(binaryMedia.objectKey);
    assert.equal(versionsBefore.length, 2, "sanity check: real versions exist to destroy");

    const startResult = await startDeletion(fixtureStore, realRegisterStore, {
      requestId: "req-interleave-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    // The interleaving store makes completeDeletion's claim-step READ a
    // snapshot from BEFORE retention ran, but retention's OWN write lands
    // in the real store in between — exactly the reported race, reproduced
    // deterministically rather than hoped-for via real concurrency.
    const interleavingStore = new InterleavingRegisterStore(realRegisterStore, async () => {
      await retainForPreservationOnly(fixtureStore, realRegisterStore, {
        requestId: "req-interleave-retain",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] races into the exact gap",
      });
    });

    await assert.rejects(
      () =>
        completeDeletion(
          fixtureStore,
          interleavingStore,
          {
            requestId: "req-interleave-complete",
            recordId,
            requesterCapacity: "[SYNTHETIC] steward",
            reason: "[SYNTHETIC] test",
            deletionRequestId: startResult.requestId,
          },
          mediaStore,
        ),
      (error: unknown) => error instanceof VersionConflictError,
      "completeDeletion's claim write must lose to retention's already-landed write, not silently proceed",
    );

    const current = await realRegisterStore.getCurrent(recordId);
    assert.equal(current?.currentCustodyStatus, "preserved", "retention must have actually won the race");
    const versionsAfter = await mediaStore.listObjectVersions(binaryMedia.objectKey);
    assert.deepEqual(
      versionsAfter.map((v) => v.versionId).sort(),
      versionsBefore.map((v) => v.versionId).sort(),
      "media must be COMPLETELY untouched — the exact reviewer repro this test closes",
    );
  },
);

test(
  "retainForPreservationOnly refuses while a media purge claim is active, instead of silently overwriting custody mid-purge",
  async () => {
    const { fixtureStore, registerStore, recordId } = await setupActiveWithMedia();
    const currentEntry = await registerStore.getCurrent(recordId);
    // Simulate an in-flight purge by setting the claim directly, the same
    // shape completeDeletion's own claim-write would produce.
    await registerStore.setCurrent(
      {
        ...currentEntry!,
        mediaPurgeClaim: { requestId: "some-other-completion", claimedAt: new Date().toISOString() },
        controlVersion: currentEntry!.controlVersion + 1,
      },
      currentEntry!.controlVersion,
    );

    await assert.rejects(
      () =>
        retainForPreservationOnly(fixtureStore, registerStore, {
          requestId: "req-retain-blocked",
          recordId,
          requesterCapacity: "[SYNTHETIC] steward",
          reason: "[SYNTHETIC] test",
        }),
      (error: unknown) => error instanceof MediaPurgeInProgressError,
    );

    // currentCustodyStatus is already "preserved" at seed time for this
    // fixture family, so it can't discriminate "did retention actually
    // run" — restrictedPurposes (empty at seed, retention's specific long
    // list once applied) and the request's own status both can.
    const after = await registerStore.getCurrent(recordId);
    assert.deepEqual(after?.restrictedPurposes, [], "retention's restrictedPurposes write must never have landed while the claim was active");
    const blockedRequest = await fixtureStore.getLifecycleRequest("req-retain-blocked");
    assert.equal(blockedRequest?.status, "in-progress", "a refused attempt must stay retryable, not silently marked completed");
  },
);

test("completeDeletion releases its media purge claim after finishing, so retention isn't left permanently blocked", async () => {
  const { fixtureStore, registerStore, mediaStore, recordId } = await setupActiveWithMedia();
  const startResult = await startDeletion(fixtureStore, registerStore, {
    requestId: "req-claim-release-start",
    recordId,
    requesterCapacity: "[SYNTHETIC] steward",
    reason: "[SYNTHETIC] test",
  });
  await completeDeletion(
    fixtureStore,
    registerStore,
    {
      requestId: "req-claim-release-complete",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
      deletionRequestId: startResult.requestId,
    },
    mediaStore,
  );
  const current = await registerStore.getCurrent(recordId);
  assert.equal(current?.mediaPurgeClaim ?? null, null, "the claim must be released once the purge attempt concludes, not left stuck");
});

test(
  "a retention action racing into the window AFTER media purge but BEFORE the final commit is refused — the claim is held continuously, not released early (reviewer-caught finding, round three)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const realRegisterStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, realRegisterStore, [active]);
    const recordId = active.record.recordId;

    const startResult = await startDeletion(fixtureStore, realRegisterStore, {
      requestId: "req-postpurge-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    let retentionOutcome: unknown;
    // Interleave on the SECOND getCurrent() call: completeDeletion's
    // claim-write read is the first; its final-commit read (AFTER
    // purgeMediaCustody has already run) is the second. The old bug
    // released the claim right after the purge, before this exact read —
    // a retention action landing here could then win the register even
    // though the media was already destroyed. The fix holds the claim
    // continuously through this read, so retention here must still lose.
    const interleavingStore = new InterleavingRegisterStore(
      realRegisterStore,
      async () => {
        retentionOutcome = await retainForPreservationOnly(fixtureStore, realRegisterStore, {
          requestId: "req-postpurge-retain",
          recordId,
          requesterCapacity: "[SYNTHETIC] steward",
          reason: "[SYNTHETIC] races into the post-purge window",
        }).catch((error: unknown) => error);
      },
      2,
    );

    const result = await completeDeletion(
      fixtureStore,
      interleavingStore,
      {
        requestId: "req-postpurge-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );

    assert.ok(
      retentionOutcome instanceof MediaPurgeInProgressError,
      "retention racing into the post-purge, pre-commit window must still be refused, not silently win it",
    );
    assert.equal(result.status, "completed", "the deletion itself must still complete — the claim it held was never actually released early");
    assert.equal(await fixtureStore.getRecord(recordId), null);
  },
);

test(
  "completeDeletion resumes a claim it already owns instead of refusing it as foreign — only a DIFFERENT requestId's claim is refused (reviewer-caught finding)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, recordId } = await setupActiveWithMedia();
    const startResult = await startDeletion(fixtureStore, registerStore, {
      requestId: "req-claim-owner-start",
      recordId,
      requesterCapacity: "[SYNTHETIC] steward",
      reason: "[SYNTHETIC] test",
    });

    // Simulate a claim left over from an earlier attempt under THIS SAME
    // completion requestId — e.g. a purge that failed, and whose release
    // in the deny/abandon path then ALSO failed, leaving the claim stuck
    // but still correctly attributed to the request that's about to retry.
    const current = await registerStore.getCurrent(recordId);
    await registerStore.setCurrent(
      {
        ...current!,
        mediaPurgeClaim: { requestId: "req-claim-owner-complete", claimedAt: new Date().toISOString() },
        controlVersion: current!.controlVersion + 1,
      },
      current!.controlVersion,
    );

    // A DIFFERENT requestId must still be refused — the claim is foreign to it.
    const foreignAttempt = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-claim-other-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    ).catch((error: unknown) => error);
    assert.ok(foreignAttempt instanceof MediaPurgeInProgressError, "a claim held by a DIFFERENT requestId must still refuse");

    // The SAME requestId that owns the claim must be able to resume —
    // never denied just because a claim already exists.
    const resumed = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: "req-claim-owner-complete",
        recordId,
        requesterCapacity: "[SYNTHETIC] steward",
        reason: "[SYNTHETIC] test",
        deletionRequestId: startResult.requestId,
      },
      mediaStore,
    );
    assert.equal(resumed.status, "completed", "the claim's OWN requestId must resume it, not be refused as a foreign conflict");
    assert.equal(await fixtureStore.getRecord(recordId), null);
  },
);

// ------------------------------------------------- versioned correction --

test("correctRecord replaces the live field but preserves the previous value in correction history", async () => {
  const { fixtureStore, recordId } = await setupActive();
  const before = await fixtureStore.getRecord(recordId);

  const result = await correctRecord(fixtureStore, {
    requestId: "req-correct-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] fixing a transcription error",
    field: "summary",
    correctedValue: "[SYNTHETIC] corrected summary text",
  });
  assert.equal(result.status, "completed");

  const after = await fixtureStore.getRecord(recordId);
  assert.equal(after?.summary, "[SYNTHETIC] corrected summary text", "readers must see the corrected text immediately");

  const corrections = await fixtureStore.listCorrections(recordId);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].previousValue, before?.summary, "the previous value must be preserved, not erased");
  assert.equal(corrections[0].correctedValue, "[SYNTHETIC] corrected summary text");
  assert.equal(corrections[0].status, "accepted");
  assert.equal(corrections[0].attribution, "[SYNTHETIC] curator");
});

test("correctRecord denies (not crashes) when the record doesn't exist", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const result = await correctRecord(fixtureStore, {
    requestId: "req-correct-missing",
    recordId: "does-not-exist",
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    field: "title",
    correctedValue: "x",
  });
  assert.equal(result.status, "denied");
});

test("correctRecord is idempotent on requestId — replaying it does not re-apply or duplicate the correction", async () => {
  const { fixtureStore, recordId } = await setupActive();
  const input = {
    requestId: "req-correct-idempotent",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    field: "title" as const,
    correctedValue: "[SYNTHETIC] idempotent title",
  };
  const first = await correctRecord(fixtureStore, input);
  const second = await correctRecord(fixtureStore, input);
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(first.completedAt, second.completedAt);
  assert.equal((await fixtureStore.listCorrections(recordId)).length, 1, "replay must not duplicate the correction");
});

test(
  "correctRecord commits the field change and its history atomically — a failed history write loses neither, and retrying preserves the TRUE original (reviewer-caught finding)",
  async () => {
    const { fixtureStore: realStore, recordId } = await setupActive();
    const flaky = new FailOnceOnHistoryWriteFixtureStore(realStore);
    const before = await realStore.getRecord(recordId);

    const input = {
      requestId: "req-atomic-correct",
      recordId,
      requesterCapacity: "[SYNTHETIC] curator",
      reason: "[SYNTHETIC] test",
      field: "summary" as const,
      correctedValue: "[SYNTHETIC] corrected summary",
    };

    await assert.rejects(() => correctRecord(flaky, input), /simulated history-write failure/);

    // The failed attempt must leave NEITHER the field NOR the history
    // changed — never a half-applied state where the field moved but its
    // true original was lost with nothing preserving it.
    const afterFailure = await realStore.getRecord(recordId);
    assert.equal(afterFailure?.summary, before?.summary, "the live field must be unchanged after a failed atomic write");
    assert.equal((await realStore.listCorrections(recordId)).length, 0, "no history row must exist after a failed atomic write");

    const retryResult = await correctRecord(flaky, input);
    assert.equal(retryResult.status, "completed");

    const afterRetry = await realStore.getRecord(recordId);
    assert.equal(afterRetry?.summary, "[SYNTHETIC] corrected summary");
    const corrections = await realStore.listCorrections(recordId);
    assert.equal(corrections.length, 1);
    assert.equal(
      corrections[0].previousValue,
      before?.summary,
      "the retry must preserve the TRUE original, not re-capture the live value from a prior partial attempt as a fake 'previous' one",
    );
  },
);

test(
  "disputeCorrection marks a correction disputed WITHOUT reverting it — disagreements remain attributed",
  async () => {
    const { fixtureStore, recordId } = await setupActive();
    await correctRecord(fixtureStore, {
      requestId: "req-correct-for-dispute",
      recordId,
      requesterCapacity: "[SYNTHETIC] curator",
      reason: "[SYNTHETIC] test",
      field: "summary",
      correctedValue: "[SYNTHETIC] disputed correction text",
    });
    const [correction] = await fixtureStore.listCorrections(recordId);

    const result = await disputeCorrection(fixtureStore, {
      requestId: "req-dispute-1",
      recordId,
      requesterCapacity: "[SYNTHETIC] subject",
      reason: "[SYNTHETIC] this correction is wrong",
      correctionId: correction.correctionId,
    });
    assert.equal(result.status, "completed");

    const [afterDispute] = await fixtureStore.listCorrections(recordId);
    assert.equal(afterDispute.status, "disputed");
    assert.equal(afterDispute.disputeReason, "[SYNTHETIC] this correction is wrong");
    // The correction itself must NOT be reverted — the live field still
    // reflects it.
    const record = await fixtureStore.getRecord(recordId);
    assert.equal(record?.summary, "[SYNTHETIC] disputed correction text");
  },
);

test("disputeCorrection denies when the correctionId doesn't exist on the record", async () => {
  const { fixtureStore, recordId } = await setupActive();
  const result = await disputeCorrection(fixtureStore, {
    requestId: "req-dispute-missing",
    recordId,
    requesterCapacity: "[SYNTHETIC] subject",
    reason: "[SYNTHETIC] test",
    correctionId: "does-not-exist",
  });
  assert.equal(result.status, "denied");
});

// ------------------------------------------------------------ redaction --

test("redactText masks the live field with a placeholder and preserves the original only in redaction history", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();
  const before = await fixtureStore.getRecord(recordId);

  const result = await redactText(fixtureStore, registerStore, {
    requestId: "req-redact-text-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] sensitive detail in the summary",
    field: "summary",
  });
  assert.equal(result.status, "completed");

  const after = await fixtureStore.getRecord(recordId);
  assert.equal(after?.summary, "[REDACTED]");
  assert.equal(after?.redactionApplied, true);

  const redactions = await fixtureStore.listRedactions(recordId);
  assert.equal(redactions.length, 1);
  const redaction = redactions[0];
  assert.equal(redaction.scope, "text");
  if (redaction.scope === "text") {
    assert.equal(redaction.previousValue, before?.summary, "the original must be preserved in redaction history, not erased");
  }
});

test(
  "redactText commits the field change and its history atomically — a failed history write loses neither, and retrying preserves the TRUE original (reviewer-caught finding)",
  async () => {
    const { fixtureStore: realStore, registerStore, recordId } = await setupActive();
    const flaky = new FailOnceOnHistoryWriteFixtureStore(realStore);
    const before = await realStore.getRecord(recordId);

    const input = {
      requestId: "req-atomic-redact",
      recordId,
      requesterCapacity: "[SYNTHETIC] curator",
      reason: "[SYNTHETIC] test",
      field: "summary" as const,
    };

    await assert.rejects(() => redactText(flaky, registerStore, input), /simulated history-write failure/);

    const afterFailure = await realStore.getRecord(recordId);
    assert.equal(afterFailure?.summary, before?.summary, "the live field must be unchanged after a failed atomic write");
    assert.equal((await realStore.listRedactions(recordId)).length, 0, "no history row must exist after a failed atomic write");

    const retryResult = await redactText(flaky, registerStore, input);
    assert.equal(retryResult.status, "completed");

    const afterRetry = await realStore.getRecord(recordId);
    assert.equal(afterRetry?.summary, "[REDACTED]");
    const redactions = await realStore.listRedactions(recordId);
    assert.equal(redactions.length, 1);
    if (redactions[0].scope === "text") {
      assert.equal(
        redactions[0].previousValue,
        before?.summary,
        "the retry must preserve the TRUE original, not re-capture the live value from a prior partial attempt as a fake 'previous' one",
      );
    }
  },
);

test("redactMedia denies through evaluatePermission for every purpose/audience, even one that would otherwise be fully allowed", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActiveWithMedia();
  const textMedia = (await fixtureStore.getRecord(recordId))!.mediaRefs[0];

  const beforeDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
    mediaId: textMedia.mediaId,
  });
  assert.equal(beforeDecision.allowed, true, "sanity check: allowed before redaction");

  const result = await redactMedia(fixtureStore, registerStore, {
    requestId: "req-redact-media-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] sensitive media",
    mediaId: textMedia.mediaId,
  });
  assert.equal(result.status, "completed");

  const afterDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
    mediaId: textMedia.mediaId,
  });
  assert.equal(afterDecision.allowed, false);
  assert.match(afterDecision.reason, /redacted/i);

  const record = await fixtureStore.getRecord(recordId);
  assert.equal(record?.redactionApplied, true);
  const redactions = await fixtureStore.listRedactions(recordId);
  assert.equal(redactions.length, 1);
  assert.equal(redactions[0].scope, "media");
});

test("redactMedia leaves the underlying S3 bytes completely untouched — redaction is not deletion", async () => {
  const { fixtureStore, registerStore, mediaStore, recordId } = await setupActiveWithMedia();
  const binaryMedia = (await fixtureStore.getRecord(recordId))!.mediaRefs[1];
  const versionsBefore = await mediaStore.listObjectVersions(binaryMedia.objectKey);

  await redactMedia(fixtureStore, registerStore, {
    requestId: "req-redact-media-no-delete",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    mediaId: binaryMedia.mediaId,
  });

  const versionsAfter = await mediaStore.listObjectVersions(binaryMedia.objectKey);
  assert.deepEqual(versionsAfter, versionsBefore, "redaction must never touch S3 — only register-level access is denied");
});

test("redactMedia denies when the mediaId doesn't exist on the record", async () => {
  const { fixtureStore, registerStore, recordId } = await setupActive();
  const result = await redactMedia(fixtureStore, registerStore, {
    requestId: "req-redact-media-missing",
    recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    mediaId: "does-not-exist",
  });
  assert.equal(result.status, "denied");
});
