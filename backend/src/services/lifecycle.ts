// Lifecycle operations per docs/ethos.txt §5 and §12.
//
// The one rule every function here is built around: the restriction-register
// write (the durable control state) happens BEFORE the lifecycle request is
// marked "completed". If the register write throws, the request is left
// "in-progress" — visibly pending, not silently lost and not falsely
// acknowledged. A caller retrying the same requestId is safe: creation is
// idempotent on requestId, and the register write is itself version-guarded.
import type {
  CorrectableField,
  CustodyStatus,
  FixtureRecord,
  LifecycleAction,
  LifecycleRequest,
  PublicationStatus,
  Purpose,
  RestrictionRegisterEntry,
} from "../domain/types";
import { uuidv7 } from "../domain/id";
import {
  IdempotencyKeyConflictError,
  VersionConflictError,
  type FixtureStore,
  type RestrictionRegisterStore,
} from "../store/store";
import type { MediaStore } from "../store/mediaStore";

export type LifecycleActionInput = {
  requestId: string;
  recordId: string;
  requesterCapacity: string;
  reason: string;
  protectiveHold?: boolean;
};

// Everything that defines "this is the same operation" beyond requestId
// itself. Order-independent (JSON.stringify of a fixed key order) so two
// equivalent calls always fingerprint the same way regardless of how the
// caller built the payload object.
function fingerprintFor(
  action: LifecycleAction,
  input: LifecycleActionInput,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    recordId: input.recordId,
    action,
    requesterCapacity: input.requesterCapacity,
    reason: input.reason,
    protectiveHold: Boolean(input.protectiveHold),
    payload,
  });
}

async function getOrCreateRequest(
  store: FixtureStore,
  action: LifecycleAction,
  input: LifecycleActionInput,
  payload: Record<string, unknown> = {},
): Promise<LifecycleRequest> {
  const fingerprint = fingerprintFor(action, input, payload);
  const existing = await store.getLifecycleRequest(input.requestId);
  if (existing) {
    if (existing.payloadFingerprint !== fingerprint) {
      // Reusing a requestId for a DIFFERENT record/action/caller/payload is
      // never a safe replay — returning the stale request here would (and
      // did) let an unrelated operation silently no-op while reporting
      // success. Reject instead; the caller must use a fresh requestId.
      throw new IdempotencyKeyConflictError(input.requestId);
    }
    // Idempotent replay: same requestId AND same operation, return what's
    // there (possibly already completed — callers should treat that as
    // success, not redo).
    return existing;
  }
  const request: LifecycleRequest = {
    requestId: input.requestId,
    recordId: input.recordId,
    action,
    status: "in-progress",
    requesterCapacity: input.requesterCapacity,
    reason: input.reason,
    protectiveHold: Boolean(input.protectiveHold),
    payloadFingerprint: fingerprint,
    createdAt: new Date().toISOString(),
    completedAt: null,
    receiptSummary: null,
  };
  await store.createLifecycleRequest(request);
  return request;
}

async function completeRequest(
  store: FixtureStore,
  request: LifecycleRequest,
  safeNote: string,
): Promise<LifecycleRequest> {
  const completed: LifecycleRequest = {
    ...request,
    status: "completed",
    completedAt: new Date().toISOString(),
    receiptSummary: safeNote,
  };
  await store.updateLifecycleRequest(completed);
  await store.putAuditReceipt({
    recordId: request.recordId,
    receiptId: uuidv7(),
    action: request.action,
    outcome: "completed",
    safeNote,
    at: completed.completedAt as string,
  });
  return completed;
}

async function recordFailure(
  store: FixtureStore,
  request: LifecycleRequest,
  safeNote: string,
): Promise<void> {
  // Status stays "in-progress" — visibly pending, never silently dropped.
  await store.putAuditReceipt({
    recordId: request.recordId,
    receiptId: uuidv7(),
    action: request.action,
    outcome: "failed",
    safeNote,
    at: new Date().toISOString(),
  });
}

