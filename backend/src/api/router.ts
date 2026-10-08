// The staff API's route table. Deliberately pure and transport-agnostic —
// takes already-parsed request data and a caller identity string, returns a
// status code + JSON body. handler.ts (the real Lambda entrypoint) is the
// only thing that knows about API Gateway's event shape; everything here is
// exercised directly in tests against the in-memory fake, no AWS needed.
//
// Hard rule carried over from docs/ethos.txt §3.3 / permissions.ts: Cognito
// authentication (checked before this module ever runs, by API Gateway's
// JWT authorizer) answers "is this a real signed-in staff member" — it is
// NOT a substitute for anything evaluatePermission decides, and nothing
// here bypasses evaluatePermission for any purpose/audience check. What
// authentication DOES gate is who may invoke a lifecycle MUTATION at all,
// and whose identity lands in the audit trail for it.
import type { LifecycleRequestStatus } from "../domain/types";
import { uuidv7 } from "../domain/id";
import type { FixtureStore, IntakeRegisterCommitter, RestrictionRegisterStore } from "../store/store";
import { IdempotencyKeyConflictError, VersionConflictError } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import {
  withdraw,
  restrict,
  retainForPreservationOnly,
  startDeletion,
  completeDeletion,
  revokeConsentGrant,
  correctRecord,
  disputeCorrection,
  redactText,
  redactMedia,
  MediaPurgeInProgressError,
} from "../services/lifecycle";
import { evaluatePermission } from "../services/permissions";
import { applyTextRedactions, maskCorrectionsForRedactedFields, redactionsSafeView } from "../services/redactionView";
import { exportFixtureSet, LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES } from "../services/export";
import { fetchAuthorizedMedia, fetchIntakeMedia } from "../services/media";
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
  supersedeLegalRight,
} from "../services/intake";
import { readIntakeQueue, readIntakeSubmission } from "../services/intakeViews";
import {
  validateLifecycleActionBody,
  validateRestrictActionBody,
  validateCompleteDeletionActionBody,
  validateRevokeConsentActionBody,
  validatePermissionCheckBody,
  validateExportBody,
  validateCorrectActionBody,
  validateDisputeCorrectionActionBody,
  validateRedactTextActionBody,
  validateRedactMediaActionBody,
  validateCreateSubmissionBody,
  validateAddAuthorityClaimActionBody,
  validateAddLegalRightActionBody,
  validateAddConsentGrantActionBody,
  validateAddMediaActionBody,
  validateSupersedeAuthorityClaimActionBody,
  validateSupersedeLegalRightActionBody,
  validateApprovePreservationActionBody,
  validateApprovePublicationActionBody,
  isPurpose,
  isAudience,
} from "./validation";

export type ApiRequest = {
  method: "GET" | "POST";
  // Path segments already split, e.g. "/records/abc/restrict" -> ["records", "abc", "restrict"].
  pathSegments: string[];
  queryParams: Record<string, string | undefined>;
  body: unknown;
};

export type ApiResponse = {
  statusCode: number;
  body: unknown;
  // Present only for the media-download route — handler.ts emits this as a
  // base64 body with isBase64Encoded:true instead of JSON-stringifying
  // `body`. Kept as a separate field (rather than overloading `body`) so
  // every other route stays simple, untyped JSON exactly as before.
  binary?: { contentType: string; base64Body: string };
};

const LIFECYCLE_STATUSES: LifecycleRequestStatus[] = ["pending", "in-progress", "completed", "denied"];
function isLifecycleStatus(value: unknown): value is LifecycleRequestStatus {
  return typeof value === "string" && (LIFECYCLE_STATUSES as string[]).includes(value);
}

function notFound(message: string): ApiResponse {
  return { statusCode: 404, body: { error: message } };
}
function badRequest(message: string): ApiResponse {
  return { statusCode: 400, body: { error: message } };
}

async function withConflictHandling(work: () => Promise<ApiResponse>): Promise<ApiResponse> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof VersionConflictError ||
      error instanceof IdempotencyKeyConflictError ||
      error instanceof MediaPurgeInProgressError
    ) {
      return { statusCode: 409, body: { error: error.message } };
    }
    throw error;
  }
}

