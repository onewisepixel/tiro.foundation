// Pure, injectable helpers for realPublicMemoryAcceptanceDrill.ts — split
// out of that script's main() closure so their decision logic is covered
// by `npm test` (publicDrillSupport.test.ts) instead of only ever being
// exercised live.
import { randomUUID } from "node:crypto";

export type HttpResult = { status: number; json: unknown };

// A listing walk has three honest outcomes, not two. Reviewer-caught
// finding: GET /public/records can return 200 with `hadFailures: true` and
// `nextCursor: null` when one allowed candidate failed to evaluate and
// another succeeded (router.ts only 503s when EVERY candidate on the page
// failed). The failed candidate is silently missing from that page, so a
// walk that never finds the target cannot call it "absent" — only
// "inconclusive". Presence, by contrast, is positive evidence and stands
// regardless of failures elsewhere.
export type ListingOutcome =
  | { kind: "present" }
  | { kind: "absent" }
  | { kind: "inconclusive"; reason: string };

export async function walkPublicListing(
  get: (path: string) => Promise<HttpResult>,
  targetRecordId: string,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<ListingOutcome> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 200;
  let cursor: string | null = null;
  let failedPages = 0;
  for (let page = 0; page < maxPages; page++) {
    const path = cursor
      ? `/public/records?limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
      : `/public/records?limit=${pageSize}`;
    const response = await get(path);
    if (response.status !== 200) {
      return { kind: "inconclusive", reason: `GET /public/records returned ${response.status} on page ${page + 1}` };
    }
    const body = response.json as { items?: { recordId: string }[]; nextCursor?: string | null; hadFailures?: boolean } | null;
    if (!body || !Array.isArray(body.items)) {
      return { kind: "inconclusive", reason: `GET /public/records returned an unrecognized body on page ${page + 1}` };
    }
    if (body.items.some((item) => item.recordId === targetRecordId)) {
      return { kind: "present" };
    }
    // Anything other than an explicit `false` counts as a failed page — a
    // missing field is not evidence that every candidate was checked.
    if (body.hadFailures !== false) {
      failedPages++;
    }
    if (!body.nextCursor) {
      return failedPages > 0
        ? { kind: "inconclusive", reason: `${failedPages} page(s) reported hadFailures; the target may have been one of the unchecked candidates` }
        : { kind: "absent" };
    }
    cursor = body.nextCursor;
  }
  return { kind: "inconclusive", reason: `walk exceeded its ${maxPages}-page safety bound` };
}

// Retries a whole HTTP call on 500/503 (how a Lambda-side
// ProvisionedThroughputExceededException surfaces to an HTTP client). Any
// other status — success or a genuine 4xx — returns immediately. After
// maxAttempts the LAST result is returned, never thrown: callers must check
// its status themselves.
export async function retryOnServerError<T extends { status: number }>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: (attempt: number) => number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, status: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 31;
  const delayMs = options.delayMs ?? ((attempt) => Math.min(1000 * attempt, 8000));
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    const result = await fn();
    if ((result.status !== 500 && result.status !== 503) || attempt >= maxAttempts) {
      return result;
    }
    const delay = delayMs(attempt);
    options.onRetry?.(attempt, result.status, delay);
    await sleep(delay);
  }
}

// Reviewer-caught finding: the drill's POSTs were retried without a
// requestId, so the server minted a fresh one per attempt — a retry after a
// response was lost (the action committed, the 500 came from somewhere
// later) became a SECOND, distinct lifecycle request instead of an
// idempotent replay. The requestId is minted ONCE per logical operation,
// here, outside the retry loop, so every attempt carries the same one and
// the backend's getOrCreateRequest/runGuarded replay protection applies. A
// caller-supplied requestId is respected unchanged.
export async function idempotentPost(
  send: (body: Record<string, unknown>) => Promise<HttpResult>,
  body: Record<string, unknown>,
  retry: (fn: () => Promise<HttpResult>) => Promise<HttpResult> = retryOnServerError,
  mintRequestId: () => string = randomUUID,
): Promise<HttpResult> {
  const stableBody = { ...body, requestId: typeof body.requestId === "string" ? body.requestId : mintRequestId() };
  return retry(() => send(stableBody));
}

export type CleanupResult = {
  resolved: { recordId: string; how: "withdrawn" | "already-deleted" }[];
  unresolved: { recordId: string; reason: string }[];
};

// Cleanup is only "done" for a fixture when it is VERIFIABLY no longer
// published: either the record is gone (staff GET 404 — the delete-path
// fixture), or a withdraw request returned HTTP 200 with lifecycle status
// "completed" AND the register read back afterward shows
// currentPublicationStatus "withdrawn". Anything else is reported as
// unresolved with its reason — never silently swallowed. Reviewer-caught
// finding: the previous cleanup ignored the withdraw response entirely and
// `.catch()`-ed only thrown errors, but the retry helper RETURNS its last
// 500/503 rather than throwing, so a fully throttled cleanup finished
// "normally" after 31 failed attempts, leaving fixtures published.
export async function cleanupDrillFixtures(
  recordIds: string[],
  deps: {
    post: (path: string, body: Record<string, unknown>) => Promise<HttpResult>;
    get: (path: string) => Promise<HttpResult>;
  },
): Promise<CleanupResult> {
  const result: CleanupResult = { resolved: [], unresolved: [] };
  const statePath = (recordId: string) => `/records/${recordId}?purpose=preservation&audience=staff`;
  for (const recordId of recordIds) {
    try {
      const before = await deps.get(statePath(recordId));
      if (before.status === 404) {
        result.resolved.push({ recordId, how: "already-deleted" });
        continue;
      }
      const withdrawal = await deps.post(`/records/${recordId}/withdraw`, {
        reason: "[SYNTHETIC] drill cleanup — withdrawing every fixture this run created",
      });
      const requestStatus = (withdrawal.json as { status?: string } | null)?.status;
      if (withdrawal.status !== 200 || requestStatus !== "completed") {
        result.unresolved.push({
          recordId,
          reason: `withdraw returned HTTP ${withdrawal.status}, lifecycle status ${JSON.stringify(requestStatus ?? null)}`,
        });
        continue;
      }
      const after = await deps.get(statePath(recordId));
      const publicationStatus = (after.json as { control?: { currentPublicationStatus?: string } | null } | null)?.control
        ?.currentPublicationStatus;
      if (after.status === 200 && publicationStatus === "withdrawn") {
        result.resolved.push({ recordId, how: "withdrawn" });
      } else if (after.status === 404) {
        result.resolved.push({ recordId, how: "already-deleted" });
      } else {
        result.unresolved.push({
          recordId,
          reason: `withdraw completed, but the read-back returned HTTP ${after.status} with publication status ${JSON.stringify(publicationStatus ?? null)}`,
        });
      }
    } catch (error) {
      result.unresolved.push({ recordId, reason: `threw: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return result;
}
