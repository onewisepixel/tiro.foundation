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
// Covers, all through the REAL deployed API, with exactly TWO complete
// GET /public/records walks per run (each walk evaluates every
// preserved+published candidate on the shared namespace, so per-check
// walks were the drill's dominant cost):
//   1. Build 8 fresh fixtures: POST /intake, add evidence (one authority
//      claim, one preservation/staff grant, one publication/public grant,
//      one real media file), approve preservation — and confirm each is
//      STILL anonymously invisible, directly (detail and media 404), with
//      preservation alone. One ("preservation-only") stops there; the other
//      7 get approve-publication (naming the publication/public grant), and
//      each is confirmed directly visible: GET /public/records/:id 200 and
//      GET /public/records/:id/media/:id returns real, checksummed bytes.
//   2. Baseline walk: every published fixture present; preservation-only
//      absent.
//   3. For EACH of restrict / redact-text / redact-media / revoke-consent /
//      withdraw / delete, on its own fresh, previously allowed fixture:
//      apply exactly that action, confirm the action's lifecycle request
//      completed, and directly re-check detail and media — 404 (never 403)
//      or masked (redacted text/media only).
//   4. After-actions walk: every fixture checked against its expected
//      state — primary present; redact-text listed with its title masked
//      IN the listing item; redact-media listed without the redacted
//      mediaId; restrict/revoke-consent/withdraw/delete and
//      preservation-only absent.
//
// Cleanup: the disposable Cognito test user is deleted. Fixtures are NOT
// all deleted: the dedicated "delete" case exercises real deletion, and
// every other fixture this run built is WITHDRAWN (left in a terminal,
// non-public state, matching this engagement's synthetic-fixture
// precedent). Cleanup verifies each one — staff GET 404 (deleted), or a
// withdraw that returned HTTP 200 with lifecycle status "completed" AND a
// register read-back showing "withdrawn" — and lists every fixture it
// could not verify by recordId, exiting non-zero. A run whose cleanup is
// unfinished is never reported as clean.
//
// Listing checks have three outcomes: PASS, FAIL, and INCONCLUSIVE. An
// "absent from GET /public/records" check is INCONCLUSIVE — never PASS —
// whenever any page of the walk reported hadFailures (a candidate that
// failed to evaluate is silently missing from that page) or the walk could
// not complete; see publicDrillSupport.ts. Any non-PASS exits non-zero.
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
import {
  cleanupDrillFixtures,
  idempotentPost,
  retryOnServerError,
  classifyInWalk,
  walkEntirePublicListing,
  type HttpResult,
  type ListingOutcome,
  type ListingWalk,
} from "./publicDrillSupport";

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

