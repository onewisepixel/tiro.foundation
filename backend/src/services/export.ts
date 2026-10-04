// Preservation export per docs/ethos.txt §3.10 and §7.
//
// Produces a versioned manifest + JSONL-ready records, each carrying its
// own provenance and consent/restriction/withdrawal state AS OF EXPORT TIME.
// That state is a snapshot, not a live link — this is exactly why restore
// (see restore.ts) must reconcile against the CURRENT restriction register
// rather than trusting anything in the export. An old export is expected to
// contain old, possibly since-revoked, state.
import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  Correction,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  Purpose,
  Redaction,
} from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { evaluatePermission } from "./permissions";
import { MAX_MEDIA_BYTES } from "./media";
import { applyTextRedactions, maskCorrectionsForRedactedFields } from "./redactionView";

export type ExportScope = "complete-preservation" | "public-redacted";

// Budgets the ACTUAL SERIALIZED size of the COMPLETE Lambda response — every
// record's full encoded envelope (title/summary/corrections/redactions/
// history AND media), not just media's contribution. AWS Lambda's
// synchronous invocation response has a hard 6 MiB buffered payload limit
// (docs.aws.amazon.com). A reviewer reproduced 9,032,712 serialized bytes
// from 20 records with larger TEXT fields and no media at all — the
// previous version of this budget only ever measured media's base64 +
// structural overhead, so text-heavy records sailed straight through it.
// Fixed by measuring each record's REAL serialized envelope size
// (Buffer.byteLength of its JSON, not an estimate) and tracking a running
// total across the WHOLE response; once a record's envelope would push
// that total over budget, the ENTIRE record is excluded (not trimmed) and
// recorded in recordsSkippedForResponseBudget — never silently dropped,
// same as mediaObjectsSkipped. The value itself stays well below the 6 MiB
// hard limit to leave headroom for the manifest and API Gateway/Lambda's
// own response framing.
export const MAX_EXPORT_RESPONSE_BYTES = 5 * 1024 * 1024;

// Conservative fixed estimate for the manifest line — tiny and effectively
// fixed-size (recordCount's digit count is the only variable), so a real
// byte count isn't worth computing before the record count is final.
const MANIFEST_OVERHEAD_BYTES = 512;

// Conservative fixed estimate of the JSON structure wrapping ONE media
// object — {"mediaId":"<uuidv7>","base64":"..."} — field names, quotes,
// commas, and the id itself (~36 chars). Deliberately generous (real
// overhead is usually smaller) so the budget stays a genuine upper bound,
// not an optimistic one.
const PER_MEDIA_OBJECT_JSON_OVERHEAD_BYTES = 120;

