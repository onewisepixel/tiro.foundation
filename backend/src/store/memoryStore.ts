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
import {
  AlreadyAppliedError,
  DeletionInProgressError,
  VersionConflictError,
  type CustodyCopyCommitter,
  type EvidenceFlip,
  type FixtureStore,
  type IntakeRegisterCommitter,
  type RestrictionRegisterStore,
} from "./store";

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
  // requestId receipts for approvePreservation/approvePublication — see
  // IntakeRegisterCommitter.hasReceipt's doc comment (store.ts) for why
  // these two actions need one and nothing else does.
  private intakeReceipts = new Map<string, Set<string>>();

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

  async getAuthorityClaim(recordId: string, claimId: string): Promise<AuthorityClaim | null> {
    return this.getAuthorityClaimSync(recordId, claimId);
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

  async getLegalRight(recordId: string, rightId: string): Promise<LegalRight | null> {
    return this.getLegalRightSync(recordId, rightId);
  }

  async listConsentGrants(recordId: string): Promise<ConsentGrant[]> {
    return [...(this.consentGrants.get(recordId) ?? [])];
  }

  async getConsentGrant(recordId: string, consentId: string): Promise<ConsentGrant | null> {
    return this.getConsentGrantSync(recordId, consentId);
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

  // Same no-`await`-in-between discipline as putRecordWithCorrection/
  // putRecordWithRedaction above — see store.ts's interface comment for
  // why this pair needs to be atomic.
  async putRecordWithCustodyCopy(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    copy: CustodyCopy,
  ): Promise<void> {
    const existing = this.records.get(record.recordId);
    if (existing?.version !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    this.records.set(record.recordId, { ...record, version: (expectedVersion ?? 0) + 1 });
    const list = this.custodyCopies.get(copy.recordId) ?? [];
    const next = list.filter((c) => c.copyId !== copy.copyId);
    next.push({ ...copy });
    this.custodyCopies.set(copy.recordId, next);
  }

  // Synchronous peek/write helpers below — NOT part of the FixtureStore
  // interface, same reasoning as InMemoryRestrictionRegisterStore's
  // getCurrentSync: InMemoryIntakeRegisterCommitter (below) needs to
  // check-and-write across BOTH this store and the register store as one
  // uninterrupted stretch of synchronous JS execution, with no `await`
  // anywhere in the chain, to genuinely mirror what the real adapter's one
  // DynamoDB transaction guarantees — not just "fast enough that it
  // probably doesn't interleave in practice."
  getRecordSync(recordId: string): FixtureRecord | null {
    return this.records.get(recordId) ?? null;
  }
  setRecordSync(record: FixtureRecord, nextVersion: number): void {
    this.records.set(record.recordId, { ...record, version: nextVersion });
  }
  getAuthorityClaimSync(recordId: string, claimId: string): AuthorityClaim | null {
    return (this.authorityClaims.get(recordId) ?? []).find((c) => c.claimId === claimId) ?? null;
  }
  setAuthorityClaimSync(claim: AuthorityClaim): void {
    const list = this.authorityClaims.get(claim.recordId) ?? [];
    this.authorityClaims.set(claim.recordId, [...list.filter((c) => c.claimId !== claim.claimId), { ...claim }]);
  }
  getLegalRightSync(recordId: string, rightId: string): LegalRight | null {
    return (this.legalRights.get(recordId) ?? []).find((r) => r.rightId === rightId) ?? null;
  }
  setLegalRightSync(right: LegalRight): void {
    const list = this.legalRights.get(right.recordId) ?? [];
    this.legalRights.set(right.recordId, [...list.filter((r) => r.rightId !== right.rightId), { ...right }]);
  }
  getConsentGrantSync(recordId: string, consentId: string): ConsentGrant | null {
    return (this.consentGrants.get(recordId) ?? []).find((g) => g.consentId === consentId) ?? null;
  }
  setConsentGrantSync(grant: ConsentGrant): void {
    const list = this.consentGrants.get(grant.recordId) ?? [];
    this.consentGrants.set(grant.recordId, [...list.filter((g) => g.consentId !== grant.consentId), { ...grant }]);
  }
  setCustodyCopySync(copy: CustodyCopy): void {
    const list = this.custodyCopies.get(copy.recordId) ?? [];
    this.custodyCopies.set(copy.recordId, [...list.filter((c) => c.copyId !== copy.copyId), { ...copy }]);
  }
  hasIntakeReceiptSync(recordId: string, requestId: string): boolean {
    return this.intakeReceipts.get(recordId)?.has(requestId) ?? false;
  }
  setIntakeReceiptSync(recordId: string, requestId: string): void {
    const set = this.intakeReceipts.get(recordId) ?? new Set<string>();
    set.add(requestId);
    this.intakeReceipts.set(recordId, set);
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

  // Stable slice over the Map's own insertion order — the same order
  // listAll() already returns, so a cursor derived from one entry's
  // recordId resumes deterministically right after it, mirroring the real
  // adapter's Scan+ExclusiveStartKey behavior (dynamoStore.ts) closely
  // enough to exercise the same resumption contract against this fake.
  async listPage(query: { limit: number; cursor: string | null }): Promise<{ entries: RestrictionRegisterEntry[]; nextCursor: string | null }> {
    const all = [...this.entries.values()];
    const startIndex = query.cursor === null ? 0 : all.findIndex((e) => e.recordId === query.cursor) + 1;
    const page = all.slice(startIndex, startIndex + query.limit);
    const nextCursor = startIndex + query.limit < all.length ? page[page.length - 1]?.recordId ?? null : null;
    return { entries: page, nextCursor };
  }

  // Synchronous peek — no Promise/microtask boundary at all. Used ONLY by
  // InMemoryCustodyCopyCommitter below to perform a genuinely atomic (not
  // merely fast) check-then-write: calling this immediately before
  // InMemoryFixtureStore.putRecordWithCustodyCopy (itself synchronous
  // internally, with no `await` between its own two mutations) means the
  // ENTIRE check-and-commit runs as one uninterrupted synchronous stretch
  // of JS execution — nothing else can interleave, mirroring what the real
  // adapter's single DynamoDB transaction guarantees. Not part of the
  // RestrictionRegisterStore interface; deliberately a plain extra method
  // on the concrete fake class.
  getCurrentSync(recordId: string): RestrictionRegisterEntry | null {
    return this.entries.get(recordId) ?? null;
  }

  // Synchronous write counterpart to getCurrentSync — see its comment.
  // Used ONLY by InMemoryIntakeRegisterCommitter below.
  setCurrentSync(entry: RestrictionRegisterEntry, expectedVersion: number | undefined): void {
    const existing = this.entries.get(entry.recordId);
    if (existing?.controlVersion !== expectedVersion) {
      throw new VersionConflictError("RestrictionRegisterEntry", entry.recordId);
    }
    this.entries.set(entry.recordId, { ...entry });
  }
}

// Logic-level fake of CustodyCopyCommitter (store.ts). See
// getCurrentSync's comment above for exactly how this achieves genuine
// (not just fast) atomicity without a real cross-table transaction.
export class InMemoryCustodyCopyCommitter implements CustodyCopyCommitter {
  constructor(
    private readonly fixtureStore: InMemoryFixtureStore,
    private readonly registerStore: InMemoryRestrictionRegisterStore,
  ) {}

  async commitIfNotDeleting(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    copy: CustodyCopy,
  ): Promise<void> {
    const current = this.registerStore.getCurrentSync(record.recordId);
    if (current?.currentCustodyStatus === "deletion-pending" || current?.currentCustodyStatus === "deleted") {
      throw new DeletionInProgressError(record.recordId);
    }
    await this.fixtureStore.putRecordWithCustodyCopy(record, expectedVersion, copy);
  }
}

// Logic-level fake of IntakeRegisterCommitter (store.ts). Same genuine-
// atomicity technique as InMemoryCustodyCopyCommitter above: every method
// body below is one uninterrupted stretch of synchronous Map reads/writes,
// using the *Sync helpers on both concrete stores, with no `await`
// anywhere in the chain — nothing else can interleave mid-check-and-write,
// mirroring what the real adapter's single DynamoDB transaction guarantees.
export class InMemoryIntakeRegisterCommitter implements IntakeRegisterCommitter {
  constructor(
    private readonly fixtureStore: InMemoryFixtureStore,
    private readonly registerStore: InMemoryRestrictionRegisterStore,
  ) {}

  async commitCreateSubmission(record: FixtureRecord): Promise<void> {
    if (this.registerStore.getCurrentSync(record.recordId) !== null) {
      throw new VersionConflictError("RestrictionRegisterEntry", record.recordId);
    }
    if (this.fixtureStore.getRecordSync(record.recordId) !== null) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    this.registerStore.setCurrentSync(
      {
        recordId: record.recordId,
        controlVersion: 1,
        currentPublicationStatus: "not-published",
        currentCustodyStatus: "quarantined",
        restrictedPurposes: [],
        revokedConsentIds: [],
        mediaPurgeClaim: null,
        redactedMediaIds: [],
        redactedTextFields: [],
        updatedAt: new Date().toISOString(),
      },
      undefined,
    );
    this.fixtureStore.setRecordSync(record, 1);
  }

  // Shared precondition every method below needs: the register must still
  // be at EXACTLY expectedControlVersion, still quarantined, and not
  // rejected (currentPublicationStatus "withdrawn") — asserted fresh here,
  // not trusted from an earlier read, since real wall-clock time (an S3
  // upload, for addMedia) can pass between that earlier read and this
  // commit.
  private assertOpenIntake(recordId: string, expectedControlVersion: number): RestrictionRegisterEntry {
    const current = this.registerStore.getCurrentSync(recordId);
    if (
      current?.controlVersion !== expectedControlVersion ||
      current.currentCustodyStatus !== "quarantined" ||
      current.currentPublicationStatus === "withdrawn"
    ) {
      throw new VersionConflictError("RestrictionRegisterEntry", recordId);
    }
    return current;
  }

  private bumpControlVersion(current: RestrictionRegisterEntry): void {
    this.registerStore.setCurrentSync(
      { ...current, controlVersion: current.controlVersion + 1, updatedAt: new Date().toISOString() },
      current.controlVersion,
    );
  }

  async commitEvidenceCreate(
    recordId: string,
    expectedControlVersion: number,
    newItem: AuthorityClaim | LegalRight | ConsentGrant,
  ): Promise<void> {
    const current = this.assertOpenIntake(recordId, expectedControlVersion);
    if ("claimId" in newItem) {
      if (this.fixtureStore.getAuthorityClaimSync(recordId, newItem.claimId)) {
        throw new AlreadyAppliedError("AuthorityClaim", newItem.claimId);
      }
      this.bumpControlVersion(current);
      this.fixtureStore.setAuthorityClaimSync(newItem);
    } else if ("rightId" in newItem) {
      if (this.fixtureStore.getLegalRightSync(recordId, newItem.rightId)) {
        throw new AlreadyAppliedError("LegalRight", newItem.rightId);
      }
      this.bumpControlVersion(current);
      this.fixtureStore.setLegalRightSync(newItem);
    } else {
      if (this.fixtureStore.getConsentGrantSync(recordId, newItem.consentId)) {
        throw new AlreadyAppliedError("ConsentGrant", newItem.consentId);
      }
      this.bumpControlVersion(current);
      this.fixtureStore.setConsentGrantSync({ ...newItem, version: 1 });
    }
  }

  async commitMediaAdd(
    recordId: string,
    expectedControlVersion: number,
    updatedRecord: FixtureRecord,
    expectedRecordVersion: number,
    copy: CustodyCopy,
  ): Promise<void> {
    const current = this.assertOpenIntake(recordId, expectedControlVersion);
    const existingRecord = this.fixtureStore.getRecordSync(recordId);
    if (existingRecord?.version !== expectedRecordVersion) {
      throw new VersionConflictError("FixtureRecord", recordId);
    }
    this.bumpControlVersion(current);
    this.fixtureStore.setRecordSync(updatedRecord, expectedRecordVersion + 1);
    this.fixtureStore.setCustodyCopySync(copy);
  }

  async commitEvidenceSupersede(
    recordId: string,
    expectedControlVersion: number,
    oldItem: { kind: "authority" | "legalRight"; id: string },
    newItem: AuthorityClaim | LegalRight,
  ): Promise<void> {
    const current = this.assertOpenIntake(recordId, expectedControlVersion);
    if (oldItem.kind === "authority") {
      const existingOld = this.fixtureStore.getAuthorityClaimSync(recordId, oldItem.id);
      if (!existingOld || existingOld.status !== "unknown") {
        throw new VersionConflictError("AuthorityClaim", oldItem.id);
      }
      const newClaim = newItem as AuthorityClaim;
      if (this.fixtureStore.getAuthorityClaimSync(recordId, newClaim.claimId)) {
        throw new AlreadyAppliedError("AuthorityClaim", newClaim.claimId);
      }
      this.bumpControlVersion(current);
      this.fixtureStore.setAuthorityClaimSync({ ...existingOld, status: "superseded" });
      this.fixtureStore.setAuthorityClaimSync(newClaim);
    } else {
      const existingOld = this.fixtureStore.getLegalRightSync(recordId, oldItem.id);
      if (!existingOld || existingOld.status !== "unknown") {
        throw new VersionConflictError("LegalRight", oldItem.id);
      }
      const newRight = newItem as LegalRight;
      if (this.fixtureStore.getLegalRightSync(recordId, newRight.rightId)) {
        throw new AlreadyAppliedError("LegalRight", newRight.rightId);
      }
      this.bumpControlVersion(current);
      this.fixtureStore.setLegalRightSync({ ...existingOld, status: "superseded" });
      this.fixtureStore.setLegalRightSync(newRight);
    }
  }

  async commitApproval(
    recordId: string,
    requestId: string,
    expectedControlVersion: number,
    expectedRecordVersion: number,
    registerPatch: Partial<Pick<RestrictionRegisterEntry, "currentCustodyStatus" | "currentPublicationStatus">>,
    evidenceFlips: EvidenceFlip[],
  ): Promise<void> {
    // controlVersion-only pinning is NOT transitively sufficient on its
    // own — reproduced directly: a reviewer who does a FRESH read of an
    // ALREADY-rejected record and submits approval anyway supplies a
    // perfectly current, non-stale expectedControlVersion, so a bare
    // version match alone would happily approve a withdrawn submission.
    // "Not withdrawn" must be asserted explicitly, every time, atomically
    // with the version check — not inferred from version-staleness, which
    // only ever catches a CHANGE since the caller's last read, never a
    // bad state the caller's own read already reflected. The specific
    // starting custody value (quarantined vs. preserved) is still each
    // caller's own job (approvePreservation/approvePublication,
    // services/intake.ts) since it legitimately differs between them.
    const current = this.registerStore.getCurrentSync(recordId);
    if (current?.controlVersion !== expectedControlVersion || current.currentPublicationStatus === "withdrawn") {
      throw new VersionConflictError("RestrictionRegisterEntry", recordId);
    }
    const existingRecord = this.fixtureStore.getRecordSync(recordId);
    if (existingRecord?.version !== expectedRecordVersion) {
      throw new VersionConflictError("FixtureRecord", recordId);
    }
    for (const flip of evidenceFlips) {
      if (flip.kind === "authority") {
        const claim = this.fixtureStore.getAuthorityClaimSync(recordId, flip.claimId);
        if (!claim || claim.status !== "unknown") throw new VersionConflictError("AuthorityClaim", flip.claimId);
      } else if (flip.kind === "legalRight") {
        const right = this.fixtureStore.getLegalRightSync(recordId, flip.rightId);
        if (!right || right.status !== "unknown") throw new VersionConflictError("LegalRight", flip.rightId);
      } else {
        // Existence only, same reasoning as dynamoStore.ts's equivalent fix
        // — a grant already verified (e.g. by an earlier preservation
        // approval, for a grant whose purposes cover both) must be a safe
        // no-op here, never a hard conflict.
        const grant = this.fixtureStore.getConsentGrantSync(recordId, flip.consentId);
        if (!grant) throw new VersionConflictError("ConsentGrant", flip.consentId);
      }
    }
    if (this.fixtureStore.hasIntakeReceiptSync(recordId, requestId)) {
      throw new AlreadyAppliedError("IntakeReceipt", requestId);
    }
    // Every condition above passed — now actually write, still with no
    // `await` anywhere in this stretch.
    this.registerStore.setCurrentSync(
      { ...current, ...registerPatch, controlVersion: current.controlVersion + 1, updatedAt: new Date().toISOString() },
      current.controlVersion,
    );
    for (const flip of evidenceFlips) {
      if (flip.kind === "authority") {
        const claim = this.fixtureStore.getAuthorityClaimSync(recordId, flip.claimId) as AuthorityClaim;
        this.fixtureStore.setAuthorityClaimSync({ ...claim, status: "identified", reviewerDecision: flip.reviewerDecision });
      } else if (flip.kind === "legalRight") {
        const right = this.fixtureStore.getLegalRightSync(recordId, flip.rightId) as LegalRight;
        this.fixtureStore.setLegalRightSync({ ...right, status: "identified" });
      } else {
        const grant = this.fixtureStore.getConsentGrantSync(recordId, flip.consentId) as ConsentGrant;
        this.fixtureStore.setConsentGrantSync({ ...grant, signerCapacityVerified: true });
      }
    }
    this.fixtureStore.setIntakeReceiptSync(recordId, requestId);
  }

  async hasReceipt(recordId: string, requestId: string): Promise<boolean> {
    return this.fixtureStore.hasIntakeReceiptSync(recordId, requestId);
  }
}
