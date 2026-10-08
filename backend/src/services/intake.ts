// Staff intake and review per docs/ethos.txt §§3.2-3.3: a staff member
// originates a brand-new synthetic record through the browser — metadata,
// authority/rights/consent evidence, a small media file — starting
// quarantined and unpublished, until a reviewer's decision promotes it
// into the exact same permission/lifecycle machinery every other record
// in this system is already subject to (evaluatePermission,
// permissions.ts, now denies "quarantined" unconditionally — see its own
// comment). Five review rounds found real gaps in this module's design
// before a line of it was written; each fix is called out where it lives.
import { createHash } from "node:crypto";
import { uuidv7 } from "../domain/id";
import type { AuthorityClaim, ConsentGrant, CustodyCopy, FixtureRecord, LegalRight, LifecycleRequest, Purpose } from "../domain/types";
import {
  AlreadyAppliedError,
  IdempotencyKeyConflictError,
  VersionConflictError,
  type EvidenceFlip,
  type FixtureStore,
  type IntakeRegisterCommitter,
  type RestrictionRegisterStore,
} from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { MAX_MEDIA_BYTES } from "./media";
import { findApprovableGrant } from "./permissions";
import {
  completeRequest,
  denyRequest,
  getOrCreateRequest,
  recordFailure,
  runGuarded,
  transitionControl,
  StaleCustodyStatusError,
  type LifecycleActionInput,
} from "./lifecycle";

function extensionForContentType(contentType: string): string {
  if (contentType === "text/plain") return "txt";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "application/pdf") return "pdf";
  return "bin";
}

// A single named grant qualifies for a purpose+audience if it, by its own
// fields (purposes/revocation/expiry — audience is passed explicitly, NOT
// derived from the grant, which would make the check tautological: a
// grant's audience always equals itself), would pass evaluatePermission's
// real predicate. requireVerified: false since verifying is exactly what
// the caller (approvePreservation/approvePublication) is about to do.
function qualifiesForPurpose(
  grant: ConsentGrant,
  purpose: Purpose,
  audience: ConsentGrant["audience"],
  now: Date,
  revokedConsentIds: string[],
): boolean {
  return !!findApprovableGrant([grant], { purpose, audience, now, revokedConsentIds, requireVerified: false });
}

// ---------------------------------------------------------------------------
// createSubmission
// ---------------------------------------------------------------------------

export type CreateSubmissionInput = {
  requestId: string;
  requesterCapacity: string;
  reason: string;
  fixtureSetId: string;
  title: string;
  summary: string;
  provenanceRef: string;
};

// Deliberately NOT lifecycle.ts's getOrCreateRequest/its fingerprintFor:
// that helper's fingerprint bakes in recordId as an INPUT defining the
// operation — true for every other action, but recordId here is an
// OUTPUT of this one action, not known until the first successful attempt
// mints it. Minting a fresh id on every call (as the router does for
// every other action's requestId) made a retry's fingerprint differ from
// the first attempt's and wrongly threw IdempotencyKeyConflictError
// before it could ever return the original record id — reproduced and
// fixed by excluding recordId from this fingerprint entirely.
async function getOrCreateSubmission(fixtureStore: FixtureStore, input: CreateSubmissionInput): Promise<LifecycleRequest> {
  // Hashed, not stored verbatim — same reasoning and same fix as
  // lifecycle.ts's fingerprintFor: the raw title/summary/provenanceRef
  // would otherwise persist on this LifecycleRequest row forever, outliving
  // any later redaction or deletion of the record it describes.
  const canonical = JSON.stringify({
    action: "create-submission",
    requesterCapacity: input.requesterCapacity,
    reason: input.reason,
    fixtureSetId: input.fixtureSetId,
    title: input.title,
    summary: input.summary,
    provenanceRef: input.provenanceRef,
  });
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const existing = await fixtureStore.getLifecycleRequest(input.requestId);
  if (existing) {
    if (existing.payloadFingerprint !== fingerprint) {
      throw new IdempotencyKeyConflictError(input.requestId);
    }
    return existing; // .recordId is the one actually minted on the first attempt.
  }
  const request: LifecycleRequest = {
    requestId: input.requestId,
    recordId: uuidv7(),
    action: "create-submission",
    status: "in-progress",
    requesterCapacity: input.requesterCapacity,
    reason: input.reason,
    protectiveHold: false,
    payloadFingerprint: fingerprint,
    createdAt: new Date().toISOString(),
    completedAt: null,
    receiptSummary: null,
  };
  await fixtureStore.createLifecycleRequest(request);
  return request;
}

