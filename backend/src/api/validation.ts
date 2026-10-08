// Small hand-rolled request-shape guards for the staff API. No validation
// library dependency — the request bodies are few, small, and already fully
// typed by domain/types.ts; these just confirm an unknown JSON body actually
// matches that shape before it's trusted as one.
import type { ConsentGrant, CorrectableField, Purpose } from "../domain/types";
import { MAX_EXPORT_RECORD_IDS, MAX_FIXTURE_SET_ID_LENGTH, type ExportScope } from "../services/export";
import { MAX_MEDIA_BYTES } from "../services/media";

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
  // Reviewer-caught finding: an unbounded recordIds count let a single
  // export call request thousands of records — most skipped-for-budget,
  // but the skip REPORT itself then became a second, unbounded source of
  // the same response-size overage it exists to document. Bounding the
  // batch size here, at the trust boundary, closes that at the door for
  // every caller going through the API (exportFixtureSet itself also
  // enforces this independently, for callers that don't).
  if (record.recordIds.length > MAX_EXPORT_RECORD_IDS) {
    return { ok: false, error: `"recordIds" must not exceed ${MAX_EXPORT_RECORD_IDS} ids in a single export call.` };
  }
  if (!isExportScope(record.scope)) {
    return { ok: false, error: "\"scope\" is required and must be \"complete-preservation\" or \"public-redacted\"." };
  }
  if (!isNonEmptyString(record.fixtureSetId)) {
    return { ok: false, error: "\"fixtureSetId\" is required and must be a non-empty string." };
  }
  // Reviewer-caught finding: fixtureSetId had no length limit, and the
  // manifest embeds it verbatim — a 2 MiB fixtureSetId alone could blow
  // the response budget before a single record was even considered.
  if (record.fixtureSetId.length > MAX_FIXTURE_SET_ID_LENGTH) {
    return { ok: false, error: `"fixtureSetId" must not exceed ${MAX_FIXTURE_SET_ID_LENGTH} characters.` };
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

// --- Staff intake and review -----------------------------------------------

function isNullOrNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

export type CreateSubmissionBody = {
  reason: string;
  requestId?: string;
  fixtureSetId: string;
  title: string;
  summary: string;
  provenanceRef: string;
};

export function validateCreateSubmissionBody(body: unknown): ValidationResult<CreateSubmissionBody> {
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
  for (const field of ["fixtureSetId", "title", "summary", "provenanceRef"] as const) {
    if (!isNonEmptyString(record[field])) {
      return { ok: false, error: `"${field}" is required and must be a non-empty string.` };
    }
  }
  return {
    ok: true,
    value: {
      reason: record.reason,
      requestId: record.requestId as string | undefined,
      fixtureSetId: record.fixtureSetId as string,
      title: record.title as string,
      summary: record.summary as string,
      provenanceRef: record.provenanceRef as string,
    },
  };
}

export type AddAuthorityClaimActionBody = LifecycleActionBody & { claimant: string; scope: string; evidenceRef: string };

export function validateAddAuthorityClaimActionBody(body: unknown): ValidationResult<AddAuthorityClaimActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  for (const field of ["claimant", "scope", "evidenceRef"] as const) {
    if (!isNonEmptyString(record[field])) {
      return { ok: false, error: `"${field}" is required and must be a non-empty string.` };
    }
  }
  return { ok: true, value: { ...base.value, claimant: record.claimant as string, scope: record.scope as string, evidenceRef: record.evidenceRef as string } };
}

export type AddLegalRightActionBody = LifecycleActionBody & {
  holder: string;
  rightType: string;
  jurisdiction: string | null;
  evidenceRef: string;
};

export function validateAddLegalRightActionBody(body: unknown): ValidationResult<AddLegalRightActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  for (const field of ["holder", "rightType", "evidenceRef"] as const) {
    if (!isNonEmptyString(record[field])) {
      return { ok: false, error: `"${field}" is required and must be a non-empty string.` };
    }
  }
  if (record.jurisdiction !== undefined && !isNullOrNonEmptyString(record.jurisdiction)) {
    return { ok: false, error: "\"jurisdiction\", if present, must be a non-empty string or null." };
  }
  return {
    ok: true,
    value: {
      ...base.value,
      holder: record.holder as string,
      rightType: record.rightType as string,
      jurisdiction: (record.jurisdiction as string | null | undefined) ?? null,
      evidenceRef: record.evidenceRef as string,
    },
  };
}

