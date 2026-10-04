// Small hand-rolled request-shape guards for the staff API. No validation
// library dependency — the request bodies are few, small, and already fully
// typed by domain/types.ts; these just confirm an unknown JSON body actually
// matches that shape before it's trusted as one.
import type { ConsentGrant, CorrectableField, Purpose } from "../domain/types";
import type { ExportScope } from "../services/export";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const PURPOSES: Purpose[] = [
  "collection",
  "preservation",
  "publication",
  "research",
  "derivatives",
  "model-training",
  "synthetic-reproduction",
  "commercial-use",
];
export function isPurpose(value: unknown): value is Purpose {
  return typeof value === "string" && (PURPOSES as string[]).includes(value);
}

const AUDIENCES: ConsentGrant["audience"][] = ["public", "staff", "research-partner"];
export function isAudience(value: unknown): value is ConsentGrant["audience"] {
  return typeof value === "string" && (AUDIENCES as string[]).includes(value);
}

const EXPORT_SCOPES: ExportScope[] = ["complete-preservation", "public-redacted"];
export function isExportScope(value: unknown): value is ExportScope {
  return typeof value === "string" && (EXPORT_SCOPES as string[]).includes(value);
}

const CORRECTABLE_FIELDS: CorrectableField[] = ["title", "summary", "provenanceRef"];
export function isCorrectableField(value: unknown): value is CorrectableField {
  return typeof value === "string" && (CORRECTABLE_FIELDS as string[]).includes(value);
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

// requestId and requesterCapacity are deliberately NOT part of this shape —
// requestId is server-generated when absent (see router.ts), and
// requesterCapacity is always derived from the authenticated caller's
// identity, never taken from the request body. A client-supplied value for
// either would let a staff member misattribute an action in the audit trail.
export type LifecycleActionBody = {
  reason: string;
  requestId?: string;
  protectiveHold?: boolean;
};

export function validateLifecycleActionBody(body: unknown): ValidationResult<LifecycleActionBody> {
  const record = asRecord(body);
  if (!record) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  if (!isNonEmptyString(record.reason)) {
    return { ok: false, error: "\"reason\" is required and must be a non-empty string." };
  }
  if (record.requestId !== undefined && !isNonEmptyString(record.requestId)) {
    return { ok: false, error: "\"requestId\", if present, must be a non-empty string." };
  }
  if (record.protectiveHold !== undefined && typeof record.protectiveHold !== "boolean") {
    return { ok: false, error: "\"protectiveHold\", if present, must be a boolean." };
  }
  return {
    ok: true,
    value: {
      reason: record.reason,
      requestId: record.requestId as string | undefined,
      protectiveHold: record.protectiveHold as boolean | undefined,
    },
  };
}

export type RestrictActionBody = LifecycleActionBody & { purposes: Purpose[] };

export function validateRestrictActionBody(body: unknown): ValidationResult<RestrictActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!Array.isArray(record.purposes) || record.purposes.length === 0 || !record.purposes.every(isPurpose)) {
    return { ok: false, error: "\"purposes\" is required and must be a non-empty array of valid Purpose values." };
  }
  return { ok: true, value: { ...base.value, purposes: record.purposes } };
}

export type CompleteDeletionActionBody = LifecycleActionBody & { deletionRequestId: string };

export function validateCompleteDeletionActionBody(body: unknown): ValidationResult<CompleteDeletionActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.deletionRequestId)) {
    return { ok: false, error: "\"deletionRequestId\" is required and must be a non-empty string — the requestId startDeletion() returned." };
  }
  return { ok: true, value: { ...base.value, deletionRequestId: record.deletionRequestId } };
}

export type RevokeConsentActionBody = LifecycleActionBody & { consentId: string };

export function validateRevokeConsentActionBody(body: unknown): ValidationResult<RevokeConsentActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.consentId)) {
    return { ok: false, error: "\"consentId\" is required and must be a non-empty string." };
  }
  return { ok: true, value: { ...base.value, consentId: record.consentId } };
}

export type PermissionCheckBody = { purpose: Purpose; audience: ConsentGrant["audience"] };

export function validatePermissionCheckBody(body: unknown): ValidationResult<PermissionCheckBody> {
  const record = asRecord(body);
  if (!record) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  if (!isPurpose(record.purpose)) {
    return { ok: false, error: "\"purpose\" is required and must be a valid Purpose value." };
  }
  if (!isAudience(record.audience)) {
    return { ok: false, error: "\"audience\" is required and must be one of \"public\", \"staff\", \"research-partner\"." };
  }
  return { ok: true, value: { purpose: record.purpose, audience: record.audience } };
}

export type ExportBody = {
  recordIds: string[];
  scope: ExportScope;
  fixtureSetId: string;
  destinationAudience: ConsentGrant["audience"];
};

export function validateExportBody(body: unknown): ValidationResult<ExportBody> {
  const record = asRecord(body);
  if (!record) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  if (
    !Array.isArray(record.recordIds) ||
    record.recordIds.length === 0 ||
    !record.recordIds.every((id) => isNonEmptyString(id))
  ) {
    return { ok: false, error: "\"recordIds\" is required and must be a non-empty array of strings." };
  }
  if (!isExportScope(record.scope)) {
    return { ok: false, error: "\"scope\" is required and must be \"complete-preservation\" or \"public-redacted\"." };
  }
  if (!isNonEmptyString(record.fixtureSetId)) {
    return { ok: false, error: "\"fixtureSetId\" is required and must be a non-empty string." };
  }
  if (!isAudience(record.destinationAudience)) {
    return { ok: false, error: "\"destinationAudience\" is required and must be one of \"public\", \"staff\", \"research-partner\"." };
  }
  return {
    ok: true,
    value: {
      recordIds: record.recordIds as string[],
      scope: record.scope,
      fixtureSetId: record.fixtureSetId,
      destinationAudience: record.destinationAudience,
    },
  };
}

export type CorrectActionBody = LifecycleActionBody & { field: CorrectableField; correctedValue: string };

export function validateCorrectActionBody(body: unknown): ValidationResult<CorrectActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isCorrectableField(record.field)) {
    return { ok: false, error: "\"field\" is required and must be one of \"title\", \"summary\", \"provenanceRef\"." };
  }
  if (!isNonEmptyString(record.correctedValue)) {
    return { ok: false, error: "\"correctedValue\" is required and must be a non-empty string." };
  }
  return { ok: true, value: { ...base.value, field: record.field, correctedValue: record.correctedValue } };
}

export type DisputeCorrectionActionBody = LifecycleActionBody & { correctionId: string };

export function validateDisputeCorrectionActionBody(body: unknown): ValidationResult<DisputeCorrectionActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.correctionId)) {
    return { ok: false, error: "\"correctionId\" is required and must be a non-empty string." };
  }
  return { ok: true, value: { ...base.value, correctionId: record.correctionId } };
}

export type RedactTextActionBody = LifecycleActionBody & { field: CorrectableField };

export function validateRedactTextActionBody(body: unknown): ValidationResult<RedactTextActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isCorrectableField(record.field)) {
    return { ok: false, error: "\"field\" is required and must be one of \"title\", \"summary\", \"provenanceRef\"." };
  }
  return { ok: true, value: { ...base.value, field: record.field } };
}

export type RedactMediaActionBody = LifecycleActionBody & { mediaId: string };

export function validateRedactMediaActionBody(body: unknown): ValidationResult<RedactMediaActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) {
    return base;
  }
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.mediaId)) {
    return { ok: false, error: "\"mediaId\" is required and must be a non-empty string." };
  }
  return { ok: true, value: { ...base.value, mediaId: record.mediaId } };
}
