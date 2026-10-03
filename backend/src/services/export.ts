// Preservation export per docs/ethos.txt §3.10 and §7.
//
// Produces a versioned manifest + JSONL-ready records, each carrying its
// own provenance and consent/restriction/withdrawal state AS OF EXPORT TIME.
// That state is a snapshot, not a live link — this is exactly why restore
// (see restore.ts) must reconcile against the CURRENT restriction register
// rather than trusting anything in the export. An old export is expected to
// contain old, possibly since-revoked, state.
import type {
  AuthorityClaim,
  ConsentGrant,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  Purpose,
} from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import { evaluatePermission } from "./permissions";

export type ExportScope = "complete-preservation" | "public-redacted";

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

    records.push({
      record,
      authorityClaims: await fixtureStore.listAuthorityClaims(recordId),
      legalRights: await fixtureStore.listLegalRights(recordId),
      consentGrants:
        scope === "public-redacted" ? "redacted-for-public-export" : await fixtureStore.listConsentGrants(recordId),
      custodyCopies: await fixtureStore.listCustodyCopies(recordId),
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
