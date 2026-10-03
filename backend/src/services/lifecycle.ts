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

async function nextControlVersion(
  registerStore: RestrictionRegisterStore,
  recordId: string,
): Promise<number> {
  const current = await registerStore.getCurrent(recordId);
  return (current?.controlVersion ?? 0) + 1;
}

async function transitionControl(
  registerStore: RestrictionRegisterStore,
  recordId: string,
  patch: Partial<Pick<RestrictionRegisterEntry, "currentPublicationStatus" | "currentCustodyStatus" | "restrictedPurposes">>,
): Promise<RestrictionRegisterEntry> {
  const current = await registerStore.getCurrent(recordId);
  const next: RestrictionRegisterEntry = {
    recordId,
    controlVersion: await nextControlVersion(registerStore, recordId),
    currentPublicationStatus: patch.currentPublicationStatus ?? current?.currentPublicationStatus ?? "not-published",
    currentCustodyStatus: patch.currentCustodyStatus ?? current?.currentCustodyStatus ?? "quarantined",
    restrictedPurposes: patch.restrictedPurposes ?? current?.restrictedPurposes ?? [],
    updatedAt: new Date().toISOString(),
  };
  await registerStore.setCurrent(next);
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
    await transitionControl(registerStore, input.recordId, { currentPublicationStatus: "withdrawn" });
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
    const current = await registerStore.getCurrent(input.recordId);
    const merged = [...new Set([...(current?.restrictedPurposes ?? []), ...purposes])];
    await transitionControl(registerStore, input.recordId, {
      currentPublicationStatus: input.protectiveHold ? "restricted" : current?.currentPublicationStatus,
      restrictedPurposes: merged,
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
    await transitionControl(registerStore, input.recordId, {
      currentPublicationStatus: "restricted",
      currentCustodyStatus: "preserved",
      restrictedPurposes: ["publication", "research", "derivatives", "model-training", "synthetic-reproduction", "commercial-use"],
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
    await transitionControl(registerStore, input.recordId, {
      currentPublicationStatus: "withdrawn",
      currentCustodyStatus: "deletion-pending",
    });
    return "Deletion started; custody status is deletion-pending until all copies are reconciled.";
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
  await transitionControl(registerStore, recordId, { currentCustodyStatus: "deleted" });
  return { deleted: true, reason: "All custody copies reconciled; custody status is deleted." };
}

export type { PublicationStatus, CustodyStatus };