// Exact base64 output length for N raw bytes (3 bytes -> 4 chars, padded
// up to the next multiple of 4) — computable from a HEAD-only size, before
// ever fetching or encoding anything, so the budget can be enforced
// without buffering a single byte of a rejected object.
function base64Length(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

// base64 bytes of exactly the version each MediaRef is pinned to — present
// only for complete-preservation exports (media is content, so public
// exports omit it the same way they redact consentGrants) and only for
// refs that are actually version-bound; a legacy (versionId: null)
// reference has nothing fetchable to include and is simply absent, named
// in `skipped`.
export type ExportedMediaObject = { mediaId: string; base64: string };

export type ExportedRecordEnvelope = {
  record: FixtureRecord;
  authorityClaims: AuthorityClaim[];
  legalRights: LegalRight[];
  // Public exports omit consent evidence details and restricted identifiers;
  // complete-preservation exports include the full grant for destinations
  // authorized to hold it. See docs/ethos.txt §3.10: "A media package
  // without its permissions and lifecycle history is incomplete."
  consentGrants: ConsentGrant[] | "redacted-for-public-export";
  custodyCopies: CustodyCopy[];
  // Safe lifecycle history per §3.10/§12 — AuditReceipt is minimal and
  // non-sensitive by type design (domain/types.ts), never testimony or
  // consent-document content.
  auditReceipts: AuditReceipt[];
  // Same sensitivity as the record's own title/summary (corrections are
  // just historical edits of that same text), so included for both scopes.
  corrections: Correction[];
  // Unlike corrections, a text redaction's previousValue is the exact
  // thing redaction withholds — "redacted-for-public-export" for
  // public-redacted scope, same pattern as consentGrants/mediaObjects;
  // full (original value included) for complete-preservation, the one
  // scope authorized to hold the full unredacted archival history.
  redactions: Redaction[] | "redacted-for-public-export";
  mediaObjects: ExportedMediaObject[] | "omitted-for-public-export";
  mediaObjectsSkipped: { mediaId: string; reason: string }[];
  controlStateAtExport: {
    publicationStatus: string;
    custodyStatus: string;
    restrictedPurposes: string[];
    controlVersion: number;
  } | null;
};

export type PreservationExportManifest = {
  manifestVersion: 1;
  scope: ExportScope;
  exportedAt: string;
  fixtureSetId: string;
  recordCount: number;
};

export type PreservationExport = {
  manifest: PreservationExportManifest;
  records: ExportedRecordEnvelope[];
  // Whole records excluded to keep the complete serialized response under
  // MAX_EXPORT_RESPONSE_BYTES — never silently dropped, same pattern as
  // each record's own mediaObjectsSkipped.
  recordsSkippedForResponseBudget: { recordId: string; reason: string }[];
};

// destinationAudience: who this export is FOR — checked against each
// record's scoped permission the same way any other access would be, so an
// export can never hand a destination content that a live permission check
// would deny it. public-redacted exports are evaluated for "publication"
// purpose; complete-preservation exports for "preservation" purpose. Either
// way, a denied record is simply absent from the export (never included
// redacted) — this was the gap: the old code only ever checked
// currentPublicationStatus directly for the public-redacted scope, and
// applied no authorization check at all for complete-preservation.
export async function exportFixtureSet(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  recordIds: string[],
  scope: ExportScope,
  fixtureSetId: string,
  destinationAudience: ConsentGrant["audience"],
  // Optional: without it, mediaObjects is simply omitted with a reason —
  // existing callers that never touch media keep working unchanged. Pass it
  // to actually include authorized media bytes in a complete-preservation
  // export, per docs/ethos.txt §3.10's "media package ... is incomplete"
  // without them.
  mediaStore?: MediaStore,
): Promise<PreservationExport> {
  const records: ExportedRecordEnvelope[] = [];
  const recordsSkippedForResponseBudget: { recordId: string; reason: string }[] = [];
  const purpose: Purpose = scope === "public-redacted" ? "publication" : "preservation";
  // Deduplicate: repeating one id N times must never embed that record's
  // (and its media's) content N times in the response — a reviewer
  // reproduced a multi-megabyte export this way from a single real record.
  const uniqueRecordIds = [...new Set(recordIds)];
  // Shared across every record in this call, not reset per record — the
  // WHOLE-RESPONSE budget below. Measured in real SERIALIZED bytes (every
  // committed record's full encoded envelope), not raw object bytes.
  let totalResponseBytes = MANIFEST_OVERHEAD_BYTES;

  for (const recordId of uniqueRecordIds) {
    const record = await fixtureStore.getRecord(recordId);
    if (!record) {
      continue;
    }
    const control = await registerStore.getCurrent(recordId);

    const decision = await evaluatePermission(fixtureStore, registerStore, {
      recordId,
      purpose,
      audience: destinationAudience,
      now: new Date(),
    });
    if (!decision.allowed) {
      // Absence, not a flagged entry — matches the pre-existing
      // public-redacted contract, now enforced for every export scope.
      continue;
    }

    const mediaObjectsSkipped: { mediaId: string; reason: string }[] = [];
    let mediaObjects: ExportedMediaObject[] | "omitted-for-public-export" = "omitted-for-public-export";
    if (scope === "complete-preservation") {
      if (!mediaStore) {
        for (const media of record.mediaRefs) {
          mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "No mediaStore provided to exportFixtureSet." });
        }
        mediaObjects = [];
      } else {
        const fetched: ExportedMediaObject[] = [];
        // This record's own provisional media total, checked against
        // the budget REMAINING after everything already committed —
        // purely an optimization to skip an individually-oversized
        // object before fetching/encoding it; the real, authoritative
        // gate is the whole-envelope check below, which also covers
        // text/history and corrects for this estimate if it's ever off.
        let provisionalMediaBytes = 0;
        for (const media of record.mediaRefs) {
          // Redaction is a hard override, checked first — same as
          // evaluatePermission's mediaId check (services/permissions.ts)
          // for the live retrieval route. A redacted object is never
          // embedded in an export either, complete-preservation or not.
          if (control?.redactedMediaIds?.includes(media.mediaId)) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Media has been redacted." });
            continue;
          }
          if (!media.versionId) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Legacy reference has no bound S3 version." });
            continue;
          }
          // Bounded read: check the REAL size via a bodyless HEAD before
          // ever calling getObject — the same reasoning as
          // services/media.ts's retrieval route. Trusting only the
          // recorded `media.bytes` would let a drifted or oversized real
          // object get fully buffered before any size check could reject
          // it.
          const actualSize = await mediaStore.headObjectSize(media.objectKey, media.versionId);
          if (actualSize === null) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Bound version no longer exists in storage." });
            continue;
          }
          if (actualSize > MAX_MEDIA_BYTES) {
            mediaObjectsSkipped.push({
              mediaId: media.mediaId,
              reason: `Exceeds the ${MAX_MEDIA_BYTES}-byte per-object export cap (${actualSize} bytes).`,
            });
            continue;
          }
          // Estimated from the HEAD-only size, before fetching anything —
          // computable exactly (base64Length is deterministic from byte
          // count), so an over-budget object is skipped without ever
          // calling getObject for it.
          const estimatedSerializedBytes = base64Length(actualSize) + PER_MEDIA_OBJECT_JSON_OVERHEAD_BYTES;
          if (totalResponseBytes + provisionalMediaBytes + estimatedSerializedBytes > MAX_EXPORT_RESPONSE_BYTES) {
            mediaObjectsSkipped.push({
              mediaId: media.mediaId,
              reason: `Skipped: including it would exceed this export's ${MAX_EXPORT_RESPONSE_BYTES}-byte serialized-response budget (base64 + JSON overhead, not raw bytes).`,
            });
            continue;
          }
          const object = await mediaStore.getObject(media.objectKey, media.versionId);
          if (!object) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Bound version no longer exists in storage." });
            continue;
          }
          const base64 = object.body.toString("base64");
          // Track the REAL measured base64 length for this record's
          // provisional total (should match the estimate almost always;
          // using the real value keeps it accurate even if it doesn't).
          provisionalMediaBytes += base64.length + PER_MEDIA_OBJECT_JSON_OVERHEAD_BYTES;
          fetched.push({ mediaId: media.mediaId, base64 });
        }
        mediaObjects = fetched;
      }
    }

    // Register-driven, not storage-driven (services/redactionView.ts):
    // the embedded record's currently-redacted fields are forced to the
    // placeholder from the CURRENT control state regardless of what's
    // actually stored, so a record whose primary content was reverted to
    // a pre-redaction original by a restore is still exported correctly
    // redacted, for EITHER scope — same as redactedMediaIds above. A
    // correction's OWN historical previousValue/correctedValue for that
    // field is masked too, but only for public-redacted scope:
    // complete-preservation is the one scope authorized to hold the full
    // unredacted archival history, same exemption Redaction.previousValue
    // already has for it.
    const maskedRecord = applyTextRedactions(record, control);
    const corrections = await fixtureStore.listCorrections(recordId);

    const envelope: ExportedRecordEnvelope = {
      record: maskedRecord,
      authorityClaims: await fixtureStore.listAuthorityClaims(recordId),
      legalRights: await fixtureStore.listLegalRights(recordId),
      consentGrants:
        scope === "public-redacted" ? "redacted-for-public-export" : await fixtureStore.listConsentGrants(recordId),
      custodyCopies: await fixtureStore.listCustodyCopies(recordId),
      auditReceipts: await fixtureStore.listAuditReceipts(recordId),
      corrections: scope === "public-redacted" ? maskCorrectionsForRedactedFields(corrections, control) : corrections,
      redactions:
        scope === "public-redacted" ? "redacted-for-public-export" : await fixtureStore.listRedactions(recordId),
      mediaObjects,
      mediaObjectsSkipped,
      controlStateAtExport: control
        ? {
            publicationStatus: control.currentPublicationStatus,
            custodyStatus: control.currentCustodyStatus,
            restrictedPurposes: control.restrictedPurposes,
            controlVersion: control.controlVersion,
          }
        : null,
    };

    // The authoritative, whole-envelope gate: measures the REAL serialized
    // size of everything this record would add to the response — title,
    // summary, corrections, redactions, history, AND media — not an
    // estimate of any one part of it. A record that would push the WHOLE
    // response over budget is excluded entirely (never trimmed down
    // further here) and reported, same as mediaObjectsSkipped.
    const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope), "utf8");
    if (totalResponseBytes + envelopeBytes > MAX_EXPORT_RESPONSE_BYTES) {
      recordsSkippedForResponseBudget.push({
        recordId,
        reason: `Skipped: this record's complete envelope (${envelopeBytes} bytes) would exceed this export's ${MAX_EXPORT_RESPONSE_BYTES}-byte serialized-response budget (covers the full encoded response, not just media).`,
      });
      continue;
    }
    totalResponseBytes += envelopeBytes;
    records.push(envelope);
  }

  return {
    manifest: {
      manifestVersion: 1,
      scope,
      exportedAt: new Date().toISOString(),
      fixtureSetId,
      recordCount: records.length,
    },
    records,
    recordsSkippedForResponseBudget,
  };
}

