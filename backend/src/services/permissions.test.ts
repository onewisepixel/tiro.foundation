import { test } from "node:test";
import assert from "node:assert/strict";
import type { FixtureRecord } from "../domain/types";
import { uuidv7 } from "../domain/id";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import type { FixtureStore } from "../store/store";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { approvePublication } from "./intake";
import { redactText } from "./lifecycle";
import { evaluatePermission } from "./permissions";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, active, expired, disputed, preservationOnly };
}

test("active publication consent is allowed", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, true);
});

test("preservation-only permission denies publication purpose", async () => {
  const { fixtureStore, registerStore, preservationOnly } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "publication",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /No active consent grant/);
});

test("preservation-only permission allows preservation purpose for staff", async () => {
  const { fixtureStore, registerStore, preservationOnly } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "preservation",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, true);
});

test("wrong purpose denies even with an active grant for a different purpose", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "model-training",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("wrong audience denies even with an active grant for a different audience", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "research-partner",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("expired consent denies", async () => {
  const { fixtureStore, registerStore, expired } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: expired.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /No active consent grant/);
});

test("disputed authority denies regardless of consent", async () => {
  const { fixtureStore, registerStore, disputed } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: disputed.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /disputed/);
});

test("wrong signer capacity (unverified) denies even with matching purpose/audience", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  const unverified = {
    ...active,
    consentGrants: active.consentGrants.map((g) => ({ ...g, signerCapacityVerified: false })),
  };
  await seedStore(fixtureStore, registerStore, [unverified]);

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: unverified.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /signer capacity is not verified/);
});

test("missing control state denies, not defaults to allowed", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  // Seed the fixture store directly, skip the register — simulates a
  // record that exists but has no control entry yet.
  await fixtureStore.putRecord(active.record, undefined);
  for (const grant of active.consentGrants) {
    await fixtureStore.putConsentGrant(grant, undefined);
  }
  for (const claim of active.authorityClaims) {
    await fixtureStore.putAuthorityClaim(claim);
  }

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /missing control state denies/);
});

test("disputed legal right denies, mirroring disputed authority (Finding 4)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  const withDisputedRight = {
    ...active,
    legalRights: [
      {
        recordId: active.record.recordId,
        rightId: "right-disputed-1",
        status: "disputed" as const,
        holder: "[SYNTHETIC] Invented Rightsholder",
        rightType: "publication",
        jurisdiction: null,
        evidenceRef: "fixture://invented-legal-evidence-001",
        reviewerDecision: null,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await seedStore(fixtureStore, registerStore, [withDisputedRight]);

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /Legal right .* is "disputed"/);
});

test("a staff role alone does not substitute for a scoped grant", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  // "active" has no "staff"-audience grant at all, only "public".
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("a redacted mediaId is denied regardless of an otherwise fully-authorized purpose/audience", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const current = await registerStore.getCurrent(active.record.recordId);
  await registerStore.setCurrent(
    { ...current!, redactedMediaIds: ["some-media-id"], controlVersion: current!.controlVersion + 1 },
    current!.controlVersion,
  );

  const redactedDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
    mediaId: "some-media-id",
  });
  assert.equal(redactedDecision.allowed, false);
  assert.match(redactedDecision.reason, /redacted/i);

  // A DIFFERENT, non-redacted mediaId on the same otherwise-allowed record
  // must still be allowed — redaction is scoped to the specific object,
  // not a record-wide denial.
  const otherDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
    mediaId: "a-different-media-id",
  });
  assert.equal(otherDecision.allowed, true);

  // And the record-level decision (no mediaId at all, e.g. a record-detail
  // read) must also still be allowed — media redaction doesn't withdraw
  // the whole record.
  const recordLevelDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(recordLevelDecision.allowed, true);
});

const STAFF = "staff:reviewer@example.invalid";

// Delegates every FixtureStore method to the real, already-populated store
// EXCEPT getRecord, which — the FIRST time it's called for the target
// recordId — captures the OLD (pre-transition) record, THEN runs a real
// redaction + publication approval as a side effect (using the actual
// lifecycle.ts/intake.ts functions against the SAME underlying stores),
// THEN returns the captured OLD record. getRecord is evaluatePermission's
// FIRST evidence read in the fixed ordering — triggering the transition
// here, "during the evaluator's evidence reads," is the exact reviewer-
// specified reproduction: a transition committing after control WOULD have
// been read (the old, buggy ordering) but before the evidence reads that
// follow it.
class TransitionDuringEvidenceReads implements FixtureStore {
  private fired = false;
  constructor(
    private readonly inner: FixtureStore,
    private readonly registerStore: InMemoryRestrictionRegisterStore,
    private readonly intakeCommitter: InMemoryIntakeRegisterCommitter,
    private readonly targetRecordId: string,
    private readonly consentIdToVerify: string,
  ) {}

