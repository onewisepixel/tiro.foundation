// Manually-invoked script — NOT part of `npm test`, NOT run in CI. One
// reusable live-AWS acceptance drill for the S3 media milestone, folding in
// the two completeDeletion checks a prior review round left outstanding
// (see docs/backend/evidence-matrix.md's "AWS checks still not run" table
// before this drill closed them).
//
// Covers, each against the REAL deployed stack:
//   1. Unauthenticated denial, both at the API (no bearer token) and
//      directly at S3 (an unsigned HTTPS GET to the object's bucket URL).
//   2. Permitted exact-byte retrieval through the real authenticated API.
//   3. Denial for purpose/audience mismatch, expired consent, and disputed
//      authority — all through the real media route.
//   4. A media fetch denied the moment AFTER a withdrawal/grant-revocation,
//      reusing the EXACT SAME API URL that was allowed a moment before —
//      proving there is no cached or reusable download capability.
//   5. Export/restore: real media bytes carried through a complete-
//      preservation export, a tampered copy rejected by validateExport,
//      and reconciliation against the LIVE register denying revoked access
//      even though the restored (isolated) copy looks unrevoked. A THIRD,
//      untouched record is restored as a positive control and remains
//      servable — proving reconciliation isn't just "always deny".
//   6. Real S3 version/delete-marker inventory and removal via
//      completeDeletion's purge step — including a delete marker created
//      OUTSIDE this system's normal path (simulating e.g. a console action
//      or another tool), to prove removing a marker alone is never treated
//      as sufficient.
//   7. The two outstanding completeDeletion checks: resuming after the
//      register write succeeds but record removal fails, and refusing when
//      retention changes custody before the final conditional write. The
//      first needs a DETERMINISTIC DRILL-ONLY HOOK (a direct register write
//      recreating exactly the state a partial failure leaves behind — there
//      is no reliable way to force a real transient AWS failure on demand);
//      the second needs no hook at all, just the real operations in the
//      vulnerable order. Both are labeled in their own check, not blended
//      with anything "naturally occurring". A fourth sub-check (7d, this
//      round's reviewer-caught finding) proves the media-purge claim is
//      resumed — never refused as foreign — by the SAME requestId that
//      already owns it, while a genuinely DIFFERENT requestId is still
//      refused, against the real register.
//
// Cleanup: only this drill's own disposable Cognito test user is deleted.
// Every seeded fixture, the live primary/register tables, and the staff
// user named in the setup prompt are left untouched — same precedent as
// every other real-AWS check in this project.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   TIRO_STAFF_API_URL=... TIRO_STAFF_USER_POOL_ID=... TIRO_STAFF_USER_POOL_CLIENT_ID=... \
//   npx tsx backend/src/scripts/realS3MediaAcceptanceDrill.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectCommand as RawDeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHash, randomUUID } from "node:crypto";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { InMemoryFixtureStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import {
  startDeletion,
  completeDeletion,
  revokeConsentGrant,
  retainForPreservationOnly,
  MediaPurgeInProgressError,
} from "../services/lifecycle";
import { exportFixtureSet } from "../services/export";
import { importExport, reconcileRestoredRecords, validateExport } from "../services/restore";
import { VersionConflictError, type RestrictionRegisterStore } from "../store/store";
import type { RestrictionRegisterEntry } from "../domain/types";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");
const STATUS_INDEX = process.env.TIRO_STATUS_INDEX ?? "GSI1-status-index";
const API_URL = requireEnv("TIRO_STAFF_API_URL").replace(/\/+$/, "");
const USER_POOL_ID = requireEnv("TIRO_STAFF_USER_POOL_ID");
const USER_POOL_CLIENT_ID = requireEnv("TIRO_STAFF_USER_POOL_CLIENT_ID");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function log(step: string, message: string, data?: unknown): void {
  console.log(`\n[${step}] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
}

type CheckResult = { name: string; passed: boolean; detail?: string };
const results: CheckResult[] = [];
function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  log(passed ? "PASS" : "FAIL", name, detail);
}

async function main() {
  const dynamoClient = new DynamoDBClient({ region: REGION });
  const s3Client = new S3Client({ region: REGION });
  const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

  const fixtureStore = new DynamoFixtureStore({ client: dynamoClient, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
  const registerStore = new DynamoRestrictionRegisterStore({ client: dynamoClient, tableName: REGISTER_TABLE });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

  // ---------------------------------------------------------------- setup --
  const drillTag = `drill-${Date.now()}`;
  const testEmail = `s3-drill-${Date.now()}@example.invalid`;
  const testPassword = `[SYNTHETIC]-Aa1!-${randomUUID().slice(0, 8)}`;
  log("SETUP", "Creating disposable drill Cognito test user", { email: testEmail });
  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: testEmail,
      UserAttributes: [{ Name: "email", Value: testEmail }, { Name: "email_verified", Value: "true" }],
      MessageAction: "SUPPRESS",
    }),
  );
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: testEmail, Password: testPassword, Permanent: true }),
  );
  const auth = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: USER_POOL_CLIENT_ID,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: testEmail, PASSWORD: testPassword },
    }),
  );
  const idToken = auth.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error("AdminInitiateAuth did not return an IdToken.");

  async function apiGet(path: string, withAuth: boolean): Promise<{ status: number; headers: Headers; body: ArrayBuffer }> {
    const response = await fetch(`${API_URL}${path}`, {
      headers: withAuth ? { authorization: `Bearer ${idToken}` } : {},
    });
    return { status: response.status, headers: response.headers, body: await response.arrayBuffer() };
  }
  async function apiPost(path: string, bodyObj: unknown): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  try {
    // ---------------------------------------------------- seed fixtures --
    const [active, expired, disputed] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, active);
    await bindSeedMedia(mediaStore, expired);
    await bindSeedMedia(mediaStore, disputed);
    await seedStore(fixtureStore, registerStore, [active, expired, disputed]);
    const textMedia = active.record.mediaRefs[0];
    log("SEED", "Seeded three fresh fixtures with real bound S3 media", {
      active: active.record.recordId,
      expired: expired.record.recordId,
      disputed: disputed.record.recordId,
    });

    const mediaPath = (recordId: string, mediaId: string, purpose: string, audience: string) =>
      `/records/${recordId}/media/${mediaId}?purpose=${purpose}&audience=${audience}`;
    const activeMediaPath = mediaPath(active.record.recordId, textMedia.mediaId, "publication", "public");

    // ----------------------------------------------------- check 1: 401 --
    const unauth = await apiGet(activeMediaPath, false);
    record("Unauthenticated API call to the media route is rejected (401)", unauth.status === 401, `status=${unauth.status}`);

    // Direct, unsigned HTTPS GET straight at the S3 object — proves the
    // bucket itself (BlockPublicAccess + no bucket policy) denies access
    // with no credentials at all, independent of the API/Lambda entirely.
    const directS3Response = await fetch(
      `https://${MEDIA_BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(textMedia.objectKey)}`,
    );
    record(
      "Direct, unsigned HTTPS GET straight at the S3 object is denied (not 200)",
      directS3Response.status !== 200,
      `status=${directS3Response.status}`,
    );

    // --------------------------------------------- check 2: real bytes --
    const allowed = await apiGet(activeMediaPath, true);
    const allowedBytes = Buffer.from(allowed.body);
    const allowedSha = createHash("sha256").update(allowedBytes).digest("hex");
    record(
      "Authenticated, authorized media fetch returns the exact uploaded bytes (verified SHA-256)",
      allowed.status === 200 && allowedSha === textMedia.checksumSha256,
      `status=${allowed.status} sha256Match=${allowedSha === textMedia.checksumSha256}`,
    );
    record(
      "Media response carries private/no-store cache headers",
      allowed.headers.get("cache-control") === "private, no-store",
      String(allowed.headers.get("cache-control")),
    );

    // ------------------------------------------- check 3: denial cases --
    const expiredPath = mediaPath(expired.record.recordId, expired.record.mediaRefs[0].mediaId, "publication", "public");
    const expiredResult = await apiGet(expiredPath, true);
    record("Expired-consent record's media is denied through the real API", expiredResult.status === 403, `status=${expiredResult.status}`);

    const disputedPath = mediaPath(disputed.record.recordId, disputed.record.mediaRefs[0].mediaId, "publication", "public");
    const disputedResult = await apiGet(disputedPath, true);
    record("Disputed-authority record's media is denied through the real API", disputedResult.status === 403, `status=${disputedResult.status}`);

    const wrongPurposePath = mediaPath(active.record.recordId, textMedia.mediaId, "model-training", "public");
    const wrongPurposeResult = await apiGet(wrongPurposePath, true);
    record(
      "A purpose the record's grant doesn't cover is denied, even for an otherwise-allowed record",
      wrongPurposeResult.status === 403,
      `status=${wrongPurposeResult.status}`,
    );

    // ---------------------------------- check 4: no reusable download --
    // Re-fetch the SAME active-media URL again right now: still allowed —
    // sanity check that nothing has changed yet.
    const stillAllowed = await apiGet(activeMediaPath, true);
    record("Sanity check: the saved URL is still allowed immediately before withdrawal", stillAllowed.status === 200);

    const withdrawResponse = await apiPost(`/records/${active.record.recordId}/withdraw`, {
      reason: "[SYNTHETIC] S3 media acceptance drill — withdrawal",
    });
    record("Real withdraw() via the API succeeds", withdrawResponse.status === 200, `status=${withdrawResponse.status}`);

    const afterWithdraw = await apiGet(activeMediaPath, true);
    record(
      "The EXACT SAME saved media URL is denied immediately after withdrawal — no cached/reusable download capability",
      afterWithdraw.status === 403,
      `status=${afterWithdraw.status}`,
    );

    // Same pattern, for grant-level revocation, on a SEPARATE fresh record
    // (active is now withdrawn and can't demonstrate this cleanly anymore).
    const [grantRevokeFixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, grantRevokeFixture);
    await seedStore(fixtureStore, registerStore, [grantRevokeFixture]);
    const grantRevokeMediaPath = mediaPath(
      grantRevokeFixture.record.recordId,
      grantRevokeFixture.record.mediaRefs[0].mediaId,
      "publication",
      "public",
    );
    const beforeRevoke = await apiGet(grantRevokeMediaPath, true);
    record("Sanity check: the grant-revocation record's media is allowed before revocation", beforeRevoke.status === 200);
    await revokeConsentGrant(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-revoke`,
      recordId: grantRevokeFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — grant revocation",
      consentId: grantRevokeFixture.consentGrants[0].consentId,
    });
    const afterRevoke = await apiGet(grantRevokeMediaPath, true);
    record(
      "The same saved media URL is denied immediately after grant revocation",
      afterRevoke.status === 403,
      `status=${afterRevoke.status}`,
    );

    // ------------------------------------ check 5: export/restore/tamper --
    const [positiveControl] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, positiveControl);
    await seedStore(fixtureStore, registerStore, [positiveControl]);

    const [grantRevokeT0, positiveControlT0] = await Promise.all([
      exportFixtureSet(
        fixtureStore,
        registerStore,
        [grantRevokeFixture.record.recordId],
        "complete-preservation",
        `${drillTag}-grant-revoke`,
        "public",
        mediaStore,
      ).then((r) => r), // NOTE: already revoked above — see the pre-revocation export taken before, kept separately below.
      exportFixtureSet(
        fixtureStore,
        registerStore,
        [positiveControl.record.recordId],
        "complete-preservation",
        `${drillTag}-positive-control`,
        "public",
        mediaStore,
      ),
    ]);
    // grantRevokeT0 above is actually a POST-revocation export (revocation
    // already ran) — exportFixtureSet's own evaluatePermission gate means
    // it is now EMPTY (the record no longer passes, so it's simply
    // absent). That absence is itself a real, meaningful assertion: export
    // never includes content a live check would deny, even under
    // complete-preservation scope.
    record(
      "A revoked record is absent from a NEW complete-preservation export taken after revocation (export never includes denied content)",
      grantRevokeT0.records.length === 0,
      `recordCount=${grantRevokeT0.records.length}`,
    );

    // The MEANINGFUL pre-revocation-backup case needs a backup taken BEFORE
    // revocation — re-seed a fresh equivalent fixture for this specific
    // T0->T1->T2->T3 sequence so it's unambiguous which export predates
    // which lifecycle action.
    const [preRevocationFixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, preRevocationFixture);
    await seedStore(fixtureStore, registerStore, [preRevocationFixture]);
    // So the restore can prove audit history actually survives (a reviewer
    // caught importExport silently dropping it entirely).
    await fixtureStore.putAuditReceipt({
      recordId: preRevocationFixture.record.recordId,
      receiptId: `receipt-${drillTag}-pre-revocation`,
      action: "restrict",
      outcome: "completed",
      safeNote: "[SYNTHETIC] S3 media acceptance drill — pre-revocation audit receipt",
      at: new Date().toISOString(),
    });
    const preRevocationBackup = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [preRevocationFixture.record.recordId],
      "complete-preservation",
      `${drillTag}-pre-revocation`,
      "public",
      mediaStore,
    );
    const preRevocationMediaObjects = preRevocationBackup.records[0]?.mediaObjects;
    record(
      "A pre-revocation backup actually carries real media bytes",
      Array.isArray(preRevocationMediaObjects) && preRevocationMediaObjects.length > 0,
      `count=${Array.isArray(preRevocationMediaObjects) ? preRevocationMediaObjects.length : "n/a"}`,
    );
    record(
      "The backup also carries its real audit receipt (safe lifecycle history)",
      preRevocationBackup.records[0]?.auditReceipts.length === 1,
      `count=${preRevocationBackup.records[0]?.auditReceipts.length}`,
    );

    await revokeConsentGrant(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-pre-revocation`,
      recordId: preRevocationFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — T1 revocation",
      consentId: preRevocationFixture.consentGrants[0].consentId,
    });

    // Tamper rejection: corrupt the backup's media bytes and confirm BOTH
    // validateExport and importExport refuse it.
    const tamperedBackup = structuredClone(preRevocationBackup);
    const tamperedObjects = tamperedBackup.records[0].mediaObjects as { mediaId: string; base64: string }[];
    tamperedObjects[0].base64 = Buffer.from("[SYNTHETIC] tampered drill bytes").toString("base64");
    const tamperValidation = validateExport(tamperedBackup);
    record("A tampered export package fails validateExport", tamperValidation.ok === false, JSON.stringify(tamperValidation));
    let tamperImportRejected = false;
    try {
      await importExport(new InMemoryFixtureStore(), tamperedBackup);
    } catch {
      tamperImportRejected = true;
    }
    record("importExport refuses a tampered package outright, not just validateExport in isolation", tamperImportRejected);

    // T2/T3: restore the UNTAMPERED pre-revocation backup into an isolated
    // in-process target (FixtureStore) + a real, separately-prefixed S3
    // media store under the SAME bucket (isolated by key prefix, not a
    // second bucket — the full real-DynamoDB-table restore mechanics are
    // already proven by realBackupRestoreDrill.ts/realGrantRevocationRestoreDrill.ts;
    // this drill's new ground is specifically the media layer).
    const restoredFixtureStore = new InMemoryFixtureStore();
    const restoredMediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });
    // Rewrite the restored object's key under a disposable prefix so this
    // restore never collides with the live key.
    const rebindEnvelope = structuredClone(preRevocationBackup);
    rebindEnvelope.records[0].record.mediaRefs = rebindEnvelope.records[0].record.mediaRefs.map((m) => ({
      ...m,
      objectKey: `restored/${drillTag}/${m.objectKey}`,
    }));
    await importExport(restoredFixtureStore, rebindEnvelope, restoredMediaStore);
    const reconciliation = await reconcileRestoredRecords(restoredFixtureStore, registerStore, rebindEnvelope.records, {
      purpose: "publication",
      audience: "public",
    });
    record(
      "Reconciling the restored (stale, looks-unrevoked) backup against the LIVE register still denies — no revived access",
      reconciliation[0]?.servable === false,
      JSON.stringify(reconciliation[0]),
    );
    const restoredReceipts = await restoredFixtureStore.listAuditReceipts(preRevocationFixture.record.recordId);
    record(
      "The restored store actually contains the audit receipt — previously dropped entirely by importExport",
      restoredReceipts.length === 1 && restoredReceipts[0].receiptId === `receipt-${drillTag}-pre-revocation`,
      `count=${restoredReceipts.length}`,
    );
    // Restored bytes survive too, not just the register-level denial above —
    // fetch the restored (rebound) media directly from the restore target's
    // own real S3 media store and verify its checksum.
    const restoredPreRevocationMedia = (await restoredFixtureStore.getRecord(preRevocationFixture.record.recordId))!.mediaRefs[0];
    const restoredBytes = restoredPreRevocationMedia.versionId
      ? await restoredMediaStore.getObject(restoredPreRevocationMedia.objectKey, restoredPreRevocationMedia.versionId)
      : null;
    record(
      "The restored record's media bytes are actually present and checksum-correct in the restore target's own S3 store",
      restoredBytes !== null && restoredBytes.sha256 === restoredPreRevocationMedia.checksumSha256,
      restoredBytes ? `sha256Match=${restoredBytes.sha256 === restoredPreRevocationMedia.checksumSha256}` : "no object returned",
    );

    // Positive control: restore+reconcile an export whose record was NEVER
    // touched afterward — must remain servable, proving reconciliation
    // isn't just "always deny after any restore".
    const positiveRestoredStore = new InMemoryFixtureStore();
    const positiveRebind = structuredClone(positiveControlT0);
    positiveRebind.records[0].record.mediaRefs = positiveRebind.records[0].record.mediaRefs.map((m) => ({
      ...m,
      objectKey: `restored/${drillTag}-positive/${m.objectKey}`,
    }));
    await importExport(positiveRestoredStore, positiveRebind, new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET }));
    const positiveReconciliation = await reconcileRestoredRecords(positiveRestoredStore, registerStore, positiveRebind.records, {
      purpose: "publication",
      audience: "public",
    });
    record(
      "Positive control: restoring an untouched record's backup remains servable (reconciliation isn't just always-deny)",
      positiveReconciliation[0]?.servable === true,
      JSON.stringify(positiveReconciliation[0]),
    );

    // --------------------------- check 6: real version/marker inventory --
    // disputed has no text media ref (seed.ts's disputedAuthorityFixture
    // starts with mediaRefs: []), so bindSeedMedia's text-binding branch was
    // skipped for it and mediaRefs[0] is its BINARY ref — which
    // bindSeedMedia deliberately gives TWO real S3 versions (demonstrating
    // version pinning). That's exactly the right object for this check: it
    // proves inventory sees BOTH pre-existing versions, not just one.
    const inventoryTarget = disputed.record.mediaRefs[0]; // never touched by deletion yet
    const versionsBeforeDelete = await mediaStore.listObjectVersions(inventoryTarget.objectKey);
    record(
      "listObjectVersions sees BOTH real pre-existing versions before anything is deleted",
      versionsBeforeDelete.length === 2 && versionsBeforeDelete.every((v) => !v.isDeleteMarker),
      JSON.stringify(versionsBeforeDelete),
    );

    // Simulate a delete marker created OUTSIDE this system's normal path
    // (e.g. a console action, or another tool bare-deleting the key) —
    // a bare DeleteObject with no VersionId, which S3 turns into a NEW
    // delete-marker version rather than removing anything.
    await s3Client.send(new RawDeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: inventoryTarget.objectKey }));
    const versionsWithMarker = await mediaStore.listObjectVersions(inventoryTarget.objectKey);
    record(
      "A bare key-level delete adds a DELETE MARKER on top, leaving BOTH original versions' bytes fully intact (not erased)",
      versionsWithMarker.length === 3 &&
        versionsWithMarker.filter((v) => v.isDeleteMarker).length === 1 &&
        versionsWithMarker.filter((v) => !v.isDeleteMarker).length === 2,
      JSON.stringify(versionsWithMarker),
    );
    // Now run the real deletion workflow on this record — completeDeletion's
    // purge step must remove BOTH the marker and the original version.
    const disputedStart = await startDeletion(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-disputed-start`,
      recordId: disputed.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — inventory/removal",
    });
    const disputedComplete = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: `req-${drillTag}-disputed-complete`,
        recordId: disputed.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] S3 media acceptance drill — inventory/removal",
        deletionRequestId: disputedStart.requestId,
      },
      mediaStore,
    );
    const versionsAfterDelete = await mediaStore.listObjectVersions(inventoryTarget.objectKey);
    record(
      "completeDeletion removes EVERY version AND the delete marker — real S3 shows nothing left, not just that completion reported success",
      disputedComplete.status === "completed" && versionsAfterDelete.length === 0,
      `status=${disputedComplete.status} remainingVersions=${versionsAfterDelete.length}`,
    );

    // ------------------------- check 7a: resumable partial-failure drill --
    // DETERMINISTIC DRILL-ONLY HOOK: there is no reliable way to force a
    // real, transient AWS failure between the register write and the
    // record-removal write on demand. Instead, this directly recreates —
    // via a raw register write, bypassing completeDeletion — EXACTLY the
    // state such a failure leaves behind (register says "deleted", record
    // still physically present), then proves completeDeletion resumes and
    // finishes it. This is a SIMULATION of that state, not a naturally
    // occurring failure — labeled here and in the evidence matrix as such.
    const [resumeFixture] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [resumeFixture]);
    const resumeStart = await startDeletion(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-resume-start`,
      recordId: resumeFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — partial-failure recovery",
    });
    const preHookState = await registerStore.getCurrent(resumeFixture.record.recordId);
    if (!preHookState) throw new Error("drill invariant violated: register entry must exist after startDeletion");
    await registerStore.setCurrent(
      { ...preHookState, currentCustodyStatus: "deleted", controlVersion: preHookState.controlVersion + 1 },
      preHookState.controlVersion,
    );
    log("DRILL HOOK (labeled)", "Directly flipped the LIVE register to custody=\"deleted\" via a raw write, bypassing completeDeletion — simulating exactly the state a partial failure (register write succeeded, record removal failed) leaves behind. The record itself was never touched by this hook.");
    const recordStillThere = await fixtureStore.getRecord(resumeFixture.record.recordId);
    record("Sanity check: the record is still physically present right after the simulated partial failure", recordStillThere !== null);
    const resumeComplete = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: `req-${drillTag}-resume-complete`,
        recordId: resumeFixture.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] S3 media acceptance drill — partial-failure recovery",
        deletionRequestId: resumeStart.requestId,
      },
      mediaStore,
    );
    const recordGoneAfterResume = await fixtureStore.getRecord(resumeFixture.record.recordId);
    record(
      "completeDeletion resumes from the simulated partial-failure state and actually finishes, against real DynamoDB",
      resumeComplete.status === "completed" && recordGoneAfterResume === null,
      `status=${resumeComplete.status}`,
    );

    // --------------------- check 7b: retention-before-completion drill --
    // No hook needed here — just the real operations, in the real
    // vulnerable order, against real DynamoDB. Reviewer-caught gap: the
    // FIRST version of this check used a fixture with no bound media,
    // which could never have caught "retention denies completion but the
    // purge already destroyed the media anyway" — the purge ran before
    // custody was ever validated. This fixture now carries real bound S3
    // media specifically so this live check actually exercises that path.
    const [staleFixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, staleFixture);
    await seedStore(fixtureStore, registerStore, [staleFixture]);
    const staleBinaryMedia = staleFixture.record.mediaRefs[1];
    const staleVersionsBefore = await mediaStore.listObjectVersions(staleBinaryMedia.objectKey);
    const staleStart = await startDeletion(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-stale-start`,
      recordId: staleFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — stale precondition",
    });
    await retainForPreservationOnly(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-stale-retain`,
      recordId: staleFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — a real retention action overrides the pending deletion",
    });
    const staleComplete = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: `req-${drillTag}-stale-complete`,
        recordId: staleFixture.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] S3 media acceptance drill — stale precondition",
        deletionRequestId: staleStart.requestId,
      },
      mediaStore,
    );
    const staleRecordStillThere = await fixtureStore.getRecord(staleFixture.record.recordId);
    const staleRegister = await registerStore.getCurrent(staleFixture.record.recordId);
    record(
      "completeDeletion refuses (denies) when a real retention action changed custody before its final write, against real DynamoDB — the record is NOT deleted",
      staleComplete.status === "denied" && staleRecordStillThere !== null && staleRegister?.currentCustodyStatus === "preserved",
      `status=${staleComplete.status} custody=${staleRegister?.currentCustodyStatus}`,
    );
    const staleVersionsAfter = await mediaStore.listObjectVersions(staleBinaryMedia.objectKey);
    record(
      "Retained media is actually still fully intact in real S3 — a denial must never have already destroyed it (the exact reviewer-caught ordering bug)",
      staleVersionsAfter.length === staleVersionsBefore.length &&
        staleVersionsBefore.every((v) => staleVersionsAfter.some((a) => a.versionId === v.versionId)),
      `before=${staleVersionsBefore.length} after=${staleVersionsAfter.length}`,
    );

    // Direct-DynamoDB confirmation (not via the service layer) that the
    // stale-precondition record really is untouched, for belt-and-suspenders.
    const rawItem = await dynamoClient.send(
      new GetItemCommand({ TableName: PRIMARY_TABLE, Key: { PK: { S: `ENTITY#${staleFixture.record.recordId}` }, SK: { S: "RECORD" } } }),
    );
    record("Direct DynamoDB GetItem confirms the stale-precondition record is still present", rawItem.Item !== undefined);

    // ------------------- check 7c: exact-gap interleaving, real DynamoDB --
    // The check above (7b) proved denial when retention ran BEFORE
    // completeDeletion started at all. This proves the narrower, second-
    // round finding: a DETERMINISTIC DRILL-ONLY HOOK makes retention land
    // in the EXACT gap between completeDeletion's custody read and its own
    // claim write, against the REAL DynamoDB conditional-write mechanics
    // (not the in-memory fake's approximation of them) — the same
    // InterleavingRegisterStore pattern as lifecycle.test.ts, wrapping the
    // real DynamoRestrictionRegisterStore.
    class InterleavingRegisterStore implements RestrictionRegisterStore {
      private triggered = false;
      constructor(
        private readonly inner: RestrictionRegisterStore,
        private readonly interleave: () => Promise<void>,
      ) {}
      async getCurrent(recordId: string) {
        const snapshot = await this.inner.getCurrent(recordId);
        if (!this.triggered) {
          this.triggered = true;
          await this.interleave();
        }
        return snapshot;
      }
      setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined) {
        return this.inner.setCurrent(entry, expectedVersion);
      }
      listAll() {
        return this.inner.listAll();
      }
    }

    const [interleaveFixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, interleaveFixture);
    await seedStore(fixtureStore, registerStore, [interleaveFixture]);
    const interleaveBinaryMedia = interleaveFixture.record.mediaRefs[1];
    const interleaveVersionsBefore = await mediaStore.listObjectVersions(interleaveBinaryMedia.objectKey);
    const interleaveStart = await startDeletion(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-interleave-start`,
      recordId: interleaveFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — exact-gap interleaving",
    });
    log(
      "DRILL HOOK (labeled)",
      "Wrapping the REAL DynamoRestrictionRegisterStore so retainForPreservationOnly runs for real, against real DynamoDB, in the exact gap between completeDeletion's custody read and its own claim write — this is a deterministic forcing function for an otherwise-timing-dependent race, not a naturally occurring interleaving.",
    );
    const interleavingStore = new InterleavingRegisterStore(registerStore, async () => {
      await retainForPreservationOnly(fixtureStore, registerStore, {
        requestId: `req-${drillTag}-interleave-retain`,
        recordId: interleaveFixture.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] races into the exact gap, against real DynamoDB",
      });
    });
    let interleaveRejected: unknown = null;
    try {
      await completeDeletion(
        fixtureStore,
        interleavingStore,
        {
          requestId: `req-${drillTag}-interleave-complete`,
          recordId: interleaveFixture.record.recordId,
          requesterCapacity: "[SYNTHETIC] drill steward",
          reason: "[SYNTHETIC] S3 media acceptance drill — exact-gap interleaving",
          deletionRequestId: interleaveStart.requestId,
        },
        mediaStore,
      );
    } catch (error) {
      interleaveRejected = error;
    }
    const interleaveRegister = await registerStore.getCurrent(interleaveFixture.record.recordId);
    const interleaveVersionsAfter = await mediaStore.listObjectVersions(interleaveBinaryMedia.objectKey);
    record(
      "completeDeletion's claim write loses to retention's already-landed write, against REAL DynamoDB — confirmed by a real ConditionalCheckFailedException-backed VersionConflictError",
      interleaveRejected instanceof VersionConflictError,
      String(interleaveRejected),
    );
    record(
      "Retention actually won the real register, and the media is COMPLETELY untouched in real S3 — the exact second-round reviewer repro, closed",
      interleaveRegister?.currentCustodyStatus === "preserved" &&
        interleaveVersionsAfter.length === interleaveVersionsBefore.length &&
        interleaveVersionsBefore.every((v) => interleaveVersionsAfter.some((a) => a.versionId === v.versionId)),
      `custody=${interleaveRegister?.currentCustodyStatus} before=${interleaveVersionsBefore.length} after=${interleaveVersionsAfter.length}`,
    );

    // ------------- check 7d: claim ownership resumption, real DynamoDB ----
    // DETERMINISTIC DRILL-ONLY HOOK, same precedent as 7a: there is no
    // reliable way to force a real purge failure AND a real release
    // failure on demand. This directly recreates — via a raw register
    // write — EXACTLY the state a failed purge plus a failed release
    // leaves behind (a claim stuck, attributed to a specific requestId),
    // then proves, against real DynamoDB: a DIFFERENT requestId is still
    // refused (the claim is foreign to it), while the SAME requestId that
    // already owns it resumes and completes — never denied just because a
    // claim already exists. This is the reviewer's exact repro: "a failed
    // purge plus failed release left an owned claim that its retry denied
    // rather than resumed."
    const [claimFixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, claimFixture);
    await seedStore(fixtureStore, registerStore, [claimFixture]);
    const claimStart = await startDeletion(fixtureStore, registerStore, {
      requestId: `req-${drillTag}-claim-start`,
      recordId: claimFixture.record.recordId,
      requesterCapacity: "[SYNTHETIC] drill steward",
      reason: "[SYNTHETIC] S3 media acceptance drill — claim ownership resumption",
    });
    const claimOwnerRequestId = `req-${drillTag}-claim-owner-complete`;
    const preClaimState = await registerStore.getCurrent(claimFixture.record.recordId);
    if (!preClaimState) throw new Error("drill invariant violated: register entry must exist after startDeletion");
    await registerStore.setCurrent(
      {
        ...preClaimState,
        mediaPurgeClaim: { requestId: claimOwnerRequestId, claimedAt: new Date().toISOString() },
        controlVersion: preClaimState.controlVersion + 1,
      },
      preClaimState.controlVersion,
    );
    log(
      "DRILL HOOK (labeled)",
      "Directly wrote a mediaPurgeClaim onto the REAL live register via a raw write, bypassing completeDeletion — simulating exactly the state a failed purge plus a failed release leaves behind, attributed to a specific requestId.",
    );

    const claimForeignAttempt = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: `req-${drillTag}-claim-foreign-complete`,
        recordId: claimFixture.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] S3 media acceptance drill — claim ownership resumption",
        deletionRequestId: claimStart.requestId,
      },
      mediaStore,
    ).catch((error: unknown) => error);
    record(
      "A claim held by a DIFFERENT requestId is still refused, against the real register",
      claimForeignAttempt instanceof MediaPurgeInProgressError,
      String(claimForeignAttempt),
    );

    const claimResumed = await completeDeletion(
      fixtureStore,
      registerStore,
      {
        requestId: claimOwnerRequestId,
        recordId: claimFixture.record.recordId,
        requesterCapacity: "[SYNTHETIC] drill steward",
        reason: "[SYNTHETIC] S3 media acceptance drill — claim ownership resumption",
        deletionRequestId: claimStart.requestId,
      },
      mediaStore,
    );
    const claimRecordGone = await fixtureStore.getRecord(claimFixture.record.recordId);
    record(
      "The claim's OWN requestId resumes and completes against real DynamoDB — never refused as a foreign conflict just because a claim already exists",
      claimResumed.status === "completed" && claimRecordGone === null,
      `status=${claimResumed.status}`,
    );

    // ------- check 8: export response size budget, real Lambda, real API --
    // Reviewer reproduced 7,035,395 serialized bytes from 20 distinct,
    // individually-authorized, individually-under-cap (256 KiB) records —
    // comfortably over Lambda's real 6 MB synchronous response limit. This
    // seeds 20 real fixtures with real 256 KiB S3 objects each and calls
    // the REAL deployed API's /export route — proving the fix holds
    // against the actual AWS-imposed limit, not just a local estimate of it.
    const exportBudgetRecordIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const [fixture] = buildSeedFixtures();
      fixture.record.mediaRefs = [];
      const uploaded = await mediaStore.putObject(
        `fixtures/${drillTag}-lambda-limit/${i}.bin`,
        Buffer.alloc(256 * 1024, i % 256),
        "application/octet-stream",
      );
      fixture.record.mediaRefs.push({
        mediaId: `media-${drillTag}-${i}`,
        objectKey: `fixtures/${drillTag}-lambda-limit/${i}.bin`,
        bytes: uploaded.bytes,
        checksumSha256: uploaded.sha256,
        contentType: "application/octet-stream",
        versionId: uploaded.versionId,
      });
      await seedStore(fixtureStore, registerStore, [fixture]);
      exportBudgetRecordIds.push(fixture.record.recordId);
    }
    const exportBudgetResponse = await fetch(`${API_URL}/export`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        recordIds: exportBudgetRecordIds,
        scope: "complete-preservation",
        fixtureSetId: `${drillTag}-lambda-limit`,
        destinationAudience: "public",
      }),
    });
    const exportBudgetBodyText = await exportBudgetResponse.text();
    record(
      "The real Lambda/API actually returns 200 for 20 distinct 256 KiB records, not a Lambda/API-Gateway payload-limit failure",
      exportBudgetResponse.status === 200,
      `status=${exportBudgetResponse.status}`,
    );
    const LAMBDA_SYNC_RESPONSE_LIMIT_BYTES = 6 * 1024 * 1024;
    const realResponseBytes = Buffer.byteLength(exportBudgetBodyText, "utf8");
    record(
      "The real HTTP response body stays safely under Lambda's 6 MB synchronous limit",
      realResponseBytes < LAMBDA_SYNC_RESPONSE_LIMIT_BYTES,
      `bytes=${realResponseBytes}`,
    );
    let exportBudgetParsed: { records?: { mediaObjectsSkipped?: { reason: string }[] }[] } = {};
    try {
      exportBudgetParsed = JSON.parse(exportBudgetBodyText);
    } catch {
      // leave empty; the check below will correctly fail if parsing was needed
    }
    const anyRealSkipForBudget = (exportBudgetParsed.records ?? []).some((envelope) =>
      (envelope.mediaObjectsSkipped ?? []).some((s) => /budget/i.test(s.reason)),
    );
    record(
      "At least one of the 20 real records' media was actually skipped for the budget, confirmed from the real response body",
      anyRealSkipForBudget,
    );
  } finally {
    // ------------------------------------------------------------ cleanup --
    log("CLEANUP", "Deleting the disposable drill Cognito test user (nothing else)", { email: testEmail });
    await cognitoClient
      .send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: testEmail }))
      .catch((error) => log("CLEANUP", "Non-fatal: failed to delete drill test user", String(error)));
  }

  console.log("\n==================== SUMMARY ====================");
  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"} — ${r.name}`);
  }
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Drill failed with an unhandled error:", error);
  process.exitCode = 1;
});
