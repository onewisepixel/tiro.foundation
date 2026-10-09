import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures, FIXTURE_SET_ID } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import type { AuthorityClaim, ConsentGrant, FixtureRecord, RestrictionRegisterEntry } from "../domain/types";
import { uuidv7 } from "../domain/id";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import { restrict, revokeConsentGrant, withdraw, startDeletion, completeDeletion, redactText, redactMedia } from "./lifecycle";
import { decodePublicCursor, setCursorSecretKey } from "./cursorCodec";
import {
  fetchPublicMedia,
  PUBLIC_LISTING_MAX_EVALUATIONS,
  PUBLIC_LISTING_MAX_RAW_ROWS,
  readPublicListing,
  readPublicRecord,
} from "./publicView";

// Same fixed, clearly-local test key cursorCodec.test.ts uses — never the
// real deployment secret, which infra generates fresh per deploy.
setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

const CALLER = "staff:test@example.invalid";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, mediaStore, active, expired, disputed, preservationOnly };
}

// ---------------------------------------------------------------------------
// readPublicRecord
// ---------------------------------------------------------------------------

test("readPublicRecord returns null for a nonexistent record", async () => {
  const { fixtureStore, registerStore } = await setup();
  const view = await readPublicRecord(fixtureStore, registerStore, "does-not-exist");
  assert.equal(view, null);
});

test('readPublicRecord returns null when only "preservation" (never "publication") consent exists — preservation approval alone leaves it invisible anonymously', async () => {
  const { fixtureStore, registerStore, preservationOnly } = await setup();
  const view = await readPublicRecord(fixtureStore, registerStore, preservationOnly.record.recordId);
  assert.equal(view, null);
});

test("readPublicRecord returns a view once an active, verified, public-audience publication grant exists", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.ok(view, "an active publication/public grant must make the record visible");
  assert.equal(view!.recordId, active.record.recordId);
  assert.equal(view!.recordKind, "demo");
  assert.equal(view!.title, active.record.title);
});

test("readPublicRecord never leaks internal/evidence fields", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.ok(view);
  const keys = Object.keys(view!);
  for (const forbidden of ["consentGrants", "custodyCopies", "auditReceipts", "corrections", "redactions", "authorityClaims", "legalRights", "access", "control"]) {
    assert.equal(keys.includes(forbidden), false, `PublicMemoryView must never include "${forbidden}"`);
  }
  for (const media of view!.media) {
    const mediaKeys = Object.keys(media);
    for (const forbidden of ["objectKey", "checksumSha256", "versionId"]) {
      assert.equal(mediaKeys.includes(forbidden), false, `PublicMediaRef must never include "${forbidden}"`);
    }
  }
});

test("readPublicRecord masks a text-redacted field to the placeholder", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  await redactText(fixtureStore, registerStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] test redaction",
    field: "title",
  });
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.ok(view);
  assert.equal(view!.title, "[REDACTED]");
});

test("readPublicRecord excludes a redacted media object from media[] while keeping the record otherwise visible", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const redactedMediaId = active.record.mediaRefs[0].mediaId;
  await redactMedia(fixtureStore, registerStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] test redaction",
    mediaId: redactedMediaId,
  });
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.ok(view, "redacting one media object must not hide the whole record");
  assert.equal(view!.media.some((m) => m.mediaId === redactedMediaId), false);
});

for (const [name, apply] of [
  ["restrict (publication)", async (fixtureStore: FixtureStore, registerStore: RestrictionRegisterStore, recordId: string) =>
    restrict(fixtureStore, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] test" }, ["publication"])],
  ["withdraw", async (fixtureStore: FixtureStore, registerStore: RestrictionRegisterStore, recordId: string) =>
    withdraw(fixtureStore, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] test" })],
] as const) {
  test(`readPublicRecord returns null after ${name}`, async () => {
    const { fixtureStore, registerStore, active } = await setup();
    await apply(fixtureStore, registerStore, active.record.recordId);
    const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
    assert.equal(view, null);
  });
}

test("readPublicRecord returns null after the public consent grant is revoked", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const consentId = active.consentGrants[0].consentId;
  await revokeConsentGrant(fixtureStore, registerStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] test",
    consentId,
  });
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.equal(view, null);
});