// Distinct from recordFailure: used when a request is not merely "not yet
// possible" (retryable, stays in-progress) but definitively not going to
// happen under its current preconditions — e.g. completeDeletion() called
// without a valid prior deletion request. Terminal, like completeRequest,
// but with outcome "failed" rather than "completed".
async function denyRequest(
  store: FixtureStore,
  request: LifecycleRequest,
  safeNote: string,
): Promise<LifecycleRequest> {
  const denied: LifecycleRequest = {
    ...request,
    status: "denied",
    completedAt: new Date().toISOString(),
    receiptSummary: safeNote,
  };
  await store.updateLifecycleRequest(denied);
  await store.putAuditReceipt({
    recordId: request.recordId,
    receiptId: uuidv7(),
    action: request.action,
    outcome: "failed",
    safeNote,
    at: denied.completedAt as string,
  });
  return denied;
}

type ControlPatch = Partial<
  Pick<
    RestrictionRegisterEntry,
    | "currentPublicationStatus"
    | "currentCustodyStatus"
    | "restrictedPurposes"
    | "revokedConsentIds"
    | "mediaPurgeClaim"
    | "redactedMediaIds"
  >
>;

// Takes exactly ONE snapshot read, derives the full next entry from THAT
// snapshot via computePatch, and writes with that same snapshot's version as
// the exact expected version. Callers that need to read current state to
// compute their patch (e.g. restrict() merging purposes) MUST do so inside
// computePatch, not via a separate pre-read — a separate read is exactly the
// non-atomic read-modify-write race that let concurrent lifecycle actions
// silently undo each other (deletion racing a restriction, for example).
// setCurrent's exact-version-match requirement (store/store.ts) is what turns
// a lost race into a visible VersionConflictError instead of a silent clobber.
async function transitionControl(
  registerStore: RestrictionRegisterStore,
  recordId: string,
  computePatch: (current: RestrictionRegisterEntry | null) => ControlPatch,
): Promise<RestrictionRegisterEntry> {
  const current = await registerStore.getCurrent(recordId);
  const patch = computePatch(current);
  const next: RestrictionRegisterEntry = {
    recordId,
    controlVersion: (current?.controlVersion ?? 0) + 1,
    currentPublicationStatus: patch.currentPublicationStatus ?? current?.currentPublicationStatus ?? "not-published",
    currentCustodyStatus: patch.currentCustodyStatus ?? current?.currentCustodyStatus ?? "quarantined",
    restrictedPurposes: patch.restrictedPurposes ?? current?.restrictedPurposes ?? [],
    revokedConsentIds: patch.revokedConsentIds ?? current?.revokedConsentIds ?? [],
    // Explicit undefined-check, not `??`: a patch that wants to CLEAR the
    // claim passes null, and `null ?? current?.mediaPurgeClaim` would
    // wrongly fall through to whatever was already there. Omitting the key
    // entirely (the common case — most patches don't touch this field) is
    // the only thing that should preserve the current value.
    mediaPurgeClaim: patch.mediaPurgeClaim !== undefined ? patch.mediaPurgeClaim : current?.mediaPurgeClaim ?? null,
    redactedMediaIds: patch.redactedMediaIds ?? current?.redactedMediaIds ?? [],
    updatedAt: new Date().toISOString(),
  };
  await registerStore.setCurrent(next, current?.controlVersion);
  return next;
}

// Thrown when a lifecycle action that writes currentCustodyStatus
// (currently only retainForPreservationOnly) finds an active
// mediaPurgeClaim — a completeDeletion-driven S3 purge is in flight for
// this exact record right now. This is deliberately NOT treated as a
// silent no-op or an automatic wait/retry: the caller gets a clear,
// distinguishable, retryable error (mapped to 409 at the API layer,
// same family as VersionConflictError) rather than either blocking or
// having its request silently dropped.
export class MediaPurgeInProgressError extends Error {}

async function runGuarded(
  fixtureStore: FixtureStore,
  request: LifecycleRequest,
  work: () => Promise<string>,
): Promise<LifecycleRequest> {
  if (request.status === "completed") {
    return request;
  }
  try {
    const safeNote = await work();
    return await completeRequest(fixtureStore, request, safeNote);
  } catch (error) {
    const message =
      error instanceof VersionConflictError || error instanceof MediaPurgeInProgressError
        ? error.message
        : "Unexpected error applying lifecycle action.";
    await recordFailure(fixtureStore, request, message);
    throw error;
  }
}

