// Read-once for the public record and media paths (permissions.ts's
// evaluatePermissionSnapshot). Live profiling (scripts/profilePublicReadPath.ts,
// 2026-10-10) measured a near-400 KB record item at 97 RCU per strongly
// consistent read, read twice per public detail/listing evaluation and three
// times per media fetch. These tests pin down: exactly one record read per
// path; the snapshot is never caller-supplied and fails closed on a missing
// or mismatched record; and a revocation or redaction landing DURING the
// evidence reads is still honored, because the authoritative register is
// read last and masking/media selection use that same decision and record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { uuidv7 } from "../domain/id";
import type { FixtureRecord } from "../domain/types";
import type { FixtureStore } from "../store/store";
import { redactMedia, redactText, revokeConsentGrant } from "./lifecycle";
import { fetchAuthorizedMedia } from "./media";
import { evaluatePermissionSnapshot } from "./permissions";
import { setCursorSecretKey } from "./cursorCodec";
import { fetchPublicMedia, readPublicListing, readPublicRecord } from "./publicView";

setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

const CALLER = "staff:test@example.invalid";

async function setup() {
  const inner = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(inner, registerStore, [active]);
  const seeded = (await inner.getRecord(active.record.recordId))!;
  return { inner, registerStore, mediaStore, active, seeded, recordId: active.record.recordId, mediaId: active.record.mediaRefs[0].mediaId };
}

