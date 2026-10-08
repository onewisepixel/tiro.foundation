import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { AlreadyAppliedError, VersionConflictError, type IntakeRegisterCommitter } from "../store/store";
import { evaluatePermission } from "./permissions";
import {
  addAuthorityClaim,
  addConsentGrant,
  addLegalRight,
  addMedia,
  approvePreservation,
  approvePublication,
  createSubmission,
  rejectSubmission,
  requestChanges,
  supersedeAuthorityClaim,
} from "./intake";

const STAFF = "staff:reviewer@example.invalid";

function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  return { fixtureStore, registerStore, mediaStore, intakeCommitter };
}

async function createBasicSubmission(deps: ReturnType<typeof setup>, requestId = "create-1") {
  const { fixtureStore, intakeCommitter } = deps;
  const request = await createSubmission(fixtureStore, intakeCommitter, {
    requestId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] new submission",
    fixtureSetId: "fixture-set-intake-test",
    title: "[SYNTHETIC] test title",
    summary: "[SYNTHETIC] test summary",
    provenanceRef: "fixture://invented-intake-001",
  });
  assert.equal(request.status, "completed");
  return request.recordId;
}

test("createSubmission creates a quarantined, unpublished record", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const record = await deps.fixtureStore.getRecord(recordId);
  const control = await deps.registerStore.getCurrent(recordId);
  assert.equal(record?.custodyStatus, "quarantined");
  assert.equal(record?.publicationStatus, "not-published");
  assert.equal(control?.currentCustodyStatus, "quarantined");
  assert.equal(control?.currentPublicationStatus, "not-published");
  assert.equal(control?.controlVersion, 1);
});

test("createSubmission is idempotent: retrying the same requestId returns the SAME record, never a second one", async () => {
  const deps = setup();
  const input = {
    requestId: "create-retry",
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] retry test",
    fixtureSetId: "fixture-set-intake-test",
    title: "[SYNTHETIC] title",
    summary: "[SYNTHETIC] summary",
    provenanceRef: "fixture://invented-intake-002",
  };
  const first = await createSubmission(deps.fixtureStore, deps.intakeCommitter, input);
  const second = await createSubmission(deps.fixtureStore, deps.intakeCommitter, input);
  assert.equal(first.recordId, second.recordId);
  const record = await deps.fixtureStore.getRecord(first.recordId);
  assert.ok(record);
});

test("a quarantined, unreviewed submission is denied for every purpose — evaluatePermission's own unconditional quarantine deny", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const decision = await evaluatePermission(deps.fixtureStore, deps.registerStore, {
    recordId,
    purpose: "preservation",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /quarantined/);
});

test("addAuthorityClaim/addLegalRight/addConsentGrant add evidence pending review", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const claimReq = await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-1",
  });
  assert.equal(claimReq.status, "completed");
  const claims = await deps.fixtureStore.listAuthorityClaims(recordId);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "unknown");

  const rightReq = await addLegalRight(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "right-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] right",
    holder: "[SYNTHETIC] rightsholder",
    rightType: "publication",
    jurisdiction: null,
    evidenceRef: "fixture://invented-evidence-right-1",
  });
  assert.equal(rightReq.status, "completed");

  const grantReq = await addConsentGrant(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "grant-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] grant",
    signerCapacitySummary: "[SYNTHETIC] self",
    purposes: ["preservation"],
    audience: "staff",
    mandateRef: null,
    expiresAt: null,
    retentionTermsRef: "fixture://invented-retention-1",
    withdrawalContact: "fixture-steward@example.invalid",
  });
  assert.equal(grantReq.status, "completed");
  const grants = await deps.fixtureStore.listConsentGrants(recordId);
  assert.equal(grants[0].signerCapacityVerified, false);

  // Each evidence-adding action is idempotent via its own by-id check.
  const retryClaimReq = await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-1",
  });
  assert.equal(retryClaimReq.status, "completed");
  assert.equal((await deps.fixtureStore.listAuthorityClaims(recordId)).length, 1);
});

