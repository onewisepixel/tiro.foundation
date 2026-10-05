// Core logic for migrating legacy (versionId: null) media references —
// extracted from backend/src/scripts/realLegacyMediaMigration.ts so it can
// be exercised against the in-memory fakes, not only against real AWS. A
// reviewer reproduced two real failures by running the script's logic
// against InMemoryFixtureStore/InMemoryMediaStore directly: (1) it would
// create and rebind media for a record already in the deletion workflow
// (custody "deletion-pending" or "deleted") just because the media
// reference happened to match the known placeholder signature — a
// recognizable placeholder does not by itself establish migration
// eligibility; (2) a failed custody-copy write could leave the record's
// MediaRef already pointing at a newly uploaded S3 object with NO
// CustodyCopy tracking it, so a later completeDeletion() would report
// success while that object survived untracked, outside the deletion
// workflow entirely (purgeMediaCustody, in services/lifecycle.ts, only
// ever learns what to purge from CustodyCopy rows).
//
// Both are fixed here: eligibility is checked against FRESH custody state
// immediately before any upload (never trusting a possibly-stale inventory
// snapshot), and the record's MediaRef rewrite plus its new CustodyCopy are
// written together via FixtureStore.putRecordWithCustodyCopy — one atomic
// DynamoDB transaction, never two separate writes. If the atomic write
// still fails AFTER the S3 upload already created real bytes, this cleans
// up that upload best-effort rather than leaving an orphaned, untracked
// object behind.
import type { CustodyStatus, MediaRef, RestrictionRegisterEntry } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { uuidv7 } from "../domain/id";

// The EXACT shape every known-placeholder legacy reference from this
// project's own fixture generator has — see fixtures/seed.ts's
// activeAuthorizedFixture(). Matched field-for-field, not fuzzy: anything
// that differs in even one field (a different objectKey a real upload
// might have used, a real-looking checksum, a different declared size) is
// NOT recognized, on purpose — a near-miss is exactly the case where
// guessing would be most tempting and most wrong.
export const KNOWN_PLACEHOLDER_SIGNATURE = {
  objectKey: "fixtures/active-authorized/dummy.txt",
  checksumSha256: "0".repeat(64),
  contentType: "text/plain",
  bytes: 128,
} as const;

export function isKnownPlaceholder(media: MediaRef): boolean {
  return (
    media.versionId === null &&
    media.objectKey === KNOWN_PLACEHOLDER_SIGNATURE.objectKey &&
    media.checksumSha256 === KNOWN_PLACEHOLDER_SIGNATURE.checksumSha256 &&
    media.contentType === KNOWN_PLACEHOLDER_SIGNATURE.contentType &&
    media.bytes === KNOWN_PLACEHOLDER_SIGNATURE.bytes
  );
}

// The exact deterministic content fixtures/media.ts's bindSeedMedia would
// have uploaded for this record's text MediaRef, had it been called
// instead of skipped. Reconstructed, not recovered — the placeholder was
// never backed by real bytes to begin with.
export function reconstructedPlaceholderContent(recordId: string): Buffer {
  return Buffer.from(`[SYNTHETIC] dummy text content for record ${recordId}.\n`);
}

// "deleted" is included, not just "deletion-pending": a record mid-way
// through deletion recovery (register already "deleted", physical record
// removal still pending — see completeDeletion's own partial-failure-resume
// state in services/lifecycle.ts) is just as ineligible as one still
// actively being purged.
export function isDeletionInProgress(custodyStatus: CustodyStatus | undefined): boolean {
  return custodyStatus === "deletion-pending" || custodyStatus === "deleted";
}

export type LegacyMediaClassification = "rebindable" | "no-trustworthy-origin" | "ineligible-deletion-in-progress";

export type LegacyMediaInventoryEntry = {
  recordId: string;
  mediaId: string;
  objectKey: string;
  bytes: number;
  checksumSha256: string;
  contentType: string;
  classification: LegacyMediaClassification;
  reason: string;
};

// Inventories every legacy MediaRef across the given register entries.
// Deliberately takes the register entries as a parameter (rather than
// calling registerStore.listAll() itself) — the caller already has them
// from the one full-table scan that enumerates every known recordId, and
// each entry's currentCustodyStatus is read from THAT SAME scan, at no
// extra DynamoDB cost. This inventory is a SNAPSHOT: apply-time eligibility
// is re-checked fresh against live state, never trusted from here alone.
export async function inventoryLegacyMedia(
  fixtureStore: FixtureStore,
  registerEntries: RestrictionRegisterEntry[],
  onProgress?: (recordId: string, index: number, total: number) => void,
): Promise<LegacyMediaInventoryEntry[]> {
  const inventory: LegacyMediaInventoryEntry[] = [];
  for (let i = 0; i < registerEntries.length; i++) {
    const entry = registerEntries[i];
    onProgress?.(entry.recordId, i, registerEntries.length);
    const record = await fixtureStore.getRecord(entry.recordId);
    if (!record) {
      continue; // Register entry with no corresponding record — not this module's concern.
    }
    for (const media of record.mediaRefs) {
      if (media.versionId !== null) {
        continue; // Already bound to a real S3 version — not legacy.
      }
      const base = {
        recordId: record.recordId,
        mediaId: media.mediaId,
        objectKey: media.objectKey,
        bytes: media.bytes,
        checksumSha256: media.checksumSha256,
        contentType: media.contentType,
      };
      // Checked BEFORE the signature match, deliberately: recognizing a
      // known placeholder does not by itself establish migration
      // eligibility (the reviewer's exact wording) — a record already in
      // the deletion workflow is ineligible regardless of what its media
      // looks like.
      if (isDeletionInProgress(entry.currentCustodyStatus)) {
        inventory.push({
          ...base,
          classification: "ineligible-deletion-in-progress",
          reason: `Custody status is "${entry.currentCustodyStatus}" — this record is in the deletion workflow. A recognizable placeholder signature does not establish migration eligibility on its own; rebinding media for a record that is being (or has been) deleted would create media outside that workflow's tracking. Left unavailable, matched or not.`,
        });
      } else if (isKnownPlaceholder(media)) {
        inventory.push({
          ...base,
          classification: "rebindable",
          reason: "Matches this project's known placeholder signature exactly — the deterministic synthetic content bindSeedMedia would have uploaded is reconstructable from the record id. Eligibility is re-checked fresh immediately before any upload.",
        });
      } else {
        inventory.push({
          ...base,
          classification: "no-trustworthy-origin",
          reason: "versionId is null but the reference does not match the known placeholder signature — no trustworthy known origin for its bytes. Stays unavailable; never guessed.",
        });
      }
    }
  }
  return inventory;
}