export async function withdraw(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "withdraw", input);
  return runGuarded(fixtureStore, request, async () => {
    await transitionControl(registerStore, input.recordId, () => ({ currentPublicationStatus: "withdrawn" }));
    return "Publication withdrawn; future distribution within TIRO-controlled systems ceased.";
  });
}

export async function restrict(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
  purposes: Purpose[],
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "restrict", input, { purposes });
  return runGuarded(fixtureStore, request, async () => {
    let merged: Purpose[] = [];
    await transitionControl(registerStore, input.recordId, (current) => {
      merged = [...new Set([...(current?.restrictedPurposes ?? []), ...purposes])];
      return {
        currentPublicationStatus: input.protectiveHold ? "restricted" : current?.currentPublicationStatus,
        restrictedPurposes: merged,
      };
    });
    return `Restricted purposes: ${merged.join(", ")}.`;
  });
}

export async function retainForPreservationOnly(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "retain", input);
  return runGuarded(fixtureStore, request, async () => {
    // Reviewer-caught finding: completeDeletion used to validate custody
    // via a bare READ before purging media, which a concurrent retention
    // could race past undetected (retention wins the register, but the
    // purge — already past its one-time check — destroys the media
    // anyway). The real fix is HERE too, not just on the deletion side:
    // this computePatch runs against a FRESH read every time, so if a
    // media purge currently holds the register's mediaPurgeClaim,
    // retention refuses outright rather than silently writing underneath
    // it. Combined with completeDeletion's own claim being a CONDITIONAL
    // write (not a bare read), the two sides can never both believe they
    // safely "won" — whichever write actually lands first in the
    // database is authoritative, and DynamoDB's single-item conditional
    // write guarantees only one of two racing writes to the same item
    // can ever succeed.
    await transitionControl(registerStore, input.recordId, (current) => {
      if (current?.mediaPurgeClaim) {
        throw new MediaPurgeInProgressError(
          `A media purge is currently in progress for this record (requestId ${current.mediaPurgeClaim.requestId}); retention cannot be applied until it finishes. This is not an error to work around — retry shortly.`,
        );
      }
      return {
        currentPublicationStatus: "restricted",
        currentCustodyStatus: "preserved",
        restrictedPurposes: ["publication", "research", "derivatives", "model-training", "synthetic-reproduction", "commercial-use"],
      };
    });
    return "Retained for preservation only; all non-preservation purposes restricted.";
  });
}

export async function startDeletion(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "delete", input);
  return runGuarded(fixtureStore, request, async () => {
    // Per docs/ethos.txt §5: deletion stays "deletion-pending" while copies,
    // derivatives, or backups still require removal/expiry. completeDeletion
    // (below) is the only path to "deleted", and only once copies are
    // confirmed reconciled.
    await transitionControl(registerStore, input.recordId, () => ({
      currentPublicationStatus: "withdrawn",
      currentCustodyStatus: "deletion-pending",
    }));
    return "Deletion started; custody status is deletion-pending until all copies are reconciled.";
  });
}

// Revokes one specific consent grant. Distinct from withdraw() (which
// withdraws the whole record's publication): this scopes to a single
// consentId, recorded in the register's revokedConsentIds — see Finding 1 in
// the reviewer's correctness pass — so that restoring an old backup of the
// ConsentGrant row itself can never resurrect access this grant used to
// provide. The grant row's own revokedAt is also updated for consistency,
// but evaluatePermission (permissions.ts) never trusts that field alone.
export async function revokeConsentGrant(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput & { consentId: string },
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "revoke-consent", input, { consentId: input.consentId });
  return runGuarded(fixtureStore, request, async () => {
    await transitionControl(registerStore, input.recordId, (current) => ({
      revokedConsentIds: [...new Set([...(current?.revokedConsentIds ?? []), input.consentId])],
    }));
    const grants = await fixtureStore.listConsentGrants(input.recordId);
    const grant = grants.find((g) => g.consentId === input.consentId);
    if (grant && grant.revokedAt === null) {
      await fixtureStore.putConsentGrant(
        { ...grant, revokedAt: new Date().toISOString() },
        grant.version,
      );
    }
    return `Consent grant ${input.consentId} revoked.`;
  });
}