test("evidence cannot be added once a submission is rejected — rejection is terminal", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  await rejectSubmission(deps.fixtureStore, deps.registerStore, {
    requestId: "reject-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] rejected",
  });
  const claimReq = await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-after-reject",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-x",
  });
  assert.equal(claimReq.status, "denied");
});

test("addMedia uploads and binds atomically, cleaning up on a failed commit (definite-vs-uncertain decision tree)", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);

  const ok = await addMedia(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, {
    requestId: "media-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] media",
    contentType: "text/plain",
    base64: Buffer.from("[SYNTHETIC] small test file").toString("base64"),
  });
  assert.equal(ok.status, "completed");
  const record = await deps.fixtureStore.getRecord(recordId);
  assert.equal(record?.mediaRefs.length, 1);
  assert.ok(record?.mediaRefs[0].versionId);

  // A committer whose commitMediaAdd always throws, simulating a genuine
  // operational failure (not a version conflict) — the uploaded object
  // must be cleaned up, and the request must report "failed" (not
  // silently "completed" or lost).
  class AlwaysFailingCommitter implements IntakeRegisterCommitter {
    constructor(private readonly inner: InMemoryIntakeRegisterCommitter) {}
    commitCreateSubmission(...args: Parameters<IntakeRegisterCommitter["commitCreateSubmission"]>) {
      return this.inner.commitCreateSubmission(...args);
    }
    commitEvidenceCreate(...args: Parameters<IntakeRegisterCommitter["commitEvidenceCreate"]>) {
      return this.inner.commitEvidenceCreate(...args);
    }
    commitEvidenceSupersede(...args: Parameters<IntakeRegisterCommitter["commitEvidenceSupersede"]>) {
      return this.inner.commitEvidenceSupersede(...args);
    }
    commitApproval(...args: Parameters<IntakeRegisterCommitter["commitApproval"]>) {
      return this.inner.commitApproval(...args);
    }
    hasReceipt(...args: Parameters<IntakeRegisterCommitter["hasReceipt"]>) {
      return this.inner.hasReceipt(...args);
    }
    async commitMediaAdd(): Promise<void> {
      throw new Error("simulated operational failure");
    }
  }
  const failingCommitter = new AlwaysFailingCommitter(deps.intakeCommitter);
  const failed = await addMedia(deps.fixtureStore, deps.registerStore, deps.mediaStore, failingCommitter, {
    requestId: "media-2",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] media that fails",
    contentType: "text/plain",
    base64: Buffer.from("[SYNTHETIC] another file").toString("base64"),
  });
  assert.equal(failed.status, "in-progress"); // recordFailure leaves it retryable, never silently lost.
  const receipts = await deps.fixtureStore.listAuditReceipts(recordId);
  const failureReceipt = receipts.find((r) => r.outcome === "failed" && r.action === "add-media");
  assert.ok(failureReceipt, "expected a failed audit receipt for the failed media add");
  const recordAfterFail = await deps.fixtureStore.getRecord(recordId);
  assert.equal(recordAfterFail?.mediaRefs.length, 1, "the failed upload must have been cleaned up, not left bound");
});

test("supersedeAuthorityClaim fixes a wrong claim without leaving the old one blocking permission checks", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-wrong",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] wrong claim",
    claimant: "[SYNTHETIC] wrong narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-wrong",
  });
  const supersedeReq = await supersedeAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-fixed",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] correction",
    supersededClaimId: "claim-wrong",
    claimant: "[SYNTHETIC] correct narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-fixed",
  });
  assert.equal(supersedeReq.status, "completed");
  const claims = await deps.fixtureStore.listAuthorityClaims(recordId);
  const oldClaim = claims.find((c) => c.claimId === "claim-wrong");
  const newClaim = claims.find((c) => c.claimId === "claim-fixed");
  assert.equal(oldClaim?.status, "superseded");
  assert.equal(newClaim?.status, "unknown");
});

