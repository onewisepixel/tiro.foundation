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
import { exportFixtureSet, MAX_EXPORT_RESPONSE_BYTES } from "./export";
import { MAX_MEDIA_BYTES } from "./media";
import { correctRecord, redactText } from "./lifecycle";

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

test(
  "repeating one recordId many times does not duplicate it in the export (reviewer-reproduced amplification)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, registerStore, [active]);

    const result = await exportFixtureSet(
      fixtureStore,
      registerStore,
      Array(20).fill(active.record.recordId),
      "complete-preservation",
      "export-test-dedup",
      "public",
      mediaStore,
    );

    assert.equal(result.records.length, 1, "the record must appear exactly once, not 20 times");
    assert.equal(result.manifest.recordCount, 1);
  },
);

test("a media object exceeding the per-object export cap is skipped, not embedded", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  // Replace the text media's bound version with an oversized object at the
  // same key, re-binding the MediaRef to the new (too-large) version.
  const textMedia = active.record.mediaRefs[0];
  const oversized = await mediaStore.putObject(
    textMedia.objectKey,
    Buffer.alloc(MAX_MEDIA_BYTES + 1, "x"),
    "text/plain",
  );
  textMedia.versionId = oversized.versionId;
  textMedia.bytes = oversized.bytes;
  textMedia.checksumSha256 = oversized.sha256;
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "export-test-per-object-cap",
    "public",
    mediaStore,
  );

  const envelope = result.records[0];
  const objects = envelope.mediaObjects as { mediaId: string; base64: string }[];
  assert.equal(objects.some((o) => o.mediaId === textMedia.mediaId), false, "the oversized object must not be embedded");
  const skipped = envelope.mediaObjectsSkipped.find((s) => s.mediaId === textMedia.mediaId);
  assert.ok(skipped, "the oversized object must be reported as skipped, not silently dropped");
  assert.match(skipped!.reason, /cap/i);
});

test("an aggregate media budget bounds the exported media's SERIALIZED (base64) size across many distinct records, skipping the rest rather than growing forever", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const recordIds: string[] = [];
  const perObjectBytes = 200 * 1024; // under the 256 KiB per-object cap
  // MAX_EXPORT_RESPONSE_BYTES is 5 MiB; 30 distinct records at ~200 KiB
  // raw each sum to ~6 MiB RAW (already over budget on raw bytes alone),
  // and comfortably more once base64 is accounted for — enough to force
  // the budget to actually bind without needing a single huge object
  // (which the per-object cap would reject first, testing the wrong limit).
  for (let i = 0; i < 30; i++) {
    const [fixture] = buildSeedFixtures();
    fixture.record.mediaRefs = []; // drop the placeholder text ref; use one real sized object below
    const uploaded = await mediaStore.putObject(`fixtures/aggregate-test/${i}.bin`, Buffer.alloc(perObjectBytes, i % 256), "application/octet-stream");
    fixture.record.mediaRefs.push({
      mediaId: `media-${i}`,
      objectKey: `fixtures/aggregate-test/${i}.bin`,
      bytes: uploaded.bytes,
      checksumSha256: uploaded.sha256,
      contentType: "application/octet-stream",
      versionId: uploaded.versionId,
    });
    await seedStore(fixtureStore, registerStore, [fixture]);
    recordIds.push(fixture.record.recordId);
  }

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    recordIds,
    "complete-preservation",
    "export-test-aggregate-cap",
    "public",
    mediaStore,
  );

  const totalSerializedMediaBytes = result.records.reduce((sum, envelope) => {
    const objects = envelope.mediaObjects === "omitted-for-public-export" ? [] : envelope.mediaObjects;
    return sum + objects.reduce((s, o) => s + o.base64.length, 0);
  }, 0);
  assert.ok(
    totalSerializedMediaBytes <= MAX_EXPORT_RESPONSE_BYTES,
    `total serialized (base64) media bytes (${totalSerializedMediaBytes}) must never exceed the response budget (${MAX_EXPORT_RESPONSE_BYTES})`,
  );
  const anySkippedForBudget = result.records.some((envelope) =>
    envelope.mediaObjectsSkipped.some((s) => /budget/i.test(s.reason)),
  );
  assert.ok(anySkippedForBudget, "at least one object must actually be skipped for the budget — proving it bound, not just happened to fit");
});

