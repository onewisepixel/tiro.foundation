// The small, separately stored listing item behind GET /public/records.
//
// Why it exists (measured 2026-10-10, scripts/profilePublicReadPath.ts and
// the consolidated live drill): a public listing walk evaluated every
// preserved+published candidate by reading its full canonical RECORD item,
// and near-400 KB legacy records cost ~97 RCU per strongly consistent read.
// DynamoDB charges a read by the stored item's size, so projecting fewer
// attributes from the canonical record would not reduce that cost. A
// separate, bounded item can.
//
// What it is NOT: an eligibility marker or an authorization. It holds only
// what a /memories card displays. Whether it may be shown is decided by the
// same permission rules as every other read — current evidence, then the
// authoritative register read last — and the register's text and media
// redactions are applied to it before anything is returned
// (permissions.ts's evaluateListingSnapshot, publicView.ts's listing path).
//
// Maintained by the store layer, atomically with the canonical record:
// every RECORD write or delete also writes or deletes this item in the same
// transaction (store/dynamoStore.ts, store/memoryStore.ts), so creation,
// correction, redaction, media changes, restoration and deletion are all
// covered without each caller having to remember. Legacy records written
// before this existed get it from scripts/backfillPublicListingItems.ts.
import type { FixtureRecord, RestrictionRegisterEntry } from "../domain/types";

export const LISTING_ITEM_SCHEMA_VERSION = 1;
// Bounds in Unicode code points (never splitting a surrogate pair). Worst
// case stays under 4 KB as stored, so one strongly consistent read is
// 1 RCU — see publicListingItem.test.ts's size check.
export const LISTING_TITLE_MAX_CHARS = 160;
export const LISTING_SUMMARY_EXCERPT_MAX_CHARS = 240;
export const LISTING_MAX_MEDIA = 8;
export const LISTING_MAX_MEDIA_ID_CHARS = 64;
export const LISTING_MAX_CONTENT_TYPE_CHARS = 100;
export const LISTING_MAX_TIMESTAMP_CHARS = 40;

const REDACTED_PLACEHOLDER = "[REDACTED]";

export type ListingMediaRef = { mediaId: string; contentType: string; bytes: number };