export type ApplyOutcome =
  | { outcome: "rebound"; recordId: string; mediaId: string; objectKey: string; versionId: string }
  | { outcome: "skipped-ineligible"; recordId: string; mediaId: string; reason: string }
  | { outcome: "failed"; recordId: string; mediaId: string; reason: string; cleanedUp: boolean };

// Applies ONE previously-inventoried "rebindable" item. Re-derives
// eligibility from a FRESH read of both the register and the record
// immediately before doing anything real — the inventory snapshot can be
// seconds to minutes stale by the time this actually runs (this stack's
// deliberately tiny, throttled table paces a full inventory at roughly one
// record every few seconds under load), and a record can move into the
// deletion workflow, or have its media reference changed, in that window.
export async function applyLegacyMediaRebind(
  item: Pick<LegacyMediaInventoryEntry, "recordId" | "mediaId">,
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
): Promise<ApplyOutcome> {
  const freshControl = await registerStore.getCurrent(item.recordId);
  if (isDeletionInProgress(freshControl?.currentCustodyStatus)) {
    return {
      outcome: "skipped-ineligible",
      recordId: item.recordId,
      mediaId: item.mediaId,
      reason: `Custody status is now "${freshControl?.currentCustodyStatus}" — the record entered the deletion workflow since the inventory was taken. Skipping without uploading anything.`,
    };
  }

  const freshRecord = await fixtureStore.getRecord(item.recordId);
  const freshMedia = freshRecord?.mediaRefs.find((m) => m.mediaId === item.mediaId);
  if (!freshRecord || !freshMedia || !isKnownPlaceholder(freshMedia)) {
    return {
      outcome: "skipped-ineligible",
      recordId: item.recordId,
      mediaId: item.mediaId,
      reason: "The record or its media reference changed since the inventory was taken and is no longer an exact signature match. Skipping without uploading anything.",
    };
  }

  const body = reconstructedPlaceholderContent(item.recordId);
  const key = `fixtures/legacy-migration/${item.recordId}/${item.mediaId}.txt`;
  const uploaded = await mediaStore.putObject(key, body, "text/plain");

  const updatedMediaRefs = freshRecord.mediaRefs.map((m) =>
    m.mediaId === item.mediaId
      ? { ...m, objectKey: key, bytes: uploaded.bytes, checksumSha256: uploaded.sha256, versionId: uploaded.versionId }
      : m,
  );

  try {
    // ATOMIC: the MediaRef rewrite and its CustodyCopy commit together or
    // not at all — see store.ts's interface comment for why this matters.
    await fixtureStore.putRecordWithCustodyCopy(
      { ...freshRecord, mediaRefs: updatedMediaRefs, updatedAt: new Date().toISOString() },
      freshRecord.version,
      {
        recordId: item.recordId,
        copyId: uuidv7(),
        location: "primary",
        objectVersionId: uploaded.versionId,
        mediaId: item.mediaId,
        createdAt: new Date().toISOString(),
        reconciledAt: null,
      },
    );
  } catch (error) {
    // The atomic write failed AFTER the upload already created real S3
    // bytes. Clean up best-effort — completeDeletion's purge only ever
    // learns what to purge from a CustodyCopy, which this object now will
    // never have, so leaving it in place would mean it survives forever,
    // outside the deletion workflow entirely, invisible to every normal
    // check in this system.
    let cleanedUp = false;
    try {
      await mediaStore.deleteObjectVersion(key, uploaded.versionId);
      cleanedUp = true;
    } catch {
      cleanedUp = false;
    }
    const baseReason = error instanceof Error ? error.message : String(error);
    const reason = cleanedUp
      ? `${baseReason} (the just-uploaded object at ${key} version ${uploaded.versionId} was cleaned up — nothing untracked survives)`
      : `${baseReason} (CLEANUP ALSO FAILED — an untracked object may remain at ${key} version ${uploaded.versionId}; this needs direct, manual investigation, not a silent retry)`;
    return { outcome: "failed", recordId: item.recordId, mediaId: item.mediaId, reason, cleanedUp };
  }

  return { outcome: "rebound", recordId: item.recordId, mediaId: item.mediaId, objectKey: key, versionId: uploaded.versionId };
}
