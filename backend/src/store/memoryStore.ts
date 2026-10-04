// A hand-built in-memory fake of FixtureStore/RestrictionRegisterStore.
//
// IMPORTANT — this is a LOGIC-LEVEL fake, not a DynamoDB emulator. It proves
// the service layer's permission/lifecycle/restore-reconciliation logic is
// correct against the same interface the real adapter implements. It does
// NOT prove: actual DynamoDB eventual-consistency behavior, actual
// ConditionExpression/TransactWriteItems wire semantics, actual TTL-deletion
// latency, or actual provider backup/restore. Those require the real AWS
// connection — see docs/backend/evidence-matrix.md for what's demonstrated
// here versus what still needs a live account.
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
import { AlreadyAppliedError, VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "./store";

export class InMemoryFixtureStore implements FixtureStore {
  private records = new Map<string, FixtureRecord>();
  private authorityClaims = new Map<string, AuthorityClaim[]>();
  private legalRights = new Map<string, LegalRight[]>();
  private consentGrants = new Map<string, ConsentGrant[]>();
  private custodyCopies = new Map<string, CustodyCopy[]>();
  private lifecycleRequests = new Map<string, LifecycleRequest>();
  private auditReceipts = new Map<string, AuditReceipt[]>();
  private corrections = new Map<string, Correction[]>();
  private redactions = new Map<string, Redaction[]>();

  async getRecord(recordId: string): Promise<FixtureRecord | null> {
    return this.records.get(recordId) ?? null;
  }

  async putRecord(record: FixtureRecord, expectedVersion: number | undefined): Promise<void> {
    const existing = this.records.get(record.recordId);
    const currentVersion = existing?.version;
    if (currentVersion !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    // The store owns the persisted version — see store.ts's comment. A
    // caller's `record.version` is never trusted; without this, two
    // concurrent writers both reading the same expectedVersion would both
    // pass the check above and both "succeed", the second clobbering the
    // first, because nothing ever actually advanced the stored version.
    this.records.set(record.recordId, { ...record, version: (expectedVersion ?? 0) + 1 });
  }

  async deleteRecord(recordId: string, expectedVersion: number): Promise<void> {
    const existing = this.records.get(recordId);
    if (existing?.version !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", recordId);
    }
    this.records.delete(recordId);
  }

  async listAuthorityClaims(recordId: string): Promise<AuthorityClaim[]> {
    return [...(this.authorityClaims.get(recordId) ?? [])];
  }

  async putAuthorityClaim(claim: AuthorityClaim): Promise<void> {
    const list = this.authorityClaims.get(claim.recordId) ?? [];
    const next = list.filter((c) => c.claimId !== claim.claimId);
    next.push({ ...claim });
    this.authorityClaims.set(claim.recordId, next);
  }

  async listLegalRights(recordId: string): Promise<LegalRight[]> {
    return [...(this.legalRights.get(recordId) ?? [])];
  }

  async putLegalRight(right: LegalRight): Promise<void> {
    const list = this.legalRights.get(right.recordId) ?? [];
    const next = list.filter((r) => r.rightId !== right.rightId);
    next.push({ ...right });
    this.legalRights.set(right.recordId, next);
  }

  async listConsentGrants(recordId: string): Promise<ConsentGrant[]> {
    return [...(this.consentGrants.get(recordId) ?? [])];
  }

  async putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined): Promise<void> {
    const list = this.consentGrants.get(grant.recordId) ?? [];
    const existing = list.find((g) => g.consentId === grant.consentId);
    if (existing?.version !== expectedVersion) {
      throw new VersionConflictError("ConsentGrant", grant.consentId);
    }
    const next = list.filter((g) => g.consentId !== grant.consentId);
    // Store-owned version counter — same reasoning as putRecord.
    next.push({ ...grant, version: (expectedVersion ?? 0) + 1 });
    this.consentGrants.set(grant.recordId, next);
  }

  async listCustodyCopies(recordId: string): Promise<CustodyCopy[]> {
    return [...(this.custodyCopies.get(recordId) ?? [])];
  }

  async putCustodyCopy(copy: CustodyCopy): Promise<void> {
    const list = this.custodyCopies.get(copy.recordId) ?? [];
    const next = list.filter((c) => c.copyId !== copy.copyId);
    next.push({ ...copy });
    this.custodyCopies.set(copy.recordId, next);
  }

  async createLifecycleRequest(request: LifecycleRequest): Promise<void> {
    if (this.lifecycleRequests.has(request.requestId)) {
      throw new VersionConflictError("LifecycleRequest", request.requestId);
    }
    this.lifecycleRequests.set(request.requestId, { ...request });
  }

  async getLifecycleRequest(requestId: string): Promise<LifecycleRequest | null> {
    return this.lifecycleRequests.get(requestId) ?? null;
  }

  async updateLifecycleRequest(request: LifecycleRequest): Promise<void> {
    if (!this.lifecycleRequests.has(request.requestId)) {
      throw new VersionConflictError("LifecycleRequest", request.requestId);
    }
    this.lifecycleRequests.set(request.requestId, { ...request });
  }

  async listLifecycleRequestsByStatus(status: LifecycleRequestStatus): Promise<LifecycleRequest[]> {
    return [...this.lifecycleRequests.values()].filter((r) => r.status === status);
  }

  async putAuditReceipt(receipt: AuditReceipt): Promise<void> {
    // Upsert by receiptId, matching every other entity-put in this file
    // (putAuthorityClaim, putCustodyCopy, etc.) and the real DynamoDB
    // adapter's Put-by-key semantics — without this, replaying the same
    // receipt (e.g. restore.ts's importExport re-run) duplicated it on
    // every call instead of being a safe no-op.
    const list = this.auditReceipts.get(receipt.recordId) ?? [];
    const next = list.filter((r) => r.receiptId !== receipt.receiptId);
    next.push({ ...receipt });
    this.auditReceipts.set(receipt.recordId, next);
  }

  async listAuditReceipts(recordId: string): Promise<AuditReceipt[]> {
    return [...(this.auditReceipts.get(recordId) ?? [])];
  }

  async putCorrection(correction: Correction): Promise<void> {
    const list = this.corrections.get(correction.recordId) ?? [];
    const next = list.filter((c) => c.correctionId !== correction.correctionId);
    next.push({ ...correction });
    this.corrections.set(correction.recordId, next);
  }

  async listCorrections(recordId: string): Promise<Correction[]> {
    return [...(this.corrections.get(recordId) ?? [])];
  }

  async getCorrection(recordId: string, correctionId: string): Promise<Correction | null> {
    // A plain Map read has no eventual-consistency window at all — every
    // read reflects every prior write instantly. Still a SEPARATE method
    // from listCorrections (rather than `(await listCorrections()).find`)
    // so the real adapter's strongly-consistent-by-exact-key contract has
    // a fake counterpart with the identical signature and semantics.
    return (this.corrections.get(recordId) ?? []).find((c) => c.correctionId === correctionId) ?? null;
  }

  async putRedaction(redaction: Redaction): Promise<void> {
    const list = this.redactions.get(redaction.recordId) ?? [];
    const next = list.filter((r) => r.redactionId !== redaction.redactionId);
    next.push({ ...redaction });
    this.redactions.set(redaction.recordId, next);
  }

  async listRedactions(recordId: string): Promise<Redaction[]> {
    return [...(this.redactions.get(recordId) ?? [])];
  }

  async getRedaction(recordId: string, redactionId: string): Promise<Redaction | null> {
    return (this.redactions.get(recordId) ?? []).find((r) => r.redactionId === redactionId) ?? null;
  }

  // Deliberately does NOT call this.putRecord()/this.putCorrection() —
  // calling through those (overridable) public methods would reintroduce
  // exactly the gap this exists to close: a subclass (or future code)
  // could observe or fail in between the two writes. Both mutations below
  // happen with no `await` between them, so nothing can interleave.
  async putRecordWithCorrection(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    correction: Correction,
  ): Promise<void> {
    const existing = this.records.get(record.recordId);
    if (existing?.version !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    // Reviewer-caught finding, round two: a stale (eventually consistent,
    // on the real adapter) pre-check could miss a correction this SAME
    // retry already committed in an earlier attempt (request completion
    // failing AFTER the transaction succeeded) and wrongly proceed to
    // overwrite that row with the ALREADY-corrected live value as its
    // "previous" one — destroying the true original. Conditioning this
    // write on the id NOT already existing is the actual guard (defense
    // in depth beyond the pre-check, which getCorrection now makes
    // strongly consistent too) — checked and applied with no `await` in
    // between, so nothing can interleave even in the fake.
    if ((this.corrections.get(correction.recordId) ?? []).some((c) => c.correctionId === correction.correctionId)) {
      throw new AlreadyAppliedError("Correction", correction.correctionId);
    }
    this.records.set(record.recordId, { ...record, version: (expectedVersion ?? 0) + 1 });
    const list = this.corrections.get(correction.recordId) ?? [];
    list.push({ ...correction });
    this.corrections.set(correction.recordId, list);
  }

  async putRecordWithRedaction(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    redaction: Redaction,
  ): Promise<void> {
    const existing = this.records.get(record.recordId);
    if (existing?.version !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    if ((this.redactions.get(redaction.recordId) ?? []).some((r) => r.redactionId === redaction.redactionId)) {
      throw new AlreadyAppliedError("Redaction", redaction.redactionId);
    }
    this.records.set(record.recordId, { ...record, version: (expectedVersion ?? 0) + 1 });
    const list = this.redactions.get(redaction.recordId) ?? [];
    list.push({ ...redaction });
    this.redactions.set(redaction.recordId, list);
  }

  // Test/backup-simulation helper only — not part of the FixtureStore
  // interface. Produces a deep snapshot usable to simulate "restore an old
  // backup" in tests, without touching the restriction register.
  snapshot(): {
    records: FixtureRecord[];
    custodyCopies: [string, CustodyCopy[]][];
  } {
    return {
      records: [...this.records.values()].map((r) => ({ ...r })),
      custodyCopies: [...this.custodyCopies.entries()].map(([k, v]) => [k, v.map((c) => ({ ...c }))]),
    };
  }

  static fromSnapshot(snapshot: ReturnType<InMemoryFixtureStore["snapshot"]>): InMemoryFixtureStore {
    const store = new InMemoryFixtureStore();
    for (const record of snapshot.records) {
      store.records.set(record.recordId, { ...record });
    }
    for (const [recordId, copies] of snapshot.custodyCopies) {
      store.custodyCopies.set(recordId, copies.map((c) => ({ ...c })));
    }
    return store;
  }
}

export class InMemoryRestrictionRegisterStore implements RestrictionRegisterStore {
  private entries = new Map<string, RestrictionRegisterEntry>();

  async getCurrent(recordId: string): Promise<RestrictionRegisterEntry | null> {
    return this.entries.get(recordId) ?? null;
  }

  async setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined): Promise<void> {
    const existing = this.entries.get(entry.recordId);
    if (existing?.controlVersion !== expectedVersion) {
      throw new VersionConflictError("RestrictionRegisterEntry", entry.recordId);
    }
    this.entries.set(entry.recordId, { ...entry });
  }

  async listAll(): Promise<RestrictionRegisterEntry[]> {
    return [...this.entries.values()];
  }
}