// completeDeletion is itself a full lifecycle action now, not a bare helper —
// it used to take just a recordId and would happily delete ANY record with
// no outstanding custody copies, including one that had never gone through
// startDeletion() at all: no LifecycleRequest, no audit receipt, no link
// back to a deletion request, just a silent delete. Three things fix that:
// 1. It requires a completed "delete" (startDeletion) request matching this
//    record (deletionRequestId) — completion can never happen without a
//    real prior start.
// 2. It requires the register's currentCustodyStatus to actually be
//    "deletion-pending" (or "deleted" — see StaleCustodyStatusError below) —
//    a record that's merely "preserved" is refused.
// 3. It goes through getOrCreateRequest like every other action, so it has
//    its own tracked request, requesterCapacity, and receipt.
export type CompleteDeletionInput = LifecycleActionInput & {
  // The requestId startDeletion() returned when deletion was started for
  // this record. Required, not inferred from register state alone — an
  // explicit link, not just an implicit "custodyStatus happens to match".
  deletionRequestId: string;
};

// Thrown from INSIDE transitionControl's computePatch, i.e. against the
// exact register snapshot that will also supply the expected version for
// the conditional write below — not a separate, earlier read that could go
// stale before the write happens. A reviewer caught a real bug where the
// prerequisite check used its own throwaway getCurrent() and the write's
// computePatch ignored custody status entirely, so a retention action that
// flipped custody to "preserved" in between went undetected and the record
// was deleted anyway. Validating here closes that gap: if custody isn't
// "deletion-pending" (first attempt) or "deleted" (resuming after the
// register write succeeded but the record removal below failed — see the
// outstanding-copies-style retry note in completeDeletion) at the moment of
// the write, this throws before anything is written.
class StaleCustodyStatusError extends Error {}

// Shared by the pre-purge guard below and the final write's computePatch —
// "deletion-pending" (the normal case) or "deleted" (resuming after a
// partial failure — see completeDeletion's write step) are the only two
// states in which either destroying media or writing "deleted" is valid.
function isDeletionEligibleCustody(status: string | undefined): boolean {
  return status === "deletion-pending" || status === "deleted";
}

// Attempts to actually purge each media-backed custody copy's S3 object —
// EVERY version and delete marker under its exact key, not just whichever
// one the MediaRef happens to be pinned to (an old, superseded version left
// behind is still real stored bytes, and a bare delete-marker removal alone
// would leave all of them fully intact). A copy is reconciled only once
// listing the key again confirms it is actually empty — attempted is never
// treated as done. Tolerant of partial progress: a copy already reconciled
// is skipped, a record already gone means nothing left to purge, and
// deleting an already-gone version is a no-op in S3 — so calling this
// again after a prior partial failure safely resumes exactly where it left
// off, without redoing completed work or erroring on it.
async function purgeMediaCustody(
  fixtureStore: FixtureStore,
  mediaStore: MediaStore,
  recordId: string,
): Promise<void> {
  const record = await fixtureStore.getRecord(recordId);
  if (!record) {
    return;
  }
  const copies = await fixtureStore.listCustodyCopies(recordId);
  for (const copy of copies) {
    if (copy.reconciledAt !== null || !copy.mediaId) {
      continue;
    }
    const media = record.mediaRefs.find((m) => m.mediaId === copy.mediaId);
    if (!media || !media.objectKey) {
      continue;
    }
    try {
      const versions = await mediaStore.listObjectVersions(media.objectKey);
      for (const version of versions) {
        await mediaStore.deleteObjectVersion(media.objectKey, version.versionId);
      }
      const remaining = await mediaStore.listObjectVersions(media.objectKey);
      if (remaining.length > 0) {
        continue; // Still not actually empty — leave unreconciled, retryable.
      }
      await fixtureStore.putCustodyCopy({ ...copy, reconciledAt: new Date().toISOString() });
    } catch {
      // Leave unreconciled on any failure (network error, permission
      // denial, etc.) — the outstanding-copies check below naturally keeps
      // the overall request retryable; nothing here is a terminal failure.
      continue;
    }
  }
}