export type PublicListingItem = {
  schemaVersion: typeof LISTING_ITEM_SCHEMA_VERSION;
  recordId: string;
  // The canonical record version this item was derived from.
  recordVersion: number;
  isSynthetic: true;
  title: string;
  titleTruncated: boolean;
  summaryExcerpt: string;
  summaryTruncated: boolean;
  media: ListingMediaRef[];
  // True when the record has media this item doesn't carry (over the count
  // bound, or a reference with an out-of-bounds id/type).
  mediaTruncated: boolean;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// What GET /public/records returns per item: the listing item after the
// register's redactions, minus storage-only fields.
export type PublicListingCard = {
  recordId: string;
  recordKind: "demo";
  title: string;
  titleTruncated: boolean;
  summaryExcerpt: string;
  summaryTruncated: boolean;
  media: ListingMediaRef[];
  mediaTruncated: boolean;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function codePoints(value: string): string[] {
  return Array.from(value);
}

function bounded(value: string, max: number): { text: string; truncated: boolean } {
  const chars = codePoints(value);
  return chars.length <= max ? { text: value, truncated: false } : { text: chars.slice(0, max).join(""), truncated: true };
}

function withinChars(value: unknown, max: number): value is string {
  return typeof value === "string" && codePoints(value).length <= max;
}

// `storedVersion` is the version the store is about to persist for this
// record (the store owns the version counter — see store.ts).
export function deriveListingItem(record: FixtureRecord, storedVersion: number): PublicListingItem {
  const title = bounded(record.title, LISTING_TITLE_MAX_CHARS);
  const summary = bounded(record.summary, LISTING_SUMMARY_EXCERPT_MAX_CHARS);
  const media: ListingMediaRef[] = [];
  let mediaTruncated = false;
  for (const ref of record.mediaRefs) {
    const fits =
      ref.mediaId.length > 0 &&
      withinChars(ref.mediaId, LISTING_MAX_MEDIA_ID_CHARS) &&
      withinChars(ref.contentType, LISTING_MAX_CONTENT_TYPE_CHARS) &&
      Number.isSafeInteger(ref.bytes) &&
      ref.bytes >= 0;
    if (!fits || media.length >= LISTING_MAX_MEDIA) {
      mediaTruncated = true;
      continue;
    }
    media.push({ mediaId: ref.mediaId, contentType: ref.contentType, bytes: ref.bytes });
  }
  return {
    schemaVersion: LISTING_ITEM_SCHEMA_VERSION,
    recordId: record.recordId,
    recordVersion: storedVersion,
    isSynthetic: record.isSynthetic,
    title: title.text,
    titleTruncated: title.truncated,
    summaryExcerpt: summary.text,
    summaryTruncated: summary.truncated,
    media,
    mediaTruncated,
    reviewedAt: record.reviewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Validates a stored item read back from the store. Returns a clean copy
// (unknown/storage-only attributes such as PK/SK are dropped), or null if
// anything is missing, malformed, out of bounds, not synthetic, or for a
// different record. Callers must treat null as "listing data unavailable",
// never as "nothing to list".
export function parseListingItem(raw: unknown, expectedRecordId: string): PublicListingItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (item.schemaVersion !== LISTING_ITEM_SCHEMA_VERSION) return null;
  if (item.recordId !== expectedRecordId) return null;
  if (typeof item.recordVersion !== "number" || !Number.isSafeInteger(item.recordVersion) || item.recordVersion < 1) return null;
  if (item.isSynthetic !== true) return null;
  if (!withinChars(item.title, LISTING_TITLE_MAX_CHARS) || typeof item.titleTruncated !== "boolean") return null;
  if (!withinChars(item.summaryExcerpt, LISTING_SUMMARY_EXCERPT_MAX_CHARS) || typeof item.summaryTruncated !== "boolean") return null;
  if (!Array.isArray(item.media) || item.media.length > LISTING_MAX_MEDIA || typeof item.mediaTruncated !== "boolean") return null;
  const media: ListingMediaRef[] = [];
  for (const entry of item.media as unknown[]) {
    if (typeof entry !== "object" || entry === null) return null;
    const m = entry as Record<string, unknown>;
    if (!withinChars(m.mediaId, LISTING_MAX_MEDIA_ID_CHARS) || (m.mediaId as string).length === 0) return null;
    if (!withinChars(m.contentType, LISTING_MAX_CONTENT_TYPE_CHARS)) return null;
    if (typeof m.bytes !== "number" || !Number.isSafeInteger(m.bytes) || m.bytes < 0) return null;
    media.push({ mediaId: m.mediaId as string, contentType: m.contentType as string, bytes: m.bytes });
  }
  if (!(item.reviewedAt === null || withinChars(item.reviewedAt, LISTING_MAX_TIMESTAMP_CHARS))) return null;
  if (!withinChars(item.createdAt, LISTING_MAX_TIMESTAMP_CHARS) || !withinChars(item.updatedAt, LISTING_MAX_TIMESTAMP_CHARS)) return null;
  return {
    schemaVersion: LISTING_ITEM_SCHEMA_VERSION,
    recordId: item.recordId as string,
    recordVersion: item.recordVersion,
    isSynthetic: true,
    title: item.title as string,
    titleTruncated: item.titleTruncated as boolean,
    summaryExcerpt: item.summaryExcerpt as string,
    summaryTruncated: item.summaryTruncated as boolean,
    media,
    mediaTruncated: item.mediaTruncated as boolean,
    reviewedAt: item.reviewedAt as string | null,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

// Applies the register snapshot's text and media redactions — the SAME
// snapshot the permission decision used — before anything leaves the
// backend. Register-driven, like redactionView.ts's applyTextRedactions: a
// stale or restored listing item can never un-redact a field.
export function toPublicListingCard(item: PublicListingItem, control: RestrictionRegisterEntry | null): PublicListingCard {
  const redactedFields = new Set(control?.redactedTextFields ?? []);
  const redactedMedia = new Set(control?.redactedMediaIds ?? []);
  const titleRedacted = redactedFields.has("title");
  const summaryRedacted = redactedFields.has("summary");
  return {
    recordId: item.recordId,
    recordKind: "demo",
    title: titleRedacted ? REDACTED_PLACEHOLDER : item.title,
    titleTruncated: titleRedacted ? false : item.titleTruncated,
    summaryExcerpt: summaryRedacted ? REDACTED_PLACEHOLDER : item.summaryExcerpt,
    summaryTruncated: summaryRedacted ? false : item.summaryTruncated,
    media: item.media.filter((m) => !redactedMedia.has(m.mediaId)),
    mediaTruncated: item.mediaTruncated,
    reviewedAt: item.reviewedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