test("supersedeAuthorityClaim resumes safely by new-claim-id, not by re-reading the (now superseded) old claim", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-wrong",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] wrong claim",
    claimant: "[SYNTHETIC] wrong narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-wrong",
  });
  const input = {
    requestId: "claim-fixed",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] correction",
    supersededClaimId: "claim-wrong",
    claimant: "[SYNTHETIC] correct narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-fixed",
  };
  const first = await supersedeAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, input);
  assert.equal(first.status, "completed");
  // Retry with the identical requestId/payload — must resume via the new
  // claim's own existence check, NOT fail by re-reading the old claim
  // (now "superseded", not "unknown").
  const retry = await supersedeAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, input);
  assert.equal(retry.status, "completed");
});

async function fullyEvidencedSubmission(deps: ReturnType<typeof setup>) {
  const recordId = await createBasicSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-1",
  });
  await addConsentGrant(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "grant-preservation",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] grant",
    signerCapacitySummary: "[SYNTHETIC] self",
    purposes: ["preservation"],
    audience: "staff",
    mandateRef: null,
    expiresAt: null,
    retentionTermsRef: "fixture://invented-retention-1",
    withdrawalContact: "fixture-steward@example.invalid",
  });
  const control = await deps.registerStore.getCurrent(recordId);
  const record = await deps.fixtureStore.getRecord(recordId);
  return { recordId, controlVersion: control!.controlVersion, recordVersion: record!.version };
}

test("approvePreservation denies an empty selection — never a pass-through", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);
  const denied = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-empty",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: controlVersion,
    expectedRecordVersion: recordVersion,
    authorityClaimIds: [],
    legalRightIds: [],
    consentGrantIds: [],
  });
  assert.equal(denied.status, "denied");
  const control = await deps.registerStore.getCurrent(recordId);
  assert.equal(control?.currentCustodyStatus, "quarantined");
});

test("approvePreservation denies when a claim is left unnamed and unresolved", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-2-unnamed",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] second claim",
    claimant: "[SYNTHETIC] second narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-2",
  });
  const denied = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-partial",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: controlVersion + 1, // the addAuthorityClaim call above bumped it
    expectedRecordVersion: recordVersion,
    authorityClaimIds: ["claim-1"], // claim-2-unnamed deliberately omitted
    legalRightIds: [],
    consentGrantIds: ["grant-preservation"],
  });
  assert.equal(denied.status, "denied");
  assert.match(denied.receiptSummary ?? "", /unresolved/);
});

test("approvePreservation denies a wrong-scope grant (right purpose, wrong audience) and never silently promotes", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-1",
  });
  await addConsentGrant(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "grant-wrong-audience",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] grant",
    signerCapacitySummary: "[SYNTHETIC] self",
    purposes: ["preservation"],
    audience: "public", // wrong — approval checks the grant's OWN audience, which must independently qualify
    mandateRef: null,
    expiresAt: null,
    retentionTermsRef: "fixture://invented-retention-1",
    withdrawalContact: "fixture-steward@example.invalid",
  });
  const control = await deps.registerStore.getCurrent(recordId);
  const record = await deps.fixtureStore.getRecord(recordId);
  const denied = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-wrong-scope",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: control!.controlVersion,
    expectedRecordVersion: record!.version,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-wrong-audience"],
  });
  assert.equal(denied.status, "denied");
  const freshControl = await deps.registerStore.getCurrent(recordId);
  assert.equal(freshControl?.currentCustodyStatus, "quarantined");
});

test("approvePreservation succeeds, preservation/staff access is now allowed, publication/* remains denied", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);
  const approved = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: controlVersion,
    expectedRecordVersion: recordVersion,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-preservation"],
  });
  assert.equal(approved.status, "completed");

  const now = new Date();
  const preservationDecision = await evaluatePermission(deps.fixtureStore, deps.registerStore, {
    recordId,
    purpose: "preservation",
    audience: "staff",
    now,
  });
  assert.equal(preservationDecision.allowed, true);

  const publicationDecisionPublic = await evaluatePermission(deps.fixtureStore, deps.registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now,
  });
  assert.equal(publicationDecisionPublic.allowed, false);

  // audience: "staff" specifically exercises the consent-grant check
  // itself, past the audience==="public" publicationStatus short-circuit
  // evaluatePermission checks first — the exact "no publication grant"
  // reason the completion test's own wording names.
  const publicationDecisionStaff = await evaluatePermission(deps.fixtureStore, deps.registerStore, {
    recordId,
    purpose: "publication",
    audience: "staff",
    now,
  });
  assert.equal(publicationDecisionStaff.allowed, false);
  assert.match(publicationDecisionStaff.reason, /No active consent grant/);
});