// Wraps the real in-memory store: counts getRecord calls, and can run a
// hook AFTER a given evidence read has already returned its (now stale)
// result — i.e. the mutation lands between that evidence read and the
// register read evaluatePermission performs last. Hooks mutate via the
// INNER store, so the lifecycle functions' own store use isn't counted.
function instrumented(
  inner: InMemoryFixtureStore,
  options: {
    afterEvidenceRead?: { method: "listAuthorityClaims" | "listLegalRights" | "listConsentGrants"; run: () => Promise<unknown> };
    getRecordOverride?: (recordId: string) => Promise<FixtureRecord | null>;
  } = {},
) {
  const counts = { getRecord: 0 };
  let hookFired = false;
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "getRecord") {
        return async (recordId: string) => {
          counts.getRecord++;
          return options.getRecordOverride ? options.getRecordOverride(recordId) : target.getRecord(recordId);
        };
      }
      const hook = options.afterEvidenceRead;
      if (hook && prop === hook.method) {
        return async (recordId: string) => {
          const staleResult = await (target[hook.method] as (id: string) => Promise<unknown>).call(target, recordId);
          if (!hookFired) {
            hookFired = true;
            await hook.run();
          }
          return staleResult;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as FixtureStore;
  return { store, counts, hookFired: () => hookFired };
}

// ---------------------------------------------------------------------------
// Exactly one record read per path
// ---------------------------------------------------------------------------

test("readPublicRecord reads the record exactly once", async () => {
  const { inner, registerStore, recordId } = await setup();
  const { store, counts } = instrumented(inner);
  const view = await readPublicRecord(store, registerStore, recordId);
  assert.ok(view);
  assert.equal(counts.getRecord, 1);
});

test("fetchPublicMedia reads the record exactly once and still serves the pinned, checksum-verified bytes", async () => {
  const { inner, registerStore, mediaStore, recordId, mediaId, seeded } = await setup();
  const { store, counts } = instrumented(inner);
  const result = await fetchPublicMedia(store, registerStore, mediaStore, { recordId, mediaId });
  assert.equal(result.ok, true);
  assert.equal(counts.getRecord, 1);
  const ref = seeded.mediaRefs[0];
  assert.equal(createHash("sha256").update((result as { body: Buffer }).body).digest("hex"), ref.checksumSha256);
});

test("fetchAuthorizedMedia (staff path) reads the record exactly once", async () => {
  const { inner, registerStore, mediaStore, recordId, mediaId } = await setup();
  const { store, counts } = instrumented(inner);
  const result = await fetchAuthorizedMedia(store, registerStore, mediaStore, { recordId, mediaId, purpose: "publication", audience: "public" });
  assert.equal(result.ok, true);
  assert.equal(counts.getRecord, 1);
});

test("readPublicListing reads each evaluated candidate's record exactly once", async () => {
  const { inner, registerStore, recordId } = await setup();
  const { store, counts } = instrumented(inner);
  const listing = await readPublicListing(store, registerStore, { limit: 10, cursor: null });
  assert.deepEqual(listing.items.map((i) => i.recordId), [recordId]);
  assert.equal(counts.getRecord, 1);
});

// ---------------------------------------------------------------------------
// The snapshot is never supplied by a caller, and fails closed
// ---------------------------------------------------------------------------

test("a record read whose id doesn't match the permission query fails closed on every path", async () => {
  const { inner, registerStore, mediaStore, recordId, mediaId, seeded } = await setup();
  const impostor: FixtureRecord = { ...seeded, recordId: uuidv7() };
  const { store } = instrumented(inner, { getRecordOverride: async () => impostor });

  const snapshot = await evaluatePermissionSnapshot(store, registerStore, { recordId, purpose: "publication", audience: "public", now: new Date() });
  assert.equal(snapshot.decision.allowed, false);
  assert.equal(snapshot.record, null);

  assert.equal(await readPublicRecord(store, registerStore, recordId), null);
  const media = await fetchPublicMedia(store, registerStore, mediaStore, { recordId, mediaId });
  assert.deepEqual(media, { ok: false, statusCode: 404, reason: "Not found." });
});

test("a missing record denies with no record in the snapshot", async () => {
  const { inner, registerStore, recordId } = await setup();
  const { store } = instrumented(inner, { getRecordOverride: async () => null });
  const snapshot = await evaluatePermissionSnapshot(store, registerStore, { recordId, purpose: "publication", audience: "public", now: new Date() });
  assert.equal(snapshot.decision.allowed, false);
  assert.equal(snapshot.record, null);
});

test("a denied snapshot never hands its record back, so it can't be used for masking or media selection", async () => {
  const { inner, registerStore, recordId } = await setup();
  const snapshot = await evaluatePermissionSnapshot(inner, registerStore, { recordId, purpose: "research", audience: "research-partner", now: new Date() });
  assert.equal(snapshot.decision.allowed, false);
  assert.equal(snapshot.record, null);
});

test("the plain evaluatePermission decision carries no record content (it is returned verbatim by staff API routes)", async () => {
  const { inner, registerStore, recordId } = await setup();
  const { evaluatePermission } = await import("./permissions");
  const decision = await evaluatePermission(inner, registerStore, { recordId, purpose: "publication", audience: "public", now: new Date() });
  assert.deepEqual(Object.keys(decision).sort(), ["allowed", "control", "reason"]);
});

// ---------------------------------------------------------------------------
// Revocation/redaction landing DURING the evidence reads
// ---------------------------------------------------------------------------

test("a consent revocation landing after the grants were read still denies the record and its media", async () => {
  const { inner, registerStore, recordId, active } = await setup();
  const revoke = () =>
    revokeConsentGrant(inner, registerStore, {
      requestId: uuidv7(),
      recordId,
      requesterCapacity: CALLER,
      reason: "[SYNTHETIC] revoke mid-evaluation",
      consentId: active.consentGrants[0].consentId,
    });

  const forRecord = instrumented(inner, { afterEvidenceRead: { method: "listConsentGrants", run: revoke } });
  assert.equal(await readPublicRecord(forRecord.store, registerStore, recordId), null);
  assert.equal(forRecord.hookFired(), true, "precondition: the revocation really landed mid-evaluation");

  // Media, against a fresh fixture (the one above is already revoked).
  const fresh = await setup();
  const forMedia = instrumented(fresh.inner, {
    afterEvidenceRead: {
      method: "listConsentGrants",
      run: () =>
        revokeConsentGrant(fresh.inner, fresh.registerStore, {
          requestId: uuidv7(),
          recordId: fresh.recordId,
          requesterCapacity: CALLER,
          reason: "[SYNTHETIC] revoke mid-evaluation",
          consentId: fresh.active.consentGrants[0].consentId,
        }),
    },
  });
  const media = await fetchPublicMedia(forMedia.store, fresh.registerStore, fresh.mediaStore, { recordId: fresh.recordId, mediaId: fresh.mediaId });
  assert.deepEqual(media, { ok: false, statusCode: 404, reason: "Not found." });
  assert.equal(forMedia.hookFired(), true);
});

test("a text redaction landing during the evidence reads masks the field in the view built from the one record snapshot", async () => {
  const { inner, registerStore, recordId } = await setup();
  const { store, hookFired } = instrumented(inner, {
    afterEvidenceRead: {
      method: "listAuthorityClaims",
      run: () => redactText(inner, registerStore, { requestId: uuidv7(), recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact mid-evaluation", field: "title" }),
    },
  });
  const view = await readPublicRecord(store, registerStore, recordId);
  assert.equal(hookFired(), true, "precondition: the redaction really landed mid-evaluation");
  assert.ok(view, "text redaction keeps the record visible");
  assert.equal(view!.title, "[REDACTED]");
});

test("a media redaction landing during the evidence reads removes the media from the view and denies its bytes", async () => {
  const forView = await setup();
  const viewRun = instrumented(forView.inner, {
    afterEvidenceRead: {
      method: "listLegalRights",
      run: () => redactMedia(forView.inner, forView.registerStore, { requestId: uuidv7(), recordId: forView.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact mid-evaluation", mediaId: forView.mediaId }),
    },
  });
  const view = await readPublicRecord(viewRun.store, forView.registerStore, forView.recordId);
  assert.equal(viewRun.hookFired(), true);
  assert.ok(view);
  assert.equal(view!.media.some((m) => m.mediaId === forView.mediaId), false);

  const forMedia = await setup();
  const mediaRun = instrumented(forMedia.inner, {
    afterEvidenceRead: {
      method: "listLegalRights",
      run: () => redactMedia(forMedia.inner, forMedia.registerStore, { requestId: uuidv7(), recordId: forMedia.recordId, requesterCapacity: CALLER, reason: "[SYNTHETIC] redact mid-evaluation", mediaId: forMedia.mediaId }),
    },
  });
  const media = await fetchPublicMedia(mediaRun.store, forMedia.registerStore, forMedia.mediaStore, { recordId: forMedia.recordId, mediaId: forMedia.mediaId });
  assert.equal(mediaRun.hookFired(), true);
  assert.deepEqual(media, { ok: false, statusCode: 404, reason: "Not found." });
});

test("media is selected from the authorized snapshot: a record rewrite landing mid-evaluation can't swap in a different pinned version or checksum", async () => {
  const { inner, registerStore, mediaStore, recordId, mediaId, seeded } = await setup();
  const originalRef = seeded.mediaRefs[0];
  const { store, hookFired } = instrumented(inner, {
    afterEvidenceRead: {
      method: "listConsentGrants",
      run: async () => {
        const current = (await inner.getRecord(recordId))!;
        await inner.putRecord(
          { ...current, mediaRefs: current.mediaRefs.map((m) => (m.mediaId === mediaId ? { ...m, versionId: "some-other-version", checksumSha256: "f".repeat(64) } : m)) },
          current.version,
        );
      },
    },
  });
  const result = await fetchPublicMedia(store, registerStore, mediaStore, { recordId, mediaId });
  assert.equal(hookFired(), true);
  assert.equal(result.ok, true, "served from the snapshot's own pinned reference");
  assert.equal(createHash("sha256").update((result as { body: Buffer }).body).digest("hex"), originalRef.checksumSha256);
});

test("fetchPublicMedia still 404s a non-synthetic record after read-once (synthetic check runs on the snapshot)", async () => {
  const { inner, registerStore, mediaStore, recordId, mediaId, seeded } = await setup();
  const { store, counts } = instrumented(inner, { getRecordOverride: async () => ({ ...seeded, isSynthetic: false as true }) });
  const result = await fetchPublicMedia(store, registerStore, mediaStore, { recordId, mediaId });
  assert.deepEqual(result, { ok: false, statusCode: 404, reason: "Not found." });
  assert.equal(counts.getRecord, 1);
  assert.equal(await readPublicRecord(store, registerStore, recordId), null);
});
