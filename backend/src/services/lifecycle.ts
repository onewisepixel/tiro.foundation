// Lifecycle operations per docs/ethos.txt §5 and §12.
//
// The one rule every function here is built around: the restriction-register
// write (the durable control state) happens BEFORE the lifecycle request is
// marked "completed". If the register write throws, the request is left
// "in-progress" — visibly pending, not silently lost and not falsely
// acknowledged. A caller retrying the same requestId is safe: creation is
// idempotent on requestId, and the register write is itself version-guarded.
import type {
  CustodyStatus,
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
    "currentPublicationStatus" | "currentCustodyStatus" | "restrictedPurposes" | "revokedConsentIds"
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
    updatedAt: new Date().toISOString(),
  };
  await registerStore.setCurrent(next, current?.controlVersion);
  return next;
}

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
    const message = error instanceof VersionConflictError ? error.message : "Unexpected error applying lifecycle action.";
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
    await transitionControl(registerStore, input.recordId, () => ({
      currentPublicationStatus: "restricted",
      currentCustodyStatus: "preserved",
      restrictedPurposes: ["publication", "research", "derivatives", "model-training", "synthetic-reproduction", "commercial-use"],
    }));
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

export async function completeDeletion(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: CompleteDeletionInput,
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
        if (current?.currentCustodyStatus !== "deletion-pending" && current?.currentCustodyStatus !== "deleted") {
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

export type { PublicationStatus, CustodyStatus };
