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
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
  RestrictionRegisterEntry,
} from "../domain/types";
import { VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "./store";

export class InMemoryFixtureStore implements FixtureStore {
  private records = new Map<string, FixtureRecord>();
  private authorityClaims = new Map<string, AuthorityClaim[]>();
  private legalRights = new Map<string, LegalRight[]>();
  private consentGrants = new Map<string, ConsentGrant[]>();
  private custodyCopies = new Map<string, CustodyCopy[]>();
  private lifecycleRequests = new Map<string, LifecycleRequest>();
  private auditReceipts = new Map<string, AuditReceipt[]>();

  async getRecord(recordId: string): Promise<FixtureRecord | null> {
    return this.records.get(recordId) ?? null;
  }

  async putRecord(record: FixtureRecord, expectedVersion: number | undefined): Promise<void> {
    const existing = this.records.get(record.recordId);
    const currentVersion = existing?.version;
    if (currentVersion !== expectedVersion) {
      throw new VersionConflictError("FixtureRecord", record.recordId);
    }
    this.records.set(record.recordId, { ...record });
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
    next.push({ ...grant });
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
    const list = this.auditReceipts.get(receipt.recordId) ?? [];
    list.push({ ...receipt });
    this.auditReceipts.set(receipt.recordId, list);
  }

  async listAuditReceipts(recordId: string): Promise<AuditReceipt[]> {
    return [...(this.auditReceipts.get(recordId) ?? [])];
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

  async setCurrent(entry: RestrictionRegisterEntry): Promise<void> {
    const existing = this.entries.get(entry.recordId);
    if (existing && entry.controlVersion <= existing.controlVersion) {
      throw new VersionConflictError("RestrictionRegisterEntry", entry.recordId);
    }
    this.entries.set(entry.recordId, { ...entry });
  }

  async listAll(): Promise<RestrictionRegisterEntry[]> {
    return [...this.entries.values()];
  }
}
