// Read-side views for the public, unauthenticated Memory site —
// api/router.ts's GET /public/records, GET /public/records/:recordId, and
// GET /public/records/:recordId/media/:mediaId. Kept separate from
// router.ts the same way intakeViews.ts is kept separate from its route
// handlers.
//
// Hard rule, unconditional, never caller-overridable: every function here
// evaluates permission for EXACTLY purpose "publication" and audience
// "public" — never from a query parameter, never from any other caller
// input. This is the server-side enforcement the public-site milestone
// exists to provide; a route that let a caller pick its own purpose/
// audience here would defeat the entire point.
//
// A denied record and a genuinely nonexistent one are indistinguishable to
// every function here (both return null / a flat 404) — an anonymous
// caller has no legitimate reason to learn "this exists but was denied,"
// which the staff-only limited-metadata view (api/router.ts's authenticated
// GET /records/:recordId) exists to serve for a different audience with a
// different, legitimate need.
import type { FixtureRecord } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { decodePublicCursor, encodePublicCursor } from "./cursorCodec";
import { fetchAuthorizedMedia, type MediaFetchResult } from "./media";
import { evaluatePermission } from "./permissions";
import { applyTextRedactions } from "./redactionView";

export type PublicMediaRef = {
  mediaId: string;
  contentType: string;
  bytes: number;
};