export async function completeDeletion(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: CompleteDeletionInput,
  mediaStore?: MediaStore,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "complete-deletion", input, {
    deletionRequestId: input.deletionRequestId,
  });
  if (request.status === "completed" || request.status === "denied") {
    return request;
  }

  const deletionRequest = await fixtureStore.getLifecycleRequest(input.deletionRequestId);
  if (
    !deletionRequest ||
    deletionRequest.recordId !== input.recordId ||
    deletionRequest.action !== "delete" ||
    deletionRequest.status !== "completed"
  ) {
    return denyRequest(
      fixtureStore,
      request,
      "No completed deletion request matches this record and deletionRequestId; startDeletion() must run first — completion is not a substitute for the deletion workflow.",
    );
  }

  // Reviewer-caught bug, round two: a bare READ-then-act guard here (this
  // function's previous fix) still left a real gap — a retention action
  // landing in the window between the read and purgeMediaCustody starting
  // could win the register but still have its media destroyed, because
  // the read never CLAIMED anything. Checked custody must become COMMITTED
  // custody before anything irreversible runs. Fixed by claiming the purge
  // via a CONDITIONAL WRITE (transitionControl), not a bare read:
  // retainForPreservationOnly's own computePatch (above) now also checks
  // for an active claim and refuses while one is held. Whichever of the
  // two writes — this claim, or a racing retention — actually lands first
  // in the register wins; the loser either denies (sees stale/wrong
  // custody, or a version conflict meaning someone else just wrote) or is
  // refused (sees an active claim), and in neither case does any S3 call
  // happen. The claim is released in a `finally` so a purge failure never
  // leaves retention permanently blocked.
  if (mediaStore) {
    try {
      await transitionControl(registerStore, input.recordId, (current) => {
        if (!isDeletionEligibleCustody(current?.currentCustodyStatus)) {
          throw new StaleCustodyStatusError(
            `Custody status is "${current?.currentCustodyStatus ?? "unknown"}", not "deletion-pending" — refusing to purge media or complete deletion. If a retention action ran after startDeletion(), this is correct: retained media must not be destroyed.`,
          );
        }
        if (current?.mediaPurgeClaim) {
          throw new StaleCustodyStatusError(
            `A media purge is already in progress for this record (requestId ${current.mediaPurgeClaim.requestId}); refusing to start a concurrent one.`,
          );
        }
        return { mediaPurgeClaim: { requestId: input.requestId, claimedAt: new Date().toISOString() } };
      });
    } catch (error) {
      if (error instanceof StaleCustodyStatusError) {
        return denyRequest(fixtureStore, request, error.message);
      }
      // A VersionConflictError here means a racing write (most plausibly
      // retention) landed first — retryable, not a terminal denial; the
      // next attempt sees the fresh (now possibly ineligible) state.
      const message = error instanceof VersionConflictError ? error.message : "Unexpected error claiming the media purge.";
      await recordFailure(fixtureStore, request, message);
      throw error;
    }

    try {
      await purgeMediaCustody(fixtureStore, mediaStore, input.recordId);
    } finally {
      await transitionControl(registerStore, input.recordId, () => ({ mediaPurgeClaim: null })).catch(() => {
        // Best-effort release. If even this fails (a genuine, separate
        // outage), the claim stays set and retention stays blocked until a
        // later completeDeletion retry naturally claims+releases it again
        // — never silently ignored, but also never allowed to crash or
        // mask the purge's own outcome.
      });
    }
  }

  const copies = await fixtureStore.listCustodyCopies(input.recordId);
  const outstanding = copies.filter((copy) => copy.reconciledAt === null);
  if (outstanding.length > 0) {
    // Retryable (unlike the deny above) — leave the request in-progress so
    // a later call, once copies ARE reconciled, can still complete it under
    // the same requestId.
    await recordFailure(
      fixtureStore,
      request,
      `${outstanding.length} custody cop${outstanding.length === 1 ? "y" : "ies"} not yet reconciled.`,
    );
    return request;
  }

  try {
    const safeNote = await (async () => {
      // The register entry is the authoritative "may this be served" answer
      // and is set to deleted FIRST — if the record removal below fails,
      // the record is still correctly denied. Only once that's durable do
      // we remove the primary record itself; a status flag alone (the old
      // behavior) left completion reporting success while the record
      // stayed present and exportable, which was Finding 5a.
      //
      // computePatch here IS the prerequisite check — it runs against the
      // same snapshot transitionControl uses for the version-matched write,
      // so a concurrent custody change is either caught here (wrong status
      // at write time) or by setCurrent's own version conflict (changed
      // between this read and the write) — never silently missed. "deleted"
      // is accepted alongside "deletion-pending" specifically so that a
      // retry after this exact partial failure (register flipped to
      // "deleted", then deleteRecord below threw) can resume and finish
      // removing the still-present record, instead of being permanently
      // denied for no longer being "deletion-pending".
      await transitionControl(registerStore, input.recordId, (current) => {
        if (!isDeletionEligibleCustody(current?.currentCustodyStatus)) {
          throw new StaleCustodyStatusError(
            `Custody status is "${current?.currentCustodyStatus ?? "unknown"}", not "deletion-pending" — it changed after the prerequisite check (e.g. a retention action), so completion cannot proceed.`,
          );
        }
        return { currentCustodyStatus: "deleted" };
      });
      const record = await fixtureStore.getRecord(input.recordId);
      if (record) {
        await fixtureStore.deleteRecord(input.recordId, record.version);
      }
      return "All custody copies reconciled; custody status is deleted and the record removed.";
    })();
    return await completeRequest(fixtureStore, request, safeNote);
  } catch (error) {
    if (error instanceof StaleCustodyStatusError) {
      return denyRequest(fixtureStore, request, error.message);
    }
    const message = error instanceof VersionConflictError ? error.message : "Unexpected error applying lifecycle action.";
    await recordFailure(fixtureStore, request, message);
    throw error;
  }
}

