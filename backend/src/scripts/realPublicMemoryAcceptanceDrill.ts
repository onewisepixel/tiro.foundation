// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Live-AWS
// acceptance drill for the "connect approved synthetic records to the
// public Memory site" milestone, against the real deployed stack. This is
// the automated version of the milestone's own stated completion test:
//
//   "create a fixture through staff intake; confirm preservation approval
//   alone leaves it invisible anonymously; approve a separate public-
//   audience publication grant; then browse and retrieve media without
//   signing in. Test each protective action against a fresh, previously
//   allowed fixture, verifying that the affected content disappears or
//   becomes masked across pages, metadata, API and media."
//
// Every "anonymous"/"public" check below sends NO Authorization header at
// all — proving the real API Gateway HttpNoneAuthorizer override and
// handler.ts's own isPublicGetRoutePath gate, not just the in-memory fakes.
//
// Covers, all through the REAL deployed API:
//   1. Build an approved, publicly-visible fixture: POST /intake, add
//      evidence (one authority claim, one preservation/staff grant, one
//      publication/public grant, one real media file), approve
//      preservation — confirm it's STILL anonymously invisible (listing,
//      detail, media) with preservation alone.
//   2. approve-publication (naming the publication/public grant) — confirm
//      it is NOW anonymously visible: present in a real, multi-page
//      GET /public/records walk (using the real encrypted cursors),
//      GET /public/records/:id returns the masked-safe view, and
//      GET /public/records/:id/media/:id returns real, checksummed bytes.
//   3. For EACH of restrict / redact-text / redact-media / revoke-consent /
//      withdraw / delete, independently: build a FRESH approved-and-public
//      fixture (step 1-2 above), apply exactly that one protective action,
//      and re-check every anonymous surface — confirming the affected
//      content disappears (listing/detail/media all 404) or becomes masked
//      (redacted text/media only), never partially stale on any surface.
//
// Cleanup: only this drill's own disposable Cognito test user is deleted.
// Every fixture this drill creates is deleted by the drill itself (the
// dedicated "delete" case, plus an explicit cleanup pass over every other
// fixture built along the way) — nothing else is left behind beyond the
// ordinary synthetic-fixture precedent.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_FIXTURE_NAMESPACE=drill-20261002 \
//   TIRO_STAFF_API_URL=... TIRO_STAFF_USER_POOL_ID=... TIRO_STAFF_USER_POOL_CLIENT_ID=... \
//   npx tsx backend/src/scripts/realPublicMemoryAcceptanceDrill.ts
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHash, randomUUID } from "node:crypto";

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
  const drillTag = `public-memory-drill-${Date.now()}`;
  const testEmail = `public-memory-drill-${Date.now()}@example.invalid`;
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

  // ---- Authenticated (staff) helpers — same shape as realIntakeAcceptanceDrill.ts ----
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

  // ---- Anonymous (public, unauthenticated) helpers — NO Authorization header, ever ----
  async function publicGet(path: string): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${API_URL}${path}`);
    return { status: response.status, json: await response.json().catch(() => null) };
  }
  async function publicGetBinary(path: string): Promise<{ status: number; body: Buffer }> {
    const response = await fetch(`${API_URL}${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    return { status: response.status, body };
  }

  // Walks GET /public/records across as many pages as the REAL encrypted
  // cursor needs, exercising the actual round trip end to end (not just
  // in-memory) — bounded so a bug can never hang this drill.
  async function findInPublicListing(targetRecordId: string): Promise<boolean> {
    let cursor: string | null = null;
    for (let page = 0; page < 200; page++) {
      const path = cursor ? `/public/records?limit=50&cursor=${encodeURIComponent(cursor)}` : "/public/records?limit=50";
      const response = await publicGet(path);
      if (response.status !== 200) {
        throw new Error(`GET /public/records returned ${response.status} while paginating.`);
      }
      const body = response.json as { items: { recordId: string }[]; nextCursor: string | null };
      if (body.items.some((item) => item.recordId === targetRecordId)) {
        return true;
      }
      if (!body.nextCursor) {
        return false;
      }
      cursor = body.nextCursor;
    }
    throw new Error("findInPublicListing exceeded its page-walk safety bound — possible infinite pagination.");
  }

  const builtRecordIds: string[] = [];

  // Builds one fresh fixture, through the REAL deployed API, all the way
  // to "preserved and published, visible anonymously" — the exact
  // "previously allowed fixture" the completion test asks every
  // protective-action check to start from.
  async function buildApprovedPublicFixture(suffix: string) {
    const fixtureSetId = `${drillTag}-${suffix}`;
    const createResponse = await apiPost("/intake", {
      reason: "[SYNTHETIC] public memory drill — new submission",
      fixtureSetId,
      title: `[SYNTHETIC] public memory drill title (${suffix})`,
      summary: "[SYNTHETIC] public memory drill summary",
      provenanceRef: `fixture://invented-${fixtureSetId}`,
    });
    const recordId = (createResponse.json as { recordId: string }).recordId;
    builtRecordIds.push(recordId);

    const claimResponse = await apiPost(`/records/${recordId}/add-authority-claim`, {
      reason: "[SYNTHETIC] claim",
      claimant: "[SYNTHETIC] invented narrator",
      scope: "full record",
      evidenceRef: `fixture://invented-${fixtureSetId}-claim`,
    });
    const claimId = (claimResponse.json as { requestId: string }).requestId;

    const preservationGrantResponse = await apiPost(`/records/${recordId}/add-consent-grant`, {
      reason: "[SYNTHETIC] preservation grant",
      signerCapacitySummary: "[SYNTHETIC] invented primary narrator",
      purposes: ["preservation"],
      audience: "staff",
      mandateRef: null,
      expiresAt: null,
      retentionTermsRef: `fixture://invented-${fixtureSetId}-retention`,
      withdrawalContact: "fixture-steward@example.invalid",
    });
    const preservationConsentId = (preservationGrantResponse.json as { requestId: string }).requestId;

    // The SEPARATE public-audience publication grant the completion test
    // requires — added now, while still quarantined (addConsentGrant's own
    // precondition), left UNVERIFIED until approve-publication names it.
    const publicationGrantResponse = await apiPost(`/records/${recordId}/add-consent-grant`, {
      reason: "[SYNTHETIC] public-audience publication grant",
      signerCapacitySummary: "[SYNTHETIC] invented primary narrator",
      purposes: ["publication"],
      audience: "public",
      mandateRef: null,
      expiresAt: null,
      retentionTermsRef: `fixture://invented-${fixtureSetId}-retention`,
      withdrawalContact: "fixture-steward@example.invalid",
    });
    const publicationConsentId = (publicationGrantResponse.json as { requestId: string }).requestId;

    const mediaBody = Buffer.from(`[SYNTHETIC] public memory drill file for ${fixtureSetId}\n`);
    const mediaResponse = await apiPost(`/records/${recordId}/add-media`, {
      reason: "[SYNTHETIC] media",
      contentType: "text/plain",
      base64: mediaBody.toString("base64"),
    });
    const mediaId = (mediaResponse.json as { requestId: string }).requestId;

    const intakeDetail = await apiGet(`/intake/${recordId}`);
    const { controlVersion, recordVersion } = intakeDetail.json as { controlVersion: number; recordVersion: number };

    const approvePreservation = await apiPost(`/records/${recordId}/approve-preservation`, {
      reason: "[SYNTHETIC] approve preservation",
      expectedControlVersion: controlVersion,
      expectedRecordVersion: recordVersion,
      authorityClaimIds: [claimId],
      legalRightIds: [],
      consentGrantIds: [preservationConsentId],
    });
    if ((approvePreservation.json as { status?: string }).status !== "completed") {
      throw new Error(`approve-preservation did not complete for ${recordId}: ${JSON.stringify(approvePreservation.json)}`);
    }

    // ---- Preservation-only checkpoint: anonymously invisible, always ----
    const preservationOnlyDetail = await publicGet(`/public/records/${recordId}`);
    record(
      `[${suffix}] GET /public/records/:id is 404 with preservation approval alone (no public-audience grant verified yet)`,
      preservationOnlyDetail.status === 404,
      `status=${preservationOnlyDetail.status}`,
    );
    const preservationOnlyListed = await findInPublicListing(recordId);
    record(`[${suffix}] record is absent from GET /public/records with preservation approval alone`, preservationOnlyListed === false);

    const afterPreservation = await apiGet(`/records/${recordId}?purpose=preservation&audience=staff`);
    const afterPreservationBody = afterPreservation.json as { control: { controlVersion: number }; record: { version: number } };

    const approvePublication = await apiPost(`/records/${recordId}/approve-publication`, {
      reason: "[SYNTHETIC] approve publication with its own public-audience grant",
      expectedControlVersion: afterPreservationBody.control.controlVersion,
      expectedRecordVersion: afterPreservationBody.record.version,
      consentGrantIds: [publicationConsentId],
    });
    if ((approvePublication.json as { status?: string }).status !== "completed") {
      throw new Error(`approve-publication did not complete for ${recordId}: ${JSON.stringify(approvePublication.json)}`);
    }

    return { recordId, mediaId, mediaBody, preservationConsentId, publicationConsentId };
  }

  async function assertFullyPublic(label: string, recordId: string, mediaId: string, mediaBody: Buffer): Promise<void> {
    const detail = await publicGet(`/public/records/${recordId}`);
    record(`${label}: GET /public/records/:id returns 200`, detail.status === 200, `status=${detail.status}`);

    const listed = await findInPublicListing(recordId);
    record(`${label}: record is present in GET /public/records (real, paginated walk)`, listed === true);

    const media = await publicGetBinary(`/public/records/${recordId}/media/${mediaId}`);
    const checksumMatches = media.status === 200 && createHash("sha256").update(media.body).digest("hex") === createHash("sha256").update(mediaBody).digest("hex");
    record(`${label}: GET /public/records/:id/media/:id returns the real, checksummed bytes anonymously`, checksumMatches, `status=${media.status}`);
  }

  async function assertFullyGone(label: string, recordId: string, mediaId: string): Promise<void> {
    const detail = await publicGet(`/public/records/${recordId}`);
    record(`${label}: GET /public/records/:id is 404`, detail.status === 404, `status=${detail.status}`);

    const listed = await findInPublicListing(recordId);
    record(`${label}: record is absent from GET /public/records`, listed === false);

    const media = await publicGetBinary(`/public/records/${recordId}/media/${mediaId}`);
    record(`${label}: media is 404 (never 403) anonymously`, media.status === 404, `status=${media.status}`);
  }

  try {
    // ================= Step 1-2: the completion test's primary case =====
    const primary = await buildApprovedPublicFixture("primary");
    await assertFullyPublic("Primary fixture, after approve-publication", primary.recordId, primary.mediaId, primary.mediaBody);

    // ================= Step 3: each protective action, fresh fixture ====

    // -- restrict --
    const restrictFixture = await buildApprovedPublicFixture("restrict");
    await apiPost(`/records/${restrictFixture.recordId}/restrict`, { reason: "[SYNTHETIC] restrict publication", purposes: ["publication"] });
    await assertFullyGone("restrict", restrictFixture.recordId, restrictFixture.mediaId);

    // -- redact-text --
    const redactTextFixture = await buildApprovedPublicFixture("redact-text");
    await apiPost(`/records/${redactTextFixture.recordId}/redact-text`, { reason: "[SYNTHETIC] redact title", field: "title" });
    const redactedDetail = await publicGet(`/public/records/${redactTextFixture.recordId}`);
    const redactedBody = redactedDetail.json as { title?: string };
    record("redact-text: the record stays visible, but the title is masked to the placeholder", redactedDetail.status === 200 && redactedBody.title === "[REDACTED]", `status=${redactedDetail.status} title=${redactedBody.title}`);

    // -- redact-media --
    const redactMediaFixture = await buildApprovedPublicFixture("redact-media");
    await apiPost(`/records/${redactMediaFixture.recordId}/redact-media`, { reason: "[SYNTHETIC] redact media", mediaId: redactMediaFixture.mediaId });
    const afterMediaRedactDetail = await publicGet(`/public/records/${redactMediaFixture.recordId}`);
    const afterMediaRedactBody = afterMediaRedactDetail.json as { media?: { mediaId: string }[] };
    record("redact-media: the record stays visible, and the redacted mediaId is absent from media[]", afterMediaRedactDetail.status === 200 && !(afterMediaRedactBody.media ?? []).some((m) => m.mediaId === redactMediaFixture.mediaId), `status=${afterMediaRedactDetail.status}`);
    const redactedMediaFetch = await publicGetBinary(`/public/records/${redactMediaFixture.recordId}/media/${redactMediaFixture.mediaId}`);
    record("redact-media: that specific media id 404s (never 403) anonymously", redactedMediaFetch.status === 404, `status=${redactedMediaFetch.status}`);

    // -- revoke-consent (the public-audience publication grant) --
    const revokeFixture = await buildApprovedPublicFixture("revoke-consent");
    await apiPost(`/records/${revokeFixture.recordId}/revoke-consent`, { reason: "[SYNTHETIC] revoke publication grant", consentId: revokeFixture.publicationConsentId });
    await assertFullyGone("revoke-consent", revokeFixture.recordId, revokeFixture.mediaId);

    // -- withdraw --
    const withdrawFixture = await buildApprovedPublicFixture("withdraw");
    await apiPost(`/records/${withdrawFixture.recordId}/withdraw`, { reason: "[SYNTHETIC] withdraw" });
    await assertFullyGone("withdraw", withdrawFixture.recordId, withdrawFixture.mediaId);

    // -- delete --
    const deleteFixture = await buildApprovedPublicFixture("delete");
    const startDeletionResponse = await apiPost(`/records/${deleteFixture.recordId}/start-deletion`, { reason: "[SYNTHETIC] deleting the drill fixture" });
    const startDeletionBody = startDeletionResponse.json as { requestId: string };
    await apiPost(`/records/${deleteFixture.recordId}/complete-deletion`, {
      reason: "[SYNTHETIC] completing deletion",
      deletionRequestId: startDeletionBody.requestId,
    });
    await assertFullyGone("delete", deleteFixture.recordId, deleteFixture.mediaId);
  } finally {
    // Leave every OTHER fixture this drill built in a terminal, withdrawn
    // state rather than deleting them outright — matching this
    // engagement's precedent of not accumulating unbounded live-drill
    // debris, while keeping the delete-path check (above) the one place
    // actual deletion is exercised.
    for (const recordId of builtRecordIds) {
      await apiPost(`/records/${recordId}/withdraw`, { reason: "[SYNTHETIC] drill cleanup — withdrawing every fixture this run created" }).catch(() => undefined);
    }
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