test(
  "twenty distinct, individually-authorized 256 KiB records produce a serialized export response safely under Lambda's 6 MB synchronous limit (exact reviewer reproduction)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const recordIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const [fixture] = buildSeedFixtures();
      fixture.record.mediaRefs = [];
      const uploaded = await mediaStore.putObject(
        `fixtures/lambda-limit-test/${i}.bin`,
        Buffer.alloc(MAX_MEDIA_BYTES, i % 256),
        "application/octet-stream",
      );
      fixture.record.mediaRefs.push({
        mediaId: `media-${i}`,
        objectKey: `fixtures/lambda-limit-test/${i}.bin`,
        bytes: uploaded.bytes,
        checksumSha256: uploaded.sha256,
        contentType: "application/octet-stream",
        versionId: uploaded.versionId,
      });
      await seedStore(fixtureStore, registerStore, [fixture]);
      recordIds.push(fixture.record.recordId);
    }

    const result = await exportFixtureSet(
      fixtureStore,
      registerStore,
      recordIds,
      "complete-preservation",
      "lambda-limit-test",
      "public",
      mediaStore,
    );

    const LAMBDA_SYNC_RESPONSE_LIMIT_BYTES = 6 * 1024 * 1024;
    const serializedSize = Buffer.byteLength(JSON.stringify(result), "utf8");
    assert.ok(
      serializedSize < LAMBDA_SYNC_RESPONSE_LIMIT_BYTES,
      `the full serialized export response (${serializedSize} bytes) must stay under Lambda's ${LAMBDA_SYNC_RESPONSE_LIMIT_BYTES}-byte synchronous response limit — this reproduced 7,035,395 bytes before the fix`,
    );
    const totalSkippedForBudget = result.records.reduce(
      (count, envelope) => count + envelope.mediaObjectsSkipped.filter((s) => /budget/i.test(s.reason)).length,
      0,
    );
    assert.ok(totalSkippedForBudget > 0, "at least one of the 20 records' media must actually be skipped — proving the budget bound real content, not that 20 objects coincidentally fit");
  },
);

test(
  "twenty records with large TEXT fields and no media stay under Lambda's 6 MB synchronous limit — the budget covers the whole response, not just media (exact reviewer reproduction)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const recordIds: string[] = [];
    const largeText = "x".repeat(400_000); // ~400 KB of text, no media at all
    for (let i = 0; i < 20; i++) {
      const [fixture] = buildSeedFixtures();
      fixture.record.mediaRefs = [];
      fixture.record.summary = largeText;
      await seedStore(fixtureStore, registerStore, [fixture]);
      recordIds.push(fixture.record.recordId);
    }

    const result = await exportFixtureSet(
      fixtureStore,
      registerStore,
      recordIds,
      "complete-preservation",
      "lambda-limit-text-test",
      "public",
    );

    const LAMBDA_SYNC_RESPONSE_LIMIT_BYTES = 6 * 1024 * 1024;
    const serializedSize = Buffer.byteLength(JSON.stringify(result), "utf8");
    assert.ok(
      serializedSize < LAMBDA_SYNC_RESPONSE_LIMIT_BYTES,
      `the full serialized export response (${serializedSize} bytes) must stay under Lambda's ${LAMBDA_SYNC_RESPONSE_LIMIT_BYTES}-byte synchronous response limit — this reproduced 9,032,712 bytes before the fix, because the old budget only ever measured media's contribution`,
    );
    assert.ok(
      result.records.length < 20,
      "with no media at all, the ONLY way this budget can bind is by excluding whole records for their text content — fewer than all 20 must make it in",
    );
    assert.ok(
      result.recordsSkippedForResponseBudget.length > 0,
      "excluded records must be reported, never silently dropped — same as mediaObjectsSkipped",
    );
    assert.equal(
      result.records.length + result.recordsSkippedForResponseBudget.length,
      20,
      "every record must be accounted for: either included or explicitly reported as skipped for the budget",
    );
  },
);

