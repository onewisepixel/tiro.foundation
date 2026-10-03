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
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  Purpose,
} from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { evaluatePermission } from "./permissions";

export type ExportScope = "complete-preservation" | "public-redacted";

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
  const purpose: Purpose = scope === "public-redacted" ? "publication" : "preservation";

  for (const recordId of recordIds) {
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
        for (const media of record.mediaRefs) {
          if (!media.versionId) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Legacy reference has no bound S3 version." });
            continue;
          }
          const object = await mediaStore.getObject(media.objectKey, media.versionId);
          if (!object) {
            mediaObjectsSkipped.push({ mediaId: media.mediaId, reason: "Bound version no longer exists in storage." });
            continue;
          }
          fetched.push({ mediaId: media.mediaId, base64: object.body.toString("base64") });
        }
        mediaObjects = fetched;
      }
    }

    records.push({
      record,
      authorityClaims: await fixtureStore.listAuthorityClaims(recordId),
      legalRights: await fixtureStore.listLegalRights(recordId),
      consentGrants:
        scope === "public-redacted" ? "redacted-for-public-export" : await fixtureStore.listConsentGrants(recordId),
      custodyCopies: await fixtureStore.listCustodyCopies(recordId),
      auditReceipts: await fixtureStore.listAuditReceipts(recordId),
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
    });
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
  };
}

// JSONL serialization: manifest line first, then one record envelope per line.
export function toJsonl(exportData: PreservationExport): string {
  const lines = [JSON.stringify(exportData.manifest), ...exportData.records.map((r) => JSON.stringify(r))];
  return lines.join("\n") + "\n";
}

export function fromJsonl(jsonl: string): PreservationExport {
  const lines = jsonl.split("\n").filter((line) => line.trim().length > 0);
  const [manifestLine, ...recordLines] = lines;
  const manifest = JSON.parse(manifestLine) as PreservationExportManifest;
  const records = recordLines.map((line) => JSON.parse(line) as ExportedRecordEnvelope);
  return { manifest, records };
}
