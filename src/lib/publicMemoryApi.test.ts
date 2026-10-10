// Pure data-layer tests — no DOM/rendering infrastructure needed (this
// project's only other frontend test, recordKind.test.ts, is the same
// shape). Covers the reviewer-caught finding that the detail page used to
// collapse every failure mode to a bare null: an operational failure
// (network error, backend 500) must be distinguishable from a genuine 404,
// which is exactly what fetchPublicMemoryRecord's `status` field exists to
// let a caller do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPublicMemoryRecord, fetchPublicMemoryListing, type PublicMemoryRecord } from "./publicMemoryApi";

const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL;
const ORIGINAL_FETCH = globalThis.fetch;

function restore() {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = ORIGINAL_BASE_URL;
  globalThis.fetch = ORIGINAL_FETCH;
}

test("fetchPublicMemoryRecord reports the real 404 status for a genuinely missing record", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryRecord("does-not-exist");
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 404);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryRecord reports the real 500 status for a backend failure — never indistinguishable from 404", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "internal" }), { status: 500 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryRecord("some-id");
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 500);
    assert.notEqual((result as { status: number }).status, 404, "a 500 must never be reported with the same status as a genuine 404");
  } finally {
    restore();
  }
});

test("fetchPublicMemoryRecord reports status 0 for a network failure — distinguishable from any real HTTP status", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    const result = await fetchPublicMemoryRecord("some-id");
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 0);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryRecord reports status 0 when the backend base URL isn't configured at all", async () => {
  delete process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL;
  try {
    const result = await fetchPublicMemoryRecord("some-id");
    assert.equal(result.ok, false);
    assert.equal((result as { status: number }).status, 0);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryRecord returns the real record on success", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  const record: PublicMemoryRecord = {
    recordId: "r1",
    recordKind: "demo",
    title: "[SYNTHETIC] title",
    summary: "[SYNTHETIC] summary",
    provenanceRef: "fixture://invented",
    media: [],
    reviewedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  globalThis.fetch = (async () => new Response(JSON.stringify(record), { status: 200 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryRecord("r1");
    assert.equal(result.ok, true);
    assert.deepEqual((result as { record: PublicMemoryRecord }).record, record);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryListing returns ok:false (not a thrown error) on a network failure", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    const result = await fetchPublicMemoryListing({});
    assert.equal(result.ok, false);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryListing returns ok:true with an empty, non-null items array for a genuinely empty listing", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => new Response(JSON.stringify({ items: [], nextCursor: null, hadFailures: false }), { status: 200 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryListing({});
    assert.equal(result.ok, true);
    assert.deepEqual((result as { listing: unknown }).listing, { items: [], nextCursor: null, hadFailures: false });
  } finally {
    restore();
  }
});

// Reviewer-caught finding: a 200 page with hadFailures: true is INCOMPLETE
// — the index page renders an incomplete-results notice from this flag.
test("fetchPublicMemoryListing carries hadFailures: true through, so the page can say results are incomplete", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [{ recordId: "r1" }], nextCursor: null, hadFailures: true }), { status: 200 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryListing({});
    assert.equal(result.ok, true);
    assert.equal((result as { listing: { hadFailures: boolean } }).listing.hadFailures, true);
  } finally {
    restore();
  }
});

test("fetchPublicMemoryListing treats a response missing hadFailures as incomplete, never as fully checked", async () => {
  process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })) as typeof fetch;
  try {
    const result = await fetchPublicMemoryListing({});
    assert.equal(result.ok, true);
    assert.equal((result as { listing: { hadFailures: boolean } }).listing.hadFailures, true);
  } finally {
    restore();
  }
});
