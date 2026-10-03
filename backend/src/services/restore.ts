// Restoration per docs/ethos.txt §6 and §7 — this is the file the central
// acceptance test in backend/src/services/restore.test.ts exercises.
//
// THE RULE: importing an export writes only into the target FixtureStore.
// It NEVER writes to the RestrictionRegisterStore. Reconciliation then
// checks every imported record against the CURRENT register — which, if
// this restore is replaying an old backup taken before a later withdrawal,
// still reflects that withdrawal, because nothing in this file ever touched
// it. An old grant is never treated as current authorization.
import type { ExportedRecordEnvelope, PreservationExport } from "./export";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";

export type ImportValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateExport(exportData: PreservationExport): ImportValidationResult {
  if (exportData.manifest.manifestVersion !== 1) {
    return { ok: false, reason: `Unsupported manifest version ${exportData.manifest.manifestVersion}.` };
  }
  if (exportData.records.length !== exportData.manifest.recordCount) {
    return {
      ok: false,
      reason: `Manifest declares ${exportData.manifest.recordCount} records but ${exportData.records.length} were present.`,
    };
  }
  for (const envelope of exportData.records) {
    for (const media of envelope.record.mediaRefs) {
      // Format-only check: 64 hex characters. This does NOT verify the
      // checksum against actual media bytes — no media bytes flow through
      // export/import in this pass (validateExport is synchronous/pure, no
      // I/O), so byte-level verification remains a separate, unclosed gap.
      // See Finding 5b / docs/backend/evidence-matrix.md.
      if (!/^[0-9a-f]{64}$/i.test(media.checksumSha256)) {
        return {
          ok: false,
          reason: `Media ${media.mediaId} on record ${envelope.record.recordId} has an invalid or missing SHA-256 checksum.`,
        };
      }
    }
    if (!envelope.record.isSynthetic) {
      return { ok: false, reason: `Record ${envelope.record.recordId} is not marked synthetic; refusing import in fixture-only mode.` };
    }
  }
  return { ok: true };
}

export type RestoredRecordStatus = {
  recordId: string;
  // What the export said at the time it was taken.
  exportedPublicationStatus: string | null;
  // What the CURRENT restriction register says right now.
  currentPublicationStatus: string | null;
  currentCustodyStatus: string | null;
  // Whether this restored record may actually be served, per current
  // control state — NEVER per the exported snapshot.
  servable: boolean;
  reason: string;
};

// Writes record data into the target store. Deliberately takes only a
// FixtureStore — there is no RestrictionRegisterStore parameter here,
// because this function must be structurally incapable of writing to it.
export async function importExport(
  target: FixtureStore,
  exportData: PreservationExport,
): Promise<{ imported: number }> {
  const validation = validateExport(exportData);
  if (!validation.ok) {
    throw new Error(`Rejecting import: ${validation.reason}`);
  }

  let imported = 0;
  for (const envelope of exportData.records) {
    // Upsert: a fresh target has no existing record (existing is
    // undefined, matching putRecord's "must not already exist" contract);
    // restoring into a store that already has the record overwrites it at
    // its current version instead. Either way, only the target FixtureStore
    // is touched — never the restriction register.
    const existingRecord = await target.getRecord(envelope.record.recordId);
    await target.putRecord(envelope.record, existingRecord?.version);
    for (const claim of envelope.authorityClaims) {
      await target.putAuthorityClaim(claim);
    }
    for (const right of envelope.legalRights) {
      await target.putLegalRight(right);
    }
    if (envelope.consentGrants !== "redacted-for-public-export") {
      for (const grant of envelope.consentGrants) {
        const existing = (await target.listConsentGrants(grant.recordId)).find(
          (g) => g.consentId === grant.consentId,
        );
        await target.putConsentGrant(grant, existing?.version);
      }
    }
    for (const copy of envelope.custodyCopies) {
      await target.putCustodyCopy(copy);
    }
    imported += 1;
  }
  return { imported };
}

// The reconciliation step. Call this before permitting ANY serving of
// restored content — never rely on a successful import alone.
export async function reconcileRestoredRecords(
  registerStore: RestrictionRegisterStore,
  envelopes: ExportedRecordEnvelope[],
): Promise<RestoredRecordStatus[]> {
  const results: RestoredRecordStatus[] = [];

  for (const envelope of envelopes) {
    const recordId = envelope.record.recordId;
    const current = await registerStore.getCurrent(recordId);

    if (!current) {
      results.push({
        recordId,
        exportedPublicationStatus: envelope.controlStateAtExport?.publicationStatus ?? null,
        currentPublicationStatus: null,
        currentCustodyStatus: null,
        servable: false,
        reason: "No current restriction-register entry; missing control state denies serving.",
      });
      continue;
    }

    const blockedByCustody = current.currentCustodyStatus === "deleted" || current.currentCustodyStatus === "deletion-pending";
    const blockedByPublication = current.currentPublicationStatus !== "published";

    const servable = !blockedByCustody && !blockedByPublication;

    results.push({
      recordId,
      exportedPublicationStatus: envelope.controlStateAtExport?.publicationStatus ?? null,
      currentPublicationStatus: current.currentPublicationStatus,
      currentCustodyStatus: current.currentCustodyStatus,
      servable,
      reason: servable
        ? "Current control state permits serving."
        : `Current control state denies serving (publication: ${current.currentPublicationStatus}, custody: ${current.currentCustodyStatus}), regardless of exported state.`,
    });
  }

  return results;
}