  async getRecord(recordId: string): Promise<FixtureRecord | null> {
    const result = await this.inner.getRecord(recordId);
    if (!this.fired && recordId === this.targetRecordId) {
      this.fired = true;
      await redactText(this.inner, this.registerStore, {
        requestId: `redact-${this.targetRecordId}`,
        recordId: this.targetRecordId,
        requesterCapacity: STAFF,
        reason: "[SYNTHETIC] redact concurrently with publication approval",
        field: "title",
      });
      const afterRedact = await this.registerStore.getCurrent(this.targetRecordId);
      const recordAfterRedact = await this.inner.getRecord(this.targetRecordId);
      await approvePublication(this.inner, this.registerStore, this.intakeCommitter, {
        requestId: `approve-publication-${this.targetRecordId}`,
        recordId: this.targetRecordId,
        requesterCapacity: STAFF,
        reason: "[SYNTHETIC] concurrent publication approval",
        expectedControlVersion: afterRedact!.controlVersion,
        expectedRecordVersion: recordAfterRedact!.version,
        consentGrantIds: [this.consentIdToVerify],
      });
    }
    return result;
  }

  // Everything else is a plain pass-through.
  putRecord(...a: Parameters<FixtureStore["putRecord"]>) { return this.inner.putRecord(...a); }
  deleteRecord(...a: Parameters<FixtureStore["deleteRecord"]>) { return this.inner.deleteRecord(...a); }
  listAuthorityClaims(...a: Parameters<FixtureStore["listAuthorityClaims"]>) { return this.inner.listAuthorityClaims(...a); }
  putAuthorityClaim(...a: Parameters<FixtureStore["putAuthorityClaim"]>) { return this.inner.putAuthorityClaim(...a); }
  getAuthorityClaim(...a: Parameters<FixtureStore["getAuthorityClaim"]>) { return this.inner.getAuthorityClaim(...a); }
  listLegalRights(...a: Parameters<FixtureStore["listLegalRights"]>) { return this.inner.listLegalRights(...a); }
  putLegalRight(...a: Parameters<FixtureStore["putLegalRight"]>) { return this.inner.putLegalRight(...a); }
  getLegalRight(...a: Parameters<FixtureStore["getLegalRight"]>) { return this.inner.getLegalRight(...a); }
  listConsentGrants(...a: Parameters<FixtureStore["listConsentGrants"]>) { return this.inner.listConsentGrants(...a); }
  getConsentGrant(...a: Parameters<FixtureStore["getConsentGrant"]>) { return this.inner.getConsentGrant(...a); }
  putConsentGrant(...a: Parameters<FixtureStore["putConsentGrant"]>) { return this.inner.putConsentGrant(...a); }
  listCustodyCopies(...a: Parameters<FixtureStore["listCustodyCopies"]>) { return this.inner.listCustodyCopies(...a); }
  putCustodyCopy(...a: Parameters<FixtureStore["putCustodyCopy"]>) { return this.inner.putCustodyCopy(...a); }
  createLifecycleRequest(...a: Parameters<FixtureStore["createLifecycleRequest"]>) { return this.inner.createLifecycleRequest(...a); }
  getLifecycleRequest(...a: Parameters<FixtureStore["getLifecycleRequest"]>) { return this.inner.getLifecycleRequest(...a); }
  updateLifecycleRequest(...a: Parameters<FixtureStore["updateLifecycleRequest"]>) { return this.inner.updateLifecycleRequest(...a); }
  listLifecycleRequestsByStatus(...a: Parameters<FixtureStore["listLifecycleRequestsByStatus"]>) { return this.inner.listLifecycleRequestsByStatus(...a); }
  putAuditReceipt(...a: Parameters<FixtureStore["putAuditReceipt"]>) { return this.inner.putAuditReceipt(...a); }
  listAuditReceipts(...a: Parameters<FixtureStore["listAuditReceipts"]>) { return this.inner.listAuditReceipts(...a); }
  listCorrections(...a: Parameters<FixtureStore["listCorrections"]>) { return this.inner.listCorrections(...a); }
  putCorrection(...a: Parameters<FixtureStore["putCorrection"]>) { return this.inner.putCorrection(...a); }
  getCorrection(...a: Parameters<FixtureStore["getCorrection"]>) { return this.inner.getCorrection(...a); }
  listRedactions(...a: Parameters<FixtureStore["listRedactions"]>) { return this.inner.listRedactions(...a); }
  putRedaction(...a: Parameters<FixtureStore["putRedaction"]>) { return this.inner.putRedaction(...a); }
  getRedaction(...a: Parameters<FixtureStore["getRedaction"]>) { return this.inner.getRedaction(...a); }
  putRecordWithCorrection(...a: Parameters<FixtureStore["putRecordWithCorrection"]>) { return this.inner.putRecordWithCorrection(...a); }
  putRecordWithRedaction(...a: Parameters<FixtureStore["putRecordWithRedaction"]>) { return this.inner.putRecordWithRedaction(...a); }
  putRecordWithCustodyCopy(...a: Parameters<FixtureStore["putRecordWithCustodyCopy"]>) { return this.inner.putRecordWithCustodyCopy(...a); }
}