// §12's "Correct" action: replaces the live field (so readers see the fix
// immediately) but preserves the prior value permanently in a Correction
// row — never erases it. Operates purely on FixtureStore (title/summary/
// provenanceRef live there, not in the register) with its own
// version-guarded write; it doesn't touch publicationStatus/custodyStatus,
// so it takes no RestrictionRegisterStore parameter at all — an unused
// parameter here would be dead weight, not defensive consistency.
export type CorrectRecordInput = LifecycleActionInput & {
  field: CorrectableField;
  correctedValue: string;
};

export async function correctRecord(
  fixtureStore: FixtureStore,
  input: CorrectRecordInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "correct", input, {
    field: input.field,
    correctedValue: input.correctedValue,
  });
  if (request.status === "completed" || request.status === "denied") {
    return request;
  }

  const record = await fixtureStore.getRecord(input.recordId);
  if (!record) {
    return denyRequest(fixtureStore, request, `No record "${input.recordId}" exists to correct.`);
  }

  return runGuarded(fixtureStore, request, async () => {
    // Re-read fresh inside the guarded work, not the outer `record` above
    // (used only for the existence precondition) — the same
    // single-fresh-snapshot discipline transitionControl uses for the
    // register, applied here to the record's own optimistic-concurrency
    // version.
    const fresh = await fixtureStore.getRecord(input.recordId);
    if (!fresh) {
      throw new Error(`Record "${input.recordId}" was removed before the correction could be applied.`);
    }
    const previousValue = fresh[input.field];
    const correctionId = uuidv7();
    const updated: FixtureRecord = { ...fresh, [input.field]: input.correctedValue, updatedAt: new Date().toISOString() };
    await fixtureStore.putRecord(updated, fresh.version);
    await fixtureStore.putCorrection({
      recordId: input.recordId,
      correctionId,
      field: input.field,
      previousValue,
      correctedValue: input.correctedValue,
      attribution: input.requesterCapacity,
      reason: input.reason,
      status: "accepted",
      disputeReason: null,
      createdAt: new Date().toISOString(),
    });
    return `Corrected ${input.field} (correction ${correctionId}); previous value preserved in correction history, not erased.`;
  });
}

// "Disagreements remain attributed and are not resolved by silently
// overwriting a source account" (§3.5), applied to a correction itself:
// marks it disputed WITHOUT reverting it — the correction and the
// disagreement about it both stay on record, attributed.
export type DisputeCorrectionInput = LifecycleActionInput & {
  correctionId: string;
};

