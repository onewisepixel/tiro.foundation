import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { fetchAuthorizedMedia, MAX_MEDIA_BYTES } from "./media";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active, expired, disputed] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active, expired, disputed]);
  return { fixtureStore, registerStore, mediaStore, active, expired, disputed };
}

// Counts getObject calls so denial-path tests can prove the media store was
// never even touched, not just that the final answer was a denial.
class CountingMediaStore extends InMemoryMediaStore {
  getObjectCalls = 0;
  override async getObject(key: string, versionId: string) {
    this.getObjectCalls += 1;
    return super.getObject(key, versionId);
  }
}

test("allowed access returns the exact bytes that were uploaded, with a verified checksum", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const textMedia = active.record.mediaRefs[0];
  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: textMedia.mediaId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.contentType, "text/plain");
    assert.equal(result.bytes, textMedia.bytes);
    assert.equal(result.body.toString("utf8"), `[SYNTHETIC] dummy text content for record ${active.record.recordId}.\n`);
  }
});

test("a version-pinned MediaRef keeps serving its bound version even after the key gets a newer version", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const binaryMedia = active.record.mediaRefs[1];
  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: binaryMedia.mediaId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.bytes, 8, "must be v1's byte count, not v2's (which has 9 bytes)");
    assert.deepEqual([...result.body], [0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc]);
  }
});

test("denied permission returns no bytes and never touches the media store (Finding-1-style gate)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new CountingMediaStore();
  const [, expired] = buildSeedFixtures();
  // expired has no mediaRefs by default from seed.ts — give it one bound ref
  // directly so this test can prove the permission gate runs BEFORE any
  // media lookup even when a real bound reference exists.
  const uploaded = await mediaStore.putObject("fixtures/expired/x.txt", Buffer.from("x"), "text/plain");
  expired.record.mediaRefs.push({
    mediaId: "media-on-denied-record",
    objectKey: "fixtures/expired/x.txt",
    bytes: 1,
    checksumSha256: uploaded.sha256,
    contentType: "text/plain",
    versionId: uploaded.versionId,
  });
  await seedStore(fixtureStore, registerStore, [expired]);

  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: expired.record.recordId,
    mediaId: "media-on-denied-record",
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.statusCode, 403);
  assert.equal(mediaStore.getObjectCalls, 0, "a denied permission check must short-circuit before any media store call");
});

test("a legacy reference with no bound version fails closed (409), never guessing a version", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  // Directly construct a legacy-shaped ref (as buildSeedFixtures() alone,
  // without bindSeedMedia, would produce) and attach it to the live record.
  const record = await fixtureStore.getRecord(active.record.recordId);
  const legacyMediaId = "legacy-unbound-media";
  record!.mediaRefs.push({
    mediaId: legacyMediaId,
    objectKey: "fixtures/legacy/never-bound.txt",
    bytes: 10,
    checksumSha256: "0".repeat(64),
    contentType: "text/plain",
    versionId: null,
  });
  await fixtureStore.putRecord(record!, record!.version);

  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: legacyMediaId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 409);
    assert.match(result.reason, /legacy|no bound/i);
  }
});

test("a reference claiming more than the 256 KiB cap is rejected before any buffering", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const mediaStore = new CountingMediaStore();
  const record = await fixtureStore.getRecord(active.record.recordId);
  const oversizedId = "oversized-media";
  record!.mediaRefs.push({
    mediaId: oversizedId,
    objectKey: "fixtures/active/huge.bin",
    bytes: MAX_MEDIA_BYTES + 1,
    checksumSha256: "a".repeat(64),
    contentType: "application/octet-stream",
    versionId: "some-version",
  });
  await fixtureStore.putRecord(record!, record!.version);

  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: oversizedId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.statusCode, 413);
  assert.equal(mediaStore.getObjectCalls, 0, "the size cap must reject before ever calling getObject");
});

test(
  "a reference whose RECORDED size looks fine but whose REAL stored object is oversized is still rejected before buffering (bounded reads)",
  async () => {
    // Reviewer-caught gap: trusting only the recorded `media.bytes` metadata
    // means a real object that's larger than recorded (drift, or a crafted
    // upload) would sail past that check and get fully buffered by
    // getObject before the post-fetch size check ever ran. headObjectSize
    // must catch this via a bodyless HEAD, before getObject is called at all.
    class DriftingMediaStore extends InMemoryMediaStore {
      getObjectCalls = 0;
      override async headObjectSize(): Promise<number> {
        return MAX_MEDIA_BYTES + 999_999; // real size, far larger than recorded
      }
      override async getObject(key: string, versionId: string) {
        this.getObjectCalls += 1;
        return super.getObject(key, versionId);
      }
    }
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new DriftingMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, registerStore, [active]);
    const textMedia = active.record.mediaRefs[0]; // recorded bytes well under the cap

    const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
      recordId: active.record.recordId,
      mediaId: textMedia.mediaId,
      purpose: "publication",
      audience: "public",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.statusCode, 413);
    assert.equal(mediaStore.getObjectCalls, 0, "a bounded HEAD check must reject drift before ever buffering the body");
  },
);

test("a bound reference whose object no longer exists in storage returns 404, not a crash", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const binaryMedia = active.record.mediaRefs[1];
  // Simulate the object having been purged already (e.g. a prior deletion).
  for (const v of await mediaStore.listObjectVersions(binaryMedia.objectKey)) {
    await mediaStore.deleteObjectVersion(binaryMedia.objectKey, v.versionId);
  }
  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: binaryMedia.mediaId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.statusCode, 404);
});

test("a checksum mismatch between the stored reference and the retrieved bytes is refused, not silently served", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const record = await fixtureStore.getRecord(active.record.recordId);
  const textMedia = record!.mediaRefs[0];
  textMedia.checksumSha256 = "0".repeat(64); // tamper with the recorded checksum
  await fixtureStore.putRecord(record!, record!.version);

  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: textMedia.mediaId,
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 500);
    assert.match(result.reason, /checksum/i);
  }
});

test("an unknown mediaId on a real record returns 404", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const result = await fetchAuthorizedMedia(fixtureStore, registerStore, mediaStore, {
    recordId: active.record.recordId,
    mediaId: "does-not-exist",
    purpose: "publication",
    audience: "public",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.statusCode, 404);
});
