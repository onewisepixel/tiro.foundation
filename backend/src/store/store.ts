import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
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

// Primary fixture data — records, their sub-entities, lifecycle work, and
// custody copies. Everything EXCEPT the restriction register (see below).
export interface FixtureStore {
  getRecord(recordId: string): Promise<FixtureRecord | null>;
  // expectedVersion: undefined means "must not already exist". Throws
  // VersionConflictError on mismatch.
  putRecord(record: FixtureRecord, expectedVersion: number | undefined): Promise<void>;

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
  // controlVersion must be monotonically increasing; the real adapter
  // enforces this with a ConditionExpression, the fake enforces it directly.
  setCurrent(entry: RestrictionRegisterEntry): Promise<void>;
  listAll(): Promise<RestrictionRegisterEntry[]>;
}
