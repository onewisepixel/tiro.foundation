// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Scripts
// the staff API smoke test that, until now, was only ever run by hand (AWS
// CLI + PowerShell) — see docs/backend/evidence-matrix.md's "Real staff API
// smoke test" section, dated 2026-10-03, for the manual sequence this is
// based on, and its "AWS checks still not run" table, which named "Script
// the staff API smoke test into a reusable drill" as outstanding.
//
// Covers, each against the REAL deployed stack:
//   1. Unauthenticated denial: GET /lifecycle-requests with no Authorization
//      header -> 401, confirming the Cognito JWT authorizer actually rejects
//      unauthenticated requests before this Lambda ever runs.
//   2. The same call WITH a real Cognito-issued ID token -> 200, reading the
//      real GSI1-status-index.
//   3. GET /records/:id on a real ALLOWED (active-authorized) fixture -> the
//      full detail bundle (record, control, claims, grants, copies,
//      receipts), read correctly from live DynamoDB. The original manual
//      run of this step (2026-10-03) used the disputed-authority fixture
//      here and got a full bundle too — but that was BEFORE Finding 1's fix
//      (same document) started enforcing evaluatePermission on this route;
//      reproducing that exact input now would correctly get a DENIAL
//      instead, so this script uses an allowed record for the full-bundle
//      case and the disputed record for an explicit denial check instead.
//   4. The SAME disputed-authority fixture, same query -> correctly DENIED
//      (limited view, no content) -- Finding 1's fix, confirmed live.
//   5. POST /records/:id/permission-check on the disputed record -> denied,
//      with the real evaluatePermission reason naming the disputed
//      authority claim.
//   6. POST /records/:id/restrict, with the request body attempting to set
//      requesterCapacity to a spoofed value -> the real response's
//      requesterCapacity is the AUTHENTICATED caller's identity, never the
//      spoofed one (handler.ts's extractCallerIdentity never reads the
//      body) -- confirmed both in the response and via a direct register
//      read afterward.
//   7. POST /export (public-redacted scope) against an expired-consent
//      record and the now-restricted record -> recordCount: 0, correctly
//      excluding both.
//
// Cleanup: only this drill's own disposable Cognito test user is deleted.
// Every fixture it seeds, and the one record check 6 restricts, are left in
// place, same precedent as every other real-AWS check in this project.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... \
//   TIRO_STAFF_API_URL=... TIRO_STAFF_USER_POOL_ID=... TIRO_STAFF_USER_POOL_CLIENT_ID=... \
//   npx tsx backend/src/scripts/realStaffApiSmokeTest.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomUUID } from "node:crypto";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
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
  const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

  const fixtureStore = new DynamoFixtureStore({ client: dynamoClient, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
  const registerStore = new DynamoRestrictionRegisterStore({ client: dynamoClient, tableName: REGISTER_TABLE });

  const drillTag = `staff-api-smoke-${Date.now()}`;
  const testEmail = `staff-api-smoke-${Date.now()}@example.invalid`;
  const testPassword = `[SYNTHETIC]-Aa1!-${randomUUID().slice(0, 8)}`;
  log("SETUP", "Creating disposable smoke-test Cognito user", { email: testEmail });
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

  async function apiGet(path: string, authorized: boolean): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${API_URL}${path}`, {
      headers: authorized ? { authorization: `Bearer ${idToken}` } : {},
    });
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
    // ------------------------------------------------------------ seed --
    const [active, expired, disputed] = buildSeedFixtures();
    await seedStore(fixtureStore, registerStore, [active, expired, disputed]);
    log("SEED", "Seeded one active-authorized, one expired-consent, and one disputed-authority fixture", {
      active: active.record.recordId,
      expiredConsent: expired.record.recordId,
      disputedAuthority: disputed.record.recordId,
    });

    // --------------------------------------- check 1: unauthenticated denial --
    const unauthResponse = await apiGet("/lifecycle-requests?status=pending", false);
    record(
      "GET /lifecycle-requests with NO Authorization header is rejected by the real Cognito authorizer (401)",
      unauthResponse.status === 401,
      `status=${unauthResponse.status}`,
    );

    // ------------------------------------------- check 2: authenticated 200 --
    const authResponse = await apiGet("/lifecycle-requests?status=pending", true);
    const authBody = authResponse.json as { requests?: unknown[] };
    record(
      "The SAME call with a real Cognito ID token succeeds (200), reading the real GSI1-status-index",
      authResponse.status === 200 && Array.isArray(authBody.requests),
      `status=${authResponse.status} requests=${JSON.stringify(authBody.requests)}`,
    );

    // ---------------------------------- check 3: full record detail bundle --
    // Deliberately the ACTIVE-AUTHORIZED fixture, not the disputed one: an
    // earlier version of this check used the disputed-authority record
    // here and asserted it should return the FULL bundle — wrong, since
    // Finding 1's fix (evidence-matrix.md) means a disputed authority
    // claim correctly DENIES this record for every purpose/audience,
    // returning the limited view instead. The full-bundle case needs a
    // record evaluatePermission actually allows.
    const recordDetail = await apiGet(`/records/${active.record.recordId}?purpose=publication&audience=public`, true);
    const recordDetailBody = recordDetail.json as {
      access?: { allowed: boolean };
      record?: unknown;
      control?: unknown;
      authorityClaims?: unknown[];
      consentGrants?: unknown[];
      custodyCopies?: unknown[];
      auditReceipts?: unknown[];
    };
    record(
      "GET /records/:id on a real allowed (active-authorized) fixture returns the full detail bundle, read from live DynamoDB",
      recordDetail.status === 200 &&
        recordDetailBody.access?.allowed === true &&
        recordDetailBody.record !== undefined &&
        recordDetailBody.control !== undefined &&
        Array.isArray(recordDetailBody.authorityClaims) &&
        Array.isArray(recordDetailBody.consentGrants) &&
        Array.isArray(recordDetailBody.custodyCopies) &&
        Array.isArray(recordDetailBody.auditReceipts),
      `status=${recordDetail.status} allowed=${recordDetailBody.access?.allowed}`,
    );

    // A disputed-authority record, by contrast, must be DENIED (the
    // limited metadata view) for the exact same query — Finding 1's fix,
    // confirmed live.
    const disputedDetail = await apiGet(`/records/${disputed.record.recordId}?purpose=publication&audience=public`, true);
    const disputedDetailBody = disputedDetail.json as { access?: { allowed: boolean }; record?: { title?: string } };
    record(
      "GET /records/:id on a real disputed-authority fixture is correctly DENIED (limited view, no content) — Finding 1's fix",
      disputedDetail.status === 200 && disputedDetailBody.access?.allowed === false && disputedDetailBody.record?.title === undefined,
      `status=${disputedDetail.status} allowed=${disputedDetailBody.access?.allowed}`,
    );

    // ---------------------------------------- check 4: permission-check denies --
    const permissionCheck = await apiPost(`/records/${disputed.record.recordId}/permission-check`, {
      purpose: "publication",
      audience: "public",
    });
    const permissionCheckBody = permissionCheck.json as { allowed?: boolean; reason?: string };
    record(
      "POST /records/:id/permission-check on the disputed-authority record denies, naming the real disputed claim",
      permissionCheck.status === 200 && permissionCheckBody.allowed === false && /disputed/i.test(permissionCheckBody.reason ?? ""),
      JSON.stringify(permissionCheckBody),
    );

    // ----------------------------- check 5: requesterCapacity cannot be spoofed --
    const restrictResponse = await apiPost(`/records/${disputed.record.recordId}/restrict`, {
      reason: "[SYNTHETIC] staff API smoke test",
      purposes: ["model-training"],
      // Attempting to spoof the attributed actor — handler.ts's
      // extractCallerIdentity must never read this.
      requesterCapacity: "someone-else-entirely",
    });
    const restrictBody = restrictResponse.json as { requesterCapacity?: string };
    record(
      "POST /records/:id/restrict ignores a spoofed requesterCapacity in the body, attributing to the authenticated caller instead",
      restrictResponse.status === 200 && restrictBody.requesterCapacity === `staff:${testEmail}`,
      `requesterCapacity=${restrictBody.requesterCapacity}`,
    );
    const registerAfterRestrict = await registerStore.getCurrent(disputed.record.recordId);
    record(
      "The restriction itself actually landed in the real register, confirmed by a direct read",
      registerAfterRestrict?.restrictedPurposes.includes("model-training") ?? false,
      JSON.stringify(registerAfterRestrict?.restrictedPurposes),
    );

    // ------------------------------------------- check 6: export excludes both --
    const exportResponse = await apiPost("/export", {
      recordIds: [expired.record.recordId, disputed.record.recordId],
      scope: "public-redacted",
      fixtureSetId: `${drillTag}-export`,
      destinationAudience: "public",
    });
    const exportBody = exportResponse.json as { manifest?: { recordCount?: number } };
    record(
      "POST /export (public-redacted) excludes both the expired-consent record and the now-restricted disputed-authority record",
      exportResponse.status === 200 && exportBody.manifest?.recordCount === 0,
      `recordCount=${exportBody.manifest?.recordCount}`,
    );
  } finally {
    log("CLEANUP", "Deleting the disposable smoke-test Cognito user (nothing else)", { email: testEmail });
    await cognitoClient
      .send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: testEmail }))
      .catch((error) => log("CLEANUP", "Non-fatal: failed to delete smoke-test user", String(error)));
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
  console.error("Smoke test failed with an unhandled error:", error);
  process.exitCode = 1;
});