export async function disputeCorrection(
  fixtureStore: FixtureStore,
  input: DisputeCorrectionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "dispute-correction", input, {
    correctionId: input.correctionId,
  });
  if (request.status === "completed" || request.status === "denied") {
    return request;
  }

  const corrections = await fixtureStore.listCorrections(input.recordId);
  const target = corrections.find((c) => c.correctionId === input.correctionId);
  if (!target) {
    return denyRequest(fixtureStore, request, `No correction "${input.correctionId}" exists on this record.`);
  }

  return runGuarded(fixtureStore, request, async () => {
    await fixtureStore.putCorrection({ ...target, status: "disputed", disputeReason: input.reason });
    return `Correction ${input.correctionId} marked disputed; the correction itself is preserved, not reverted.`;
  });
}

// §3.5's redaction tooling, text half: masks a field with a safe
// placeholder — the record everyone reads is simply changed to the safer
// text — while preserving the original ONLY in redaction history, which
// api/router.ts never serves through the normal record-read path.
export type RedactTextInput = LifecycleActionInput & {
  field: CorrectableField;
};

export async function redactText(
  fixtureStore: FixtureStore,
  input: RedactTextInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "redact-text", input, { field: input.field });
  if (request.status === "completed" || request.status === "denied") {
    return request;
  }

  const record = await fixtureStore.getRecord(input.recordId);
  if (!record) {
    return denyRequest(fixtureStore, request, `No record "${input.recordId}" exists to redact.`);
  }

  return runGuarded(fixtureStore, request, async () => {
    const fresh = await fixtureStore.getRecord(input.recordId);
    if (!fresh) {
      throw new Error(`Record "${input.recordId}" was removed before the redaction could be applied.`);
    }
    const previousValue = fresh[input.field];
    const redactionId = uuidv7();
    const updated: FixtureRecord = {
      ...fresh,
      [input.field]: "[REDACTED]",
      redactionApplied: true,
      updatedAt: new Date().toISOString(),
    };
    await fixtureStore.putRecord(updated, fresh.version);
    await fixtureStore.putRedaction({
      recordId: input.recordId,
      redactionId,
      scope: "text",
      field: input.field,
      previousValue,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    return `Redacted ${input.field} (redaction ${redactionId}); original preserved only in redaction history, never served through the normal record read.`;
  });
}

// §3.5's redaction tooling, media half: this backend cannot blur/bleep/
// crop actual bytes (no media-processing infrastructure), so redaction
// means permanently denying the object through every normal fetch path —
// a HARD override in the register (evaluatePermission/services/media.ts),
// independent of purpose/audience — while leaving the underlying S3 bytes
// untouched. Redaction is not deletion: nothing here calls MediaStore at
// all.
export type RedactMediaInput = LifecycleActionInput & {
  mediaId: string;
};

export async function redactMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: RedactMediaInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "redact-media", input, { mediaId: input.mediaId });
  if (request.status === "completed" || request.status === "denied") {
    return request;
  }

  const record = await fixtureStore.getRecord(input.recordId);
  if (!record) {
    return denyRequest(fixtureStore, request, `No record "${input.recordId}" exists to redact.`);
  }
  if (!record.mediaRefs.some((m) => m.mediaId === input.mediaId)) {
    return denyRequest(fixtureStore, request, `No media "${input.mediaId}" exists on this record.`);
  }

  return runGuarded(fixtureStore, request, async () => {
    // The register entry is the authoritative "may this be served"
    // answer and is updated FIRST, same ordering principle as every
    // other register-then-record write in this file — if the record
    // write below fails, the media is still correctly denied.
    await transitionControl(registerStore, input.recordId, (current) => ({
      redactedMediaIds: [...new Set([...(current?.redactedMediaIds ?? []), input.mediaId])],
    }));
    const fresh = await fixtureStore.getRecord(input.recordId);
    if (fresh) {
      await fixtureStore.putRecord({ ...fresh, redactionApplied: true, updatedAt: new Date().toISOString() }, fresh.version);
    }
    await fixtureStore.putRedaction({
      recordId: input.recordId,
      redactionId: uuidv7(),
      scope: "media",
      mediaId: input.mediaId,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    return `Media ${input.mediaId} redacted — denied through the normal fetch path for every purpose/audience; underlying bytes are preserved, not deleted.`;
  });
}

export type { PublicationStatus, CustodyStatus };