test("readPublicRecord returns null once deletion completes", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const deletionRequest = await startDeletion(fixtureStore, registerStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] test",
  });
  await completeDeletion(fixtureStore, registerStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: CALLER,
    reason: "[SYNTHETIC] test",
    deletionRequestId: deletionRequest.requestId,
  });
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.equal(view, null);
});

test("readPublicRecord treats a non-synthetic record as absent", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const current = await fixtureStore.getRecord(active.record.recordId);
  const nonSynthetic = { ...current, isSynthetic: false } as unknown as FixtureRecord;
  await fixtureStore.putRecord(nonSynthetic, current!.version);
  const view = await readPublicRecord(fixtureStore, registerStore, active.record.recordId);
  assert.equal(view, null);
});

// ---------------------------------------------------------------------------
// fetchPublicMedia
// ---------------------------------------------------------------------------

test("fetchPublicMedia serves bytes for an authorized, eligible record", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: active.record.mediaRefs[0].mediaId,
  });
  assert.equal(result.ok, true);
});

test("fetchPublicMedia 404s (never 403) for a denied-but-existing record", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  await restrict(fixtureStore, registerStore, { requestId: uuidv7(), recordId: active.record.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] test" }, ["publication"]);
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: active.record.mediaRefs[0].mediaId,
  });
  assert.equal(result.ok, false);
  assert.equal((result as { statusCode: number }).statusCode, 404);
});

test("fetchPublicMedia 404s (never 403) for a redacted media object on an otherwise-visible record", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const mediaId = active.record.mediaRefs[0].mediaId;
  await redactMedia(fixtureStore, registerStore, { requestId: uuidv7(), recordId: active.record.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] test", mediaId });
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, { recordId: active.record.recordId, mediaId });
  assert.equal(result.ok, false);
  assert.equal((result as { statusCode: number }).statusCode, 404);
});

test("fetchPublicMedia 404s for a genuinely missing media id, indistinguishably from the denied case", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: "no-such-media-id",
  });
  assert.equal(result.ok, false);
  assert.equal((result as { statusCode: number }).statusCode, 404);
});

test("fetchPublicMedia 404s for a non-synthetic record", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const current = await fixtureStore.getRecord(active.record.recordId);
  const nonSynthetic = { ...current, isSynthetic: false } as unknown as FixtureRecord;
  await fixtureStore.putRecord(nonSynthetic, current!.version);
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: active.record.mediaRefs[0].mediaId,
  });
  assert.equal(result.ok, false);
  assert.equal((result as { statusCode: number }).statusCode, 404);
});

test("fetchPublicMedia passes through a 409 (unbound legacy media) unchanged, not collapsed to 404", async () => {
  // The second media ref bindSeedMedia adds a REAL S3-bound object, but the
  // seed's own first (text) ref — before binding — had versionId: null.
  // Re-seed WITHOUT bindSeedMedia to keep that legacy, unbound state.
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const result = await fetchPublicMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: active.record.mediaRefs[0].mediaId,
  });
  assert.equal(result.ok, false);
  assert.equal((result as { statusCode: number }).statusCode, 409, "a post-authorization operational state must pass through unchanged, never collapsed into the disclosure-shaped 404");
});

// ---------------------------------------------------------------------------
// readPublicListing
// ---------------------------------------------------------------------------

function minimalEligibleFixture(recordId: string): { record: FixtureRecord; authorityClaims: AuthorityClaim[]; consentGrants: ConsentGrant[] } {
  const now = new Date().toISOString();
  return {
    record: {
      recordId,
      version: 0,
      isSynthetic: true,
      fixtureSetId: FIXTURE_SET_ID,
      title: `[SYNTHETIC] listing-test record ${recordId}`,
      summary: "[SYNTHETIC] fabricated summary for a listing pagination test.",
      provenanceRef: "fixture://invented-listing-test",
      publicationStatus: "published",
      custodyStatus: "preserved",
      reviewedAt: now,
      redactionApplied: false,
      mediaRefs: [],
      createdAt: now,
      updatedAt: now,
    },
    authorityClaims: [
      { recordId, claimId: uuidv7(), status: "identified", claimant: "[SYNTHETIC] steward", scope: "full record", evidenceRef: "fixture://invented", reviewerDecision: "accepted", createdAt: now },
    ],
    consentGrants: [
      {
        recordId,
        consentId: uuidv7(),
        version: 0,
        signerCapacitySummary: "[SYNTHETIC] narrator",
        signerCapacityVerified: true,
        mandateRef: null,
        purposes: ["publication"],
        audience: "public",
        grantedAt: now,
        expiresAt: null,
        revokedAt: null,
        retentionTermsRef: "fixture://invented-retention",
        withdrawalContact: "fixture-steward@example.invalid",
      },
    ],
  };
}

