// The central acceptance test for this milestone (docs/ethos.txt §6 /
// the AWS handoff brief §6): restoring an export that predates a withdrawal
// must not revive access. This is a LOGIC-LEVEL proof against the in-memory
// fake — see memoryStore.ts's header comment for exactly what that does and
// does not prove. The real-AWS version of this drill (actual DynamoDB
// backup/restore) is tracked separately in docs/backend/evidence-matrix.md
// and requires a live account connection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { exportFixtureSet } from "./export";
import { importExport, reconcileRestoredRecords, validateExport } from "./restore";
import { withdraw, startDeletion, revokeConsentGrant } from "./lifecycle";
import { evaluatePermission } from "./permissions";

test("restoring a pre-withdrawal backup does not revive access (T0-T3)", async () => {
  // --- T0: seed an authorized record, take a backup (export) while access is allowed.
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const preWithdrawalDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(preWithdrawalDecision.allowed, true, "sanity check: T0 state must actually be authorized");

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [recordId],
    "complete-preservation",
    "t0-backup",
    "public",
  );
  assert.equal(validateExport(backupExport).ok, true);

  // --- T1: AFTER that backup, withdraw the record and start deletion.
  const withdrawal = await withdraw(fixtureStore, registerStore, {
    requestId: "req-withdraw-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] test withdrawal",
  });
  assert.equal(withdrawal.status, "completed");

  const deletion = await startDeletion(fixtureStore, registerStore, {
    requestId: "req-delete-1",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] test deletion",
  });
  assert.equal(deletion.status, "completed");

  const postWithdrawalDecision = await evaluatePermission(fixtureStore, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(postWithdrawalDecision.allowed, false, "sanity check: T1 state must actually be denied");

  // --- T2: restore the OLD (pre-withdrawal) backup into a FRESH, isolated target store.
  // Deliberately a brand-new store, not the one that was just withdrawn from —
  // this is what "fresh isolated target, serving disabled" means at the logic level.
  const restoredTarget = new InMemoryFixtureStore();
  const importResult = await importExport(restoredTarget, backupExport);
  assert.equal(importResult.imported, 1);

  // Confirm the restored target really does contain the OLD, pre-withdrawal
  // published status — proving this is a meaningful test of reconciliation,
  // not a trivial pass because the restored data already looks denied.
  const restoredRecord = await restoredTarget.getRecord(recordId);
  assert.equal(restoredRecord?.publicationStatus, "published");

  // --- T3: reconcile against the CURRENT (post-T1) restriction register —
  // NOT the register bundled in the export, and NOT a new one derived from
  // the restored target — before permitting any serving.
  const reconciliation = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, {
    purpose: "publication",
    audience: "public",
  });
  assert.equal(reconciliation.length, 1);
  assert.equal(reconciliation[0].servable, false, "restored content must not be servable after a later withdrawal");
  assert.equal(reconciliation[0].exportedPublicationStatus, "published", "the export itself is confirmed to carry the old, now-stale status");
  assert.equal(reconciliation[0].currentPublicationStatus, "withdrawn");

  // Belt-and-suspenders: a permission check against the restored target,
  // using the real (untouched) register, must also deny.
  const postRestoreDecision = await evaluatePermission(restoredTarget, registerStore, {
    recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(postRestoreDecision.allowed, false);
});

test("restoring a backup for a record with NO later changes remains servable", async () => {
  // Negative control: the reconciliation logic isn't just "always deny after
  // restore" — an export whose record was never touched afterward should
  // still check out as servable.
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [recordId],
    "complete-preservation",
    "control-backup",
    "public",
  );

  const restoredTarget = new InMemoryFixtureStore();
  await importExport(restoredTarget, backupExport);

  const reconciliation = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, {
    purpose: "publication",
    audience: "public",
  });
  assert.equal(reconciliation[0].servable, true);
});