export type PublicMemoryView = {
  recordId: string;
  // Every record this backend can ever serve is synthetic (domain/types.ts:
  // isSynthetic is mandatory and always true) — present as a literal so the
  // frontend can compose with the mandated demonstration-notice mechanism
  // without re-deriving it from anything else.
  recordKind: "demo";
  title: string;
  summary: string;
  provenanceRef: string;
  media: PublicMediaRef[];
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toPublicView(record: FixtureRecord, media: PublicMediaRef[]): PublicMemoryView {
  return {
    recordId: record.recordId,
    recordKind: "demo",
    title: record.title,
    summary: record.summary,
    provenanceRef: record.provenanceRef,
    media,
    reviewedAt: record.reviewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function readPublicRecord(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  recordId: string,
): Promise<PublicMemoryView | null> {
  const record = await fixtureStore.getRecord(recordId);
  if (!record || !record.isSynthetic) {
    return null;
  }
  // One evaluatePermission call; its returned decision.control is the
  // SAME snapshot used for every masking decision below — never a second,
  // separately-timed register read. See permissions.ts's own docstring for
  // why that matters.
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  if (!decision.allowed) {
    return null;
  }
  const masked = applyTextRedactions(record, decision.control);
  const redactedMediaIds = new Set(decision.control?.redactedMediaIds ?? []);
  const media: PublicMediaRef[] = masked.mediaRefs
    .filter((m) => !redactedMediaIds.has(m.mediaId))
    .map((m) => ({ mediaId: m.mediaId, contentType: m.contentType, bytes: m.bytes }));
  return toPublicView(masked, media);
}

// Deliberately small, concrete budgets — see docs/backend's milestone plan
// for the full reasoning. Any one being exhausted stops the loop in
// readPublicListing below (returning whatever was collected, plus a
// continuation cursor) — never an error, and never an unbounded scan.
export const PUBLIC_LISTING_RAW_PAGE_SIZE = 25;
export const PUBLIC_LISTING_MAX_RAW_ROWS = 200;
export const PUBLIC_LISTING_MAX_EVALUATIONS = 40;
export const PUBLIC_LISTING_TIME_BUDGET_MS = 7000;

export type PublicListingResult = { items: PublicMemoryView[]; nextCursor: string | null };

export async function readPublicListing(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  query: { limit: number; cursor: string | null },
): Promise<PublicListingResult> {
  const startedAt = Date.now();
  // Decoded ONCE, at the boundary — everywhere else in this function deals
  // in the plain, unencrypted recordId-based resume key RestrictionRegisterStore
  // itself understands. Throws InvalidCursorError (caught by router.ts) on
  // a tampered or malformed cursor — never silently treated as page one.
  let resumeKey: string | null = query.cursor ? decodePublicCursor(query.cursor) : null;
  const items: PublicMemoryView[] = [];
  let rowsExamined = 0;
  let evaluations = 0;
  let exhausted = false;

  const budgetExceeded = () =>
    items.length >= query.limit ||
    rowsExamined >= PUBLIC_LISTING_MAX_RAW_ROWS ||
    evaluations >= PUBLIC_LISTING_MAX_EVALUATIONS ||
    Date.now() - startedAt >= PUBLIC_LISTING_TIME_BUDGET_MS;

  while (!budgetExceeded()) {
    const page = await registerStore.listPage({ limit: PUBLIC_LISTING_RAW_PAGE_SIZE, cursor: resumeKey });
    if (page.entries.length === 0) {
      exhausted = page.nextCursor === null;
      if (exhausted) break;
      resumeKey = page.nextCursor;
      continue;
    }

    for (const entry of page.entries) {
      // Checked BEFORE considering this row — resumeKey still points to the
      // last row actually finished, so stopping here never skips this row:
      // the next call resumes exactly here, re-examining it.
      if (budgetExceeded()) break;
      rowsExamined++;
      // Cheap pre-filter from the scan's own already-free fields (the same
      // idiom intakeViews.ts's readIntakeQueue uses) before ever calling
      // the real, authoritative, multi-read evaluatePermission.
      if (entry.currentCustodyStatus === "preserved" && entry.currentPublicationStatus === "published") {
        evaluations++;
        const view = await readPublicRecord(fixtureStore, registerStore, entry.recordId);
        if (view) {
          items.push(view);
        }
      }
      // Marked as fully examined only now, after the row has actually been
      // pre-filtered (and, if applicable, evaluated) — never before.
      resumeKey = entry.recordId;
    }

    if (budgetExceeded()) {
      break;
    }
    if (page.nextCursor === null) {
      exhausted = true;
      break;
    }
    // Page fully consumed without hitting any budget: resumeKey already
    // equals page.nextCursor (DynamoDB's LastEvaluatedKey IS the key of the
    // last row actually scanned) — loop to fetch the next raw page.
  }

  // encodePublicCursor(null) faithfully round-trips as "resume from the
  // start" — needed for the edge case where a budget is exhausted before
  // even the first row of the first page was examined (resumeKey never
  // advances past its initial null), which must NOT be reported as
  // exhausted just because resumeKey happens to still be null.
  return { items, nextCursor: exhausted ? null : encodePublicCursor(resumeKey) };
}

// Same eligibility gate as readPublicRecord (isSynthetic, then the
// hardcoded publication/public evaluatePermission call via the unmodified
// fetchAuthorizedMedia), plus one normalization fetchAuthorizedMedia alone
// doesn't do: a denied-but-existing record (403) and a genuinely missing
// one (404) are collapsed into the SAME flat 404 here. 409 ("no bound S3
// version"), 413 (size cap), and 500 (checksum mismatch) pass through
// unchanged — those only ever occur AFTER authorization already succeeded,
// so they disclose nothing about access that isn't already known.
export async function fetchPublicMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  query: { recordId: string; mediaId: string; now?: Date },
): Promise<MediaFetchResult> {
  const record = await fixtureStore.getRecord(query.recordId);
  if (!record || !record.isSynthetic) {
    return { ok: false, statusCode: 404, reason: "Not found." };
  }
  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: query.recordId,
    mediaId: query.mediaId,
    purpose: "publication",
    audience: "public",
    now: query.now ?? new Date(),
  });
  if (!result.ok && (result.statusCode === 403 || result.statusCode === 404)) {
    return { ok: false, statusCode: 404, reason: "Not found." };
  }
  return result;
}
