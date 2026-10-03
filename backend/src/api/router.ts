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
import { VersionConflictError } from "../store/store";
import {
  withdraw,
  restrict,
  retainForPreservationOnly,
  startDeletion,
  completeDeletion,
  revokeConsentGrant,
} from "../services/lifecycle";
import { evaluatePermission } from "../services/permissions";
import { exportFixtureSet } from "../services/export";
import {
  validateLifecycleActionBody,
  validateRestrictActionBody,
  validateRevokeConsentActionBody,
  validatePermissionCheckBody,
  validateExportBody,
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
    if (error instanceof VersionConflictError) {
      return { statusCode: 409, body: { error: error.message } };
    }
    throw error;
  }
}

export async function routeRequest(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  callerIdentity: string,
  request: ApiRequest,
): Promise<ApiResponse> {
  const { method, pathSegments, queryParams, body } = request;

  // GET /lifecycle-requests?status=pending
  if (method === "GET" && pathSegments.length === 1 && pathSegments[0] === "lifecycle-requests") {
    const status = queryParams.status;
    if (!isLifecycleStatus(status)) {
      return badRequest('"status" query parameter is required and must be one of pending, in-progress, completed, denied.');
    }
    const requests = await fixtureStore.listLifecycleRequestsByStatus(status);
    return { statusCode: 200, body: { requests } };
  }

  // GET /records/:recordId
  if (method === "GET" && pathSegments.length === 2 && pathSegments[0] === "records") {
    const recordId = pathSegments[1];
    const record = await fixtureStore.getRecord(recordId);
    if (!record) {
      return notFound(`No record with id "${recordId}".`);
    }
    const [control, authorityClaims, legalRights, consentGrants, custodyCopies, auditReceipts] = await Promise.all([
      registerStore.getCurrent(recordId),
      fixtureStore.listAuthorityClaims(recordId),
      fixtureStore.listLegalRights(recordId),
      fixtureStore.listConsentGrants(recordId),
      fixtureStore.listCustodyCopies(recordId),
      fixtureStore.listAuditReceipts(recordId),
    ]);
    return {
      statusCode: 200,
      body: { record, control, authorityClaims, legalRights, consentGrants, custodyCopies, auditReceipts },
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
      return withConflictHandling(async () => {
        const result = await completeDeletion(fixtureStore, registerStore, recordId);
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
    );
    return { statusCode: 200, body: result };
  }

  return notFound(`No route for ${method} /${pathSegments.join("/")}.`);
}