test("concurrent restriction during a restore still wins — reconciliation reads current state at call time", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [recordId],
    "complete-preservation",
    "race-backup",
    "public",
  );
  const restoredTarget = new InMemoryFixtureStore();
  await importExport(restoredTarget, backupExport);

  // Simulate a restriction landing WHILE a restore is "in flight" — i.e.
  // between taking the export and calling reconcile.
  await withdraw(fixtureStore, registerStore, {
    requestId: "req-race-withdraw",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] race condition test",
  });

  const reconciliation = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, {
    purpose: "publication",
    audience: "public",
  });
  assert.equal(reconciliation[0].servable, false);
});

test("repeated reconciliation replay is safe and consistent", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;
  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [recordId],
    "complete-preservation",
    "replay-backup",
    "public",
  );
  const restoredTarget = new InMemoryFixtureStore();
  await importExport(restoredTarget, backupExport);

  await withdraw(fixtureStore, registerStore, {
    requestId: "req-replay-withdraw",
    recordId,
    requesterCapacity: "[SYNTHETIC] source authority",
    reason: "[SYNTHETIC] replay test",
  });

  const query = { purpose: "publication" as const, audience: "public" as const };
  const first = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, query);
  const second = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, query);
  assert.deepEqual(first, second);
  assert.equal(first[0].servable, false);
});

test(
  "restoring a backup predating a consent revocation does not revive access — grant-level, not just record-level (Finding 1)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const consentId = active.consentGrants[0].consentId;

    // T0: backup while the grant is still active.
    const backupExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [recordId],
      "complete-preservation",
      "consent-revoke-backup",
      "public",
    );

    // T1: revoke the GRANT specifically (not a full record withdrawal).
    await revokeConsentGrant(fixtureStore, registerStore, {
      requestId: "req-revoke-1",
      recordId,
      requesterCapacity: "[SYNTHETIC] source authority",
      reason: "[SYNTHETIC] revoke test",
      consentId,
    });

    const liveDecision = await evaluatePermission(fixtureStore, registerStore, {
      recordId,
      purpose: "publication",
      audience: "public",
      now: new Date(),
    });
    assert.equal(liveDecision.allowed, false, "sanity check: live access must actually be denied after revocation");

    // T2: restore the OLD backup (its grant still shows unrevoked) into a fresh store.
    const restoredTarget = new InMemoryFixtureStore();
    await importExport(restoredTarget, backupExport);
    const restoredGrant = (await restoredTarget.listConsentGrants(recordId))[0];
    assert.equal(
      restoredGrant.revokedAt,
      null,
      "sanity check: the restored grant row itself must look unrevoked — that's the whole point of this test",
    );

    // T3: permission evaluation against the restored (stale, looks-unrevoked)
    // grant data, combined with the CURRENT (untouched) register, must still
    // deny — the register's revokedConsentIds is consulted in addition to,
    // never instead of, the grant row's own revokedAt.
    const postRestoreDecision = await evaluatePermission(restoredTarget, registerStore, {
      recordId,
      purpose: "publication",
      audience: "public",
      now: new Date(),
    });
    assert.equal(
      postRestoreDecision.allowed,
      false,
      "the register must deny even though the restored grant row looks unrevoked",
    );
  },
);

