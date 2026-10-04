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
// same as mediaObjectsSkipped.
//
// Second round, reviewer-caught finding: that fix still measured only this
// export object's OWN single JSON.stringify length — not what api/
// handler.ts actually returns. The real Lambda invocation response is
// `{statusCode, headers, body: JSON.stringify(exportResult)}`, itself
// JSON-stringified ONE more time to become the actual bytes Lambda
// transmits — meaning the already-JSON `body` gets embedded as a STRING
// VALUE, and every quote/backslash in it is escaped again. Records whose
// text happened to be rich in quotes/backslashes measured safely under
// budget by one encoding (4,935,651 bytes) but nearly DOUBLED once
// actually wrapped this way (9,852,931 bytes) — ordinary text inflates far
// less, so a single fixed multiplier would be wrong either way. Fixed by
// measuring the REAL cost of that eventual re-escaping directly
// (responseEncodedByteLength below) instead of assuming one. The value
// itself stays well below the 6 MiB hard limit to leave headroom for API
// Gateway/Lambda's own response framing on top of everything measured here.
export const MAX_EXPORT_RESPONSE_BYTES = 5 * 1024 * 1024;

// AWS Lambda's real, hard limit on a synchronous invocation's buffered
// response (docs.aws.amazon.com) — the actual ceiling every budgeting
// mechanism in this file exists to stay comfortably under.
// MAX_EXPORT_RESPONSE_BYTES already leaves generous headroom below this;
// api/router.ts uses this constant directly for ONE final, outermost
// guard — see its comment there for why that's still needed even with
// everything else here working correctly.
export const LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES = 6 * 1024 * 1024;

// A reviewer reproduced two further ways to blow the response budget that
// per-record accounting alone can't catch, because they aren't about any
// one record's content:
//   - A caller-supplied `fixtureSetId` with NO length limit — 20 ordinary
//     records plus a 2 MiB fixtureSetId produced a 7,026,838-byte real
//     response, because the MANIFEST (which embeds fixtureSetId verbatim)
//     was budgeted with a fixed, optimistic estimate that assumed it was
//     always small.
//   - 8,000 requested records, almost all individually skipped-for-budget
//     (903 included, 7,097 skipped) — because each skip entry's own small
//     cost WAS being counted (see responseEncodedByteLength below), but
//     entries were still appended UNCONDITIONALLY no matter how large the
//     skip list itself grew, so the report meant to document the overage
//     became a second, unbounded source of it (7,291,455 bytes).
// Fixed with defense in depth: bounded input (MAX_FIXTURE_SET_ID_LENGTH,
// MAX_EXPORT_RECORD_IDS below) closes both at the door; the manifest is
// now budgeted from its REAL encoded size, not a guess; and the skip-list
// loop stops (recordsNotProcessed) the moment reporting even one more
// skip would itself exceed the budget, rather than growing forever.
export const MAX_FIXTURE_SET_ID_LENGTH = 256;
export const MAX_EXPORT_RECORD_IDS = 2000;

// What a value will actually cost once embedded as a SUBSTRING of the
// Lambda response's escaped `body` field, not just its own single
// JSON.stringify length — see MAX_EXPORT_RESPONSE_BYTES's comment. JSON
// string-escaping (quotes -> \", backslashes -> \\, control characters ->
// \n etc.) is additive over concatenation: escaping two pieces separately
// and concatenating the results is byte-for-byte identical to escaping
// their concatenation. That's what makes tracking a RUNNING total of each
// record's own call to this function exactly correct, not an
// approximation — the structural punctuation joining records (commas,
// brackets) needs no escaping either way, so it contributes the same byte
// count regardless; only PAYLOAD content (text, which may contain quotes
// or backslashes) is actually sensitive to this, and this measures that
// real cost directly. Exported for api/router.ts's final response-size
// guard, which needs the identical measurement.
export function responseEncodedByteLength(value: unknown): number {
  const singleEncoded = JSON.stringify(value);
  // JSON.stringify(aString) always wraps it in exactly one leading and one
  // trailing '"' before escaping its content — subtracting those 2 bytes
  // isolates just the escaped PAYLOAD length that would actually appear
  // embedded inside the outer body string.
  return Buffer.byteLength(JSON.stringify(singleEncoded), "utf8") - 2;
}