export async function createSubmission(
  fixtureStore: FixtureStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: CreateSubmissionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateSubmission(fixtureStore, input);
  return runGuarded(fixtureStore, request, async () => {
    const existing = await fixtureStore.getRecord(request.recordId);
    if (existing) {
      return `Submission ${request.recordId} was already created on an earlier attempt; resuming safely.`;
    }
    const now = new Date().toISOString();
    const record: FixtureRecord = {
      recordId: request.recordId,
      version: 0, // ignored — commitCreateSubmission's atomic write owns this, like every other store-owned version.
      isSynthetic: true,
      fixtureSetId: input.fixtureSetId,
      title: input.title,
      summary: input.summary,
      provenanceRef: input.provenanceRef,
      publicationStatus: "not-published",
      custodyStatus: "quarantined",
      reviewedAt: null,
      redactionApplied: false,
      mediaRefs: [],
      createdAt: now,
      updatedAt: now,
    };
    // Register and record created together or neither is — closes the gap
    // where startDeletion+completeDeletion could otherwise run to
    // completion entirely between two separate writes, leaving real
    // content behind an already-"deleted" tombstone (round 5, Finding 1).
    await intakeCommitter.commitCreateSubmission(record);
    return `Submission ${request.recordId} created, quarantined and unpublished pending review.`;
  });
}

// ---------------------------------------------------------------------------
// addAuthorityClaim / addLegalRight / addConsentGrant
// ---------------------------------------------------------------------------

function openIntakePrecondition(
  control: Awaited<ReturnType<RestrictionRegisterStore["getCurrent"]>>,
  recordId: string,
): void {
  if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    throw new StaleCustodyStatusError(
      `Record "${recordId}" is not open for intake evidence (custody must be "quarantined" and not rejected).`,
    );
  }
}

export type AddAuthorityClaimInput = LifecycleActionInput & { claimant: string; scope: string; evidenceRef: string };