test(
  "reconcileRestoredRecords and evaluatePermission never disagree after a grant-level revocation restore",
  async () => {
    // Regression for a reviewer-reported disagreement: after revoking a
    // grant and restoring its old (pre-revocation) backup, evaluatePermission
    // correctly denied access, but reconcileRestoredRecords still returned
    // servable: true — because it only checked record-level
    // publicationStatus/custodyStatus, never the register's
    // revokedConsentIds or the restored grant data. reconcileRestoredRecords
    // now delegates to evaluatePermission directly, so the two cannot
    // disagree — this test would have failed before that fix.
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    const recordId = active.record.recordId;
    const consentId = active.consentGrants[0].consentId;

    const backupExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [recordId],
      "complete-preservation",
      "reconcile-revoke-backup",
      "public",
    );

    await revokeConsentGrant(fixtureStore, registerStore, {
      requestId: "req-reconcile-revoke-1",
      recordId,
      requesterCapacity: "[SYNTHETIC] source authority",
      reason: "[SYNTHETIC] reconciliation disagreement regression",
      consentId,
    });

    const restoredTarget = new InMemoryFixtureStore();
    await importExport(restoredTarget, backupExport);

    const query = { purpose: "publication" as const, audience: "public" as const };
    const reconciliation = await reconcileRestoredRecords(restoredTarget, registerStore, backupExport.records, query);
    const decision = await evaluatePermission(restoredTarget, registerStore, {
      recordId,
      ...query,
      now: new Date(),
    });

    assert.equal(
      reconciliation[0].servable,
      decision.allowed,
      "reconciliation's servable flag and evaluatePermission's decision must never disagree",
    );
    assert.equal(
      reconciliation[0].servable,
      false,
      "a grant-level revocation must deny reconciliation, not just evaluatePermission",
    );
  },
);

test("validateExport rejects a non-empty checksum that is not valid SHA-256 hex (Finding 5b)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [recordId],
    "complete-preservation",
    "checksum-test",
    "public",
  );
  backupExport.records[0].record.mediaRefs[0].checksumSha256 = "not-a-checksum";

  const result = validateExport(backupExport);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /invalid or missing SHA-256/);
});

test("validateExport rejects a tampered media object whose bytes don't match the record's recorded checksum/length", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "tamper-test",
    "public",
    mediaStore,
  );
  const objects = backupExport.records[0].mediaObjects as { mediaId: string; base64: string }[];
  assert.ok(objects.length > 0, "sanity check: the export must actually carry media bytes to tamper with");
  objects[0].base64 = Buffer.from("[SYNTHETIC] tampered replacement bytes").toString("base64");

  const result = validateExport(backupExport);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /tamper/i);

  await assert.rejects(() => importExport(new InMemoryFixtureStore(), backupExport), /Rejecting import/);
});

test("importExport with a targetMediaStore re-uploads media into the isolated target and rebinds to its own new version", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const sourceMediaStore = new InMemoryMediaStore();
  const [active] = buildSeedFixtures();
  await bindSeedMedia(sourceMediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);
  const originalVersionId = active.record.mediaRefs[0].versionId;

  const backupExport = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "complete-preservation",
    "rebind-test",
    "public",
    sourceMediaStore,
  );

  const targetFixtureStore = new InMemoryFixtureStore();
  const targetMediaStore = new InMemoryMediaStore();
  const textMedia = active.record.mediaRefs[0];
  assert.ok(originalVersionId, "sanity check: the source reference really was bound before export");
  // Sanity check: the ISOLATED target's own media store starts with
  // nothing at this key — proving any version found there after import was
  // actually produced by THIS import, not pre-existing.
  assert.deepEqual(await targetMediaStore.listObjectVersions(textMedia.objectKey), []);

  const importResult = await importExport(targetFixtureStore, backupExport, targetMediaStore);

  assert.equal(importResult.mediaRebound.length, active.record.mediaRefs.length);
  const restoredRecord = await targetFixtureStore.getRecord(active.record.recordId);
  const restoredMedia = restoredRecord!.mediaRefs[0];

  const targetVersions = await targetMediaStore.listObjectVersions(restoredMedia.objectKey);
  assert.equal(targetVersions.length, 1, "the import must have uploaded exactly one new version into the target");
  assert.equal(restoredMedia.versionId, targetVersions[0].versionId, "the rebound reference must point at THAT new version");

  // The restored target's media store must actually serve those exact bytes
  // under the new binding.
  const fetched = await targetMediaStore.getObject(restoredMedia.objectKey, restoredMedia.versionId!);
  assert.ok(fetched);
  assert.equal(fetched?.sha256, restoredMedia.checksumSha256);
});

