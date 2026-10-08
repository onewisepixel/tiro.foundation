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

export type PublicMemoryListing = {
  items: PublicMemoryRecord[];
  nextCursor: string | null;
};

// Distinguishes a fetch that failed/errored (backend unreachable, bad
// response) from one that succeeded with zero results — the frontend must
// render these differently ("temporarily unavailable" vs "nothing
// published yet"), never conflate them.
export type PublicMemoryListingResult = { ok: true; listing: PublicMemoryListing } | { ok: false };

export type PublicMemoryRecordResult = { ok: true; record: PublicMemoryRecord } | { ok: false; status: number };

function baseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL;
  return value ? value.replace(/\/+$/, "") : null;
}

export async function fetchPublicMemoryListing(params: { limit?: number; cursor?: string | null } = {}): Promise<PublicMemoryListingResult> {
  const base = baseUrl();
  if (!base) {
    return { ok: false };
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
      return { ok: false };
    }
    const listing = (await response.json()) as PublicMemoryListing;
    return { ok: true, listing };
  } catch {
    return { ok: false };
  }
}

export async function fetchPublicMemoryRecord(recordId: string): Promise<PublicMemoryRecordResult> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, status: 0 };
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