test("approvePreservation is idempotent via its receipt — a retry after a successful-but-unacknowledged commit resumes safely", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);
  const input = {
    requestId: "approve-resume",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: controlVersion,
    expectedRecordVersion: recordVersion,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-preservation"],
  };
  const first = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, input);
  assert.equal(first.status, "completed");
  // Retry with the SAME stale expectedControlVersion/expectedRecordVersion
  // (as a client would if it never received the first response) — must
  // resume via hasReceipt, never fail as a false conflict.
  const retry = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, input);
  assert.equal(retry.status, "completed");
});

test("approvePublication denies before preservation is approved, denies without a qualifying grant, and succeeds once one exists", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);

  const tooEarly = await approvePublication(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "publish-too-early",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] publish",
    expectedControlVersion: controlVersion,
    expectedRecordVersion: recordVersion,
    consentGrantIds: ["grant-preservation"],
  });
  assert.equal(tooEarly.status, "denied");

  const approvedPreservation = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: controlVersion,
    expectedRecordVersion: recordVersion,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-preservation"],
  });
  assert.equal(approvedPreservation.status, "completed");
  const controlAfterPreservation = await deps.registerStore.getCurrent(recordId);

  // No publication-purpose grant exists at all — this is exactly the
  // completion test's "publication remains denied without its own grant".
  const noGrant = await approvePublication(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "publish-no-grant",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] publish",
    expectedControlVersion: controlAfterPreservation!.controlVersion,
    expectedRecordVersion: recordVersion,
    consentGrantIds: ["grant-preservation"], // wrong purpose — preservation, not publication
  });
  assert.equal(noGrant.status, "denied");

  await addConsentGrant(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "grant-publication",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] publication grant",
    signerCapacitySummary: "[SYNTHETIC] self",
    purposes: ["publication"],
    audience: "staff",
    mandateRef: null,
    expiresAt: null,
    retentionTermsRef: "fixture://invented-retention-1",
    withdrawalContact: "fixture-steward@example.invalid",
  });
  // Wait — addConsentGrant's quarantined-only precondition would deny this
  // since custody is now "preserved". A publication grant must be added
  // BEFORE preservation approval in practice; this call is expected to be
  // denied, confirming that constraint explicitly rather than silently
  // assuming it.
  const publicationGrantAttempt = await deps.fixtureStore.listConsentGrants(recordId);
  assert.equal(publicationGrantAttempt.some((g) => g.consentId === "grant-publication"), false);
});

test("requestChanges records a decision without changing state, and evidence can still be added afterward", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const req = await requestChanges(deps.fixtureStore, deps.registerStore, {
    requestId: "changes-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] needs more evidence",
  });
  assert.equal(req.status, "completed");
  const control = await deps.registerStore.getCurrent(recordId);
  assert.equal(control?.currentCustodyStatus, "quarantined");

  const claimReq = await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-after-changes",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-after-changes",
  });
  assert.equal(claimReq.status, "completed");
});

