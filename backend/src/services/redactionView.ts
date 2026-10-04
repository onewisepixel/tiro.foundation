// Shared "what's safe to actually serve" logic for correction/redaction,
// used by both api/router.ts (live reads) and services/export.ts (backups).
// Kept in one place so router.ts and export.ts can never silently diverge
// on what redaction is supposed to withhold.
//
// Register-driven, not storage-driven: every function here takes the
// CURRENT RestrictionRegisterEntry and masks against ITS redactedTextFields
// — never the FixtureRecord's own stored value, and never a Correction/
// Redaction row's own content alone. A reviewer caught that masking based
// on stored content lets a restored (stale, pre-redaction) FixtureStore
// silently un-redact a record: the register is never touched by restore
// (docs/ethos.txt §12's "kept outside the data being rolled back"), so
// enforcing from it is what makes the mask survive a restore too — the
// exact property redactedMediaIds already had for media.
import type { CorrectableField, Correction, FixtureRecord, Redaction, RestrictionRegisterEntry } from "../domain/types";

const REDACTED_PLACEHOLDER = "[REDACTED]";

// Forces every currently-redacted field to the placeholder in the OUTPUT,
// regardless of what's actually stored — so a record whose FixtureStore
// content was reverted to a pre-redaction original by a restore is still
// served correctly, as long as the register (checked here) still lists
// the field as redacted.
export function applyTextRedactions(record: FixtureRecord, control: RestrictionRegisterEntry | null): FixtureRecord {
  const fields = control?.redactedTextFields ?? [];
  if (fields.length === 0) {
    return record;
  }
  const masked = { ...record };
  for (const field of fields) {
    masked[field] = REDACTED_PLACEHOLDER;
  }
  return masked;
}

// A correction's OWN previousValue/correctedValue are historical content
// for the SAME field a later redaction might cover — redacting the live
// field but leaving its correction history fully readable would be a
// complete end-run around the redaction. Masked using the SAME register
// state applyTextRedactions uses, for the same restore-survival reason.
export function maskCorrectionsForRedactedFields(corrections: Correction[], control: RestrictionRegisterEntry | null): Correction[] {
  const fields = new Set<CorrectableField>(control?.redactedTextFields ?? []);
  if (fields.size === 0) {
    return corrections;
  }
  return corrections.map((correction) =>
    fields.has(correction.field)
      ? { ...correction, previousValue: REDACTED_PLACEHOLDER, correctedValue: REDACTED_PLACEHOLDER }
      : correction,
  );
}

// Redaction metadata (scope, field/mediaId, reason, timestamps) is safe —
// it's the whole POINT of redaction that the ORIGINAL text never appears
// here. Used for every live read, allowed or not: safe by construction,
// same as custodyCopies/auditReceipts.
export function redactionsSafeView(redactions: Redaction[]) {
  return redactions.map((r) =>
    r.scope === "text"
      ? { recordId: r.recordId, redactionId: r.redactionId, scope: r.scope, field: r.field, reason: r.reason, createdAt: r.createdAt }
      : r,
  );
}
