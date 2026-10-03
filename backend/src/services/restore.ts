// Restoration per docs/ethos.txt §6 and §7 — this is the file the central
// acceptance test in backend/src/services/restore.test.ts exercises.
//
// THE RULE: importing an export writes only into the target FixtureStore.
// It NEVER writes to the RestrictionRegisterStore. Reconciliation then
// checks every imported record against the CURRENT register — which, if
// this restore is replaying an old backup taken before a later withdrawal,
// still reflects that withdrawal, because nothing in this file ever touched
// it. An old grant is never treated as current authorization.
import { createHash } from "node:crypto";
import type { ExportedRecordEnvelope, PreservationExport } from "./export";
import type { ConsentGrant, Purpose } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { evaluatePermission } from "./permissions";

export type ImportValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

// Synchronous/pure on purpose (base64 decode + hashing need no I/O) — this
// is the single gate importExport always runs before writing anything,
// whether or not a targetMediaStore is involved.
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
      // Format check: 64 hex characters.
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
    // Byte-level check (Finding 5b, closed): for every media object this
    // envelope actually carries bytes for, decode and re-hash them and
    // compare against the record's own recorded length/checksum — a
    // mismatch means the package was tampered with (or corrupted) between
    // export and import, and is rejected outright rather than imported.
    if (envelope.mediaObjects !== "omitted-for-public-export") {
      for (const object of envelope.mediaObjects) {
        const media = envelope.record.mediaRefs.find((m) => m.mediaId === object.mediaId);
        if (!media) {
          return {
            ok: false,
            reason: `Media object ${object.mediaId} on record ${envelope.record.recordId} does not correspond to any MediaRef on the record.`,
          };
        }
        let decoded: Buffer;
        try {
          decoded = Buffer.from(object.base64, "base64");
        } catch {
          return { ok: false, reason: `Media object ${object.mediaId} on record ${envelope.record.recordId} is not valid base64.` };
        }
        if (decoded.length !== media.bytes) {
          return {
            ok: false,
            reason: `Media object ${object.mediaId} on record ${envelope.record.recordId} is ${decoded.length} bytes, but the record declares ${media.bytes} — possible tampering.`,
          };
        }
        const actualSha256 = createHash("sha256").update(decoded).digest("hex");
        if (actualSha256 !== media.checksumSha256) {
          return {
            ok: false,
            reason: `Media object ${object.mediaId} on record ${envelope.record.recordId} fails its SHA-256 check — possible tampering.`,
          };
        }
      }
    }
  }
  return { ok: true };
}

export type RestoredRecordStatus = {
  recordId: string;
  // What the export said at the time it was taken.
  exportedPublicationStatus: string | null;
  // What the CURRENT restriction register says right now — diagnostic only;
  // NOT what servable is computed from (see below).
  currentPublicationStatus: string | null;
  currentCustodyStatus: string | null;
  // The actual, scoped evaluatePermission() decision for the requested
  // purpose/audience, run against the RESTORED store + the CURRENT register —
  // never a looser record-state-only approximation of it. This is the same
  // decision a live permission check would produce; the two can never
  // disagree, because this IS that decision, not a separate reimplementation
  // of it. (Previously this field was computed from publicationStatus/
  // custodyStatus alone, which missed grant-level revocation — a revoked
  // consent grant's restored row still looked unrevoked, so reconciliation
  // said servable:true while evaluatePermission correctly said denied.)
  servable: boolean;
  reason: string;
};

// Writes record data into the target store. Deliberately takes only a
// FixtureStore (plus an OPTIONAL target MediaStore) — there is no
// RestrictionRegisterStore parameter here, because this function must be
// structurally incapable of writing to it.
export type ImportResult = {
  imported: number;
  // Per-record media rebinding outcome, only populated when
  // targetMediaStore is provided — otherwise every record's media stays
  // bound to whatever versionId the export recorded, which is meaningless
  // once restored into an isolated target that was never uploaded to.
  mediaRebound: { recordId: string; mediaId: string; versionId: string }[];
};

export async function importExport(
  target: FixtureStore,
  exportData: PreservationExport,
  targetMediaStore?: MediaStore,
): Promise<ImportResult> {
  const validation = validateExport(exportData);
  if (!validation.ok) {
    throw new Error(`Rejecting import: ${validation.reason}`);
  }

  let imported = 0;
  const mediaRebound: ImportResult["mediaRebound"] = [];
  for (const envelope of exportData.records) {
    // Re-upload each exported media object into the ISOLATED target's own
    // media store and rebind the record's MediaRef to the version THAT
    // upload produced — the export's original versionId means nothing in a
    // target that never received that upload. A restored record's media
    // is only ever servable via a version this exact import created.
    const record = { ...envelope.record, mediaRefs: envelope.record.mediaRefs.map((m) => ({ ...m })) };
    if (targetMediaStore && envelope.mediaObjects !== "omitted-for-public-export") {
      for (const object of envelope.mediaObjects) {
        const media = record.mediaRefs.find((m) => m.mediaId === object.mediaId);
        if (!media) continue; // validateExport already rejects this case; defensive only.
        const uploaded = await targetMediaStore.putObject(
          media.objectKey,
          Buffer.from(object.base64, "base64"),
          media.contentType,
        );
        media.versionId = uploaded.versionId;
        mediaRebound.push({ recordId: record.recordId, mediaId: media.mediaId, versionId: uploaded.versionId });
      }
    }

    // Upsert: a fresh target has no existing record (existing is
    // undefined, matching putRecord's "must not already exist" contract);
    // restoring into a store that already has the record overwrites it at
    // its current version instead. Either way, only the target FixtureStore
    // (and, now, its media store) is touched — never the restriction
    // register.
    const existingRecord = await target.getRecord(record.recordId);
    await target.putRecord(record, existingRecord?.version);
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
  return { imported, mediaRebound };
}

// The reconciliation step. Call this before permitting ANY serving of
// restored content — never rely on a successful import alone.
//
// restoredStore MUST be the store the restored content was actually imported
// into (importExport's target) — servable is evaluatePermission's decision
// against THAT data plus the live register, so it reflects exactly what
// would happen if this restored content were served, including grant-level
// revocation that a record-state-only check would miss.
export async function reconcileRestoredRecords(
  restoredStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  envelopes: ExportedRecordEnvelope[],
  query: { purpose: Purpose; audience: ConsentGrant["audience"]; now?: Date },
): Promise<RestoredRecordStatus[]> {
  const now = query.now ?? new Date();
  const results: RestoredRecordStatus[] = [];

  for (const envelope of envelopes) {
    const recordId = envelope.record.recordId;
    const current = await registerStore.getCurrent(recordId);
    const decision = await evaluatePermission(restoredStore, registerStore, {
      recordId,
      purpose: query.purpose,
      audience: query.audience,
      now,
    });

    results.push({
      recordId,
      exportedPublicationStatus: envelope.controlStateAtExport?.publicationStatus ?? null,
      currentPublicationStatus: current?.currentPublicationStatus ?? null,
      currentCustodyStatus: current?.currentCustodyStatus ?? null,
      servable: decision.allowed,
      reason: decision.allowed
        ? decision.reason
        : `${decision.reason} (regardless of exported state).`,
    });
  }

  return results;
}