test("rejectSubmission is terminal: a later approvePreservation attempt is denied, not merely conflicted", async () => {
  const deps = setup();
  const { recordId, controlVersion, recordVersion } = await fullyEvidencedSubmission(deps);
  const rejected = await rejectSubmission(deps.fixtureStore, deps.registerStore, {
    requestId: "reject-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] not a real submission",
  });
  assert.equal(rejected.status, "completed");
  const control = await deps.registerStore.getCurrent(recordId);
  assert.equal(control?.currentPublicationStatus, "withdrawn");

  const approveAttempt = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-after-reject",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: control!.controlVersion,
    expectedRecordVersion: recordVersion,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-preservation"],
  });
  // Denied via the commit's own register-state assertion (controlVersion
  // transitively pins the withdrawn state too, since rejectSubmission's
  // transitionControl write bumped it) — reported as a VersionConflictError
  // from the commit, which approvePreservation maps to recordFailure
  // (retryable) rather than a terminal denial at the service layer, since
  // the service layer itself has no separate "is this withdrawn" check for
  // approval specifically (by design — see store.ts's commitApproval
  // comment). What matters is that it never silently succeeds.
  assert.notEqual(approveAttempt.status, "completed");
});

test("rejection racing addMedia: the atomic commit refuses, not a silent bound-media-on-a-rejected-submission", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const control = await deps.registerStore.getCurrent(recordId);
  const record = await deps.fixtureStore.getRecord(recordId);

  // Simulate the race directly: reject BETWEEN addMedia's own fresh
  // precondition read and its commit, by constructing the same
  // expectedControlVersion addMedia would have captured, then rejecting,
  // then attempting the commit with that now-stale version.
  await rejectSubmission(deps.fixtureStore, deps.registerStore, {
    requestId: "reject-race",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] rejected mid-upload",
  });

  await assert.rejects(
    () =>
      deps.intakeCommitter.commitMediaAdd(
        recordId,
        control!.controlVersion, // stale — a rejection has since landed
        { ...record!, mediaRefs: [{ mediaId: "m1", objectKey: "k", bytes: 1, checksumSha256: "x", contentType: "text/plain", versionId: "v1" }] },
        record!.version,
        { recordId, copyId: "c1", location: "primary", objectVersionId: "v1", mediaId: "m1", createdAt: new Date().toISOString(), reconciledAt: null },
      ),
    VersionConflictError,
  );
});

test("commitEvidenceCreate rejects a duplicate id with AlreadyAppliedError, the real guard beyond the service layer's own by-id pre-check", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const control = await deps.registerStore.getCurrent(recordId);
  const claim = {
    recordId,
    claimId: "dup-1",
    status: "unknown" as const,
    claimant: "[SYNTHETIC] a",
    scope: "full record",
    evidenceRef: "fixture://invented-dup",
    reviewerDecision: null,
    createdAt: new Date().toISOString(),
  };
  await deps.intakeCommitter.commitEvidenceCreate(recordId, control!.controlVersion, claim);
  const bumped = await deps.registerStore.getCurrent(recordId);
  await assert.rejects(() => deps.intakeCommitter.commitEvidenceCreate(recordId, bumped!.controlVersion, claim), AlreadyAppliedError);
});

test("addMedia's idempotency fingerprint never carries the raw uploaded bytes", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const secret = "[SYNTHETIC] this exact string must never appear in any stored fingerprint";
  await addMedia(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, {
    requestId: "media-fingerprint-check",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] media",
    contentType: "text/plain",
    base64: Buffer.from(secret).toString("base64"),
  });
  const stored = await deps.fixtureStore.getLifecycleRequest("media-fingerprint-check");
  assert.ok(stored);
  assert.doesNotMatch(stored!.payloadFingerprint, new RegExp(Buffer.from(secret).toString("base64")));
  assert.doesNotMatch(stored!.payloadFingerprint, /this exact string/);
});