test("evaluatePermission never combines a stale control snapshot with evidence resolved during its own reads", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  const recordId = uuidv7();
  const consentId = uuidv7();
  const now = new Date().toISOString();

  const record: FixtureRecord = {
    recordId,
    version: 0,
    isSynthetic: true,
    fixtureSetId: "fixture-set-permissions-test",
    title: "[SYNTHETIC] original title — must never be served unmasked here",
    summary: "[SYNTHETIC] summary",
    provenanceRef: "fixture://invented-permissions-test",
    publicationStatus: "not-published",
    custodyStatus: "preserved",
    reviewedAt: null,
    redactionApplied: false,
    mediaRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  await fixtureStore.putRecord(record, undefined);
  await fixtureStore.putAuthorityClaim({
    recordId,
    claimId: uuidv7(),
    status: "identified",
    claimant: "[SYNTHETIC] claimant",
    scope: "[SYNTHETIC] scope",
    evidenceRef: "fixture://invented-evidence",
    reviewerDecision: "[SYNTHETIC] accepted",
    createdAt: now,
  });
  // Starts UNVERIFIED — the "preservation consent [not yet verified]; access
  // is denied" half of the reviewer's repro. Covers BOTH "preservation" and
  // "publication" so one grant-verification (via approvePublication's
  // evidenceFlip, purpose-agnostic) is enough to flip it for the
  // "preservation"-purpose query this test actually evaluates — mirroring
  // services/intakeViews.ts's own pendingPublication check.
  await fixtureStore.putConsentGrant(
    {
      recordId,
      consentId,
      version: 0,
      signerCapacitySummary: "[SYNTHETIC] signer",
      signerCapacityVerified: false,
      mandateRef: null,
      purposes: ["preservation", "publication"],
      audience: "staff",
      grantedAt: now,
      expiresAt: null,
      revokedAt: null,
      retentionTermsRef: "fixture://retention",
      withdrawalContact: "[SYNTHETIC] contact",
    },
    undefined,
  );
  await registerStore.setCurrent(
    {
      recordId,
      controlVersion: 1,
      currentPublicationStatus: "not-published",
      currentCustodyStatus: "preserved",
      restrictedPurposes: [],
      revokedConsentIds: [],
      updatedAt: now,
    },
    undefined,
  );
  const preRaceVersion = 1;

  const racingStore = new TransitionDuringEvidenceReads(fixtureStore, registerStore, intakeCommitter, recordId, consentId);
  const decision = await evaluatePermission(racingStore, registerStore, {
    recordId,
    purpose: "preservation",
    audience: "staff",
    now: new Date(),
  });

  // The real transition (redaction + publication approval, verifying the
  // grant) committed during this call's own evidence reads — the grant now
  // qualifies, so access is allowed.
  assert.equal(decision.allowed, true, decision.reason);
  assert.ok(decision.control, "expected a register snapshot");
  // The critical assertion: decision.control must be the FRESH, post-
  // transition snapshot — never the stale one a control-first read order
  // would have captured. Reading control FIRST (the bug) would return
  // currentPublicationStatus "not-published" and redactedTextFields: [] —
  // exactly the combination that let the queue show a raw title the
  // detail route had already started masking.
  assert.equal(decision.control!.currentPublicationStatus, "published");
  assert.deepEqual(decision.control!.redactedTextFields, ["title"]);
  assert.ok(
    decision.control!.controlVersion > preRaceVersion + 1,
    "control must reflect both the redaction AND the approval commit, not an earlier snapshot",
  );

  const groundTruth = await registerStore.getCurrent(recordId);
  assert.equal(
    decision.control!.controlVersion,
    groundTruth!.controlVersion,
    "decision.control must be the exact current register state, not a snapshot from earlier in the call",
  );
});