type CheckOutcome = "PASS" | "FAIL" | "INCONCLUSIVE";
type CheckResult = { name: string; outcome: CheckOutcome; detail?: string };
const results: CheckResult[] = [];
function recordOutcome(name: string, outcome: CheckOutcome, detail?: string): void {
  results.push({ name, outcome, detail });
  log(outcome, name, detail);
}
function record(name: string, passed: boolean, detail?: string): void {
  recordOutcome(name, passed ? "PASS" : "FAIL", detail);
}
// A listing check passes only on the expected definite outcome. An
// inconclusive walk is reported as INCONCLUSIVE whatever was expected —
// "not found, but some candidates were never checked" proves neither
// presence nor absence.
function recordListing(name: string, expected: "present" | "absent", outcome: ListingOutcome): void {
  if (outcome.kind === "inconclusive") {
    recordOutcome(name, "INCONCLUSIVE", outcome.reason);
  } else {
    record(name, outcome.kind === expected, `walk result: ${outcome.kind}`);
  }
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

  // This drill builds 8 fixtures back-to-back, each several HTTP calls —
  // against the deliberately tiny provisioned capacity these tables run
  // at (5 RCU/5 WCU — see docs/backend/decision-and-cost.md; capacity
  // stays there, this drill adapts instead), a burst like that WILL
  // occasionally throttle for real. The Lambda's own
  // ProvisionedThroughputExceededException isn't visible to an HTTP
  // client — it surfaces here as either a generic 500 (an unhandled
  // exception) or, for GET /public/records specifically, a 503 (every
  // candidate on the page failed to evaluate — services/publicView.ts's
  // `hadFailures` signal, router.ts's deliberate response for exactly
  // this case, confirmed live: reproduced here on the very first live run
  // after that fix shipped) — either way, a transient throttle and a
  // genuine server bug are indistinguishable from the client alone.
  // Retrying with backoff (same shape as realLegacyMediaMigration.ts's
  // withThrottleRetry, which retries the SAME exception server-side,
  // in-process) resolves the transient case; a genuine bug fails the SAME
  // way on every retry and still surfaces — this never masks a real
  // defect, it only stops a known capacity limit from aborting the whole
  // run.
  // After its last attempt this RETURNS the final 500/503 rather than
  // throwing — every caller must check the status itself.
  async function withHttpThrottleRetry<T extends { status: number }>(fn: () => Promise<T>, label: string): Promise<T> {
    return retryOnServerError(fn, {
      onRetry: (attempt, status, delayMs) =>
        log("THROTTLE BACKOFF", `${label}: got a ${status} (possibly provisioned-throughput throttling on this intentionally tiny-capacity table); waiting ${delayMs}ms before retry ${attempt}`),
    });
  }

  // ---- Authenticated (staff) helpers — same shape as realIntakeAcceptanceDrill.ts ----
  async function apiGet(path: string): Promise<{ status: number; json: unknown }> {
    return withHttpThrottleRetry(async () => {
      const response = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${idToken}` } });
      return { status: response.status, json: await response.json().catch(() => null) };
    }, `GET ${path}`);
  }
  // One requestId per logical POST, minted once and reused by every retry
  // attempt (publicDrillSupport.ts's idempotentPost) — so a retry after a
  // lost response is the backend's idempotent replay, not a second request.
  async function apiPost(path: string, bodyObj: Record<string, unknown>): Promise<HttpResult> {
    return idempotentPost(
      async (stableBody) => {
        const response = await fetch(`${API_URL}${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
          body: JSON.stringify(stableBody),
        });
        return { status: response.status, json: await response.json().catch(() => null) };
      },
      bodyObj,
      (fn) => withHttpThrottleRetry(fn, `POST ${path}`),
    );
  }

  // ---- Anonymous (public, unauthenticated) helpers — NO Authorization header, ever ----
  async function publicGet(path: string): Promise<{ status: number; json: unknown }> {
    return withHttpThrottleRetry(async () => {
      const response = await fetch(`${API_URL}${path}`);
      return { status: response.status, json: await response.json().catch(() => null) };
    }, `GET ${path} (anonymous)`);
  }
  async function publicGetBinary(path: string): Promise<{ status: number; body: Buffer }> {
    return withHttpThrottleRetry(async () => {
      const response = await fetch(`${API_URL}${path}`);
      const body = Buffer.from(await response.arrayBuffer());
      return { status: response.status, body };
    }, `GET ${path} (anonymous, binary)`);
  }

  // Exactly TWO complete GET /public/records walks per run — a baseline
  // after every fixture is published and before any protective action, and
  // one after every action — each checked against every fixture. Each walk
  // evaluates every preserved+published candidate on the shared namespace
  // (profiled 2026-10-10: near-400 KB legacy record items cost ~97 RCU per
  // read), so per-check walks (~12 per run previously) were the expensive
  // part of this drill. Uses the REAL encrypted cursors end to end, bounded
  // so a bug can never hang the run.
  async function walkListing(label: string): Promise<ListingWalk> {
    log("WALK", `${label}: starting a complete GET /public/records walk`);
    const walk = await walkEntirePublicListing(publicGet);
    log(
      "WALK",
      `${label}: ${walk.pages} page(s), ${walk.items.size} listed item(s), ${walk.failedPages} page(s) with failed evaluations${walk.incompleteReason ? `; INCOMPLETE: ${walk.incompleteReason}` : ""}`,
    );
    return walk;
  }

  // A "present" expectation that also checks the LISTED item itself (e.g.
  // a masked title), not just that the record appears.
  function recordListedItem(name: string, outcome: ListingOutcome, check: (item: Record<string, unknown>) => boolean, describe: (item: Record<string, unknown>) => string): void {
    if (outcome.kind === "present") {
      record(name, check(outcome.item), describe(outcome.item));
    } else if (outcome.kind === "absent") {
      record(name, false, "walk result: absent");
    } else {
      recordOutcome(name, "INCONCLUSIVE", outcome.reason);
    }
  }

  const builtRecordIds: string[] = [];
  let cleanupUnresolved: { recordId: string; reason: string }[] = [];

  type BuiltFixture = { suffix: string; recordId: string; mediaId: string; mediaBody: Buffer; preservationConsentId: string; publicationConsentId: string };

  // Builds one fresh fixture through the REAL deployed API: intake,
  // evidence, a real media file, preservation approval — then checks it is
  // anonymously invisible (detail and media, directly) with preservation
  // approval alone. Unless `publish: false`, then approves publication with
  // its SEPARATE public-audience grant, making it the "previously allowed
  // fixture" each protective action starts from. Listing visibility is
  // checked by the two consolidated walks, not here.
  async function buildFixture(suffix: string, options: { publish: boolean } = { publish: true }): Promise<BuiltFixture> {
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
    const preservationOnlyMedia = await publicGetBinary(`/public/records/${recordId}/media/${mediaId}`);
    record(
      `[${suffix}] GET /public/records/:id/media/:id is 404 with preservation approval alone`,
      preservationOnlyMedia.status === 404,
      `status=${preservationOnlyMedia.status}`,
    );

    const built: BuiltFixture = { suffix, recordId, mediaId, mediaBody, preservationConsentId, publicationConsentId };
    if (!options.publish) {
      return built;
    }

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
    return built;
  }

  // Direct (non-listing) checks: detail and media, per fixture.
  async function assertDirectlyPublic(fixture: BuiltFixture): Promise<void> {
    const detail = await publicGet(`/public/records/${fixture.recordId}`);
    record(`[${fixture.suffix}] after approve-publication: GET /public/records/:id returns 200`, detail.status === 200, `status=${detail.status}`);
    const media = await publicGetBinary(`/public/records/${fixture.recordId}/media/${fixture.mediaId}`);
    const checksumMatches =
      media.status === 200 && createHash("sha256").update(media.body).digest("hex") === createHash("sha256").update(fixture.mediaBody).digest("hex");
    record(`[${fixture.suffix}] after approve-publication: GET /public/records/:id/media/:id returns the real, checksummed bytes anonymously`, checksumMatches, `status=${media.status}`);
  }

  async function assertDirectlyGone(fixture: BuiltFixture): Promise<void> {
    const detail = await publicGet(`/public/records/${fixture.recordId}`);
    record(`${fixture.suffix}: GET /public/records/:id is 404`, detail.status === 404, `status=${detail.status}`);
    const media = await publicGetBinary(`/public/records/${fixture.recordId}/media/${fixture.mediaId}`);
    record(`${fixture.suffix}: media is 404 (never 403) anonymously`, media.status === 404, `status=${media.status}`);
  }

  // A protective action's own lifecycle request must have completed —
  // otherwise every check after it would be testing nothing.
  function recordActionCompleted(label: string, response: HttpResult): void {
    const status = (response.json as { status?: string } | null)?.status;
    record(`${label}: the protective action itself completed`, response.status === 200 && status === "completed", `http=${response.status} status=${status}`);
  }

  try {
    // ================= Phase 1: build every fresh fixture ===============
    // One fixture deliberately stops at preservation approval, so both
    // walks verify "preservation approval alone leaves it anonymously
    // invisible" in the listing too (every fixture's detail/media is
    // checked directly at that stage inside buildFixture).
    const preservationOnly = await buildFixture("preservation-only", { publish: false });
    const primary = await buildFixture("primary");
    const restrictFixture = await buildFixture("restrict");
    const redactTextFixture = await buildFixture("redact-text");
    const redactMediaFixture = await buildFixture("redact-media");
    const revokeFixture = await buildFixture("revoke-consent");
    const withdrawFixture = await buildFixture("withdraw");
    const deleteFixture = await buildFixture("delete");
    const published = [primary, restrictFixture, redactTextFixture, redactMediaFixture, revokeFixture, withdrawFixture, deleteFixture];

    for (const fixture of published) {
      await assertDirectlyPublic(fixture);
    }

    // ================= Walk 1: baseline, before any protective action ===
    const baseline = await walkListing("Baseline walk (before protective actions)");
    for (const fixture of published) {
      recordListing(`[baseline walk] ${fixture.suffix}: present in GET /public/records after approve-publication`, "present", classifyInWalk(baseline, fixture.recordId));
    }
    recordListing("[baseline walk] preservation-only: absent from GET /public/records with preservation approval alone", "absent", classifyInWalk(baseline, preservationOnly.recordId));

    // ================= Phase 2: each protective action, fresh fixture ===
    recordActionCompleted("restrict", await apiPost(`/records/${restrictFixture.recordId}/restrict`, { reason: "[SYNTHETIC] restrict publication", purposes: ["publication"] }));
    await assertDirectlyGone(restrictFixture);

    recordActionCompleted("redact-text", await apiPost(`/records/${redactTextFixture.recordId}/redact-text`, { reason: "[SYNTHETIC] redact title", field: "title" }));
    const redactedDetail = await publicGet(`/public/records/${redactTextFixture.recordId}`);
    const redactedBody = redactedDetail.json as { title?: string };
    record("redact-text: the record stays visible, but the title is masked to the placeholder", redactedDetail.status === 200 && redactedBody.title === "[REDACTED]", `status=${redactedDetail.status} title=${redactedBody.title}`);

    recordActionCompleted("redact-media", await apiPost(`/records/${redactMediaFixture.recordId}/redact-media`, { reason: "[SYNTHETIC] redact media", mediaId: redactMediaFixture.mediaId }));
    const afterMediaRedactDetail = await publicGet(`/public/records/${redactMediaFixture.recordId}`);
    const afterMediaRedactBody = afterMediaRedactDetail.json as { media?: { mediaId: string }[] };
    record("redact-media: the record stays visible, and the redacted mediaId is absent from media[]", afterMediaRedactDetail.status === 200 && !(afterMediaRedactBody.media ?? []).some((m) => m.mediaId === redactMediaFixture.mediaId), `status=${afterMediaRedactDetail.status}`);
    const redactedMediaFetch = await publicGetBinary(`/public/records/${redactMediaFixture.recordId}/media/${redactMediaFixture.mediaId}`);
    record("redact-media: that specific media id 404s (never 403) anonymously", redactedMediaFetch.status === 404, `status=${redactedMediaFetch.status}`);

    recordActionCompleted("revoke-consent", await apiPost(`/records/${revokeFixture.recordId}/revoke-consent`, { reason: "[SYNTHETIC] revoke publication grant", consentId: revokeFixture.publicationConsentId }));
    await assertDirectlyGone(revokeFixture);

    recordActionCompleted("withdraw", await apiPost(`/records/${withdrawFixture.recordId}/withdraw`, { reason: "[SYNTHETIC] withdraw" }));
    await assertDirectlyGone(withdrawFixture);

    const startDeletionResponse = await apiPost(`/records/${deleteFixture.recordId}/start-deletion`, { reason: "[SYNTHETIC] deleting the drill fixture" });
    recordActionCompleted("delete (start-deletion)", startDeletionResponse);
    const startDeletionBody = startDeletionResponse.json as { requestId: string };
    recordActionCompleted(
      "delete (complete-deletion)",
      await apiPost(`/records/${deleteFixture.recordId}/complete-deletion`, {
        reason: "[SYNTHETIC] completing deletion",
        deletionRequestId: startDeletionBody.requestId,
      }),
    );
    await assertDirectlyGone(deleteFixture);

    // ================= Walk 2: after every protective action ============
    const after = await walkListing("After-actions walk");
    recordListing("[after-actions walk] primary: still present (no protective action applied)", "present", classifyInWalk(after, primary.recordId));
    recordListedItem(
      "[after-actions walk] redact-text: still listed, with the title masked in the listing item itself",
      classifyInWalk(after, redactTextFixture.recordId),
      (item) => item.title === "[REDACTED]",
      (item) => `title=${String(item.title)}`,
    );
    recordListedItem(
      "[after-actions walk] redact-media: still listed, with the redacted mediaId absent from the listing item's media[]",
      classifyInWalk(after, redactMediaFixture.recordId),
      (item) => !((item.media as { mediaId: string }[] | undefined) ?? []).some((m) => m.mediaId === redactMediaFixture.mediaId),
      (item) => `media=${JSON.stringify(item.media)}`,
    );
    for (const fixture of [restrictFixture, revokeFixture, withdrawFixture, deleteFixture]) {
      recordListing(`[after-actions walk] ${fixture.suffix}: absent from GET /public/records`, "absent", classifyInWalk(after, fixture.recordId));
    }
    recordListing("[after-actions walk] preservation-only: still absent from GET /public/records", "absent", classifyInWalk(after, preservationOnly.recordId));
  } finally {
    // Leave every OTHER fixture this drill built in a terminal, withdrawn
    // state rather than deleting them outright — matching this
    // engagement's precedent of not accumulating unbounded live-drill
    // debris, while keeping the delete-path check (above) the one place
    // actual deletion is exercised. Each fixture is VERIFIED; any that
    // can't be are reported by recordId and fail the run.
    log("CLEANUP", `Withdrawing and verifying ${builtRecordIds.length} fixture(s) built by this run`);
    const cleanup = await cleanupDrillFixtures(builtRecordIds, { post: apiPost, get: apiGet });
    cleanupUnresolved = cleanup.unresolved;
    log("CLEANUP", "Verified non-public", cleanup.resolved);
    if (cleanup.unresolved.length > 0) {
      log("CLEANUP INCOMPLETE", "These fixtures could NOT be verified as withdrawn or deleted and may still be public — resolve manually", cleanup.unresolved);
    }
    log("CLEANUP", "Deleting the disposable drill Cognito test user (nothing else)", { email: testEmail });
    await cognitoClient
      .send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: testEmail }))
      .catch((error) => log("CLEANUP", "Non-fatal: failed to delete drill test user", String(error)));
  }

  console.log("\n==================== SUMMARY ====================");
  for (const r of results) {
    console.log(`${r.outcome} — ${r.name}${r.outcome === "PASS" ? "" : ` (${r.detail ?? ""})`}`);
  }
  const passed = results.filter((r) => r.outcome === "PASS").length;
  const inconclusive = results.filter((r) => r.outcome === "INCONCLUSIVE").length;
  console.log(`\n${passed}/${results.length} checks passed; ${results.length - passed - inconclusive} failed; ${inconclusive} inconclusive.`);
  if (cleanupUnresolved.length > 0) {
    console.log(`CLEANUP INCOMPLETE — ${cleanupUnresolved.length} fixture(s) unverified: ${cleanupUnresolved.map((u) => u.recordId).join(", ")}`);
  } else {
    console.log("Cleanup verified for every fixture this run built.");
  }
  if (passed !== results.length || cleanupUnresolved.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Drill failed with an unhandled error:", error);
  process.exitCode = 1;
});
