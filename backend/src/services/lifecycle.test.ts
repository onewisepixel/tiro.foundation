import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  CustodyCopy,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
  RestrictionRegisterEntry,
} from "../domain/types";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { InMemoryMediaStore } from "../store/mediaStore";
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