test("complete-preservation export carries full correction history and the real pre-redaction text", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  await correctRecord(fixtureStore, {
    requestId: "req-export-correct",
    recordId: active.record.recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    field: "summary",
    correctedValue: "[SYNTHETIC] corrected summary",
  });
  await redactText(fixtureStore, registerStore, {
    requestId: "req-export-redact",
    recordId: active.record.recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    field: "title",
  });

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "export-test-corrections-redactions",
    "public",
  );

  const envelope = result.records[0];
  assert.equal(envelope.corrections.length, 1);
  assert.equal(envelope.corrections[0].correctedValue, "[SYNTHETIC] corrected summary");
  assert.notEqual(envelope.redactions, "redacted-for-public-export");
  if (envelope.redactions !== "redacted-for-public-export") {
    assert.equal(envelope.redactions.length, 1);
    const redaction = envelope.redactions[0];
    assert.equal(redaction.scope, "text");
    if (redaction.scope === "text") {
      assert.ok(redaction.previousValue.length > 0, "complete-preservation custody is authorized to hold the real pre-redaction text");
      assert.notEqual(redaction.previousValue, "[REDACTED]");
    }
  }
});

test("public-redacted export omits the pre-redaction original text, same as it redacts consent evidence and media", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  await redactText(fixtureStore, registerStore, {
    requestId: "req-export-redact-public",
    recordId: active.record.recordId,
    requesterCapacity: "[SYNTHETIC] curator",
    reason: "[SYNTHETIC] test",
    field: "summary",
  });

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "public-redacted",
    "export-test-public-redaction",
    "public",
  );

  assert.equal(result.records[0].redactions, "redacted-for-public-export");
});

test(
  "public-redacted export masks a redacted field's correction history too, not just the live value — complete-preservation keeps the full archival history (reviewer-caught finding)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    await correctRecord(fixtureStore, {
      requestId: "req-export-mask-correct",
      recordId: active.record.recordId,
      requesterCapacity: "[SYNTHETIC] curator",
      reason: "[SYNTHETIC] fixing a typo",
      field: "title",
      correctedValue: "[SYNTHETIC] corrected title",
    });
    await redactText(fixtureStore, registerStore, {
      requestId: "req-export-mask-redact",
      recordId: active.record.recordId,
      requesterCapacity: "[SYNTHETIC] curator",
      reason: "[SYNTHETIC] sensitive title",
      field: "title",
    });

    const publicResult = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [active.record.recordId],
      "public-redacted",
      "export-test-mask-public",
      "public",
    );
    const publicEnvelope = publicResult.records[0];
    assert.equal(publicEnvelope.record.title, "[REDACTED]", "the live field must be masked in a public export");
    assert.equal(publicEnvelope.corrections.length, 1);
    assert.equal(publicEnvelope.corrections[0].previousValue, "[REDACTED]", "a redacted field's correction history must be masked in a public export too");
    assert.equal(publicEnvelope.corrections[0].correctedValue, "[REDACTED]");

    const archivalResult = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [active.record.recordId],
      "complete-preservation",
      "export-test-mask-archival",
      "public",
    );
    const archivalEnvelope = archivalResult.records[0];
    assert.equal(archivalEnvelope.record.title, "[REDACTED]", "the live field stays masked even for the archival scope — the register, not the scope, controls this");
    assert.equal(
      archivalEnvelope.corrections[0].correctedValue,
      "[SYNTHETIC] corrected title",
      "complete-preservation is the one scope authorized to hold the full unredacted archival correction history",
    );
  },
);