async function putEligible(fixtureStore: FixtureStore, registerStore: RestrictionRegisterStore, recordId: string): Promise<void> {
  const fx = minimalEligibleFixture(recordId);
  await fixtureStore.putRecord(fx.record, undefined);
  await fixtureStore.putAuthorityClaim(fx.authorityClaims[0]);
  await fixtureStore.putConsentGrant(fx.consentGrants[0], undefined);
  await registerStore.setCurrent(
    {
      recordId,
      controlVersion: 1,
      currentPublicationStatus: "published",
      currentCustodyStatus: "preserved",
      restrictedPurposes: [],
      revokedConsentIds: [],
      updatedAt: new Date().toISOString(),
    },
    undefined,
  );
}

// No FixtureStore record at all — the cheap pre-filter (custody/publication
// status, read straight from the scan's own free data) rejects these before
// readPublicRecord/evaluatePermission is ever called for them, so they need
// no evidence to exist.
async function putFiller(registerStore: RestrictionRegisterStore, recordId: string): Promise<void> {
  const entry: RestrictionRegisterEntry = {
    recordId,
    controlVersion: 1,
    currentPublicationStatus: "not-published",
    currentCustodyStatus: "quarantined",
    restrictedPurposes: [],
    revokedConsentIds: [],
    updatedAt: new Date().toISOString(),
  };
  await registerStore.setCurrent(entry, undefined);
}

test("readPublicListing never skips an eligible row that falls after the requested limit within the same raw page (the fixed pagination bug)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();

  // 30 rows total. Eligible at indices 5, 12, 20 — all inside the FIRST raw
  // page (PUBLIC_LISTING_RAW_PAGE_SIZE = 25), with ineligible filler
  // elsewhere, including past the first page boundary.
  const eligibleIndices = new Set([5, 12, 20]);
  const insertedIds: string[] = [];
  for (let i = 0; i < 30; i++) {
    const recordId = `row-${String(i).padStart(2, "0")}`;
    insertedIds.push(recordId);
    if (eligibleIndices.has(i)) {
      await putEligible(fixtureStore, registerStore, recordId);
    } else {
      await putFiller(registerStore, recordId);
    }
  }

  const collected: string[] = [];
  let cursor: string | null = null;
  let safetyCounter = 0;
  while (safetyCounter < 20) {
    safetyCounter++;
    const page = await readPublicListing(fixtureStore, registerStore, { limit: 2, cursor });
    collected.push(...page.items.map((i) => i.recordId));
    if (page.nextCursor === null) {
      break;
    }
    cursor = page.nextCursor;
  }

  assert.deepEqual(collected, ["row-05", "row-12", "row-20"], "every eligible row must be returned exactly once, in scan order, none skipped");
});

test("readPublicListing stops at PUBLIC_LISTING_MAX_RAW_ROWS and returns a continuable cursor rather than looping forever", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const total = PUBLIC_LISTING_MAX_RAW_ROWS + 20;
  for (let i = 0; i < total; i++) {
    await putFiller(registerStore, `filler-${String(i).padStart(4, "0")}`);
  }
  const page = await readPublicListing(fixtureStore, registerStore, { limit: 50, cursor: null });
  assert.equal(page.items.length, 0, "no eligible candidates exist in this fixture set");
  assert.notEqual(page.nextCursor, null, "exhausting the row budget must still return a continuable cursor, not a terminal empty page");
  // The budget stopped exactly at the row-budget boundary, not earlier/later.
  const resumedAfter = decodePublicCursor(page.nextCursor!);
  assert.equal(resumedAfter, `filler-${String(PUBLIC_LISTING_MAX_RAW_ROWS - 1).padStart(4, "0")}`);
});