test(
  "validateExport rejects a package whose mediaObjects was stripped to [] while its record still claims version-bound media (reviewer-caught finding)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, registerStore, [active]);

    const backupExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [active.record.recordId],
      "complete-preservation",
      "strip-test",
      "public",
      mediaStore,
    );
    assert.ok((backupExport.records[0].mediaObjects as unknown[]).length > 0, "sanity check: the honest export really did carry media");

    // The exact repro: empty mediaObjects while record.mediaRefs still
    // claims real version bindings, WITHOUT updating mediaObjectsSkipped to
    // match — the mismatch itself is what must be caught.
    backupExport.records[0].mediaObjects = [];

    const result = validateExport(backupExport);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /neither included nor recorded as skipped|incomplete/i);

    await assert.rejects(() => importExport(new InMemoryFixtureStore(), backupExport), /Rejecting import/);
  },
);

test(
  "importExport clears the versionId of media the export honestly recorded as skipped, so a restored fetch fails closed instead of 404ing confusingly",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const mediaStore = new InMemoryMediaStore();
    const [active] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await seedStore(fixtureStore, registerStore, [active]);
    const textMedia = active.record.mediaRefs[0];

    // Force a legitimate skip: delete the bound version out from under the
    // export so exportFixtureSet records it in mediaObjectsSkipped rather
    // than failing outright (the "bound version no longer exists" path).
    await mediaStore.deleteObjectVersion(textMedia.objectKey, textMedia.versionId!);

    const backupExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [active.record.recordId],
      "complete-preservation",
      "skip-test",
      "public",
      mediaStore,
    );
    const skipped = backupExport.records[0].mediaObjectsSkipped.find((s) => s.mediaId === textMedia.mediaId);
    assert.ok(skipped, "sanity check: the export must have actually recorded this as skipped, not failed");

    assert.equal(validateExport(backupExport).ok, true, "an HONEST skip must still validate — completeness means accounted-for, not exhaustive");

    const targetFixtureStore = new InMemoryFixtureStore();
    const importResult = await importExport(targetFixtureStore, backupExport);
    assert.equal(importResult.mediaBindingsCleared.some((c) => c.mediaId === textMedia.mediaId), true);

    const restoredRecord = await targetFixtureStore.getRecord(active.record.recordId);
    const restoredMedia = restoredRecord!.mediaRefs.find((m) => m.mediaId === textMedia.mediaId);
    assert.equal(restoredMedia?.versionId, null, "the cleared binding must be null, not the meaningless source versionId");
  },
);

test(
  "importExport restores audit receipts — previously dropped entirely (reviewer-caught finding)",
  async () => {
    const fixtureStore = new InMemoryFixtureStore();
    const registerStore = new InMemoryRestrictionRegisterStore();
    const [active] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active]);
    await fixtureStore.putAuditReceipt({
      recordId: active.record.recordId,
      receiptId: "receipt-restore-test",
      action: "restrict",
      outcome: "completed",
      safeNote: "[SYNTHETIC] test receipt",
      at: new Date().toISOString(),
    });

    const backupExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [active.record.recordId],
      "complete-preservation",
      "receipt-restore-test",
      "public",
    );
    assert.equal(backupExport.records[0].auditReceipts.length, 1, "sanity check: the export really does carry the receipt");

    const restoredTarget = new InMemoryFixtureStore();
    await importExport(restoredTarget, backupExport);
    const restoredReceipts = await restoredTarget.listAuditReceipts(active.record.recordId);
    assert.equal(restoredReceipts.length, 1, "the restored store must actually contain the receipt, not zero");
    assert.equal(restoredReceipts[0].receiptId, "receipt-restore-test");

    // Safe replay: importing the SAME export again must not duplicate it.
    await importExport(restoredTarget, backupExport);
    const afterReplay = await restoredTarget.listAuditReceipts(active.record.recordId);
    assert.equal(afterReplay.length, 1, "replaying the same import must not duplicate the receipt");
  },
);
