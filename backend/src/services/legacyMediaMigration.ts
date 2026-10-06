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
// written together via a CustodyCopyCommitter — one atomic DynamoDB
// transaction, never two separate writes.
//
// A SECOND review round reproduced two further real failures:
//
// 3. Migration can still race deletion. Even with the fresh check and the
//    atomic record+copy write, startDeletion() AND completeDeletion() can
//    run to full completion ENTIRELY in the gap between the fresh check
//    and the write landing — uploading real bytes to S3 takes real
//    wall-clock time, and that gap is exactly the window. Fixed by
//    replacing the plain FixtureStore.putRecordWithCustodyCopy write with
//    CustodyCopyCommitter.commitIfNotDeleting (store.ts), which asserts
//    the register's custody status as PART OF the same atomic transaction
//    the record+copy write belongs to — not a separate, earlier read.
//    (completeDeletion's own custody-copy reads were ALSO fixed, in
//    dynamoStore.ts, to be strongly consistent — closing the matching
//    read-side gap: an eventually consistent read could otherwise miss a
//    copy this module just committed, even once it's causally ordered
//    correctly.)
// 4. Cleanup can destroy a successful binding. If the atomic write ACTUALLY
//    commits on the server but the client never receives a successful
//    response (a timeout, a dropped connection after the server
//    processed it), the previous code treated ANY error as "didn't
//    commit" and deleted the just-uploaded object — leaving the
//    ALREADY-COMMITTED record+copy pointing at now-missing media. Fixed
//    by resolving the uncertainty BEFORE cleaning anything up: on any
//    error, re-read the record fresh; if it already reflects the
//    attempted write, treat this as the success it actually was (the same
//    idempotent-recovery idiom used throughout services/lifecycle.ts) and
//    never touch the uploaded object. Cleanup only proceeds once the
//    record is confirmed to NOT reflect the write.
import type { CustodyStatus, FixtureRecord, MediaRef, RestrictionRegisterEntry } from "../domain/types";
import type { CustodyCopyCommitter, FixtureStore, RestrictionRegisterStore } from "../store/store";
import { DeletionInProgressError } from "../store/store";
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
  | { outcome: "skipped-ineligible"; recordId: string; mediaId: string; reason: string; cleanedUp?: boolean }
  | { outcome: "failed"; recordId: string; mediaId: string; reason: string; cleanedUp: boolean };

function recordReflectsUpload(record: FixtureRecord | null, mediaId: string, versionId: string): boolean {
  return record?.mediaRefs.find((m) => m.mediaId === mediaId)?.versionId === versionId;
}

// Best-effort: deletes the just-uploaded S3 object and reports whether
// that succeeded. Only ever called once the record has been CONFIRMED to
// not reflect the attempted write (see recordReflectsUpload above) —
// never on the strength of an error alone, which can be a false signal
// (see the module header's second finding).
async function cleanupOrphanedUpload(mediaStore: MediaStore, key: string, versionId: string): Promise<boolean> {
  try {
    await mediaStore.deleteObjectVersion(key, versionId);
    return true;
  } catch {
    return false;
  }
}

// Applies ONE previously-inventoried "rebindable" item. The EARLY fresh
// custody/signature check below is a fast path only — it avoids an S3
// upload and a doomed transaction attempt in the common case where a
// record is ALREADY ineligible, but it is NOT what makes this safe against
// deletion racing the upload: that guarantee comes from
// CustodyCopyCommitter.commitIfNotDeleting's single atomic transaction,
// which re-asserts custody at the exact commit instant, not from this
// earlier read (see the module header for why the earlier read alone
// cannot close that gap — real time passes during the S3 upload).
export async function applyLegacyMediaRebind(
  item: Pick<LegacyMediaInventoryEntry, "recordId" | "mediaId">,
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  custodyCopyCommitter: CustodyCopyCommitter,
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
    // ATOMIC, and guarded by live custody state as part of the SAME
    // transaction — see store.ts's CustodyCopyCommitter interface comment.
    await custodyCopyCommitter.commitIfNotDeleting(
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
    // The write failed — or at least, the client was TOLD it failed. That
    // is not the same thing as "nothing committed": a timeout or a
    // dropped connection can report failure even after the server
    // actually applied the transaction. Before touching S3, resolve this
    // uncertainty the same way the rest of this codebase does (compare
    // services/lifecycle.ts's getCorrection/getRedaction idempotent-replay
    // checks) — re-read the record fresh and see whether it already
    // reflects the write we just attempted.
    const recheck = await fixtureStore.getRecord(item.recordId);
    if (recordReflectsUpload(recheck, item.mediaId, uploaded.versionId)) {
      // It actually committed. The error was a false failure signal —
      // reporting this as "failed" and deleting the object we just bound
      // would destroy a successful, already-live binding.
      return { outcome: "rebound", recordId: item.recordId, mediaId: item.mediaId, objectKey: key, versionId: uploaded.versionId };
    }

    // Confirmed: it genuinely did not commit. Safe to clean up now.
    const cleanedUp = await cleanupOrphanedUpload(mediaStore, key, uploaded.versionId);
    const baseMessage = error instanceof Error ? error.message : String(error);
    const cleanupNote = cleanedUp
      ? `the just-uploaded object at ${key} version ${uploaded.versionId} was cleaned up — nothing untracked survives`
      : `CLEANUP ALSO FAILED — an untracked object may remain at ${key} version ${uploaded.versionId}; this needs direct, manual investigation, not a silent retry`;

    if (error instanceof DeletionInProgressError) {
      return {
        outcome: "skipped-ineligible",
        recordId: item.recordId,
        mediaId: item.mediaId,
        reason: `${baseMessage} (${cleanupNote})`,
        cleanedUp,
      };
    }
    return { outcome: "failed", recordId: item.recordId, mediaId: item.mediaId, reason: `${baseMessage} (${cleanupNote})`, cleanedUp };
  }

  return { outcome: "rebound", recordId: item.recordId, mediaId: item.mediaId, objectKey: key, versionId: uploaded.versionId };
}
