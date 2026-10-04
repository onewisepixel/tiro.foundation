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

// Thrown on an optimistic-concurrency version mismatch. Named to mirror what
// DynamoDB's ConditionExpression failure represents conceptually — the real
// adapter should throw this (wrapping the AWS SDK's own
// ConditionalCheckFailedException) so service-layer retry/idempotency logic
// is identical against both the fake and the real store.
export class VersionConflictError extends Error {
  constructor(entity: string, id: string) {
    super(`Version conflict writing ${entity} ${id}`);
    this.name = "VersionConflictError";
  }
}

// Thrown when a lifecycle requestId is reused for a DIFFERENT operation
// (different record, action, caller, or payload) than the one it was first
// created for. An idempotency key is a promise that replaying it replays the
// SAME request — reusing it for something else is a client error, never a
// safe "replay" of the earlier result. See services/lifecycle.ts's
// getOrCreateRequest.
export class IdempotencyKeyConflictError extends Error {
  constructor(requestId: string) {
    super(
      `Request id ${requestId} was already used for a different operation (different record, action, caller, or payload).`,
    );
    this.name = "IdempotencyKeyConflictError";
  }
}

// Primary fixture data — records, their sub-entities, lifecycle work, and
// custody copies. Everything EXCEPT the restriction register (see below).
export interface FixtureStore {
  getRecord(recordId: string): Promise<FixtureRecord | null>;
  // expectedVersion: undefined means "must not already exist". Throws
  // VersionConflictError on mismatch.
  putRecord(record: FixtureRecord, expectedVersion: number | undefined): Promise<void>;
  // Actually removes the record (not a status flag) — the only thing that
  // makes completeDeletion() true rather than cosmetic. expectedVersion must
  // match the current stored version; throws VersionConflictError otherwise.
  deleteRecord(recordId: string, expectedVersion: number): Promise<void>;

  listAuthorityClaims(recordId: string): Promise<AuthorityClaim[]>;
  putAuthorityClaim(claim: AuthorityClaim): Promise<void>;

  listLegalRights(recordId: string): Promise<LegalRight[]>;
  putLegalRight(right: LegalRight): Promise<void>;

  listConsentGrants(recordId: string): Promise<ConsentGrant[]>;
  putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined): Promise<void>;

  listCustodyCopies(recordId: string): Promise<CustodyCopy[]>;
  putCustodyCopy(copy: CustodyCopy): Promise<void>;

  createLifecycleRequest(request: LifecycleRequest): Promise<void>;
  getLifecycleRequest(requestId: string): Promise<LifecycleRequest | null>;
  updateLifecycleRequest(request: LifecycleRequest): Promise<void>;
  // The "lifecycle queue" access pattern — backed by a GSI in the real
  // adapter, a plain filter in the fake.
  listLifecycleRequestsByStatus(status: LifecycleRequestStatus): Promise<LifecycleRequest[]>;

  putAuditReceipt(receipt: AuditReceipt): Promise<void>;
  listAuditReceipts(recordId: string): Promise<AuditReceipt[]>;

  // Upsert by correctionId — disputeCorrection() (services/lifecycle.ts)
  // updates an existing correction's status in place rather than ever
  // deleting or replacing the correction itself.
  listCorrections(recordId: string): Promise<Correction[]>;
  putCorrection(correction: Correction): Promise<void>;

  listRedactions(recordId: string): Promise<Redaction[]>;
  putRedaction(redaction: Redaction): Promise<void>;

  // ATOMIC: the field change and its history entry commit together, or
  // neither does. Reviewer-caught finding: correctRecord()/redactText()
  // used to write the new field value FIRST, then the history row
  // separately — a failure in between (or just after) left the live field
  // already changed with no history entry preserving the original, and a
  // RETRY would then capture the ALREADY-CHANGED value as if it were the
  // "previous" one, losing the true original forever. expectedVersion
  // guards the record exactly like putRecord; throws VersionConflictError
  // on mismatch, in which case NEITHER write lands.
  putRecordWithCorrection(record: FixtureRecord, expectedVersion: number | undefined, correction: Correction): Promise<void>;
  putRecordWithRedaction(record: FixtureRecord, expectedVersion: number | undefined, redaction: Redaction): Promise<void>;
}

// The durable control register. Deliberately a SEPARATE interface backed by
// a separate table/store — see docs/ethos.txt §12 and backend/src/domain/types.ts.
// A restore of FixtureStore data must never be able to resurrect access on
// its own; only this store's current entry decides what may be served.
export interface RestrictionRegisterStore {
  // Always strongly consistent in the real adapter (base-table GetItem, not
  // a GSI read) — this is the one read in the whole system that cannot be
  // stale.
  getCurrent(recordId: string): Promise<RestrictionRegisterEntry | null>;
  // expectedVersion must EXACTLY match the entry currently stored (or be
  // undefined, meaning "must not already exist") — this is a compare-and-swap,
  // not a monotonic-increase check, so that two concurrent read-modify-write
  // lifecycle actions can never both succeed against the same prior state.
  // The real adapter enforces this with a ConditionExpression on
  // controlVersion; the fake enforces it directly. Throws VersionConflictError
  // on mismatch.
  setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined): Promise<void>;
  listAll(): Promise<RestrictionRegisterEntry[]>;
}
