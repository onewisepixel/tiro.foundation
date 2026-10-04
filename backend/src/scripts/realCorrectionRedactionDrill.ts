// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Live-AWS
// acceptance drill for the versioned-correction and redaction milestone
// (docs/ethos.txt §3.5/§12's "Correct" action and redaction tooling),
// against the real deployed stack.
//
// Covers:
//   1. correctRecord(): the live field changes immediately; the previous
//      value is preserved in Correction history, confirmed through the
//      real deployed API (GET /records/:id), not just the service layer.
//   2. disputeCorrection(): marks a correction disputed WITHOUT reverting
//      it — the live field still reflects the correction afterward.
//   3. redactText(): the live field is masked; the ORIGINAL never appears
//      in the real API's GET /records/:id response, even for a fully
//      authorized caller — only safe metadata (scope/field/reason/time) does.
//   4. redactMedia(): the exact mediaId is denied through the real
//      GET /records/:id/media/:mediaId route for every purpose/audience,
//      while a DIFFERENT, non-redacted media object on the SAME record
//      stays fetchable, and the redacted object's real S3 bytes are
//      confirmed completely untouched (redaction is not deletion).
//   5. Export/restore: a complete-preservation export carries the real
//      pre-redaction text and full correction history; restoring it into
//      an isolated target reproduces both; a public-redacted export omits
//      the original redacted text, matching how it already redacts
//      consent evidence and media.
//
// Reviewer-caught findings closed in this round, all against the REAL
// deployed stack (not just the in-memory fake):
//   6. Correcting a field and then redacting that SAME field masks the
//      correction's historical previousValue/correctedValue too, through
//      the real GET /records/:id response — not just the live value.
//   7. Replaying the SAME correct requestId through the real API twice
//      is a safe no-op: exactly one correction, with the TRUE original
//      preserved, never a corrupted re-capture of an already-changed
//      live value.
//   8. Restoring a backup taken BEFORE a text redaction, directly into the
//      REAL primary table, does not revive the pre-redaction text through
//      the real API — enforced from the REAL, unchanged restriction
//      register, which importExport is structurally incapable of writing
//      to. access.allowed: true is confirmed CORRECT (text redaction
//      doesn't deny overall access); the served content staying masked
//      despite that is the actual fix.
//   9. The real deployed /export response carries the new
//      recordsSkippedForResponseBudget field at all. Forcing an ACTUAL
//      whole-response exclusion live (the reviewer's full 20-record, 9 MB+
//      reproduction) was attempted and abandoned — this table's
//      deliberately tiny, always-free-tier provisioned RCU throttles even
//      a single ~395 KB strongly-consistent read, confirmed directly
//      against real CloudWatch/Lambda logs, not guessed. That exact scale
//      is proven byte-for-byte by the deterministic local test instead
//      (export.test.ts); see check 7's own comment and evidence-matrix.md
//      for the full, named limitation.
//
// Cleanup: only this drill's own disposable Cognito test user is deleted.
// Every fixture it seeds is left in place, same precedent as every other
// real-AWS check in this project.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   TIRO_STAFF_API_URL=... TIRO_STAFF_USER_POOL_ID=... TIRO_STAFF_USER_POOL_CLIENT_ID=... \
//   npx tsx backend/src/scripts/realCorrectionRedactionDrill.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomUUID } from "node:crypto";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { InMemoryFixtureStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { exportFixtureSet } from "../services/export";
import { importExport } from "../services/restore";

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

  const drillTag = `correction-redaction-drill-${Date.now()}`;
  const testEmail = `correction-redaction-drill-${Date.now()}@example.invalid`;
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

  async function apiGet(path: string): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${idToken}` } });
    return { status: response.status, json: await response.json().catch(() => null) };
  }
  async function apiPost(path: string, bodyObj: unknown): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    return { status: response.status, json: await response.json().catch(() => null) };
  }

  try {
    // -------------------------------------------------------- seed --
    const [fixture] = buildSeedFixtures();
    await bindSeedMedia(mediaStore, fixture);
    await seedStore(fixtureStore, registerStore, [fixture]);
    const recordId = fixture.record.recordId;
    const textMedia = fixture.record.mediaRefs[0];
    const binaryMedia = fixture.record.mediaRefs[1];
    const originalSummary = fixture.record.summary;
    const originalTitle = fixture.record.title;
    log("SEED", "Seeded one fresh fixture with real bound S3 media", { recordId, originalTitle, originalSummary });

    // ---------------------------------------------- check 1: correct --
    const correctResponse = await apiPost(`/records/${recordId}/correct`, {
      reason: "[SYNTHETIC] correction/redaction drill — fixing a transcription error",
      field: "summary",
      correctedValue: "[SYNTHETIC] corrected summary via the real API",
    });
    record("Real POST /records/:id/correct succeeds through the live API", correctResponse.status === 200, `status=${correctResponse.status}`);

    const afterCorrect = await apiGet(`/records/${recordId}?purpose=publication&audience=public`);
    const afterCorrectBody = afterCorrect.json as { record?: { summary?: string }; corrections?: { previousValue: string; correctedValue: string }[] };
    record(
      "The live field change is visible immediately through the real API",
      afterCorrectBody.record?.summary === "[SYNTHETIC] corrected summary via the real API",
      afterCorrectBody.record?.summary,
    );
    record(
      "The real correction history preserves the ORIGINAL value, not just the new one",
      afterCorrectBody.corrections?.[0]?.previousValue === originalSummary,
      JSON.stringify(afterCorrectBody.corrections),
    );
    const correctionId = afterCorrectBody.corrections?.[0] ? (afterCorrectBody.corrections[0] as unknown as { correctionId: string }).correctionId : undefined;

    // --------------------------------------------- check 2: dispute --
    const disputeResponse = await apiPost(`/records/${recordId}/dispute-correction`, {
      reason: "[SYNTHETIC] the subject disagrees with this correction",
      correctionId,
    });
    record("Real POST /records/:id/dispute-correction succeeds through the live API", disputeResponse.status === 200, `status=${disputeResponse.status}`);

    const afterDispute = await apiGet(`/records/${recordId}?purpose=publication&audience=public`);
    const afterDisputeBody = afterDispute.json as { record?: { summary?: string }; corrections?: { status: string }[] };
    record(
      "The dispute is recorded (status: disputed) WITHOUT reverting the live correction",
      afterDisputeBody.corrections?.[0]?.status === "disputed" &&
        afterDisputeBody.record?.summary === "[SYNTHETIC] corrected summary via the real API",
      JSON.stringify({ status: afterDisputeBody.corrections?.[0]?.status, summary: afterDisputeBody.record?.summary }),
    );

    // ------------------------------------------- check 3: redact text --
    const redactTextResponse = await apiPost(`/records/${recordId}/redact-text`, {
      reason: "[SYNTHETIC] sensitive detail discovered in the title",
      field: "title",
    });
    record("Real POST /records/:id/redact-text succeeds through the live API", redactTextResponse.status === 200, `status=${redactTextResponse.status}`);

    const afterRedactText = await apiGet(`/records/${recordId}?purpose=publication&audience=public`);
    const afterRedactTextBody = afterRedactText.json as {
      record?: { title?: string };
      redactions?: Record<string, unknown>[];
    };
    record(
      "The real live field is masked through the real API",
      afterRedactTextBody.record?.title === "[REDACTED]",
      afterRedactTextBody.record?.title,
    );
    const textRedactionHasOriginal = (afterRedactTextBody.redactions ?? []).some((r) => "previousValue" in r);
    record(
      "The real GET /records/:id response NEVER includes the pre-redaction original, even for this fully-authorized caller",
      !textRedactionHasOriginal,
      JSON.stringify(afterRedactTextBody.redactions),
    );
    record("Sanity check: the original title really was different from the redacted placeholder", originalTitle !== "[REDACTED]");

    // ------- check 3b: correcting then redacting the SAME field masks --
    // ------- its correction history too, through the real API --------
    // Reviewer-caught finding: correcting a field and then redacting that
    // SAME field left the correction's previousValue/correctedValue
    // readable through the real GET /records/:id response — a complete
    // end-run around the redaction. Uses a FRESH record so it doesn't
    // interact with the title/summary already touched above.
    const [sameFieldFixture] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [sameFieldFixture]);
    const sameFieldRecordId = sameFieldFixture.record.recordId;
    const sameFieldOriginalTitle = sameFieldFixture.record.title;
    await apiPost(`/records/${sameFieldRecordId}/correct`, {
      reason: "[SYNTHETIC] correction/redaction drill — same-field masking",
      field: "title",
      correctedValue: "[SYNTHETIC] corrected title, same field as the later redaction",
    });
    const sameFieldRedactResponse = await apiPost(`/records/${sameFieldRecordId}/redact-text`, {
      reason: "[SYNTHETIC] correction/redaction drill — same-field masking",
      field: "title",
    });
    record("Real POST /records/:id/redact-text on a PREVIOUSLY CORRECTED field succeeds through the live API", sameFieldRedactResponse.status === 200, `status=${sameFieldRedactResponse.status}`);

    const afterSameFieldRedact = await apiGet(`/records/${sameFieldRecordId}?purpose=publication&audience=public`);
    const afterSameFieldRedactBody = afterSameFieldRedact.json as {
      record?: { title?: string };
      corrections?: { field: string; previousValue: string; correctedValue: string }[];
    };
    record(
      "The live field is masked through the real API",
      afterSameFieldRedactBody.record?.title === "[REDACTED]",
      afterSameFieldRedactBody.record?.title,
    );
    record(
      "The real API masks that SAME field's correction history too, not just the live value — the exact reviewer-caught gap",
      afterSameFieldRedactBody.corrections?.[0]?.previousValue === "[REDACTED]" &&
        afterSameFieldRedactBody.corrections?.[0]?.correctedValue === "[REDACTED]",
      JSON.stringify(afterSameFieldRedactBody.corrections),
    );
    record("Sanity check: the original title really was different from the redacted placeholder", sameFieldOriginalTitle !== "[REDACTED]");

    // --- check 3c: retrying the SAME correct/redact-text requestId through
    // --- the real API is a safe no-op, never corrupting history ---------
    // Reviewer-caught finding: correctRecord()/redactText() used to write
    // the field change and its history as two SEPARATE operations, so a
    // retry after a failure in between (or after full success) could
    // re-read the ALREADY-changed live value and record it as a second,
    // wrong "previous" value. This can't force a real mid-write AWS
    // failure on demand, but it DOES prove the retry-after-full-success
    // half live: replaying the identical request twice through the real
    // API must never duplicate or corrupt history.
    const retryRequestId = `req-${drillTag}-retry-correct`;
    const retryFieldValue = "[SYNTHETIC] corrected via a retried requestId";
    const firstRetryAttempt = await apiPost(`/records/${sameFieldRecordId}/correct`, {
      requestId: retryRequestId,
      reason: "[SYNTHETIC] correction/redaction drill — retry safety",
      field: "summary",
      correctedValue: retryFieldValue,
    });
    const secondRetryAttempt = await apiPost(`/records/${sameFieldRecordId}/correct`, {
      requestId: retryRequestId,
      reason: "[SYNTHETIC] correction/redaction drill — retry safety",
      field: "summary",
      correctedValue: retryFieldValue,
    });
    record(
      "Replaying the SAME requestId through the real API twice reports completed both times, not an error or a silent divergence",
      firstRetryAttempt.status === 200 && secondRetryAttempt.status === 200,
      `first=${firstRetryAttempt.status} second=${secondRetryAttempt.status}`,
    );
    const afterRetryBody = (await apiGet(`/records/${sameFieldRecordId}?purpose=publication&audience=public`)).json as {
      corrections?: { field: string; previousValue: string; correctedValue: string }[];
    };
    const retryCorrections = (afterRetryBody.corrections ?? []).filter((c) => c.field === "summary");
    record(
      "Replaying the same requestId through the real API produces exactly ONE correction, not a duplicate",
      retryCorrections.length === 1,
      JSON.stringify(retryCorrections),
    );
    record(
      "The real correction's previousValue after a replayed retry is still the TRUE original, not a corrupted re-capture of the already-changed live value",
      retryCorrections[0]?.previousValue === sameFieldFixture.record.summary,
      retryCorrections[0]?.previousValue,
    );

    // ------------------------------------------ check 4: redact media --
    const mediaPath = (mediaId: string) => `/records/${recordId}/media/${mediaId}?purpose=publication&audience=public`;
    const beforeRedactMedia = await fetch(`${API_URL}${mediaPath(textMedia.mediaId)}`, { headers: { authorization: `Bearer ${idToken}` } });
    record("Sanity check: the media is fetchable before redaction", beforeRedactMedia.status === 200, `status=${beforeRedactMedia.status}`);

    const versionsBeforeRedact = await mediaStore.listObjectVersions(textMedia.objectKey);

    const redactMediaResponse = await apiPost(`/records/${recordId}/redact-media`, {
      reason: "[SYNTHETIC] sensitive media discovered",
      mediaId: textMedia.mediaId,
    });
    record("Real POST /records/:id/redact-media succeeds through the live API", redactMediaResponse.status === 200, `status=${redactMediaResponse.status}`);

    const afterRedactMedia = await fetch(`${API_URL}${mediaPath(textMedia.mediaId)}`, { headers: { authorization: `Bearer ${idToken}` } });
    record(
      "The exact redacted mediaId is denied through the real media route afterward",
      afterRedactMedia.status === 403,
      `status=${afterRedactMedia.status}`,
    );

    const otherMediaStillAllowed = await fetch(`${API_URL}${mediaPath(binaryMedia.mediaId)}`, { headers: { authorization: `Bearer ${idToken}` } });
    record(
      "A DIFFERENT, non-redacted media object on the SAME record remains fetchable — redaction is scoped to the exact object",
      otherMediaStillAllowed.status === 200,
      `status=${otherMediaStillAllowed.status}`,
    );

    const versionsAfterRedact = await mediaStore.listObjectVersions(textMedia.objectKey);
    record(
      "The redacted object's real S3 bytes are completely untouched — redaction is not deletion",
      versionsAfterRedact.length === versionsBeforeRedact.length &&
        versionsBeforeRedact.every((v) => versionsAfterRedact.some((a) => a.versionId === v.versionId)),
      `before=${versionsBeforeRedact.length} after=${versionsAfterRedact.length}`,
    );

    // --------------------------------------- check 5: export/restore --
    const preservationExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [recordId],
      "complete-preservation",
      `${drillTag}-preservation`,
      "public",
      mediaStore,
    );
    const envelope = preservationExport.records[0];
    record(
      "A complete-preservation export carries full correction history (real previous + corrected values)",
      envelope?.corrections.length === 1 && envelope.corrections[0].previousValue === originalSummary,
      JSON.stringify(envelope?.corrections),
    );
    const exportedRedactions = envelope?.redactions;
    record(
      "A complete-preservation export carries the REAL pre-redaction original text (custody is authorized to hold it)",
      Array.isArray(exportedRedactions) &&
        exportedRedactions.some((r) => r.scope === "text" && "previousValue" in r && r.previousValue === originalTitle),
      JSON.stringify(exportedRedactions),
    );

    const publicExport = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [recordId],
      "public-redacted",
      `${drillTag}-public`,
      "public",
      mediaStore,
    );
    record(
      "A public-redacted export omits the pre-redaction original entirely, same as it redacts consent evidence",
      publicExport.records.length === 0 || publicExport.records[0]?.redactions === "redacted-for-public-export",
      JSON.stringify(publicExport.records[0]?.redactions),
    );

    const restoredTarget = new InMemoryFixtureStore();
    const restoredMediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });
    const rebindEnvelope = structuredClone(preservationExport);
    rebindEnvelope.records[0].record.mediaRefs = rebindEnvelope.records[0].record.mediaRefs.map((m) => ({
      ...m,
      objectKey: `restored/${drillTag}/${m.objectKey}`,
    }));
    await importExport(restoredTarget, rebindEnvelope, restoredMediaStore);
    const restoredCorrections = await restoredTarget.listCorrections(recordId);
    const restoredRedactions = await restoredTarget.listRedactions(recordId);
    record(
      "Restoring the complete-preservation export reproduces the real correction history",
      restoredCorrections.length === 1 && restoredCorrections[0].previousValue === originalSummary,
      JSON.stringify(restoredCorrections),
    );
    record(
      "Restoring the complete-preservation export reproduces the real pre-redaction original text",
      restoredRedactions.some((r) => r.scope === "text" && "previousValue" in r && r.previousValue === originalTitle),
      JSON.stringify(restoredRedactions),
    );

    // ----- check 6: restoring a backup taken BEFORE redaction does NOT ----
    // ----- revive the pre-redaction text, against the REAL live register --
    // Reviewer-caught finding, exact repro: "I exported before redaction,
    // redacted the source, then restored that backup. Against the
    // unchanged live register, the restored original returned
    // access.allowed: true and servable: true." access.allowed: true is
    // actually CORRECT here (text redaction masks a field, unlike media
    // redaction's hard access override) — the bug was the SERVED CONTENT
    // reverting to the pre-redaction original despite that. This restores
    // into the REAL DynamoFixtureStore (overwriting the live record back
    // to its pristine pre-redaction state) while the REAL
    // DynamoRestrictionRegisterStore is never touched by the restore —
    // then confirms through the REAL deployed API that the field still
    // comes back masked.
    const [survivalFixture] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [survivalFixture]);
    const survivalRecordId = survivalFixture.record.recordId;
    const survivalOriginalTitle = survivalFixture.record.title;
    const preRedactionBackup = await exportFixtureSet(
      fixtureStore,
      registerStore,
      [survivalRecordId],
      "complete-preservation",
      `${drillTag}-pre-redaction-backup`,
      "public",
    );
    const survivalRedactResponse = await apiPost(`/records/${survivalRecordId}/redact-text`, {
      reason: "[SYNTHETIC] correction/redaction drill — restore survival",
      field: "title",
    });
    record("Real POST /records/:id/redact-text succeeds through the live API (restore-survival setup)", survivalRedactResponse.status === 200, `status=${survivalRedactResponse.status}`);

    // Restore the PRE-redaction backup directly into the REAL primary
    // table — simulating "restoring an old backup" against real DynamoDB.
    // importExport is structurally incapable of writing to the register,
    // so the real register entry is left completely alone by this call.
    await importExport(fixtureStore, preRedactionBackup);
    const revivedRawRecord = await fixtureStore.getRecord(survivalRecordId);
    record(
      "Sanity check: the restore really did revive the pre-redaction original in the REAL primary table",
      revivedRawRecord?.title === survivalOriginalTitle,
      revivedRawRecord?.title,
    );
    const survivalRegisterAfterRestore = await registerStore.getCurrent(survivalRecordId);
    record(
      "The REAL live register still says the field is redacted — importExport never touched it",
      (survivalRegisterAfterRestore?.redactedTextFields ?? []).includes("title"),
      JSON.stringify(survivalRegisterAfterRestore?.redactedTextFields),
    );

    const afterSurvivalRestore = await apiGet(`/records/${survivalRecordId}?purpose=publication&audience=public`);
    const afterSurvivalRestoreBody = afterSurvivalRestore.json as { access?: { allowed?: boolean }; record?: { title?: string } };
    record(
      "access.allowed is correctly true — text redaction does not deny overall access, unlike media redaction",
      afterSurvivalRestoreBody.access?.allowed === true,
      JSON.stringify(afterSurvivalRestoreBody.access),
    );
    record(
      "Despite allowed access and a primary table reverted to the pre-redaction original, the REAL deployed API still serves the field masked — the exact reviewer-caught finding, closed",
      afterSurvivalRestoreBody.record?.title === "[REDACTED]",
      afterSurvivalRestoreBody.record?.title,
    );

    // ----- check 7: the real deployed /export response carries the new ----
    // ----- recordsSkippedForResponseBudget field -------------------------
    // Reviewer reproduced 9,032,712 serialized bytes from 20 records with
    // larger text fields, despite the (then media-only) serialized-response
    // budget. That EXACT scale — enough large records to force a real
    // whole-response exclusion — is proven byte-for-byte by the
    // deterministic local test (export.test.ts's "twenty records with
    // large TEXT fields..."), which has no real infrastructure's throughput
    // to respect.
    //
    // A live attempt at forcing that same exclusion was tried here, at
    // several scales, and abandoned — not narrowed quietly, named
    // plainly. Confirmed directly against real CloudWatch metrics and
    // Lambda logs: this table's deliberately tiny, always-free-tier
    // provisioning (5 RCU/s — see fixture-backend-stack.ts's PrimaryTable)
    // throttled even a SINGLE strongly-consistent read of one ~395 KB
    // record (`DynamoFixtureStore.getRecord` uses `ConsistentRead: true`
    // throughout, correctly, for lifecycle-correctness reasons unrelated to
    // this drill) with a genuine `ProvisionedThroughputExceededException`,
    // regardless of how long a prior cooldown waited. Unlike the media
    // budget's live check in realS3MediaAcceptanceDrill.ts, where the bulk
    // bytes live in S3 (no comparable provisioned-RCU ceiling to pass
    // through), proving the TEXT-driven threshold live would require
    // reading several megabytes of DynamoDB-stored content back out inside
    // one Lambda invocation — genuinely infeasible against this fixture
    // stack's capacity without either forcing a real, billed capacity
    // increase on a SHARED table (not this script's call to make
    // unilaterally) or waiting far longer than is reasonable for a
    // drill. Named here rather than hidden; see evidence-matrix.md.
    //
    // What IS proven live, honestly: the real deployed API's /export
    // response actually carries the new field at all, using ordinary,
    // normal-sized records — confirming the deployed shape matches what
    // export.ts now returns, without needing to cross the byte threshold.
    const budgetShapeResponse = await fetch(`${API_URL}/export`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        recordIds: [sameFieldRecordId, survivalRecordId],
        scope: "complete-preservation",
        fixtureSetId: `${drillTag}-budget-shape`,
        destinationAudience: "public",
      }),
    });
    const budgetShapeBody = (await budgetShapeResponse.json().catch(() => null)) as { recordsSkippedForResponseBudget?: unknown[] } | null;
    record(
      "The real deployed /export response carries the new recordsSkippedForResponseBudget field, confirming the deployed shape matches what export.ts now returns",
      budgetShapeResponse.status === 200 && Array.isArray(budgetShapeBody?.recordsSkippedForResponseBudget),
      `status=${budgetShapeResponse.status} field=${JSON.stringify(budgetShapeBody?.recordsSkippedForResponseBudget)}`,
    );
  } finally {
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
