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
import { VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "../store/store";

export type LifecycleActionInput = {
  requestId: string;
  recordId: string;
  requesterCapacity: string;
  reason: string;
  protectiveHold?: boolean;
};

async function getOrCreateRequest(
  store: FixtureStore,
  action: LifecycleAction,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const existing = await store.getLifecycleRequest(input.requestId);
  if (existing) {
    // Idempotent replay: same requestId, return what's there (possibly
    // already completed — callers should treat that as success, not redo).
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
  const request = await getOrCreateRequest(fixtureStore, "restrict", input);
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
  const request = await getOrCreateRequest(fixtureStore, "revoke-consent", input);
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

export async function completeDeletion(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  recordId: string,
): Promise<{ deleted: boolean; reason: string }> {
  const copies = await fixtureStore.listCustodyCopies(recordId);
  const outstanding = copies.filter((copy) => copy.reconciledAt === null);
  if (outstanding.length > 0) {
    return {
      deleted: false,
      reason: `${outstanding.length} custody cop${outstanding.length === 1 ? "y" : "ies"} not yet reconciled.`,
    };
  }
  await transitionControl(registerStore, recordId, () => ({ currentCustodyStatus: "deleted" }));
  // The register entry is the authoritative "may this be served" answer and
  // is set to deleted FIRST (above) — if the record removal below fails, the
  // record is still correctly denied. Only once that's durable do we remove
  // the primary record itself; a status flag alone (the old behavior) left
  // completeDeletion() reporting success while the record stayed present and
  // exportable, which is Finding 5a.
  const record = await fixtureStore.getRecord(recordId);
  if (record) {
    await fixtureStore.deleteRecord(recordId, record.version);
  }
  return { deleted: true, reason: "All custody copies reconciled; custody status is deleted and the record removed." };
}

export type { PublicationStatus, CustodyStatus };