test("readPublicListing stops at PUBLIC_LISTING_MAX_EVALUATIONS independently of the raw-row budget", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const total = PUBLIC_LISTING_MAX_EVALUATIONS + 5;
  assert.ok(total < PUBLIC_LISTING_MAX_RAW_ROWS, "this test must hit the evaluation budget, not the row budget");
  for (let i = 0; i < total; i++) {
    await putEligible(fixtureStore, registerStore, `eligible-${String(i).padStart(3, "0")}`);
  }
  const page = await readPublicListing(fixtureStore, registerStore, { limit: 1000, cursor: null });
  assert.equal(page.items.length, PUBLIC_LISTING_MAX_EVALUATIONS, "must stop exactly at the evaluation cap, never exceed it");
  assert.notEqual(page.nextCursor, null, "the remaining eligible rows must still be reachable via a continuation cursor");
});

test("readPublicListing stops once the wall-clock time budget is exceeded, returning a continuable cursor", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  for (let i = 0; i < 30; i++) {
    await putFiller(registerStore, `filler-${String(i).padStart(2, "0")}`);
  }

  const fakeNow = { value: Date.now() };
  const realDateNow = Date.now;
  Date.now = () => fakeNow.value;

  class ClockAdvancingRegisterStore implements RestrictionRegisterStore {
    constructor(private readonly inner: RestrictionRegisterStore) {}
    getCurrent(recordId: string) {
      return this.inner.getCurrent(recordId);
    }
    setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined) {
      return this.inner.setCurrent(entry, expectedVersion);
    }
    listAll() {
      return this.inner.listAll();
    }
    async listPage(query: { limit: number; cursor: string | null }) {
      const result = await this.inner.listPage(query);
      // Simulate the first raw page alone taking longer than the entire
      // time budget — the outer loop must detect this BEFORE fetching a
      // second page, not mid-way through unrelated row processing.
      fakeNow.value += 10_000;
      return result;
    }
  }

  try {
    const page = await readPublicListing(fixtureStore, new ClockAdvancingRegisterStore(registerStore), { limit: 50, cursor: null });
    assert.equal(page.items.length, 0, "the budget was exceeded before any row of the first page could be examined");
    assert.notEqual(page.nextCursor, null, "a time-budget stop must still return a continuable cursor, never a bare null that a caller would read as full exhaustion");
    // Zero rows were ever examined, so the correct continuation is "resume
    // from the very start" — encodePublicCursor(null)'s own round trip,
    // not a terminal/exhausted signal.
    assert.equal(decodePublicCursor(page.nextCursor!), null);
  } finally {
    Date.now = realDateNow;
  }
});

test("readPublicListing rejects a tampered/malformed cursor rather than silently restarting at page one", async () => {
  const { fixtureStore, registerStore } = await setup();
  await assert.rejects(() => readPublicListing(fixtureStore, registerStore, { limit: 10, cursor: "not-a-real-cursor" }));
});