export async function addAuthorityClaim(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: AddAuthorityClaimInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "add-authority-claim", input, {
    claimant: input.claimant,
    scope: input.scope,
    evidenceRef: input.evidenceRef,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const claimId = request.requestId;
  return runGuarded(fixtureStore, request, async () => {
    // Strongly consistent by-id — the real idempotency guard for this
    // action, same role getCorrection plays for correctRecord.
    const already = await fixtureStore.getAuthorityClaim(input.recordId, claimId);
    if (already) {
      return `Authority claim ${claimId} was already added on an earlier attempt; resuming safely.`;
    }
    // Fast path only — avoids a doomed commit in the common case. The real
    // guarantee against a rejection (or anything else) racing this is
    // commitEvidenceCreate's own atomic register assertion below.
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    const claim: AuthorityClaim = {
      recordId: input.recordId,
      claimId,
      status: "unknown",
      claimant: input.claimant,
      scope: input.scope,
      evidenceRef: input.evidenceRef,
      reviewerDecision: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await intakeCommitter.commitEvidenceCreate(input.recordId, control!.controlVersion, claim);
    } catch (error) {
      if (error instanceof AlreadyAppliedError) {
        return `Authority claim ${claimId} was already added on an earlier attempt; resuming safely.`;
      }
      throw error;
    }
    return `Authority claim ${claimId} added, pending review.`;
  });
}

export type AddLegalRightInput = LifecycleActionInput & {
  holder: string;
  rightType: string;
  jurisdiction: string | null;
  evidenceRef: string;
};

export async function addLegalRight(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: AddLegalRightInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "add-legal-right", input, {
    holder: input.holder,
    rightType: input.rightType,
    jurisdiction: input.jurisdiction,
    evidenceRef: input.evidenceRef,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const rightId = request.requestId;
  return runGuarded(fixtureStore, request, async () => {
    const already = await fixtureStore.getLegalRight(input.recordId, rightId);
    if (already) {
      return `Legal right ${rightId} was already added on an earlier attempt; resuming safely.`;
    }
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    const right: LegalRight = {
      recordId: input.recordId,
      rightId,
      status: "unknown",
      holder: input.holder,
      rightType: input.rightType,
      jurisdiction: input.jurisdiction,
      evidenceRef: input.evidenceRef,
      reviewerDecision: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await intakeCommitter.commitEvidenceCreate(input.recordId, control!.controlVersion, right);
    } catch (error) {
      if (error instanceof AlreadyAppliedError) {
        return `Legal right ${rightId} was already added on an earlier attempt; resuming safely.`;
      }
      throw error;
    }
    return `Legal right ${rightId} added, pending review.`;
  });
}

export type AddConsentGrantInput = LifecycleActionInput & {
  signerCapacitySummary: string;
  purposes: Purpose[];
  audience: ConsentGrant["audience"];
  mandateRef: string | null;
  expiresAt: string | null;
  retentionTermsRef: string;
  withdrawalContact: string;
};

export async function addConsentGrant(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: AddConsentGrantInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "add-consent-grant", input, {
    signerCapacitySummary: input.signerCapacitySummary,
    purposes: input.purposes,
    audience: input.audience,
    mandateRef: input.mandateRef,
    expiresAt: input.expiresAt,
    retentionTermsRef: input.retentionTermsRef,
    withdrawalContact: input.withdrawalContact,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const consentId = request.requestId;
  return runGuarded(fixtureStore, request, async () => {
    const already = await fixtureStore.getConsentGrant(input.recordId, consentId);
    if (already) {
      return `Consent grant ${consentId} was already added on an earlier attempt; resuming safely.`;
    }
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    const grant: ConsentGrant = {
      recordId: input.recordId,
      consentId,
      version: 0, // ignored — commitEvidenceCreate's atomic write owns this, same store-owned-version contract as putConsentGrant.
      signerCapacitySummary: input.signerCapacitySummary,
      // A staff member's own submission is never self-verifying —
      // evaluatePermission already denies on this until a reviewer flips
      // it via approvePreservation/approvePublication.
      signerCapacityVerified: false,
      mandateRef: input.mandateRef,
      purposes: input.purposes,
      audience: input.audience,
      grantedAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      retentionTermsRef: input.retentionTermsRef,
      withdrawalContact: input.withdrawalContact,
    };
    try {
      await intakeCommitter.commitEvidenceCreate(input.recordId, control!.controlVersion, grant);
    } catch (error) {
      if (error instanceof AlreadyAppliedError) {
        return `Consent grant ${consentId} was already added on an earlier attempt; resuming safely.`;
      }
      throw error;
    }
    return `Consent grant ${consentId} added, pending review.`;
  });
}

// ---------------------------------------------------------------------------
// addMedia
// ---------------------------------------------------------------------------

export type AddMediaInput = LifecycleActionInput & { contentType: string; base64: string };

export async function addMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: AddMediaInput,
): Promise<LifecycleRequest> {
  // Reviewer-caught finding: fingerprinting the raw base64 means the
  // uploaded bytes sit in payloadFingerprint on the LifecycleRequest row
  // FOREVER — a completely separate, less-protected place than the
  // record itself, never touched by redaction OR deletion (LifecycleRequest
  // rows live under their own PK, not the record's). A digest is all the
  // fingerprint actually needs — it only ever has to detect "is this the
  // same upload", never reproduce the bytes.
  const base64Digest = createHash("sha256").update(input.base64).digest("hex");
  const request = await getOrCreateRequest(fixtureStore, "add-media", input, {
    contentType: input.contentType,
    base64Digest,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const mediaId = request.requestId;
  const record = await fixtureStore.getRecord(input.recordId);
  if (!record) {
    return denyRequest(fixtureStore, request, `No record "${input.recordId}" exists to add media to.`);
  }
  if (record.mediaRefs.some((m) => m.mediaId === mediaId)) {
    return completeRequest(fixtureStore, request, `Media ${mediaId} was already added on an earlier attempt; resuming safely.`);
  }
  const control = await registerStore.getCurrent(input.recordId);
  if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    return denyRequest(
      fixtureStore,
      request,
      `Record "${input.recordId}" is not open for intake evidence (custody must be "quarantined" and not rejected).`,
    );
  }

  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > MAX_MEDIA_BYTES) {
    return denyRequest(fixtureStore, request, `Media is ${bytes.length} bytes, exceeding the ${MAX_MEDIA_BYTES}-byte upload cap.`);
  }

  const key = `fixtures/${record.fixtureSetId}/${record.recordId}/${mediaId}.${extensionForContentType(input.contentType)}`;
  const uploaded = await mediaStore.putObject(key, bytes, input.contentType);
  const newMediaRef = {
    mediaId,
    objectKey: key,
    bytes: uploaded.bytes,
    checksumSha256: uploaded.sha256,
    contentType: input.contentType,
    versionId: uploaded.versionId,
  };
  const updatedRecord: FixtureRecord = {
    ...record,
    mediaRefs: [...record.mediaRefs, newMediaRef],
    updatedAt: new Date().toISOString(),
  };
  const copy: CustodyCopy = {
    recordId: input.recordId,
    copyId: uuidv7(),
    location: "primary",
    objectVersionId: uploaded.versionId,
    mediaId,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  };

  // Replaces a bare CustodyCopyCommitter.commitIfNotDeleting call (round
  // 5's finding: that interface only excludes deletion states, and a
  // reviewer reproduced it accepting a media binding after rejection —
  // quarantined + withdrawn). commitMediaAdd asserts the full open-intake
  // state atomically. Cleanup decision tree below mirrors
  // legacyMediaMigration.ts's applyLegacyMediaRebind exactly — see its
  // module comment for the full reasoning behind each step.
  try {
    await intakeCommitter.commitMediaAdd(input.recordId, control.controlVersion, updatedRecord, record.version, copy);
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : String(error);

    // DEFINITE non-commit: a VersionConflictError means the WHOLE
    // transaction was atomically cancelled by DynamoDB itself — there is
    // no uncertainty to resolve, and therefore no need for (or dependency
    // on) a recheck read, which is itself a network call that can fail.
    // Reviewer-caught finding: routing EVERY error through the "uncertain"
    // path below meant a definite conflict whose recheck read then failed
    // left the uploaded bytes completely unreconciled — no cleanup
    // attempted at all, and the request reported as an ordinary retryable
    // failure rather than a clear stop/reconcile signal. Mirrors
    // legacyMediaMigration.ts's applyLegacyMediaRebind exactly (see its
    // module comment) — this function's own comment claimed that
    // equivalence before actually implementing it.
    if (error instanceof VersionConflictError) {
      try {
        await mediaStore.deleteObjectVersion(key, uploaded.versionId);
      } catch {
        return denyRequest(
          fixtureStore,
          request,
          `${baseMessage} (CLEANUP FAILED — an untracked object remains at ${key} version ${uploaded.versionId}; NEEDS RECONCILIATION, not a silent retry.)`,
        );
      }
      await recordFailure(fixtureStore, request, baseMessage);
      return request;
    }

    // UNCERTAIN: this error does not by itself say whether the write
    // committed — a timeout or dropped connection can occur even after the
    // server actually applied the transaction. Resolve the same way the
    // rest of this codebase does: re-read fresh and see whether it already
    // reflects the attempted write. A failed recheck, or a failed cleanup,
    // means a human must look directly — denyRequest (terminal), never a
    // retryable recordFailure, since blindly retrying this requestId can't
    // fix an orphan it doesn't know to look for.
    let recheck: FixtureRecord | null;
    try {
      recheck = await fixtureStore.getRecord(input.recordId);
    } catch (recheckError) {
      const recheckMessage = recheckError instanceof Error ? recheckError.message : String(recheckError);
      return denyRequest(
        fixtureStore,
        request,
        `${baseMessage}. Could not verify whether the write committed — the recovery read itself failed: ${recheckMessage}. An object at ${key} version ${uploaded.versionId} may or may not be bound; NEEDS RECONCILIATION — do NOT delete it without checking directly.`,
      );
    }
    if (recheck?.mediaRefs.find((m) => m.mediaId === mediaId)?.versionId === uploaded.versionId) {
      // It actually committed — the error was a false failure signal.
      // Reporting this as a failure and deleting the object just bound
      // would destroy a successful, already-live binding.
      return completeRequest(fixtureStore, request, `Media ${mediaId} added (${uploaded.bytes} bytes), pending review.`);
    }
    try {
      await mediaStore.deleteObjectVersion(key, uploaded.versionId);
    } catch {
      return denyRequest(
        fixtureStore,
        request,
        `${baseMessage} (CLEANUP FAILED — an untracked object remains at ${key} version ${uploaded.versionId}; NEEDS RECONCILIATION, not a silent retry.)`,
      );
    }
    await recordFailure(fixtureStore, request, baseMessage);
    return request;
  }

  return completeRequest(fixtureStore, request, `Media ${mediaId} added (${uploaded.bytes} bytes), pending review.`);
}

// ---------------------------------------------------------------------------
// supersedeAuthorityClaim / supersedeLegalRight — the actual correction path
// ---------------------------------------------------------------------------

export type SupersedeAuthorityClaimInput = LifecycleActionInput & {
  supersededClaimId: string;
  claimant: string;
  scope: string;
  evidenceRef: string;
};

export async function supersedeAuthorityClaim(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: SupersedeAuthorityClaimInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "supersede-authority-claim", input, {
    supersededClaimId: input.supersededClaimId,
    claimant: input.claimant,
    scope: input.scope,
    evidenceRef: input.evidenceRef,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const newClaimId = request.requestId;
  return runGuarded(fixtureStore, request, async () => {
    // Ordering fix: check the NEW claim's existence FIRST — a successful-
    // but-unacknowledged earlier attempt resumes here, before ever
    // reaching the old claim's (by-then-already-flipped) status, which
    // would otherwise look like a stale precondition rather than the
    // success it actually was.
    const alreadyApplied = await fixtureStore.getAuthorityClaim(input.recordId, newClaimId);
    if (alreadyApplied) {
      return `Claim ${newClaimId} (superseding ${input.supersededClaimId}) was already added on an earlier attempt; resuming safely.`;
    }
    const oldClaim = await fixtureStore.getAuthorityClaim(input.recordId, input.supersededClaimId);
    if (!oldClaim || oldClaim.status !== "unknown") {
      throw new StaleCustodyStatusError(`Claim "${input.supersededClaimId}" is not an unresolved claim eligible to supersede.`);
    }
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    const newClaim: AuthorityClaim = {
      recordId: input.recordId,
      claimId: newClaimId,
      status: "unknown",
      claimant: input.claimant,
      scope: input.scope,
      evidenceRef: input.evidenceRef,
      reviewerDecision: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await intakeCommitter.commitEvidenceSupersede(
        input.recordId,
        control!.controlVersion,
        { kind: "authority", id: input.supersededClaimId },
        newClaim,
      );
    } catch (error) {
      if (error instanceof AlreadyAppliedError) {
        return `Claim ${newClaimId} (superseding ${input.supersededClaimId}) was already added on an earlier attempt; resuming safely.`;
      }
      throw error;
    }
    return `Claim ${input.supersededClaimId} superseded by ${newClaimId}, pending review.`;
  });
}

export type SupersedeLegalRightInput = LifecycleActionInput & {
  supersededRightId: string;
  holder: string;
  rightType: string;
  jurisdiction: string | null;
  evidenceRef: string;
};

export async function supersedeLegalRight(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: SupersedeLegalRightInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "supersede-legal-right", input, {
    supersededRightId: input.supersededRightId,
    holder: input.holder,
    rightType: input.rightType,
    jurisdiction: input.jurisdiction,
    evidenceRef: input.evidenceRef,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  const newRightId = request.requestId;
  return runGuarded(fixtureStore, request, async () => {
    const alreadyApplied = await fixtureStore.getLegalRight(input.recordId, newRightId);
    if (alreadyApplied) {
      return `Right ${newRightId} (superseding ${input.supersededRightId}) was already added on an earlier attempt; resuming safely.`;
    }
    const oldRight = await fixtureStore.getLegalRight(input.recordId, input.supersededRightId);
    if (!oldRight || oldRight.status !== "unknown") {
      throw new StaleCustodyStatusError(`Right "${input.supersededRightId}" is not an unresolved right eligible to supersede.`);
    }
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    const newRight: LegalRight = {
      recordId: input.recordId,
      rightId: newRightId,
      status: "unknown",
      holder: input.holder,
      rightType: input.rightType,
      jurisdiction: input.jurisdiction,
      evidenceRef: input.evidenceRef,
      reviewerDecision: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await intakeCommitter.commitEvidenceSupersede(
        input.recordId,
        control!.controlVersion,
        { kind: "legalRight", id: input.supersededRightId },
        newRight,
      );
    } catch (error) {
      if (error instanceof AlreadyAppliedError) {
        return `Right ${newRightId} (superseding ${input.supersededRightId}) was already added on an earlier attempt; resuming safely.`;
      }
      throw error;
    }
    return `Right ${input.supersededRightId} superseded by ${newRightId}, pending review.`;
  });
}

// ---------------------------------------------------------------------------
// approvePreservation / approvePublication
// ---------------------------------------------------------------------------

export type ApprovePreservationInput = LifecycleActionInput & {
  expectedControlVersion: number;
  expectedRecordVersion: number;
  authorityClaimIds: string[]; // must be non-empty
  legalRightIds: string[]; // may be [] — evaluatePermission's own "empty legal rights is fine" rule, unchanged
  consentGrantIds: string[]; // must be non-empty
};

export async function approvePreservation(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: ApprovePreservationInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "approve-preservation", input, {
    expectedControlVersion: input.expectedControlVersion,
    expectedRecordVersion: input.expectedRecordVersion,
    authorityClaimIds: input.authorityClaimIds,
    legalRightIds: input.legalRightIds,
    consentGrantIds: input.consentGrantIds,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  // approvePreservation creates no new row of its own — unlike every
  // other intake action, a by-id lookup on new content can't serve as
  // its "already applied" check. This receipt is what does instead.
  if (await intakeCommitter.hasReceipt(request.recordId, request.requestId)) {
    return completeRequest(fixtureStore, request, "Preservation already approved on an earlier attempt; resuming safely.");
  }

  if (input.authorityClaimIds.length === 0) {
    return denyRequest(
      fixtureStore,
      request,
      "At least one authority claim must be named — \"preserved\" has to mean undisputed authority actually exists.",
    );
  }
  if (input.consentGrantIds.length === 0) {
    return denyRequest(fixtureStore, request, "At least one consent grant must be named.");
  }

  const [record, control, claims, rights, grants] = await Promise.all([
    fixtureStore.getRecord(input.recordId),
    registerStore.getCurrent(input.recordId),
    fixtureStore.listAuthorityClaims(input.recordId),
    fixtureStore.listLegalRights(input.recordId),
    fixtureStore.listConsentGrants(input.recordId),
  ]);
  if (!record || !control) {
    return denyRequest(fixtureStore, request, `No record or register entry for "${input.recordId}".`);
  }
  // Explicit, non-atomic fast-path precondition — the real, atomic guard
  // is commitApproval's own "not withdrawn" assertion (store.ts), which
  // closes the race case; this one exists because that assertion
  // deliberately does NOT pin a specific starting custody value (shared
  // by both approvePreservation and approvePublication, which start from
  // different states) — so a record that's already "preserved" (already
  // approved) or anything other than "quarantined" needs its own explicit
  // check here, mirroring approvePublication's equivalent check below.
  if (control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    return denyRequest(
      fixtureStore,
      request,
      `Record "${input.recordId}" is not pending preservation review (custody "${control.currentCustodyStatus}", publication "${control.currentPublicationStatus}").`,
    );
  }

  // The named ids must be the COMPLETE unresolved set — approving only
  // SOME claims leaves any other claim still "unknown", and
  // evaluatePermission's blocking check scans every claim on the record,
  // not just named ones, leaving a "preserved" record permanently
  // unreadable with no quarantine-only supersede path left to fix it.
  // Protected transitively by expectedControlVersion in the commit below:
  // a claim added in the gap between this read and that commit still
  // forces a retry, since adding one bumps controlVersion too.
  const unresolvedClaims = claims.filter((c) => c.status === "unknown" || c.status === "disputed");
  if (unresolvedClaims.some((c) => !input.authorityClaimIds.includes(c.claimId))) {
    return denyRequest(
      fixtureStore,
      request,
      "One or more authority claims on this record are unresolved and not named in this approval — include them or supersede them first.",
    );
  }
  const unresolvedRights = rights.filter((r) => r.status === "unknown" || r.status === "disputed");
  if (unresolvedRights.some((r) => !input.legalRightIds.includes(r.rightId))) {
    return denyRequest(
      fixtureStore,
      request,
      "One or more legal rights on this record are unresolved and not named in this approval — include them or supersede them first.",
    );
  }

  // At least one named grant must actually be an active preservation
  // grant, by its own purposes/audience/revocation/expiry — never an
  // empty-selection pass-through, and never a hand-rolled check that
  // could drift from evaluatePermission's real one.
  const now = new Date();
  // Audience fixed to "staff", not the grant's own — preservation is an
  // internal/custodial purpose; a grant that only authorizes a "public" or
  // "research-partner" audience, even for purpose "preservation", doesn't
  // authorize the staff-side access "preserved" status is meant to turn
  // on (confirmed directly: using the grant's own audience here made the
  // check tautological — a grant's audience always equals itself).
  const qualifyingGrant = grants.find(
    (g) => input.consentGrantIds.includes(g.consentId) && qualifiesForPurpose(g, "preservation", "staff", now, control.revokedConsentIds),
  );
  if (!qualifyingGrant) {
    return denyRequest(
      fixtureStore,
      request,
      "None of the named consent grants are an active, unexpired, unrevoked grant for purpose \"preservation\" and audience \"staff\".",
    );
  }

  const evidenceFlips: EvidenceFlip[] = [
    ...input.authorityClaimIds.map((claimId): EvidenceFlip => ({ kind: "authority", claimId, reviewerDecision: input.reason })),
    ...input.legalRightIds.map((rightId): EvidenceFlip => ({ kind: "legalRight", rightId, reviewerDecision: input.reason })),
    ...input.consentGrantIds.map((consentId): EvidenceFlip => ({ kind: "consent", consentId })),
  ];

  try {
    await intakeCommitter.commitApproval(
      input.recordId,
      request.requestId,
      input.expectedControlVersion,
      input.expectedRecordVersion,
      { currentCustodyStatus: "preserved" },
      evidenceFlips,
    );
  } catch (error) {
    if (await intakeCommitter.hasReceipt(request.recordId, request.requestId)) {
      return completeRequest(fixtureStore, request, "Preservation already approved on an earlier attempt; resuming safely.");
    }
    const message = error instanceof VersionConflictError ? error.message : "Unexpected error applying preservation approval.";
    await recordFailure(fixtureStore, request, message);
    throw error;
  }

  // Best-effort, non-critical metadata — the real approval already
  // committed above; a failure here doesn't change that outcome.
  const freshRecord = await fixtureStore.getRecord(input.recordId);
  if (freshRecord && freshRecord.reviewedAt === null) {
    await fixtureStore.putRecord({ ...freshRecord, reviewedAt: new Date().toISOString() }, freshRecord.version).catch(() => {});
  }
  return completeRequest(fixtureStore, request, `Preservation approved for ${input.recordId}.`);
}

export type ApprovePublicationInput = LifecycleActionInput & {
  expectedControlVersion: number;
  expectedRecordVersion: number;
  consentGrantIds: string[];
};

export async function approvePublication(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  intakeCommitter: IntakeRegisterCommitter,
  input: ApprovePublicationInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "approve-publication", input, {
    expectedControlVersion: input.expectedControlVersion,
    expectedRecordVersion: input.expectedRecordVersion,
    consentGrantIds: input.consentGrantIds,
  });
  if (request.status === "completed" || request.status === "denied") return request;

  if (await intakeCommitter.hasReceipt(request.recordId, request.requestId)) {
    return completeRequest(fixtureStore, request, "Publication already approved on an earlier attempt; resuming safely.");
  }

  const control = await registerStore.getCurrent(input.recordId);
  if (!control || control.currentCustodyStatus !== "preserved") {
    return denyRequest(fixtureStore, request, "Preservation must be approved before publication.");
  }
  if (input.consentGrantIds.length === 0) {
    return denyRequest(fixtureStore, request, "At least one consent grant must be named.");
  }
  const grants = await fixtureStore.listConsentGrants(input.recordId);
  const now = new Date();
  // Audience NOT fixed here, unlike approvePreservation above — publication
  // can legitimately target "public", "staff", or "research-partner"; the
  // question is whether the named grant actively authorizes WHATEVER
  // audience it itself specifies, not a single hardcoded one.
  const qualifyingGrant = grants.find(
    (g) => input.consentGrantIds.includes(g.consentId) && qualifiesForPurpose(g, "publication", g.audience, now, control.revokedConsentIds),
  );
  if (!qualifyingGrant) {
    return denyRequest(
      fixtureStore,
      request,
      "None of the named consent grants are an active, unexpired, unrevoked grant for purpose \"publication\".",
    );
  }

  const evidenceFlips: EvidenceFlip[] = input.consentGrantIds
    .filter((id) => grants.some((g) => g.consentId === id))
    .map((consentId): EvidenceFlip => ({ kind: "consent", consentId }));

  try {
    await intakeCommitter.commitApproval(
      input.recordId,
      request.requestId,
      input.expectedControlVersion,
      input.expectedRecordVersion,
      { currentPublicationStatus: "published" },
      evidenceFlips,
    );
  } catch (error) {
    if (await intakeCommitter.hasReceipt(request.recordId, request.requestId)) {
      return completeRequest(fixtureStore, request, "Publication already approved on an earlier attempt; resuming safely.");
    }
    const message = error instanceof VersionConflictError ? error.message : "Unexpected error applying publication approval.";
    await recordFailure(fixtureStore, request, message);
    throw error;
  }
  return completeRequest(fixtureStore, request, `Publication approved for ${input.recordId}.`);
}

// ---------------------------------------------------------------------------
// requestChanges / rejectSubmission
// ---------------------------------------------------------------------------

export async function requestChanges(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "request-changes", input);
  return runGuarded(fixtureStore, request, async () => {
    const control = await registerStore.getCurrent(input.recordId);
    openIntakePrecondition(control, input.recordId);
    // A pure recorded decision — no state transition. Nothing above blocks
    // staff from calling addAuthorityClaim/addLegalRight/addConsentGrant/
    // addMedia/supersede* again at any time on this still-quarantined,
    // not-withdrawn record, so it simply stays visible and editable in the
    // queue until a reviewer looks again.
    return "Changes requested; submission remains quarantined for staff to revise and resubmit evidence.";
  });
}

export async function rejectSubmission(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  input: LifecycleActionInput,
): Promise<LifecycleRequest> {
  const request = await getOrCreateRequest(fixtureStore, "reject-submission", input);
  return runGuarded(fixtureStore, request, async () => {
    await transitionControl(registerStore, input.recordId, (current) => {
      if (current?.currentCustodyStatus !== "quarantined") {
        throw new StaleCustodyStatusError(`Record "${input.recordId}" is not a pending submission (custody must be "quarantined").`);
      }
      return { currentPublicationStatus: "withdrawn" };
    });
    // Deliberately does not delete anything — if a reviewer wants a
    // rejected submission actually gone, the EXISTING startDeletion/
    // completeDeletion machinery already does that correctly; this only
    // records the decision. No implicit reopening: every other intake
    // action in this module checks currentPublicationStatus !== "withdrawn"
    // as part of its own atomic commit, so rejection is genuinely terminal.
    return "Submission rejected; permanently withdrawn, pending-review evidence will not be promoted.";
  });
}