export type AddConsentGrantActionBody = LifecycleActionBody & {
  signerCapacitySummary: string;
  purposes: Purpose[];
  audience: ConsentGrant["audience"];
  mandateRef: string | null;
  expiresAt: string | null;
  retentionTermsRef: string;
  withdrawalContact: string;
};

export function validateAddConsentGrantActionBody(body: unknown): ValidationResult<AddConsentGrantActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.signerCapacitySummary)) {
    return { ok: false, error: "\"signerCapacitySummary\" is required and must be a non-empty string." };
  }
  if (!Array.isArray(record.purposes) || record.purposes.length === 0 || !record.purposes.every(isPurpose)) {
    return { ok: false, error: "\"purposes\" is required and must be a non-empty array of valid Purpose values." };
  }
  if (!isAudience(record.audience)) {
    return { ok: false, error: "\"audience\" is required and must be one of \"public\", \"staff\", \"research-partner\"." };
  }
  if (record.mandateRef !== undefined && !isNullOrNonEmptyString(record.mandateRef)) {
    return { ok: false, error: "\"mandateRef\", if present, must be a non-empty string or null." };
  }
  if (record.expiresAt !== undefined && !isNullOrNonEmptyString(record.expiresAt)) {
    return { ok: false, error: "\"expiresAt\", if present, must be a non-empty string or null." };
  }
  if (!isNonEmptyString(record.retentionTermsRef)) {
    return { ok: false, error: "\"retentionTermsRef\" is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(record.withdrawalContact)) {
    return { ok: false, error: "\"withdrawalContact\" is required and must be a non-empty string." };
  }
  return {
    ok: true,
    value: {
      ...base.value,
      signerCapacitySummary: record.signerCapacitySummary as string,
      purposes: record.purposes as Purpose[],
      audience: record.audience,
      mandateRef: (record.mandateRef as string | null | undefined) ?? null,
      expiresAt: (record.expiresAt as string | null | undefined) ?? null,
      retentionTermsRef: record.retentionTermsRef as string,
      withdrawalContact: record.withdrawalContact as string,
    },
  };
}

// MAX_MEDIA_BYTES is a raw byte cap on the DECODED upload — checked here
// against the base64 string's length via the exact inflation formula
// (base64 is ~4/3 the size of the bytes it encodes), the same
// bound-before-buffering discipline services/media.ts's read path already
// uses, applied symmetrically to the write side: reject an obviously
// oversized body before ever calling Buffer.from on it.
const MAX_MEDIA_BASE64_LENGTH = Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 4;

export type AddMediaActionBody = LifecycleActionBody & { contentType: string; base64: string };

export function validateAddMediaActionBody(body: unknown): ValidationResult<AddMediaActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonEmptyString(record.contentType)) {
    return { ok: false, error: "\"contentType\" is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(record.base64)) {
    return { ok: false, error: "\"base64\" is required and must be a non-empty string." };
  }
  if ((record.base64 as string).length > MAX_MEDIA_BASE64_LENGTH) {
    return { ok: false, error: `"base64" is too large — the decoded upload must not exceed ${MAX_MEDIA_BYTES} bytes.` };
  }
  return { ok: true, value: { ...base.value, contentType: record.contentType as string, base64: record.base64 as string } };
}

export type SupersedeAuthorityClaimActionBody = LifecycleActionBody & {
  supersededClaimId: string;
  claimant: string;
  scope: string;
  evidenceRef: string;
};

export function validateSupersedeAuthorityClaimActionBody(body: unknown): ValidationResult<SupersedeAuthorityClaimActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  for (const field of ["supersededClaimId", "claimant", "scope", "evidenceRef"] as const) {
    if (!isNonEmptyString(record[field])) {
      return { ok: false, error: `"${field}" is required and must be a non-empty string.` };
    }
  }
  return {
    ok: true,
    value: {
      ...base.value,
      supersededClaimId: record.supersededClaimId as string,
      claimant: record.claimant as string,
      scope: record.scope as string,
      evidenceRef: record.evidenceRef as string,
    },
  };
}

