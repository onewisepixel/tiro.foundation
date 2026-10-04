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
