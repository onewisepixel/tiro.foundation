// Regression coverage for Finding 3: export previously only checked
// currentPublicationStatus directly (public-redacted) or nothing at all
// (complete-preservation), so a record that evaluatePermission would deny
// (disputed authority, expired consent) could still be exported. Both scopes
// must now run the real scoped permission check per record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { exportFixtureSet } from "./export";

test("public-redacted export omits a record whose authority is disputed, even though publicationStatus alone looks published", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, , disputed] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [disputed]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [disputed.record.recordId],
    "public-redacted",
    "export-test-disputed",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("public-redacted export omits a record whose consent has expired", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, expired] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [expired]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [expired.record.recordId],
    "public-redacted",
    "export-test-expired",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("complete-preservation export also honors the authorization gate, not just public-redacted", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, , disputed] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [disputed]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [disputed.record.recordId],
    "complete-preservation",
    "export-test-complete",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("an authorized record is still included — the gate denies correctly, it doesn't deny everything", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "public-redacted",
    "export-test-active",
    "public",
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].consentGrants, "redacted-for-public-export");
});

test("public-redacted export omits media bytes, same as it redacts consent evidence", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "public-redacted",
    "export-test-media-redacted",
    "public",
    mediaStore,
  );

  assert.equal(result.records[0].mediaObjects, "omitted-for-public-export");
});

test("complete-preservation export includes real media bytes for every version-bound reference", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "export-test-media-included",
    "public",
    mediaStore,
  );

  const envelope = result.records[0];
  assert.notEqual(envelope.mediaObjects, "omitted-for-public-export");
  const objects = envelope.mediaObjects as { mediaId: string; base64: string }[];
  assert.equal(objects.length, active.record.mediaRefs.length);
  for (const media of active.record.mediaRefs) {
    const exported = objects.find((o) => o.mediaId === media.mediaId);
    assert.ok(exported, `media ${media.mediaId} must be present in the export`);
    const decoded = Buffer.from(exported!.base64, "base64");
    assert.equal(decoded.length, media.bytes);
  }
  assert.deepEqual(envelope.mediaObjectsSkipped, []);
});

test("complete-preservation export skips (rather than fails) a legacy reference with no bound version", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures(); // NOT bound — mediaRefs[0].versionId is null
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "export-test-legacy-skip",
    "public",
    mediaStore,
  );

  const envelope = result.records[0];
  assert.deepEqual(envelope.mediaObjects, []);
  assert.equal(envelope.mediaObjectsSkipped.length, 1);
  assert.match(envelope.mediaObjectsSkipped[0].reason, /legacy|version/i);
});

test("complete-preservation export also carries safe lifecycle history (audit receipts)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  await fixtureStore.putAuditReceipt({
    recordId: active.record.recordId,
    receiptId: "receipt-1",
    action: "restrict",
    outcome: "completed",
    safeNote: "[SYNTHETIC] test receipt",
    at: new Date().toISOString(),
  });

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "export-test-receipts",
    "public",
  );

  assert.equal(result.records[0].auditReceipts.length, 1);
  assert.equal(result.records[0].auditReceipts[0].receiptId, "receipt-1");
});