export type SupersedeLegalRightActionBody = LifecycleActionBody & {
  supersededRightId: string;
  holder: string;
  rightType: string;
  jurisdiction: string | null;
  evidenceRef: string;
};

export function validateSupersedeLegalRightActionBody(body: unknown): ValidationResult<SupersedeLegalRightActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  for (const field of ["supersededRightId", "holder", "rightType", "evidenceRef"] as const) {
    if (!isNonEmptyString(record[field])) {
      return { ok: false, error: `"${field}" is required and must be a non-empty string.` };
    }
  }
  if (record.jurisdiction !== undefined && !isNullOrNonEmptyString(record.jurisdiction)) {
    return { ok: false, error: "\"jurisdiction\", if present, must be a non-empty string or null." };
  }
  return {
    ok: true,
    value: {
      ...base.value,
      supersededRightId: record.supersededRightId as string,
      holder: record.holder as string,
      rightType: record.rightType as string,
      jurisdiction: (record.jurisdiction as string | null | undefined) ?? null,
      evidenceRef: record.evidenceRef as string,
    },
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export type ApprovePreservationActionBody = LifecycleActionBody & {
  expectedControlVersion: number;
  expectedRecordVersion: number;
  authorityClaimIds: string[];
  legalRightIds: string[];
  consentGrantIds: string[];
};

export function validateApprovePreservationActionBody(body: unknown): ValidationResult<ApprovePreservationActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonNegativeInteger(record.expectedControlVersion)) {
    return { ok: false, error: "\"expectedControlVersion\" is required and must be a non-negative integer." };
  }
  if (!isNonNegativeInteger(record.expectedRecordVersion)) {
    return { ok: false, error: "\"expectedRecordVersion\" is required and must be a non-negative integer." };
  }
  // Arrays may be empty (e.g. legalRightIds — evaluatePermission's own
  // rule, unchanged) — the service layer enforces which must actually be
  // non-empty for the approval to succeed; this layer only confirms shape.
  for (const field of ["authorityClaimIds", "legalRightIds", "consentGrantIds"] as const) {
    if (!isStringArray(record[field])) {
      return { ok: false, error: `"${field}" is required and must be an array of non-empty strings.` };
    }
  }
  return {
    ok: true,
    value: {
      ...base.value,
      expectedControlVersion: record.expectedControlVersion as number,
      expectedRecordVersion: record.expectedRecordVersion as number,
      authorityClaimIds: record.authorityClaimIds as string[],
      legalRightIds: record.legalRightIds as string[],
      consentGrantIds: record.consentGrantIds as string[],
    },
  };
}

export type ApprovePublicationActionBody = LifecycleActionBody & {
  expectedControlVersion: number;
  expectedRecordVersion: number;
  consentGrantIds: string[];
};

export function validateApprovePublicationActionBody(body: unknown): ValidationResult<ApprovePublicationActionBody> {
  const base = validateLifecycleActionBody(body);
  if (!base.ok) return base;
  const record = asRecord(body) as Record<string, unknown>;
  if (!isNonNegativeInteger(record.expectedControlVersion)) {
    return { ok: false, error: "\"expectedControlVersion\" is required and must be a non-negative integer." };
  }
  if (!isNonNegativeInteger(record.expectedRecordVersion)) {
    return { ok: false, error: "\"expectedRecordVersion\" is required and must be a non-negative integer." };
  }
  if (!isStringArray(record.consentGrantIds)) {
    return { ok: false, error: "\"consentGrantIds\" is required and must be an array of non-empty strings." };
  }
  return {
    ok: true,
    value: {
      ...base.value,
      expectedControlVersion: record.expectedControlVersion as number,
      expectedRecordVersion: record.expectedRecordVersion as number,
      consentGrantIds: record.consentGrantIds as string[],
    },
  };
}