// JSONL serialization: manifest line first, then one record envelope per
// line. recordsSkippedForResponseBudget rides along on the manifest line
// (not a record of its own) — folding it in rather than dropping it keeps
// this round-trip lossless; omitting it here would silently lose which
// whole records a prior export excluded for budget reasons the moment it
// was written to S3 and read back, the same "never silently drop" standard
// mediaObjectsSkipped is already held to.
type ManifestLine = PreservationExportManifest & {
  recordsSkippedForResponseBudget?: { recordId: string; reason: string }[];
};

export function toJsonl(exportData: PreservationExport): string {
  const manifestLine: ManifestLine = {
    ...exportData.manifest,
    recordsSkippedForResponseBudget: exportData.recordsSkippedForResponseBudget,
  };
  const lines = [JSON.stringify(manifestLine), ...exportData.records.map((r) => JSON.stringify(r))];
  return lines.join("\n") + "\n";
}

export function fromJsonl(jsonl: string): PreservationExport {
  const lines = jsonl.split("\n").filter((line) => line.trim().length > 0);
  const [manifestLine, ...recordLines] = lines;
  const { recordsSkippedForResponseBudget, ...manifest } = JSON.parse(manifestLine) as ManifestLine;
  const records = recordLines.map((line) => JSON.parse(line) as ExportedRecordEnvelope);
  // Defaulted, not required: older exports written before this field
  // existed are still valid JSONL to restore from.
  return { manifest, records, recordsSkippedForResponseBudget: recordsSkippedForResponseBudget ?? [] };
}
