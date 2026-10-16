import { test } from "node:test";
import assert from "node:assert/strict";
import { getMemoryById, memories } from "./memories";

// docs/design/decisions.md (2026-10-16), decision 3: demonstration records
// keep the interface but carry no invented testimony, people, or cultural
// practices, and no claims of verification or consent.
const demos = memories.filter((m) => m.recordKind === "demo");

function strings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(strings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

test("demonstration records make no verification or consent claims", () => {
  for (const m of demos) {
    assert.match(m.archiveStatus, /^Not verified/, m.id);
    assert.match(m.lastReviewed, /^Not reviewed/, m.id);
    assert.match(m.consentStatus, /^None\./, m.id);
    for (const text of strings(m)) {
      assert.doesNotMatch(text, /explicitly granted|\bconsent (was )?granted\b/i, `${m.id}: ${text}`);
    }
  }
});

test("demonstration records contain no first-person testimony or named people", () => {
  for (const m of demos) {
    for (const text of strings(m)) {
      // First-person narration, honorifics used as names, and the
      // previously invented TIRO activities.
      assert.doesNotMatch(text, /(^|[.\s“"])(I|my|we|our)\s/m, `${m.id}: ${text.slice(0, 80)}`);
      assert.doesNotMatch(text, /\bElder [A-Z]/, m.id);
      assert.doesNotMatch(text, /Memory Workshop|memory circle|field researcher/i, m.id);
    }
  }
});

test("demonstration identifiers stay distinct from accession numbers", () => {
  for (const m of demos) {
    assert.match(m.recordId, /^DEMO-MEM-\d{4}$/, m.id);
    assert.match(m.id, /^demo-/, m.id);
  }
});

test("related-record links resolve", () => {
  for (const m of memories) {
    for (const r of m.relatedMemories) {
      assert.ok(getMemoryById(r.id), `${m.id} -> ${r.id}`);
      assert.equal(r.href, `/memories/${r.id}`);
    }
  }
});
