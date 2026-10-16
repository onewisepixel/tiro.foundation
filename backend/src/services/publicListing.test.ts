// The separately stored listing item behind GET /public/records
// (publicListingItem.ts; permissions.ts's evaluateListingSnapshot;
// publicView.ts's readPublicListingCard). Covers: bounds and stored size;
// validation; register-driven masking; zero canonical-record reads, even for
// a near-400 KB record; fail-closed handling of missing or invalid listing
// data WITHOUT a false-empty result; protective actions landing
// mid-evaluation; and the listing item staying in step with the canonical
// record across creation, correction, redaction, media changes, restoration
// and deletion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { uuidv7 } from "../domain/id";
import type { FixtureRecord, RestrictionRegisterEntry } from "../domain/types";
import type { FixtureStore } from "../store/store";
import { routeRequest } from "../api/router";
import { completeDeletion, correctRecord, redactMedia, redactText, revokeConsentGrant, startDeletion, withdraw } from "./lifecycle";
import { addMedia, createSubmission } from "./intake";
import { exportFixtureSet } from "./export";
import { importExport } from "./restore";
import { setCursorSecretKey } from "./cursorCodec";
import {
  deriveListingItem,
  LISTING_MAX_MEDIA,
  LISTING_SUMMARY_EXCERPT_MAX_CHARS,
  LISTING_TITLE_MAX_CHARS,
  parseListingItem,
  toPublicListingCard,
} from "./publicListingItem";
import { readPublicListing, readPublicListingCard, ListingItemUnavailableError } from "./publicView";

setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

const CALLER = "staff:test@example.invalid";

async function setup() {
  const inner = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(inner, registerStore, [active]);
  return { inner, registerStore, mediaStore, active, recordId: active.record.recordId, mediaId: active.record.mediaRefs[0].mediaId };
}

