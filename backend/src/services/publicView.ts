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
// Live-drill-caught finding, corrected twice: a full evaluatePermission's
// real cost against the PRIMARY table is NOT ~1-3 RCU — it's FIVE
// strongly-consistent reads (confirmed directly in dynamoStore.ts:
// readPublicRecord's own getRecord, PLUS evaluatePermission's internal
// getRecord, listAuthorityClaims, listLegalRights, and listConsentGrants
// all pass `ConsistentRead: true`, by deliberate, load-bearing design —
// permission decisions must never read stale evidence. Against a
// deliberately tiny 5 RCU table, that is the ENTIRE per-second budget for
// ONE evaluation. First attempt at this fix (40 evaluations, no pacing;
// then 10, with 500ms pacing) both still reproduced sustained, repeated
// ProvisionedThroughputExceededException live — 500ms spacing yields
// ~5 RCU per 0.5s ≈ 10 RCU/sec, still double capacity. This number and
// its pacing below are sized against the REAL, now-confirmed cost, not a
// guess.
export const PUBLIC_LISTING_MAX_EVALUATIONS = 4;
export const PUBLIC_LISTING_TIME_BUDGET_MS = 8000;

// Live-drill-caught finding: the budgets above bound the NUMBER of
// DynamoDB operations a single request can issue, but not the RATE they
// go out at — issuing full evaluations back-to-back with no pacing (or
// insufficient pacing) reproduced real, repeated
// ProvisionedThroughputExceededException against the live, deliberately
// tiny (5 RCU) primary table — every single retry, since a client-side
// retry re-issues the SAME burst and hits the same wall. 1500ms between
// evaluations keeps the sustained rate at ~5 RCU per 1.5s ≈ 3.3 RCU/sec,
// comfortably under the 5 RCU/sec provisioned limit with real margin —
// PUBLIC_LISTING_MAX_EVALUATIONS evaluations' worth of pure pacing
// (3 gaps × 1500ms = 4500ms) stays safely under
// PUBLIC_LISTING_TIME_BUDGET_MS, leaving real headroom for the actual
// DynamoDB round-trip latency on top; the time budget remains the
// ultimate backstop if real latency, not just pacing, pushes a request
// close to it. The register table's own listPage Scan (RAW_PAGE_PACING_MS)
// is eventually consistent (dynamoStore.ts's listPage sets no
// ConsistentRead override), so it's cheaper per page — paced more
// lightly, against the register table's own separate 5 RCU budget.
export const PUBLIC_LISTING_EVALUATION_PACING_MS = 1500;
export const PUBLIC_LISTING_RAW_PAGE_PACING_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `hadFailures: true` means at least one candidate on this page threw
// while being evaluated (see the catch block below) — the caller (router.ts)
// must NEVER report `items: []` alongside this as a confident "nothing is
// currently published": that collapses "we don't actually know" into the
// same shape as "we checked and there's genuinely nothing there," exactly
// the false-empty-directory problem this field exists to prevent.
export type PublicListingResult = { items: PublicMemoryView[]; nextCursor: string | null; hadFailures: boolean };

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
  let rawPagesFetched = 0;
  let exhausted = false;
  let hadFailures = false;

  const budgetExceeded = () =>
    items.length >= query.limit ||
    rowsExamined >= PUBLIC_LISTING_MAX_RAW_ROWS ||
    evaluations >= PUBLIC_LISTING_MAX_EVALUATIONS ||
    Date.now() - startedAt >= PUBLIC_LISTING_TIME_BUDGET_MS;

  while (!budgetExceeded()) {
    // Paced from the SECOND raw page onward — each Scan page itself
    // consumes real RCU (up to PUBLIC_LISTING_RAW_PAGE_SIZE items), so a
    // tight loop of pages is its own overload risk, independent of
    // per-candidate evaluation pacing below.
    if (rawPagesFetched > 0) {
      await sleep(PUBLIC_LISTING_RAW_PAGE_PACING_MS);
      // Reviewer-caught finding: the budget was checked BEFORE this sleep,
      // not after — a deterministic reproduction started real work at
      // 9,400ms against an 8,000ms budget, because nothing re-checked the
      // clock once the sleep itself had pushed past it. Re-checking here,
      // before the (possibly expensive) page fetch below, closes that:
      // resumeKey still holds whatever it was before this iteration, so
      // bailing out now loses no progress — the next call fetches exactly
      // this same page.
      if (budgetExceeded()) {
        break;
      }
    }
    rawPagesFetched++;
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
        // Paced from the SECOND evaluation onward — see
        // PUBLIC_LISTING_EVALUATION_PACING_MS's comment above.
        if (evaluations > 0) {
          await sleep(PUBLIC_LISTING_EVALUATION_PACING_MS);
          // Same reviewer-caught finding as the raw-page pacing above,
          // applied here too — this is the EXACT call site the
          // deterministic reproduction targeted. resumeKey has not been
          // advanced past this row yet (that happens below, after a
          // successful or failed evaluation) — breaking now means the
          // next call re-attempts this exact row fresh, never silently
          // skipping it.
          if (budgetExceeded()) {
            break;
          }
        }
        evaluations++;
        try {
          const view = await readPublicRecord(fixtureStore, registerStore, entry.recordId);
          if (view) {
            items.push(view);
          }
        } catch (error) {
          // Live-drill-caught finding: a single candidate's evidence can
          // be disproportionately large (e.g. a record with an unusually
          // long accumulated history of authority claims/legal rights/
          // consent grants from this engagement's own extensive drill
          // history) — ONE such record's read was observed consuming far
          // more read capacity in a single call than pacing between CALLS
          // can ever smooth over, throttling even a lone, otherwise-cheap
          // request. No amount of inter-request pacing fixes a single
          // oversized call. Skipping this one candidate and continuing —
          // rather than letting its failure 500 the ENTIRE listing for
          // every other, unrelated candidate — is the correct, safe
          // response for a public, unauthenticated endpoint regardless of
          // the cause (throttling, a transient network blip, anything
          // else): one record's problem must never take down the whole
          // directory. The record simply doesn't appear on this page; a
          // later request (this one's pacing/backoff, or simply trying
          // again) may succeed once capacity recovers. Logged server-side
          // only (same as handler.ts's own top-level catch) — the
          // recordId that failed is never part of the response, kept
          // confidential from the anonymous caller the same way a
          // denied-but-existing record already is.
          hadFailures = true;
          console.error(`readPublicListing: candidate ${entry.recordId} failed to evaluate; skipping it for this page.`, error);
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
  return { items, nextCursor: exhausted ? null : encodePublicCursor(resumeKey), hadFailures };
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
