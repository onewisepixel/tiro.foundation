// Thin client for the backend's public, unauthenticated Memory API
// (backend/src/api/router.ts's GET /public/records routes). Deliberately a
// NARROW type of its own — PublicMemoryRecord mirrors the backend's
// PublicMemoryView exactly, never the much wider display-only MemoryRecord
// (src/data/memories.ts) — the backend has no honest way to populate most
// of that type's fields (location/era/tags/transcript/etc.) without
// fabricating content.
//
// NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL is a PUBLIC env var by necessity:
// publicMemoryMediaSrc() builds URLs for <img>/<audio>/<video> src
// attributes, which the browser resolves directly — there is no server-only
// alternative. This is consistent with the backend route's own design
// (anonymous, any-origin access already enabled via CORS).
export type PublicMemoryMediaRef = {
  mediaId: string;
  contentType: string;
  bytes: number;
};

export type PublicMemoryRecord = {
  recordId: string;
  recordKind: "demo";
  title: string;
  summary: string;
  provenanceRef: string;
  media: PublicMemoryMediaRef[];
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// One GET /public/records item: the backend's PublicListingCard
// (backend/src/services/publicListingItem.ts). Built from a small, bounded
// listing item rather than the full record, so the summary is an excerpt;
// the detail page (PublicMemoryRecord) carries the full text.
export type PublicMemoryListingCard = {
  recordId: string;
  recordKind: "demo";
  title: string;
  titleTruncated: boolean;
  summaryExcerpt: string;
  summaryTruncated: boolean;
  media: PublicMemoryMediaRef[];
  mediaTruncated: boolean;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicMemoryListing = {
  items: PublicMemoryListingCard[];
  nextCursor: string | null;
  // True when at least one candidate on this page could not be checked
  // (backend services/publicView.ts's readPublicListing) — the page is
  // INCOMPLETE, and the UI must say so rather than present it as the
  // whole slice. Normalized to true unless the backend explicitly sent
  // false: a missing field is not evidence every candidate was checked.
  hadFailures: boolean;
};

// Distinguishes a fetch that failed/errored (backend unreachable, bad
// response) from one that succeeded with zero results — the frontend must
// render these differently ("temporarily unavailable" vs "nothing
// published yet"), never conflate them. And both from a site where live
// records are not enabled at all (no NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL):
// a deliberate state, not an outage, and described as one (decision 44).
export type PublicMemoryListingResult = { ok: true; listing: PublicMemoryListing } | { ok: false; reason: "disabled" | "unavailable" };

export type PublicMemoryRecordResult = { ok: true; record: PublicMemoryRecord } | { ok: false; status: number; disabled?: true };

function baseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL;
  return value ? value.replace(/\/+$/, "") : null;
}

// Whether this deployment shows backend-connected records at all. Enabling
// them for public display is a founder decision (decision 44), made by
// configuring the base URL; nothing here enables them.
export const publicRecordsEnabled = () => baseUrl() !== null;

export async function fetchPublicMemoryListing(params: { limit?: number; cursor?: string | null } = {}): Promise<PublicMemoryListingResult> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, reason: "disabled" };
  }
  const url = new URL(`${base}/public/records`);
  if (params.limit) {
    url.searchParams.set("limit", String(params.limit));
  }
  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }
  try {
    // cache: "no-store" — belt-and-suspenders alongside the calling page's
    // own `export const dynamic = "force-dynamic"`; redundant with the
    // Previous Model's default-uncached fetch() behavior, but
    // self-documenting.
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }
    const body = (await response.json()) as Omit<PublicMemoryListing, "hadFailures"> & { hadFailures?: unknown };
    return { ok: true, listing: { items: body.items, nextCursor: body.nextCursor, hadFailures: body.hadFailures !== false } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function fetchPublicMemoryRecord(recordId: string): Promise<PublicMemoryRecordResult> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, status: 0, disabled: true };
  }
  try {
    const response = await fetch(`${base}/public/records/${encodeURIComponent(recordId)}`, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const record = (await response.json()) as PublicMemoryRecord;
    return { ok: true, record };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function publicMemoryMediaSrc(recordId: string, mediaId: string): string | null {
  const base = baseUrl();
  if (!base) {
    return null;
  }
  return `${base}/public/records/${encodeURIComponent(recordId)}/media/${encodeURIComponent(mediaId)}`;
}