export async function routeRequest(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  intakeCommitter: IntakeRegisterCommitter,
  callerIdentity: string,
  request: ApiRequest,
): Promise<ApiResponse> {
  const { method, pathSegments, queryParams, body } = request;

  // GET /intake/:recordId/media/:mediaId — the one place a quarantined
  // submission's upload can be previewed. The normal media route below
  // permanently 403s these now that evaluatePermission denies
  // "quarantined" outright (permissions.ts) — this exists specifically so
  // a reviewer isn't left with no way to ever see the file before
  // approving it. See services/media.ts's fetchIntakeMedia.
  if (method === "GET" && pathSegments.length === 4 && pathSegments[0] === "intake" && pathSegments[2] === "media") {
    const result = await fetchIntakeMedia(fixtureStore, registerStore, mediaStore, { recordId: pathSegments[1], mediaId: pathSegments[3] });
    if (!result.ok) {
      return { statusCode: result.statusCode, body: { error: result.reason } };
    }
    return { statusCode: 200, body: null, binary: { contentType: result.contentType, base64Body: result.body.toString("base64") } };
  }

  // GET /intake/queue — the review queue's two halves. See
  // services/intakeViews.ts's readIntakeQueue for exactly what gates each.
  if (method === "GET" && pathSegments.length === 1 && pathSegments[0] === "intake") {
    return notFound('GET /intake needs a sub-path: "/intake/queue" or "/intake/:recordId".');
  }
  if (method === "GET" && pathSegments.length === 2 && pathSegments[0] === "intake" && pathSegments[1] === "queue") {
    return { statusCode: 200, body: await readIntakeQueue(fixtureStore, registerStore) };
  }

  // GET /intake/:recordId — the intake-review detail read. Returns 404 for
  // anything not currently "quarantined" (and not "withdrawn") — once
  // preserved, GET /records/:recordId is the right route; see
  // services/intakeViews.ts's readIntakeSubmission for the full reasoning.
  if (method === "GET" && pathSegments.length === 2 && pathSegments[0] === "intake") {
    const view = await readIntakeSubmission(fixtureStore, registerStore, pathSegments[1]);
    if (!view) {
      return notFound(`No quarantined submission with id "${pathSegments[1]}".`);
    }
    return { statusCode: 200, body: view };
  }

  // POST /intake — create a brand-new synthetic record, quarantined and
  // unpublished, pending review. See services/intake.ts's createSubmission
  // for why this route alone doesn't fit the /records/:id/:action shape
  // (there is no :id yet — minting one is what this call does).
  if (method === "POST" && pathSegments.length === 1 && pathSegments[0] === "intake") {
    const validated = validateCreateSubmissionBody(body);
    if (!validated.ok) {
      return badRequest(validated.error);
    }
    return withConflictHandling(async () => {
      const result = await createSubmission(fixtureStore, intakeCommitter, {
        requestId: validated.value.requestId ?? uuidv7(),
        requesterCapacity: callerIdentity,
        reason: validated.value.reason,
        fixtureSetId: validated.value.fixtureSetId,
        title: validated.value.title,
        summary: validated.value.summary,
        provenanceRef: validated.value.provenanceRef,
      });
      return { statusCode: 200, body: result };
    });
  }

  // GET /records/:recordId/media/:mediaId?purpose=...&audience=...
  //
  // Same hard rule as the record-detail route: evaluatePermission runs on
  // EVERY fetch, not just the first one — a denial returns no bytes and no
  // reusable download capability (no presigned URL is ever handed out), so
  // access revoked a moment ago denies the very next fetch too. See
  // services/media.ts.
  if (method === "GET" && pathSegments.length === 4 && pathSegments[0] === "records" && pathSegments[2] === "media") {
    const recordId = pathSegments[1];
    const mediaId = pathSegments[3];
    const purpose = queryParams.purpose;
    const audience = queryParams.audience;
    if (!isPurpose(purpose)) {
      return badRequest('"purpose" query parameter is required and must be a valid Purpose value.');
    }
    if (!isAudience(audience)) {
      return badRequest('"audience" query parameter is required and must be one of "public", "staff", "research-partner".');
    }
    const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
      recordId,
      mediaId,
      purpose,
      audience,
      now: new Date(),
    });
    if (!result.ok) {
      return { statusCode: result.statusCode, body: { error: result.reason } };
    }
    return {
      statusCode: 200,
      body: null,
      binary: { contentType: result.contentType, base64Body: result.body.toString("base64") },
    };
  }

  // GET /lifecycle-requests?status=pending
  if (method === "GET" && pathSegments.length === 1 && pathSegments[0] === "lifecycle-requests") {
    const status = queryParams.status;
    if (!isLifecycleStatus(status)) {
      return badRequest('"status" query parameter is required and must be one of pending, in-progress, completed, denied.');
    }
    const requests = await fixtureStore.listLifecycleRequestsByStatus(status);
    // Reviewer-caught finding: payloadFingerprint is a pure internal
    // idempotency mechanism, never meant to be display content — and for
    // at least one action (add-media) its payload used to carry the
    // uploaded bytes themselves (now a digest — see services/intake.ts),
    // which this list route would otherwise still hand back to any
    // authenticated staff caller regardless of the record's own current
    // custody/redaction state. Stripped here unconditionally, for every
    // action, not just the one this was caught on.
    const safeRequests = requests.map(({ payloadFingerprint, ...safe }) => safe);
    return { statusCode: 200, body: { requests: safeRequests } };
  }

  // GET /records/:recordId?purpose=...&audience=...
  //
  // Finding 1 fix: this used to return full record content and every piece
  // of consent/authority evidence to any authenticated staff member,
  // unconditionally — exactly the "a login/staff role substitutes for a
  // scoped grant" bypass permissions.ts's own docstring forbids elsewhere.
  // Now it runs the SAME evaluatePermission check as everything else, for
  // the purpose/audience the caller is asking about: allowed -> full detail
  // (content + evidence); denied -> a limited metadata view (identifying
  // fields, register/lifecycle state, custody copies, audit receipts — safe
  // by their own type design — plus COUNTS, not contents, of claims/rights/
  // grants) so lifecycle operators can still see enough to act without that
  // being a backdoor into evidence they aren't separately authorized to see.
  if (method === "GET" && pathSegments.length === 2 && pathSegments[0] === "records") {
    const recordId = pathSegments[1];
    const purpose = queryParams.purpose;
    const audience = queryParams.audience;
    if (!isPurpose(purpose)) {
      return badRequest('"purpose" query parameter is required and must be a valid Purpose value.');
    }
    if (!isAudience(audience)) {
      return badRequest('"audience" query parameter is required and must be one of "public", "staff", "research-partner".');
    }
    const record = await fixtureStore.getRecord(recordId);
    if (!record) {
      return notFound(`No record with id "${recordId}".`);
    }
    const [control, authorityClaims, legalRights, consentGrants, custodyCopies, auditReceipts, corrections, redactions] =
      await Promise.all([
        registerStore.getCurrent(recordId),
        fixtureStore.listAuthorityClaims(recordId),
        fixtureStore.listLegalRights(recordId),
        fixtureStore.listConsentGrants(recordId),
        fixtureStore.listCustodyCopies(recordId),
        fixtureStore.listAuditReceipts(recordId),
        fixtureStore.listCorrections(recordId),
        fixtureStore.listRedactions(recordId),
      ]);
    const decision = await evaluatePermission(fixtureStore, registerStore, { recordId, purpose, audience, now: new Date() });
    if (!decision.allowed) {
      return {
        statusCode: 200,
        body: {
          access: decision,
          record: {
            recordId: record.recordId,
            isSynthetic: record.isSynthetic,
            fixtureSetId: record.fixtureSetId,
            publicationStatus: record.publicationStatus,
            custodyStatus: record.custodyStatus,
            reviewedAt: record.reviewedAt,
            redactionApplied: record.redactionApplied,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          },
          control,
          authorityClaimCount: authorityClaims.length,
          legalRightCount: legalRights.length,
          consentGrantCount: consentGrants.length,
          correctionCount: corrections.length,
          custodyCopies,
          auditReceipts,
          // Safe metadata only (no original text) even in the limited
          // view — same reasoning as custodyCopies/auditReceipts above.
          redactions: redactionsSafeView(redactions),
        },
      };
    }
    return {
      statusCode: 200,
      body: {
        access: decision,
        // Register-driven, not storage-driven (services/redactionView.ts):
        // enforced from the CURRENT control state, never from whatever the
        // record's own (restorable) content happens to say — a reviewer
        // caught that a restored pre-redaction backup could otherwise
        // silently un-redact a field here even though the register still
        // lists it redacted.
        record: applyTextRedactions(record, control),
        control,
        authorityClaims,
        legalRights,
        consentGrants,
        custodyCopies,
        auditReceipts,
        // Full correction history is safe (same sensitivity as the
        // record's own title/summary) — but a field currently redacted
        // masks its correction history too, same register, same reason:
        // leaving historical values readable would be a complete end-run
        // around the redaction. Redactions themselves NEVER include the
        // pre-redaction original through this general-purpose route, even
        // when the caller is otherwise fully authorized for the record.
        corrections: maskCorrectionsForRedactedFields(corrections, control),
        redactions: redactionsSafeView(redactions),
      },
    };
  }

  // POST /records/:recordId/permission-check
  if (method === "POST" && pathSegments.length === 3 && pathSegments[0] === "records" && pathSegments[2] === "permission-check") {
    const recordId = pathSegments[1];
    const validated = validatePermissionCheckBody(body);
    if (!validated.ok) {
      return badRequest(validated.error);
    }
    const decision = await evaluatePermission(fixtureStore, registerStore, {
      recordId,
      purpose: validated.value.purpose,
      audience: validated.value.audience,
      now: new Date(),
    });
    return { statusCode: 200, body: decision };
  }

  // POST /records/:recordId/<action> — every lifecycle mutation.
  if (method === "POST" && pathSegments.length === 3 && pathSegments[0] === "records") {
    const recordId = pathSegments[1];
    const action = pathSegments[2];

    if (action === "restrict") {
      const validated = validateRestrictActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await restrict(
          fixtureStore,
          registerStore,
          {
            requestId: validated.value.requestId ?? uuidv7(),
            recordId,
            requesterCapacity: callerIdentity,
            reason: validated.value.reason,
            protectiveHold: validated.value.protectiveHold,
          },
          validated.value.purposes,
        );
        return { statusCode: 200, body: result };
      });
    }

    if (action === "withdraw" || action === "retain" || action === "start-deletion") {
      const validated = validateLifecycleActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      const input = {
        requestId: validated.value.requestId ?? uuidv7(),
        recordId,
        requesterCapacity: callerIdentity,
        reason: validated.value.reason,
        protectiveHold: validated.value.protectiveHold,
      };
      return withConflictHandling(async () => {
        const result =
          action === "withdraw"
            ? await withdraw(fixtureStore, registerStore, input)
            : action === "retain"
              ? await retainForPreservationOnly(fixtureStore, registerStore, input)
              : await startDeletion(fixtureStore, registerStore, input);
        return { statusCode: 200, body: result };
      });
    }

    if (action === "complete-deletion") {
      const validated = validateCompleteDeletionActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await completeDeletion(
          fixtureStore,
          registerStore,
          {
            requestId: validated.value.requestId ?? uuidv7(),
            recordId,
            requesterCapacity: callerIdentity,
            reason: validated.value.reason,
            deletionRequestId: validated.value.deletionRequestId,
          },
          mediaStore,
        );
        return { statusCode: 200, body: result };
      });
    }

    if (action === "revoke-consent") {
      const validated = validateRevokeConsentActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await revokeConsentGrant(fixtureStore, registerStore, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          consentId: validated.value.consentId,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "correct") {
      const validated = validateCorrectActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await correctRecord(fixtureStore, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          field: validated.value.field,
          correctedValue: validated.value.correctedValue,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "dispute-correction") {
      const validated = validateDisputeCorrectionActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await disputeCorrection(fixtureStore, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          correctionId: validated.value.correctionId,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "redact-text") {
      const validated = validateRedactTextActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await redactText(fixtureStore, registerStore, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          field: validated.value.field,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "redact-media") {
      const validated = validateRedactMediaActionBody(body);
      if (!validated.ok) {
        return badRequest(validated.error);
      }
      return withConflictHandling(async () => {
        const result = await redactMedia(fixtureStore, registerStore, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          mediaId: validated.value.mediaId,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "add-authority-claim") {
      const validated = validateAddAuthorityClaimActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await addAuthorityClaim(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          claimant: validated.value.claimant,
          scope: validated.value.scope,
          evidenceRef: validated.value.evidenceRef,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "add-legal-right") {
      const validated = validateAddLegalRightActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await addLegalRight(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          holder: validated.value.holder,
          rightType: validated.value.rightType,
          jurisdiction: validated.value.jurisdiction,
          evidenceRef: validated.value.evidenceRef,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "add-consent-grant") {
      const validated = validateAddConsentGrantActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await addConsentGrant(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          signerCapacitySummary: validated.value.signerCapacitySummary,
          purposes: validated.value.purposes,
          audience: validated.value.audience,
          mandateRef: validated.value.mandateRef,
          expiresAt: validated.value.expiresAt,
          retentionTermsRef: validated.value.retentionTermsRef,
          withdrawalContact: validated.value.withdrawalContact,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "add-media") {
      const validated = validateAddMediaActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await addMedia(fixtureStore, registerStore, mediaStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          contentType: validated.value.contentType,
          base64: validated.value.base64,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "supersede-authority-claim") {
      const validated = validateSupersedeAuthorityClaimActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await supersedeAuthorityClaim(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          supersededClaimId: validated.value.supersededClaimId,
          claimant: validated.value.claimant,
          scope: validated.value.scope,
          evidenceRef: validated.value.evidenceRef,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "supersede-legal-right") {
      const validated = validateSupersedeLegalRightActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await supersedeLegalRight(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          supersededRightId: validated.value.supersededRightId,
          holder: validated.value.holder,
          rightType: validated.value.rightType,
          jurisdiction: validated.value.jurisdiction,
          evidenceRef: validated.value.evidenceRef,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "approve-preservation") {
      const validated = validateApprovePreservationActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await approvePreservation(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          expectedControlVersion: validated.value.expectedControlVersion,
          expectedRecordVersion: validated.value.expectedRecordVersion,
          authorityClaimIds: validated.value.authorityClaimIds,
          legalRightIds: validated.value.legalRightIds,
          consentGrantIds: validated.value.consentGrantIds,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "approve-publication") {
      const validated = validateApprovePublicationActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      return withConflictHandling(async () => {
        const result = await approvePublication(fixtureStore, registerStore, intakeCommitter, {
          requestId: validated.value.requestId ?? uuidv7(),
          recordId,
          requesterCapacity: callerIdentity,
          reason: validated.value.reason,
          expectedControlVersion: validated.value.expectedControlVersion,
          expectedRecordVersion: validated.value.expectedRecordVersion,
          consentGrantIds: validated.value.consentGrantIds,
        });
        return { statusCode: 200, body: result };
      });
    }

    if (action === "request-changes" || action === "reject-submission") {
      const validated = validateLifecycleActionBody(body);
      if (!validated.ok) return badRequest(validated.error);
      const input = {
        requestId: validated.value.requestId ?? uuidv7(),
        recordId,
        requesterCapacity: callerIdentity,
        reason: validated.value.reason,
      };
      return withConflictHandling(async () => {
        const result =
          action === "request-changes"
            ? await requestChanges(fixtureStore, registerStore, input)
            : await rejectSubmission(fixtureStore, registerStore, input);
        return { statusCode: 200, body: result };
      });
    }

    return notFound(`No action "${action}".`);
  }

  // POST /export
  if (method === "POST" && pathSegments.length === 1 && pathSegments[0] === "export") {
    const validated = validateExportBody(body);
    if (!validated.ok) {
      return badRequest(validated.error);
    }
    const result = await exportFixtureSet(
      fixtureStore,
      registerStore,
      validated.value.recordIds,
      validated.value.scope,
      validated.value.fixtureSetId,
      validated.value.destinationAudience,
      mediaStore,
    );
    // Final, outermost guard. Every upstream budgeting mechanism
    // (per-record, per-skip-entry, the manifest's own real size, the
    // input-size caps in validation.ts) is meant to keep the response
    // comfortably under Lambda's real limit on its own — this replicates
    // EXACTLY what handler.ts's real Lambda response wrapping produces
    // ({statusCode, headers, body: JSON.stringify(result)}, itself
    // JSON-stringified once more to become the actual transmitted bytes),
    // so it is the true byte count, not an estimate. A reviewer's
    // reproductions are exactly why this exists even with those other
    // mechanisms in place: whatever edge case still gets through gets a
    // small, honest 413 here instead of Lambda ever being asked to
    // transmit something it can't.
    const wrappedBytes = Buffer.byteLength(
      JSON.stringify({ statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(result) }),
      "utf8",
    );
    if (wrappedBytes > LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES) {
      return {
        statusCode: 413,
        body: {
          error: `This export's complete response (${wrappedBytes} bytes) would exceed Lambda's ${LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES}-byte synchronous response limit. Request fewer records, or a narrower scope, and retry.`,
        },
      };
    }
    return { statusCode: 200, body: result };
  }

  return notFound(`No route for ${method} /${pathSegments.join("/")}.`);
}
