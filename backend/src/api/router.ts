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
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
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
import { exportFixtureSet } from "../services/export";
import { fetchAuthorizedMedia } from "../services/media";
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
  callerIdentity: string,
  request: ApiRequest,
): Promise<ApiResponse> {
  const { method, pathSegments, queryParams, body } = request;

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
    return { statusCode: 200, body: { requests } };
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
    return { statusCode: 200, body: result };
  }

  return notFound(`No route for ${method} /${pathSegments.join("/")}.`);
}
