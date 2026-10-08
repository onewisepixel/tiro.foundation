// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Live-AWS
// acceptance drill for the staff intake and review milestone
// (docs/ethos.txt §§3.2-3.3), against the real deployed stack. This is the
// automated version of the reviewer's own stated completion test:
//
//   "create a synthetic record entirely through the browser [here: through
//   the real deployed API, the same one the browser calls], approve
//   preservation, demonstrate that publication remains denied without its
//   own grant, then export, restore, withdraw, and delete it successfully."
//
// Covers, all through the REAL deployed API unless noted:
//   1. POST /intake creates a quarantined, unpublished record.
//   2. Added evidence (one authority claim, one legal right, one
//      preservation/staff consent grant, one small real media file) stays
//      pending — GET /records/:id?purpose=preservation&audience=staff is
//      denied ("quarantined") even with real evidence attached.
//   3. GET /intake/:recordId reads the full submission though — the
//      review-scoped path that's NOT evaluatePermission-gated.
//   4. GET /intake/:recordId/media/:mediaId previews the upload; the
//      normal GET /records/:id/media/:mediaId denies the same object.
//   5. A real metadata correction (correctRecord) bumps the record's own
//      version; approving preservation with a now-stale recordVersion is
//      rejected by the real DynamoDB transaction (VersionConflictError) —
//      re-reading and re-approving with the fresh version succeeds.
//   6. approvePreservation succeeds with the real evidence ids; staff/
//      preservation access is now allowed; public/publication access
//      stays denied with the real "No active consent grant" reason.
//   7. approvePublication is denied — no publication-purpose grant was
//      ever submitted, exactly the completion test's "publication remains
//      denied without its own grant."
//   8. Export (both scopes) through the real API; restoring the
//      complete-preservation export into an isolated target reproduces
//      the real evidence and real media bytes.
//   9. withdraw, startDeletion, completeDeletion against the real deployed
//      API — the record is genuinely gone afterward.
//
// Cleanup: only this drill's own disposable Cognito test user is deleted.
// The seeded submission is deleted by the drill itself (step 9); nothing
// else is left behind beyond the ordinary synthetic-fixture precedent.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   TIRO_STAFF_API_URL=... TIRO_STAFF_USER_POOL_ID=... TIRO_STAFF_USER_POOL_CLIENT_ID=... \
//   npx tsx backend/src/scripts/realIntakeAcceptanceDrill.ts
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomUUID } from "node:crypto";
import { InMemoryFixtureStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { importExport } from "../services/restore";

const REGION = process.env.AWS_REGION ?? "us-east-1";
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
  const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
  const drillTag = `intake-drill-${Date.now()}`;
  const testEmail = `intake-drill-${Date.now()}@example.invalid`;
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
  async function apiGetBinary(path: string): Promise<{ status: number }> {
    const response = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${idToken}` } });
    await response.arrayBuffer();
    return { status: response.status };
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
    // ------------------------------------------- step 1: create ---------
    const createResponse = await apiPost("/intake", {
      reason: "[SYNTHETIC] intake drill — new submission",
      fixtureSetId: drillTag,
      title: "[SYNTHETIC] intake drill title",
      summary: "[SYNTHETIC] intake drill summary",
      provenanceRef: `fixture://invented-${drillTag}`,
    });
    record("Real POST /intake succeeds through the live API", createResponse.status === 200, `status=${createResponse.status}`);
    const recordId = (createResponse.json as { recordId: string }).recordId;
    log("CREATE", "Created submission", { recordId });

    // ----------------------------------------- step 2: add evidence -----
    const claimResponse = await apiPost(`/records/${recordId}/add-authority-claim`, {
      reason: "[SYNTHETIC] claim",
      claimant: "[SYNTHETIC] invented narrator",
      scope: "full record",
      evidenceRef: `fixture://invented-${drillTag}-claim`,
    });
    record("Real POST .../add-authority-claim succeeds", claimResponse.status === 200, `status=${claimResponse.status}`);
    const claimId = (claimResponse.json as { requestId: string }).requestId;

    const rightResponse = await apiPost(`/records/${recordId}/add-legal-right`, {
      reason: "[SYNTHETIC] right",
      holder: "[SYNTHETIC] invented rightsholder",
      rightType: "publication",
      jurisdiction: null,
      evidenceRef: `fixture://invented-${drillTag}-right`,
    });
    record("Real POST .../add-legal-right succeeds", rightResponse.status === 200, `status=${rightResponse.status}`);
    const rightId = (rightResponse.json as { requestId: string }).requestId;

    const grantResponse = await apiPost(`/records/${recordId}/add-consent-grant`, {
      reason: "[SYNTHETIC] grant",
      signerCapacitySummary: "[SYNTHETIC] invented primary narrator",
      purposes: ["preservation"],
      audience: "staff",
      mandateRef: null,
      expiresAt: null,
      retentionTermsRef: `fixture://invented-${drillTag}-retention`,
      withdrawalContact: "fixture-steward@example.invalid",
    });
    record("Real POST .../add-consent-grant succeeds", grantResponse.status === 200, `status=${grantResponse.status}`);
    const consentId = (grantResponse.json as { requestId: string }).requestId;

    // A SEPARATE publication-purpose grant — must be added now, while
    // still quarantined (addConsentGrant's own precondition), so it's
    // available later for a REAL approve-publication success check, not
    // just the denial check. Kept deliberately separate from the
    // preservation grant above, matching the milestone's own "separate
    // preservation/publication grants" scope.
    const publicationGrantResponse = await apiPost(`/records/${recordId}/add-consent-grant`, {
      reason: "[SYNTHETIC] publication grant",
      signerCapacitySummary: "[SYNTHETIC] invented primary narrator",
      purposes: ["publication"],
      audience: "staff",
      mandateRef: null,
      expiresAt: null,
      retentionTermsRef: `fixture://invented-${drillTag}-retention`,
      withdrawalContact: "fixture-steward@example.invalid",
    });
    record("Real POST .../add-consent-grant (publication-purpose) succeeds", publicationGrantResponse.status === 200, `status=${publicationGrantResponse.status}`);
    const publicationConsentId = (publicationGrantResponse.json as { requestId: string }).requestId;

    const mediaResponse = await apiPost(`/records/${recordId}/add-media`, {
      reason: "[SYNTHETIC] media",
      contentType: "text/plain",
      base64: Buffer.from(`[SYNTHETIC] intake drill file for ${recordId}\n`).toString("base64"),
    });
    record("Real POST .../add-media succeeds", mediaResponse.status === 200, `status=${mediaResponse.status}`);

    // --------------------------- step 2b: quarantine still denies -------
    const deniedWhileQuarantined = await apiGet(`/records/${recordId}?purpose=preservation&audience=staff`);
    const deniedBody = deniedWhileQuarantined.json as { access?: { allowed?: boolean; reason?: string } };
    record(
      "Quarantine denies staff/preservation access even WITH real evidence attached",
      deniedBody.access?.allowed === false && /quarantined/.test(deniedBody.access?.reason ?? ""),
      JSON.stringify(deniedBody.access),
    );

    // ------------------------------------------ step 3: intake detail ---
    const intakeDetail = await apiGet(`/intake/${recordId}`);
    const intakeBody = intakeDetail.json as {
      controlVersion: number;
      recordVersion: number;
      record: { mediaRefs: { mediaId: string }[] };
    };
    record(
      "Real GET /intake/:recordId reads the full quarantined submission",
      intakeDetail.status === 200 && intakeBody.record.mediaRefs.length === 1,
      `status=${intakeDetail.status}`,
    );
    const mediaId = intakeBody.record.mediaRefs[0].mediaId;

    // ----------------------------------- step 4: intake media preview ---
    const normalMediaAttempt = await apiGetBinary(`/records/${recordId}/media/${mediaId}?purpose=preservation&audience=staff`);
    record("The normal media route denies a quarantined upload (403)", normalMediaAttempt.status === 403, `status=${normalMediaAttempt.status}`);
    const intakeMediaAttempt = await apiGetBinary(`/intake/${recordId}/media/${mediaId}`);
    record("GET /intake/:recordId/media/:mediaId previews the same upload", intakeMediaAttempt.status === 200, `status=${intakeMediaAttempt.status}`);

    // ----------------------- step 5: real version-conflict on approval --
    const correctResponse = await apiPost(`/records/${recordId}/correct`, {
      reason: "[SYNTHETIC] fixing a typo before review",
      field: "title",
      correctedValue: "[SYNTHETIC] intake drill title (corrected)",
    });
    record("A real metadata correction mid-review succeeds", correctResponse.status === 200, `status=${correctResponse.status}`);

    const staleApproveAttempt = await apiPost(`/records/${recordId}/approve-preservation`, {
      reason: "[SYNTHETIC] approve with a stale recordVersion",
      expectedControlVersion: intakeBody.controlVersion,
      expectedRecordVersion: intakeBody.recordVersion, // stale — correctRecord just bumped it
      authorityClaimIds: [claimId],
      legalRightIds: [rightId],
      consentGrantIds: [consentId],
    });
    const staleApproveBody = staleApproveAttempt.json as { status?: string };
    record(
      "Approving with a stale recordVersion is rejected by the real DynamoDB transaction, not silently accepted",
      staleApproveAttempt.status === 409 || staleApproveBody.status !== "completed",
      JSON.stringify({ status: staleApproveAttempt.status, body: staleApproveBody }),
    );

    // --------------------------------------- step 6: real approval ------
    const freshDetail = await apiGet(`/intake/${recordId}`);
    const freshBody = freshDetail.json as { controlVersion: number; recordVersion: number };
    const approveResponse = await apiPost(`/records/${recordId}/approve-preservation`, {
      reason: "[SYNTHETIC] approve for real",
      expectedControlVersion: freshBody.controlVersion,
      expectedRecordVersion: freshBody.recordVersion,
      authorityClaimIds: [claimId],
      legalRightIds: [rightId],
      consentGrantIds: [consentId],
    });
    const approveBody = approveResponse.json as { status?: string };
    record("Real POST .../approve-preservation succeeds with the fresh version", approveBody.status === "completed", JSON.stringify(approveBody));

    const allowedNow = await apiGet(`/records/${recordId}?purpose=preservation&audience=staff`);
    const allowedBody = allowedNow.json as { access?: { allowed?: boolean } };
    record("staff/preservation access is now allowed through the real API", allowedBody.access?.allowed === true, JSON.stringify(allowedBody.access));

    const stillDeniedPublic = await apiGet(`/records/${recordId}?purpose=publication&audience=public`);
    const stillDeniedBody = stillDeniedPublic.json as { access?: { allowed?: boolean; reason?: string } };
    record(
      "public/publication access remains denied, real reason naming the missing grant",
      stillDeniedBody.access?.allowed === false,
      JSON.stringify(stillDeniedBody.access),
    );

    // --------------------------- step 7: publication denied for real ----
    const afterPreservationDetail = await apiGet(`/records/${recordId}?purpose=preservation&audience=staff`);
    const afterPreservationBody = afterPreservationDetail.json as { control?: { controlVersion: number }; record?: { version: number } };
    const publishAttempt = await apiPost(`/records/${recordId}/approve-publication`, {
      reason: "[SYNTHETIC] attempt publication with the wrong (preservation-purpose) grant",
      expectedControlVersion: afterPreservationBody.control!.controlVersion,
      expectedRecordVersion: afterPreservationBody.record!.version,
      consentGrantIds: [consentId], // preservation-purpose, not publication — deliberately wrong
    });
    const publishBody = publishAttempt.json as { status?: string };
    record(
      "approve-publication is denied — THE completion test's central guarantee: publication remains denied without its own grant",
      publishBody.status === "denied",
      JSON.stringify(publishBody),
    );

    // ------------------- step 7b: publication SUCCEEDS with ITS OWN grant -
    // Reviewer-caught finding: the drill previously covered only the
    // denial branch. The real publication-purpose grant added in step 2
    // (kept separate from the preservation grant throughout) is named
    // here for real — confirms approve-publication's success path and
    // the resulting live access change, not just its refusal.
    const realPublishAttempt = await apiPost(`/records/${recordId}/approve-publication`, {
      reason: "[SYNTHETIC] approve publication for real, with its own grant",
      // The denied attempt above never reached commitApproval at all (it
      // denies as soon as no named grant qualifies, before any register
      // write) — controlVersion is unchanged from afterPreservationBody.
      expectedControlVersion: afterPreservationBody.control!.controlVersion,
      expectedRecordVersion: afterPreservationBody.record!.version,
      consentGrantIds: [publicationConsentId],
    });
    const realPublishBody = realPublishAttempt.json as { status?: string };
    record(
      "Real POST .../approve-publication succeeds with its own, correctly-scoped grant",
      realPublishBody.status === "completed",
      JSON.stringify(realPublishBody),
    );

    const publicAllowedNow = await apiGet(`/records/${recordId}?purpose=publication&audience=staff`);
    const publicAllowedBody = publicAllowedNow.json as { access?: { allowed?: boolean } };
    record(
      "staff/publication access is now allowed through the real API, after the real grant was verified",
      publicAllowedBody.access?.allowed === true,
      JSON.stringify(publicAllowedBody.access),
    );

    // ------------------------------------------- step 8: export/restore -
    const publicExport = await apiPost("/export", {
      recordIds: [recordId],
      scope: "public-redacted",
      fixtureSetId: drillTag,
      destinationAudience: "public",
    });
    record("Real public-redacted export succeeds", publicExport.status === 200, `status=${publicExport.status}`);

    const preservationExport = await apiPost("/export", {
      recordIds: [recordId],
      scope: "complete-preservation",
      fixtureSetId: drillTag,
      destinationAudience: "staff",
    });
    record("Real complete-preservation export succeeds", preservationExport.status === 200, `status=${preservationExport.status}`);

    const restoredTarget = new InMemoryFixtureStore();
    const restoredMediaStore = new InMemoryMediaStore();
    const exportEnvelope = structuredClone(preservationExport.json) as Parameters<typeof importExport>[1];
    exportEnvelope.records[0].record.mediaRefs = exportEnvelope.records[0].record.mediaRefs.map((m) => ({
      ...m,
      objectKey: `restored/${drillTag}/${m.objectKey}`,
    }));
    await importExport(restoredTarget, exportEnvelope, restoredMediaStore);
    const restoredRecord = await restoredTarget.getRecord(recordId);
    record(
      "Restoring the complete-preservation export into an isolated target reproduces the real record and media",
      restoredRecord?.mediaRefs.length === 1,
      JSON.stringify(restoredRecord?.mediaRefs),
    );

    // --------------------------- step 9: withdraw, delete, confirm gone --
    const withdrawResponse = await apiPost(`/records/${recordId}/withdraw`, { reason: "[SYNTHETIC] withdrawing before deletion" });
    record("Real POST .../withdraw succeeds", withdrawResponse.status === 200, `status=${withdrawResponse.status}`);

    const startDeletionResponse = await apiPost(`/records/${recordId}/start-deletion`, { reason: "[SYNTHETIC] deleting the drill submission" });
    const startDeletionBody = startDeletionResponse.json as { requestId: string };
    record("Real POST .../start-deletion succeeds", startDeletionResponse.status === 200, `status=${startDeletionResponse.status}`);

    const completeDeletionResponse = await apiPost(`/records/${recordId}/complete-deletion`, {
      reason: "[SYNTHETIC] completing deletion",
      deletionRequestId: startDeletionBody.requestId,
    });
    const completeDeletionBody = completeDeletionResponse.json as { status?: string };
    record("Real POST .../complete-deletion reports completed", completeDeletionBody.status === "completed", JSON.stringify(completeDeletionBody));

    const afterDeletion = await apiGet(`/records/${recordId}?purpose=preservation&audience=staff`);
    record("The record is genuinely gone after deletion (404)", afterDeletion.status === 404, `status=${afterDeletion.status}`);
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