// Fixed structural overhead that genuinely IS constant: the handler's own
// {"statusCode":...,"headers":{...},"body":"..."} punctuation, the two
// outer quotes wrapping the whole body string, and the "manifest":{...}/
// "records":[...]/"recordsSkippedForResponseBudget":[...] key wrapping.
// Unlike the manifest's own CONTENT (budgeted for real below, since it
// embeds the caller-supplied fixtureSetId this constant must never be
// asked to cover), none of this is escaping-sensitive, so a real byte
// count isn't worth computing — deliberately generous, not optimistic.
const RESPONSE_STRUCTURAL_OVERHEAD_BYTES = 256;

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
  // Set only in the rare case where even ITEMIZING further skips would
  // itself exceed the budget — processing stops there rather than letting
  // recordsSkippedForResponseBudget grow without bound. `count` is how
  // many requested record ids, from that point on, were never evaluated
  // at all (not denied, not skipped — simply not reached). Never silently
  // dropped: this field is the honest record that they weren't.
  recordsNotProcessed: { reason: string; count: number } | null;
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
  // Defense in depth: the HTTP boundary (api/validation.ts's
  // validateExportBody) is the primary gate for both of these, but this
  // function is also called directly (scripts, tests) without ever
  // passing through it — these two reviewer-named inputs get checked
  // here too, so no caller can accidentally reproduce the finding this
  // guards against.
  if (fixtureSetId.length > MAX_FIXTURE_SET_ID_LENGTH) {
    throw new Error(`fixtureSetId is ${fixtureSetId.length} characters, over the ${MAX_FIXTURE_SET_ID_LENGTH}-character limit.`);
  }
  if (recordIds.length > MAX_EXPORT_RECORD_IDS) {
    throw new Error(`Requested ${recordIds.length} record ids, over the ${MAX_EXPORT_RECORD_IDS}-id limit for a single export call.`);
  }

  const records: ExportedRecordEnvelope[] = [];
  const recordsSkippedForResponseBudget: { recordId: string; reason: string }[] = [];
  let recordsNotProcessed: { reason: string; count: number } | null = null;
  const purpose: Purpose = scope === "public-redacted" ? "publication" : "preservation";
  // Deduplicate: repeating one id N times must never embed that record's
  // (and its media's) content N times in the response — a reviewer
  // reproduced a multi-megabyte export this way from a single real record.
  const uniqueRecordIds = [...new Set(recordIds)];
  // Shared across every record in this call, not reset per record — the
  // WHOLE-RESPONSE budget below. Measured in real SERIALIZED bytes (every
  // committed record's full encoded envelope), not raw object bytes.
  // Seeded from the manifest's OWN real encoded size — not a fixed
  // guess — because the manifest embeds the caller-supplied fixtureSetId
  // verbatim, which a fixed allowance can't account for. recordCount
  // isn't final yet, but uniqueRecordIds.length is the same or a
  // negligible few digits off, nowhere near enough to matter against a
  // multi-megabyte budget.
  let totalResponseBytes =
    RESPONSE_STRUCTURAL_OVERHEAD_BYTES +
    responseEncodedByteLength({
      manifestVersion: 1 as const,
      scope,
      exportedAt: new Date().toISOString(),
      fixtureSetId,
      recordCount: uniqueRecordIds.length,
    });

  for (let recordIndex = 0; recordIndex < uniqueRecordIds.length; recordIndex++) {
    const recordId = uniqueRecordIds[recordIndex];
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
        // Unlike text, base64's alphabet (A-Z a-z 0-9 + / =) contains no
        // quote or backslash characters, so it is NEVER inflated by the
        // re-escaping responseEncodedByteLength exists for — a single
        // encoding's length is already exact for this part.
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

    // The authoritative, whole-envelope gate: measures the REAL cost of
    // everything this record would add to the ACTUAL returned response —
    // title, summary, corrections, redactions, history, AND media, as it
    // will actually be re-escaped once wrapped as the Lambda response
    // body (see responseEncodedByteLength) — not an estimate of any one
    // part of it, and not just this object's own single encoding. A
    // record that would push the WHOLE response over budget is excluded
    // entirely (never trimmed down further here) and reported, same as
    // mediaObjectsSkipped.
    const envelopeBytes = responseEncodedByteLength(envelope);
    if (totalResponseBytes + envelopeBytes > MAX_EXPORT_RESPONSE_BYTES) {
      const skipEntry = {
        recordId,
        reason: `Skipped: this record's complete envelope (${envelopeBytes} bytes, as it would actually appear in the response) would exceed this export's ${MAX_EXPORT_RESPONSE_BYTES}-byte serialized-response budget (covers the full encoded response, not just media).`,
      };
      // The skip entry itself also lands in the final response — its own
      // cost counts against later records' remaining budget too, the same
      // "skipped-record reporting" a reviewer named as missing. But that
      // accounting alone isn't the fix: with enough requested records
      // almost all needing a skip entry, the REPORT ITSELF becomes a
      // second, unbounded source of the same overage (a reviewer
      // reproduced 7,097 skip entries this way). So this is also checked
      // BEFORE appending — if even this one more entry would exceed the
      // budget, stop processing entirely here rather than keep growing
      // the list past the same limit it exists to enforce.
      const skipEntryBytes = responseEncodedByteLength(skipEntry);
      if (totalResponseBytes + skipEntryBytes > MAX_EXPORT_RESPONSE_BYTES) {
        const remaining = uniqueRecordIds.length - recordIndex;
        recordsNotProcessed = {
          reason: `Stopped after evaluating ${recordIndex} of ${uniqueRecordIds.length} requested records: even reporting one more entry in recordsSkippedForResponseBudget would itself exceed this export's ${MAX_EXPORT_RESPONSE_BYTES}-byte serialized-response budget. The remaining ${remaining} record id(s), starting with "${recordId}", were never evaluated — request fewer records, or a narrower scope, and retry.`,
          count: remaining,
        };
        break;
      }
      totalResponseBytes += skipEntryBytes;
      recordsSkippedForResponseBudget.push(skipEntry);
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
    recordsNotProcessed,
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
  recordsNotProcessed?: { reason: string; count: number } | null;
};

export function toJsonl(exportData: PreservationExport): string {
  const manifestLine: ManifestLine = {
    ...exportData.manifest,
    recordsSkippedForResponseBudget: exportData.recordsSkippedForResponseBudget,
    recordsNotProcessed: exportData.recordsNotProcessed,
  };
  const lines = [JSON.stringify(manifestLine), ...exportData.records.map((r) => JSON.stringify(r))];
  return lines.join("\n") + "\n";
}

export function fromJsonl(jsonl: string): PreservationExport {
  const lines = jsonl.split("\n").filter((line) => line.trim().length > 0);
  const [manifestLine, ...recordLines] = lines;
  const { recordsSkippedForResponseBudget, recordsNotProcessed, ...manifest } = JSON.parse(manifestLine) as ManifestLine;
  const records = recordLines.map((line) => JSON.parse(line) as ExportedRecordEnvelope);
  // Defaulted, not required: older exports written before these fields
  // existed are still valid JSONL to restore from.
  return {
    manifest,
    records,
    recordsSkippedForResponseBudget: recordsSkippedForResponseBudget ?? [],
    recordsNotProcessed: recordsNotProcessed ?? null,
  };
}