// Live-drill-caught finding: a real, pre-existing record with an
// unusually large accumulated evidence history threw (DynamoDB
// throttling) while being evaluated as a listing candidate — and that one
// candidate's failure took down the ENTIRE listing response (500) for
// every OTHER, unrelated candidate too. A public, unauthenticated
// endpoint must never let one record's problem — throttling, a
// transient error, anything — fail the whole directory.
test("readPublicListing skips a candidate whose evaluation throws, rather than failing the whole listing", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const goodIds = ["good-0", "good-1"];
  const badId = "bad-throws";
  for (const id of [goodIds[0], badId, goodIds[1]]) {
    await putEligible(fixtureStore, registerStore, id);
  }

  class ThrowsForOneRecordFixtureStore implements FixtureStore {
    constructor(private readonly inner: FixtureStore) {}
    getRecord(recordId: string) {
      return this.inner.getRecord(recordId);
    }
    listAuthorityClaims(recordId: string) {
      if (recordId === badId) {
        throw new Error("simulated ProvisionedThroughputExceededException");
      }
      return this.inner.listAuthorityClaims(recordId);
    }
    putRecord(...a: Parameters<FixtureStore["putRecord"]>) { return this.inner.putRecord(...a); }
    deleteRecord(...a: Parameters<FixtureStore["deleteRecord"]>) { return this.inner.deleteRecord(...a); }
    putAuthorityClaim(...a: Parameters<FixtureStore["putAuthorityClaim"]>) { return this.inner.putAuthorityClaim(...a); }
    getAuthorityClaim(...a: Parameters<FixtureStore["getAuthorityClaim"]>) { return this.inner.getAuthorityClaim(...a); }
    listLegalRights(...a: Parameters<FixtureStore["listLegalRights"]>) { return this.inner.listLegalRights(...a); }
    putLegalRight(...a: Parameters<FixtureStore["putLegalRight"]>) { return this.inner.putLegalRight(...a); }
    getLegalRight(...a: Parameters<FixtureStore["getLegalRight"]>) { return this.inner.getLegalRight(...a); }
    listConsentGrants(...a: Parameters<FixtureStore["listConsentGrants"]>) { return this.inner.listConsentGrants(...a); }
    getConsentGrant(...a: Parameters<FixtureStore["getConsentGrant"]>) { return this.inner.getConsentGrant(...a); }
    putConsentGrant(...a: Parameters<FixtureStore["putConsentGrant"]>) { return this.inner.putConsentGrant(...a); }
    listCustodyCopies(...a: Parameters<FixtureStore["listCustodyCopies"]>) { return this.inner.listCustodyCopies(...a); }
    putCustodyCopy(...a: Parameters<FixtureStore["putCustodyCopy"]>) { return this.inner.putCustodyCopy(...a); }
    createLifecycleRequest(...a: Parameters<FixtureStore["createLifecycleRequest"]>) { return this.inner.createLifecycleRequest(...a); }
    getLifecycleRequest(...a: Parameters<FixtureStore["getLifecycleRequest"]>) { return this.inner.getLifecycleRequest(...a); }
    updateLifecycleRequest(...a: Parameters<FixtureStore["updateLifecycleRequest"]>) { return this.inner.updateLifecycleRequest(...a); }
    listLifecycleRequestsByStatus(...a: Parameters<FixtureStore["listLifecycleRequestsByStatus"]>) { return this.inner.listLifecycleRequestsByStatus(...a); }
    putAuditReceipt(...a: Parameters<FixtureStore["putAuditReceipt"]>) { return this.inner.putAuditReceipt(...a); }
    listAuditReceipts(...a: Parameters<FixtureStore["listAuditReceipts"]>) { return this.inner.listAuditReceipts(...a); }
    listCorrections(...a: Parameters<FixtureStore["listCorrections"]>) { return this.inner.listCorrections(...a); }
    putCorrection(...a: Parameters<FixtureStore["putCorrection"]>) { return this.inner.putCorrection(...a); }
    getCorrection(...a: Parameters<FixtureStore["getCorrection"]>) { return this.inner.getCorrection(...a); }
    listRedactions(...a: Parameters<FixtureStore["listRedactions"]>) { return this.inner.listRedactions(...a); }
    putRedaction(...a: Parameters<FixtureStore["putRedaction"]>) { return this.inner.putRedaction(...a); }
    getRedaction(...a: Parameters<FixtureStore["getRedaction"]>) { return this.inner.getRedaction(...a); }
    putRecordWithCorrection(...a: Parameters<FixtureStore["putRecordWithCorrection"]>) { return this.inner.putRecordWithCorrection(...a); }
    putRecordWithRedaction(...a: Parameters<FixtureStore["putRecordWithRedaction"]>) { return this.inner.putRecordWithRedaction(...a); }
    putRecordWithCustodyCopy(...a: Parameters<FixtureStore["putRecordWithCustodyCopy"]>) { return this.inner.putRecordWithCustodyCopy(...a); }
  }

  const wrapped = new ThrowsForOneRecordFixtureStore(fixtureStore);
  const page = await readPublicListing(wrapped, registerStore, { limit: 10, cursor: null });
  const returnedIds = page.items.map((i) => i.recordId).sort();
  assert.deepEqual(returnedIds, [...goodIds].sort(), "both good candidates must still be returned");
  assert.equal(returnedIds.includes(badId), false, "the throwing candidate must be skipped, not included");
});
