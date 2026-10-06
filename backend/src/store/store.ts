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

// Thrown by putRecordWithCorrection/putRecordWithRedaction when a history
// row with that exact id ALREADY exists — i.e. this exact operation already
// committed on an earlier attempt. Reviewer-caught finding: a stable,
// requestId-derived history id alone is not a sufficient guard against a
// retry corrupting history, because the PRE-CHECK that was supposed to
// detect "already applied" (a query across all corrections/redactions) can
// itself be stale — DynamoDB's default (eventually consistent) reads can
// miss a write that committed only moments earlier. Conditioning the
// history row's write itself on non-existence (attribute_not_exists) closes
// this for real: even if the pre-check wrongly says "not applied yet", the
// write that would corrupt the existing row fails instead of succeeding.
// services/lifecycle.ts catches this specifically and treats it as the
// SAME safe "already applied, resume without re-capturing a bad previous
// value" outcome the pre-check was meant to produce — never a hard failure.
export class AlreadyAppliedError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} already exists — this operation already committed on an earlier attempt`);
    this.name = "AlreadyAppliedError";
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

// Thrown by CustodyCopyCommitter.commitIfNotDeleting when the restriction
// register's custody status is "deletion-pending" or "deleted" at the EXACT
// instant the atomic commit was attempted — not from an earlier, separate
// check. Reviewer-caught finding: a "check custody, then upload, then
// write" sequence has a real window in which startDeletion() AND
// completeDeletion() can run to full completion entirely between the check
// and the write — real S3 bytes get uploaded and a CustodyCopy gets
// created for a record that is, by the time the write lands, already
// gone, with nothing left to ever purge that object. This error signals a
// GENUINE, certain non-commit (the whole transaction was cancelled,
// nothing partial landed) — see CustodyCopyCommitter for the mechanism.
export class DeletionInProgressError extends Error {
  constructor(recordId: string) {
    super(
      `Custody status for record ${recordId} moved into the deletion workflow at the exact instant this write was attempted; the write did not commit.`,
    );
    this.name = "DeletionInProgressError";
  }
}

// Primary fixture data — records, their sub-entities, lifecycle work, and
// custody copies. Everything EXCEPT the restriction register (see below).
export interface FixtureStore {
  getRecord(recordId: string): Promise<FixtureRecord | null>;
  // expectedVersion: undefined means "must not already exist". Throws
  // VersionConflictError on mismatch.
  //
  // Reviewer-caught finding: every caller of this (and
  // putRecordWithCorrection/putRecordWithRedaction) used to construct
  // `record` by spreading a freshly-read copy and never actually
  // incrementing its `version` field — so the STORED version never
  // advanced, and the conditional-write check below was comparing
  // `expectedVersion` against a value that could never change. Two
  // concurrent corrections both reading version N would both pass that
  // check and both "succeed", the second silently clobbering the first.
  // Fixed by making the implementation itself the sole authority over
  // what version gets PERSISTED — it always writes `expectedVersion + 1`
  // (or `1` for a first write, when expectedVersion is undefined),
  // ignoring whatever `record.version` the caller's object happens to
  // carry. This closes the whole class of bug structurally: no future
  // caller can forget to bump a version that was never theirs to set in
  // the first place.
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
  // Same store-owns-the-version-counter contract as putRecord, and for the
  // same reason: revokeConsentGrant() (services/lifecycle.ts) had the exact
  // same never-advances bug.
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
  // Strongly consistent lookup by the EXACT id — never a query/scan across
  // every correction on the record, and never eventually consistent. Used
  // ONLY as the retry-safety guard in correctRecord() (services/
  // lifecycle.ts), which must never observe a stale "not found" for a
  // correction its own earlier attempt already committed.
  getCorrection(recordId: string, correctionId: string): Promise<Correction | null>;

  listRedactions(recordId: string): Promise<Redaction[]>;
  putRedaction(redaction: Redaction): Promise<void>;
  // Same strongly-consistent, by-exact-id contract as getCorrection, for
  // redactText()/redactMedia()'s equivalent retry-safety guard.
  getRedaction(recordId: string, redactionId: string): Promise<Redaction | null>;

  // ATOMIC: the field change and its history entry commit together, or
  // neither does. Reviewer-caught finding: correctRecord()/redactText()
  // used to write the new field value FIRST, then the history row
  // separately — a failure in between (or just after) left the live field
  // already changed with no history entry preserving the original, and a
  // RETRY would then capture the ALREADY-CHANGED value as if it were the
  // "previous" one, losing the true original forever. expectedVersion
  // guards the record exactly like putRecord; throws VersionConflictError
  // on mismatch, in which case NEITHER write lands. Also owns the stored
  // version counter exactly like putRecord — see its comment.
  //
  // The history row's own write is ALSO conditional — on that exact id not
  // already existing — throwing AlreadyAppliedError (never overwriting it)
  // if it does. This is deliberate defense in depth, not redundant with
  // the stable requestId-derived id: a stale pre-check (see getCorrection/
  // getRedaction above) could otherwise still let a retry through to
  // overwrite an existing history row with a corrupted "previous" value.
  putRecordWithCorrection(record: FixtureRecord, expectedVersion: number | undefined, correction: Correction): Promise<void>;
  putRecordWithRedaction(record: FixtureRecord, expectedVersion: number | undefined, redaction: Redaction): Promise<void>;

  // ATOMIC: the record's media-reference rewrite and the new custody copy
  // that tracks its real S3 version commit together, or neither does.
  // Reviewer-caught finding: the legacy-media migration script used to
  // issue these as two SEPARATE writes — if the custody-copy write failed
  // after the record's MediaRef already pointed at the newly uploaded
  // object, completeDeletion's media purge (which learns what to purge
  // ONLY from CustodyCopy rows — see purgeMediaCustody in
  // services/lifecycle.ts) would never find out that object exists, so a
  // later deletion could report "completed" while that media survived,
  // untracked, outside the deletion workflow entirely. expectedVersion
  // guards the record exactly like putRecordWithCorrection/
  // putRecordWithRedaction; throws VersionConflictError on mismatch, in
  // which case NEITHER write lands.
  putRecordWithCustodyCopy(record: FixtureRecord, expectedVersion: number | undefined, copy: CustodyCopy): Promise<void>;
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

// A narrow, explicit interface for the ONE operation in this system that
// needs an atomicity guarantee SPANNING both FixtureStore's table and
// RestrictionRegisterStore's table — deliberately NOT folded into either
// store's own interface, which otherwise stay scoped to exactly one table
// each (see docs/ethos.txt §12 on keeping the register "outside the data
// being rolled back"). Used by services/legacyMediaMigration.ts to close a
// real TOCTOU race a separate "read custody, then write" sequence cannot:
// deletion can start AND finish entirely in the gap between a fresh
// custody check and a later write, because uploading real bytes to S3
// takes real wall-clock time. Committing the record+copy ATOMICALLY
// GUARDED by the register's custody status, in one transaction, removes
// that gap instead of merely narrowing it.
export interface CustodyCopyCommitter {
  // Throws VersionConflictError if `expectedVersion` is stale, or
  // DeletionInProgressError if custody moved into the deletion workflow at
  // the exact commit instant — in BOTH cases nothing partial is written;
  // the whole attempt either fully commits or fully doesn't.
  commitIfNotDeleting(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    copy: CustodyCopy,
  ): Promise<void>;
}