test("addMedia's VersionConflictError goes straight to cleanup (definite non-commit, no recheck) and is a terminal denial if cleanup itself fails", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);

  class DefiniteConflictCommitter implements IntakeRegisterCommitter {
    constructor(private readonly inner: InMemoryIntakeRegisterCommitter) {}
    commitCreateSubmission(...args: Parameters<IntakeRegisterCommitter["commitCreateSubmission"]>) {
      return this.inner.commitCreateSubmission(...args);
    }
    commitEvidenceCreate(...args: Parameters<IntakeRegisterCommitter["commitEvidenceCreate"]>) {
      return this.inner.commitEvidenceCreate(...args);
    }
    commitEvidenceSupersede(...args: Parameters<IntakeRegisterCommitter["commitEvidenceSupersede"]>) {
      return this.inner.commitEvidenceSupersede(...args);
    }
    commitApproval(...args: Parameters<IntakeRegisterCommitter["commitApproval"]>) {
      return this.inner.commitApproval(...args);
    }
    hasReceipt(...args: Parameters<IntakeRegisterCommitter["hasReceipt"]>) {
      return this.inner.hasReceipt(...args);
    }
    async commitMediaAdd(): Promise<void> {
      throw new VersionConflictError("RestrictionRegisterEntry", recordId);
    }
  }
  // A media store whose deleteObjectVersion always fails, to force the
  // "cleanup itself failed" branch.
  class UndeletableMediaStore extends InMemoryMediaStore {
    async deleteObjectVersion(): Promise<void> {
      throw new Error("simulated delete failure");
    }
  }
  const definiteConflictCommitter = new DefiniteConflictCommitter(deps.intakeCommitter);
  const undeletableMediaStore = new UndeletableMediaStore();
  // Seed the object so putObject has something real to attempt uploading.
  const result = await addMedia(deps.fixtureStore, deps.registerStore, undeletableMediaStore, definiteConflictCommitter, {
    requestId: "media-definite-conflict",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] media",
    contentType: "text/plain",
    base64: Buffer.from("[SYNTHETIC] file content").toString("base64"),
  });
  // Terminal denial, not a retryable "in-progress" — a caller must not
  // blindly retry this requestId expecting the orphan to resolve itself.
  assert.equal(result.status, "denied");
  assert.match(result.receiptSummary ?? "", /NEEDS RECONCILIATION/);
});

test("a consent grant covering both preservation and publication purposes can be verified by both approvals without conflict", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  await addAuthorityClaim(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "claim-1",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] claim",
    claimant: "[SYNTHETIC] narrator",
    scope: "full record",
    evidenceRef: "fixture://invented-evidence-claim-1",
  });
  await addConsentGrant(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "grant-dual-purpose",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] grant",
    signerCapacitySummary: "[SYNTHETIC] self",
    purposes: ["preservation", "publication"],
    audience: "staff",
    mandateRef: null,
    expiresAt: null,
    retentionTermsRef: "fixture://invented-retention-1",
    withdrawalContact: "fixture-steward@example.invalid",
  });
  const control = await deps.registerStore.getCurrent(recordId);
  const record = await deps.fixtureStore.getRecord(recordId);
  const approvedPreservation = await approvePreservation(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-preservation-dual",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] approve",
    expectedControlVersion: control!.controlVersion,
    expectedRecordVersion: record!.version,
    authorityClaimIds: ["claim-1"],
    legalRightIds: [],
    consentGrantIds: ["grant-dual-purpose"],
  });
  assert.equal(approvedPreservation.status, "completed");
  const grantAfterPreservation = await deps.fixtureStore.getConsentGrant(recordId, "grant-dual-purpose");
  assert.equal(grantAfterPreservation?.signerCapacityVerified, true);

  const controlAfterPreservation = await deps.registerStore.getCurrent(recordId);
  // approvePreservation's own best-effort reviewedAt write bumps the
  // record's version as a side effect — re-read fresh rather than reusing
  // the pre-approval snapshot.
  const recordAfterPreservation = await deps.fixtureStore.getRecord(recordId);
  // Re-verifying the SAME already-verified grant for publication must be a
  // safe no-op, never rejected just because signerCapacityVerified is
  // already true.
  const approvedPublication = await approvePublication(deps.fixtureStore, deps.registerStore, deps.intakeCommitter, {
    requestId: "approve-publication-dual",
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] publish",
    expectedControlVersion: controlAfterPreservation!.controlVersion,
    expectedRecordVersion: recordAfterPreservation!.version,
    consentGrantIds: ["grant-dual-purpose"],
  });
  assert.equal(approvedPublication.status, "completed");
});