// Counts canonical-record and listing-item reads; optionally runs a hook
// AFTER a given evidence read returned its (now stale) result, i.e. between
// that read and the register read evaluateListingSnapshot performs last.
function instrumented(
  inner: InMemoryFixtureStore,
  hook?: { method: "listAuthorityClaims" | "listLegalRights" | "listConsentGrants"; run: () => Promise<unknown> },
) {
  const counts = { getRecord: 0, getListingItem: 0 };
  let fired = false;
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "getRecord" || prop === "getListingItem") {
        return (recordId: string) => {
          counts[prop]++;
          return (target[prop] as (id: string) => Promise<unknown>).call(target, recordId);
        };
      }
      if (hook && prop === hook.method) {
        return async (recordId: string) => {
          const stale = await (target[hook.method] as (id: string) => Promise<unknown>).call(target, recordId);
          if (!fired) {
            fired = true;
            await hook.run();
          }
          return stale;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FixtureStore;
  return { store, counts, fired: () => fired };
}

function recordWith(overrides: Partial<FixtureRecord>): FixtureRecord {
  const [base] = buildSeedFixtures();
  return { ...base.record, ...overrides };
}

// Conservative DynamoDB item-size estimate: attribute-name bytes + UTF-8
// value bytes, 21 bytes per number, 1 per boolean/null, and 3 bytes of
// overhead plus 1 per element for lists/maps.
function approxDynamoItemBytes(value: unknown): number {
  if (value === null || typeof value === "boolean") return 1;
  if (typeof value === "number") return 21;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  if (Array.isArray(value)) return 3 + value.reduce((sum: number, v) => sum + 1 + approxDynamoItemBytes(v), 0);
  if (typeof value === "object") {
    return 3 + Object.entries(value as Record<string, unknown>).reduce((sum, [k, v]) => sum + 1 + Buffer.byteLength(k, "utf8") + approxDynamoItemBytes(v), 0);
  }
  throw new Error(`unexpected value ${String(value)}`);
}

// ---------------------------------------------------------------------------
// Derivation, bounds, validation, masking
// ---------------------------------------------------------------------------

test("deriveListingItem bounds title and summary by code point, never splitting a surrogate pair, and flags truncation", () => {
  const emoji = "😀"; // one code point, two UTF-16 units
  const record = recordWith({
    title: emoji.repeat(LISTING_TITLE_MAX_CHARS + 5),
    summary: emoji.repeat(LISTING_SUMMARY_EXCERPT_MAX_CHARS + 5),
  });
  const item = deriveListingItem(record, 7);
  assert.equal(Array.from(item.title).length, LISTING_TITLE_MAX_CHARS);
  assert.equal(item.title, emoji.repeat(LISTING_TITLE_MAX_CHARS));
  assert.equal(item.titleTruncated, true);
  assert.equal(item.summaryExcerpt, emoji.repeat(LISTING_SUMMARY_EXCERPT_MAX_CHARS));
  assert.equal(item.summaryTruncated, true);
  assert.equal(item.recordVersion, 7);

  const short = deriveListingItem(recordWith({ title: "t", summary: "s" }), 1);
  assert.equal(short.titleTruncated, false);
  assert.equal(short.summaryTruncated, false);
});

test("a worst-case listing item stays under 4 KB as stored (one strongly consistent read = 1 RCU)", () => {
  const fourByte = "😀"; // 4 UTF-8 bytes
  const record = recordWith({
    title: fourByte.repeat(10_000),
    summary: fourByte.repeat(100_000),
    reviewedAt: "2026-10-10T00:00:00.000Z",
    mediaRefs: Array.from({ length: LISTING_MAX_MEDIA + 3 }, () => ({
      mediaId: "m".repeat(64),
      contentType: "c".repeat(100),
      bytes: Number.MAX_SAFE_INTEGER,
      objectKey: "k",
      versionId: "v",
      checksumSha256: "0".repeat(64),
    })) as FixtureRecord["mediaRefs"],
  });
  const item = deriveListingItem(record, Number.MAX_SAFE_INTEGER);
  assert.equal(item.media.length, LISTING_MAX_MEDIA);
  assert.equal(item.mediaTruncated, true);
  const stored = { PK: `ENTITY#${record.recordId}`, SK: "LISTING", ...item };
  const bytes = approxDynamoItemBytes(stored);
  assert.ok(bytes < 4096, `worst-case listing item is ~${bytes} bytes; must stay under 4096`);
});

test("parseListingItem accepts a derived item (dropping storage keys) and rejects anything missing, malformed, out of bounds, unsynthetic or for another record", () => {
  const record = recordWith({});
  const good = { PK: "ENTITY#x", SK: "LISTING", ...deriveListingItem(record, 3) };
  const parsed = parseListingItem(good, record.recordId);
  assert.ok(parsed);
  assert.equal("PK" in parsed!, false);
  assert.equal("SK" in parsed!, false);

  const bad: [string, unknown][] = [
    ["null", null],
    ["not an object", "x"],
    ["wrong record", { ...good, recordId: "other" }],
    ["not synthetic", { ...good, isSynthetic: false }],
    ["schema version", { ...good, schemaVersion: 2 }],
    ["version 0", { ...good, recordVersion: 0 }],
    ["version not integer", { ...good, recordVersion: 1.5 }],
    ["title too long", { ...good, title: "x".repeat(LISTING_TITLE_MAX_CHARS + 1) }],
    ["summary too long", { ...good, summaryExcerpt: "x".repeat(LISTING_SUMMARY_EXCERPT_MAX_CHARS + 1) }],
    ["missing flag", { ...good, summaryTruncated: undefined }],
    ["too many media", { ...good, media: Array.from({ length: LISTING_MAX_MEDIA + 1 }, () => ({ mediaId: "m", contentType: "t", bytes: 1 })) }],
    ["bad media entry", { ...good, media: [{ mediaId: "", contentType: "t", bytes: 1 }] }],
    ["negative bytes", { ...good, media: [{ mediaId: "m", contentType: "t", bytes: -1 }] }],
    ["missing createdAt", { ...good, createdAt: undefined }],
  ];
  for (const [label, raw] of bad) {
    assert.equal(parseListingItem(raw, record.recordId), null, label);
  }
});

test("toPublicListingCard applies the register snapshot's text and media redactions", () => {
  const record = recordWith({});
  const item = deriveListingItem({ ...record, summary: "s".repeat(500) }, 1);
  const mediaId = item.media[0].mediaId;
  const control = { redactedTextFields: ["title", "summary"], redactedMediaIds: [mediaId] } as unknown as RestrictionRegisterEntry;
  const card = toPublicListingCard(item, control);
  assert.equal(card.title, "[REDACTED]");
  assert.equal(card.summaryExcerpt, "[REDACTED]");
  assert.equal(card.summaryTruncated, false, "a redacted field reports no truncation of hidden text");
  assert.equal(card.media.some((m) => m.mediaId === mediaId), false);
  assert.equal("recordVersion" in card, false);
  assert.equal("isSynthetic" in card, false);
});

// ---------------------------------------------------------------------------
// Cost: zero canonical-record reads, even for a near-400 KB record
// ---------------------------------------------------------------------------

test("a near-400 KB canonical record is listed with zero full-record reads and a bounded excerpt", async () => {
  const { inner, registerStore, recordId } = await setup();
  const current = (await inner.getRecord(recordId))!;
  const hugeSummary = "x".repeat(395_000);
  await inner.putRecord({ ...current, summary: hugeSummary }, current.version);

  const { store, counts } = instrumented(inner);
  const listing = await readPublicListing(store, registerStore, { limit: 10, cursor: null });
  assert.equal(counts.getRecord, 0, "the listing path must never read the canonical record");
  assert.equal(counts.getListingItem, 1);
  assert.equal(listing.hadFailures, false);
  assert.equal(listing.items.length, 1);
  const card = listing.items[0];
  assert.equal(card.summaryExcerpt, "x".repeat(LISTING_SUMMARY_EXCERPT_MAX_CHARS));
  assert.equal(card.summaryTruncated, true);
  assert.equal("summary" in card, false, "the full summary never reaches a listing response");
});

// ---------------------------------------------------------------------------
// Missing or invalid listing data: fail closed, never false-empty
// ---------------------------------------------------------------------------

for (const [label, corrupt] of [
  ["missing", (s: InMemoryFixtureStore, id: string) => s.deleteListingItemSync(id)],
  ["invalid (not synthetic)", (s: InMemoryFixtureStore, id: string) => s.setRawListingItemSync(id, { ...deriveListingItem(recordWith({ recordId: id }), 1), isSynthetic: false })],
  ["invalid (another record's item)", (s: InMemoryFixtureStore, id: string) => s.setRawListingItemSync(id, deriveListingItem(recordWith({}), 1))],
] as const) {
  test(`an allowed record whose listing item is ${label} is a failure (hadFailures, 503 when alone), never omitted as absent and never disclosed`, async () => {
    const { inner, registerStore, mediaStore, recordId } = await setup();
    corrupt(inner, recordId);

    await assert.rejects(readPublicListingCard(inner, registerStore, recordId), ListingItemUnavailableError);

    const listing = await readPublicListing(inner, registerStore, { limit: 10, cursor: null });
    assert.equal(listing.hadFailures, true);
    assert.deepEqual(listing.items, []);

    const response = await routeRequest(inner, registerStore, mediaStore, new InMemoryIntakeRegisterCommitter(inner, registerStore), "public:anonymous", {
      method: "GET",
      pathSegments: ["public", "records"],
      queryParams: {},
      body: undefined,
    });
    assert.equal(response.statusCode, 503, "never a confident, empty 200");
  });
}

test("a missing listing item on a record the rules DENY is simply not listed (not a failure)", async () => {
  const { inner, registerStore, recordId } = await setup();
  await withdraw(inner, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] test" });
  inner.deleteListingItemSync(recordId);
  assert.equal(await readPublicListingCard(inner, registerStore, recordId), null);
  const listing = await readPublicListing(inner, registerStore, { limit: 10, cursor: null });
  assert.equal(listing.hadFailures, false);
  assert.deepEqual(listing.items, []);
});

// ---------------------------------------------------------------------------
// Protective actions landing DURING the evaluation (after evidence reads,
// before the register read) are honored: the register is read last
// ---------------------------------------------------------------------------

test("revocation, withdrawal, text redaction and media redaction landing mid-evaluation are each honored on the listing path", async () => {
  const cases: [string, (s: InMemoryFixtureStore, r: InMemoryRestrictionRegisterStore, recordId: string, mediaId: string, consentId: string) => Promise<unknown>, (card: Awaited<ReturnType<typeof readPublicListingCard>>, mediaId: string) => void][] = [
    ["revoke-consent", (s, r, recordId, _m, consentId) => revokeConsentGrant(s, r, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] mid", consentId }), (card) => assert.equal(card, null)],
    ["withdraw", (s, r, recordId) => withdraw(s, r, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] mid" }), (card) => assert.equal(card, null)],
    ["redact-text", (s, r, recordId) => redactText(s, r, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] mid", field: "title" }), (card) => assert.equal(card?.title, "[REDACTED]")],
    ["redact-media", (s, r, recordId, mediaId) => redactMedia(s, r, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] mid", mediaId }), (card, mediaId) => assert.equal(card?.media.some((m) => m.mediaId === mediaId), false)],
  ];
  for (const [name, action, check] of cases) {
    const { inner, registerStore, recordId, mediaId, active } = await setup();
    const { store, fired } = instrumented(inner, {
      method: "listConsentGrants",
      run: () => action(inner, registerStore, recordId, mediaId, active.consentGrants[0].consentId),
    });
    const card = await readPublicListingCard(store, registerStore, recordId);
    assert.equal(fired(), true, `${name}: precondition, the action really landed mid-evaluation`);
    check(card, mediaId);
  }
});

// ---------------------------------------------------------------------------
// Maintenance: the listing item tracks the canonical record on every path
// ---------------------------------------------------------------------------

async function assertListingMatchesRecord(store: InMemoryFixtureStore, recordId: string): Promise<void> {
  const record = await store.getRecord(recordId);
  assert.ok(record, "precondition: record exists");
  const listing = parseListingItem(await store.getListingItem(recordId), recordId);
  assert.ok(listing, "listing item must exist and be valid");
  assert.deepEqual(listing, deriveListingItem(record!, record!.version));
}

test("the listing item is created with the record and follows correction, text/media redaction, and media changes", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);

  const created = await createSubmission(fixtureStore, intakeCommitter, {
    requestId: uuidv7(),
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] create",
    fixtureSetId: "fixture-set-listing-test",
    title: "[SYNTHETIC] original title",
    summary: "[SYNTHETIC] original summary",
    provenanceRef: "fixture://invented-listing-001",
  });
  const recordId = created.recordId;
  await assertListingMatchesRecord(fixtureStore, recordId);

  const media = await addMedia(fixtureStore, registerStore, mediaStore, intakeCommitter, {
    requestId: uuidv7(),
    recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] media",
    contentType: "text/plain",
    base64: Buffer.from("[SYNTHETIC] file").toString("base64"),
  });
  assert.equal(media.status, "completed");
  await assertListingMatchesRecord(fixtureStore, recordId);
  const afterMedia = parseListingItem(await fixtureStore.getListingItem(recordId), recordId)!;
  assert.deepEqual(afterMedia.media.map((m) => m.mediaId), [media.requestId]);

  // Correction and redaction act on preserved records; the same store
  // methods back them regardless of custody, so exercise them directly on
  // a seeded, preserved fixture.
  const seeded = await setup();
  const corrected = await correctRecord(seeded.inner, {
    requestId: uuidv7(),
    recordId: seeded.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] correction",
    field: "title",
    correctedValue: "[SYNTHETIC] corrected title",
  });
  assert.equal(corrected.status, "completed");
  await assertListingMatchesRecord(seeded.inner, seeded.recordId);
  assert.equal(parseListingItem(await seeded.inner.getListingItem(seeded.recordId), seeded.recordId)!.title, "[SYNTHETIC] corrected title");

  await redactText(seeded.inner, seeded.registerStore, { requestId: uuidv7(), recordId: seeded.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact", field: "summary" });
  await assertListingMatchesRecord(seeded.inner, seeded.recordId);
  await redactMedia(seeded.inner, seeded.registerStore, { requestId: uuidv7(), recordId: seeded.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact", mediaId: seeded.mediaId });
  await assertListingMatchesRecord(seeded.inner, seeded.recordId);

  // And the served card is masked from the register, whatever the item holds.
  const card = await readPublicListingCard(seeded.inner, seeded.registerStore, seeded.recordId);
  assert.equal(card?.summaryExcerpt, "[REDACTED]");
  assert.equal(card?.media.some((m) => m.mediaId === seeded.mediaId), false);
});

test("deletion removes the listing item together with the record", async () => {
  const { inner, registerStore, mediaStore, recordId } = await setup();
  const start = await startDeletion(inner, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] delete" });
  const done = await completeDeletion(inner, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] delete", deletionRequestId: start.requestId }, mediaStore);
  assert.equal(done.status, "completed");
  assert.equal(await inner.getRecord(recordId), null);
  assert.equal(await inner.getListingItem(recordId), null);
});

test("restoration writes a consistent listing item, and a restored pre-redaction item is still masked by the live register", async () => {
  const { inner, registerStore, recordId } = await setup();
  const backup = await exportFixtureSet(inner, registerStore, [recordId], "complete-preservation", "listing-backup", "public");

  // After the backup: redact the title live.
  await redactText(inner, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact", field: "title" });

  // Restore the pre-redaction backup into a fresh store (import path).
  const restored = new InMemoryFixtureStore();
  const result = await importExport(restored, backup);
  assert.equal(result.imported, 1);
  await assertListingMatchesRecord(restored, recordId);
  const card = await readPublicListingCard(restored, registerStore, recordId);
  assert.equal(card?.title, "[REDACTED]", "the live register's redaction survives restoring an older listing item");

  // Snapshot path (whole-table backup semantics).
  const fromSnapshot = InMemoryFixtureStore.fromSnapshot(inner.snapshot());
  await assertListingMatchesRecord(fromSnapshot, recordId);
});
