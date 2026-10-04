# Fixture-Only Preservation Backend — Runbook

Scope: synthetic, non-sensitive fixtures only. Nothing here touches the public Next.js site or its
three real demonstration records in `src/data/memories.ts`.

## Local development (no AWS required)

```bash
npm install                 # root install; npm workspaces hoist backend/ and infra/ deps
npm test                    # runs frontend recordKind checks + all backend logic tests
npx tsc --noEmit -p backend/tsconfig.json   # backend strict typecheck
npx tsc --noEmit -p infra/tsconfig.json     # infra strict typecheck
cd infra && npx cdk synth   # produces CloudFormation locally; no AWS credentials needed
```

All of the above run in CI (`.github/workflows/ci.yml`) on every PR, without any AWS credentials.

## Deploying to AWS (manual — not automated in CI)

Prerequisite: an AWS profile configured with credentials for the target account/region. This repo
does not include or assume one.

```bash
cd infra
npx cdk bootstrap --profile <your-profile>            # once per account/region
npx cdk deploy --context namespace=<short-unique-name> --profile <your-profile>
```

`namespace` should be short and unique per the brief's drill-isolation instruction (e.g.
`drill-20261015`) — every resource name and tag is derived from it, so cleanup can target exactly
one drill's resources without touching anything else. Pass the billing alarm's notification target
via env var, not as a CLI arg that ends up in shell history:

```bash
TIRO_BILLING_ALARM_EMAIL=<address> npx cdk deploy --context namespace=<name> --profile <your-profile>
```

AWS sends a one-time SNS confirmation link to that address after deploy — it must be clicked before
billing alerts actually notify anyone.

Cost: see `docs/backend/decision-and-cost.md`. At fixture scale this should land near $0/month
(DynamoDB provisioned capacity is set well inside the always-free 25/25 allowance).

Already deployed as of 2026-10-02 (updated 2026-10-03 with the staff API, then again with S3 media
support): `TiroFixtureBackend-drill-20261002`, account `440744257823`, `us-east-1`. Table names:
`tiro-fixture-primary-drill-20261002`, `tiro-restriction-register-drill-20261002`. `cdk deploy` also
prints `StaffApiUrl`, `StaffUserPoolId`, `StaffUserPoolClientId`, `StaffUserPoolDomain`, and
`MediaBucketName` — needed for the staff API/UI below and the S3 media drill further down.

## Staff API and staff UI

The authenticated staff API (`backend/src/api/`) is deployed as part of the same stack: an HTTP API
with a Cognito JWT authorizer in front of one Lambda. Nothing about it is in CI (it's exercised by
`router.test.ts`/`handler.test.ts` locally, and by hand against the real stack — see
`docs/backend/evidence-matrix.md`'s "Real staff API smoke test").

**Creating a staff user** (self-signup is disabled on purpose — invited test staff only):

```bash
aws cognito-idp admin-create-user --user-pool-id <StaffUserPoolId> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --message-action SUPPRESS --profile <your-profile>
aws cognito-idp admin-set-user-password --user-pool-id <StaffUserPoolId> --username <email> \
  --password '<temporary-password>' --permanent --profile <your-profile>
```

**Calling the API directly** (e.g. for scripting/smoke-testing, without the staff UI): the app
client has `ADMIN_USER_PASSWORD_AUTH` enabled specifically for this — IAM-gated, never reachable
from the public internet:

```bash
aws cognito-idp admin-initiate-auth --user-pool-id <StaffUserPoolId> --client-id <StaffUserPoolClientId> \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=<email>,PASSWORD=<password> \
  --profile <your-profile> --query AuthenticationResult.IdToken --output text
# then: curl -H "Authorization: Bearer <that token>" <StaffApiUrl>/lifecycle-requests?status=pending
```

**Running the staff UI** (a standalone static page, see `staff-ui/README.md` for full setup):

```bash
cp staff-ui/config.example.js staff-ui/config.js   # fill in the four cdk deploy outputs above
npx serve -l 4300 staff-ui
# open http://localhost:4300/, sign in via Cognito Hosted UI
```

## Seeding fixtures into real DynamoDB

`backend/src/scripts/realBackupRestoreDrill.ts` seeds one record (the clean `active` fixture) as
part of its own run — see below. There is no standalone seed script for the full four-fixture set
against real DynamoDB yet (the other three cases have only run against the in-memory fake); see
`docs/backend/evidence-matrix.md`.

## Exercising the lifecycle (local)

```ts
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "./backend/src/store/memoryStore";
import { seedStore } from "./backend/src/fixtures/load";
import { buildSeedFixtures } from "./backend/src/fixtures/seed";
import { withdraw } from "./backend/src/services/lifecycle";

const fixtureStore = new InMemoryFixtureStore();
const registerStore = new InMemoryRestrictionRegisterStore();
await seedStore(fixtureStore, registerStore, buildSeedFixtures());

const [active] = buildSeedFixtures();
await withdraw(fixtureStore, registerStore, {
  requestId: "manual-1",
  recordId: active.record.recordId,
  requesterCapacity: "steward",
  reason: "manual exercise",
});
```

The same code runs unchanged against `DynamoFixtureStore`/`DynamoRestrictionRegisterStore` once
those are constructed with a real `DynamoDBClient` pointed at a deployed stack's table names
(`stack.primaryTable.tableName`, `stack.restrictionRegisterTable.tableName`) — that's the entire
point of both implementing the same `FixtureStore`/`RestrictionRegisterStore` interfaces.

## Export / restore drill

Local (proven, see `restore.test.ts`):

```ts
import { exportFixtureSet, toJsonl } from "./backend/src/services/export";
import { importExport, reconcileRestoredRecords } from "./backend/src/services/restore";

const backup = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "t0", "public");
const jsonl = toJsonl(backup);
// ... later, after some lifecycle action has run against the ORIGINAL registerStore ...
const restoredTarget = new InMemoryFixtureStore();
await importExport(restoredTarget, backup);
const reconciliation = await reconcileRestoredRecords(restoredTarget, registerStore, backup.records, { purpose: "publication", audience: "public" });
// note: registerStore here is the ORIGINAL live register, never one derived from the restored
// target — but restoredTarget itself IS passed, since servable is now evaluatePermission's real
// decision (grant-level revocation included), not a record-state-only approximation of it.
```

Real AWS (run three times against the deployed stack above — see
`docs/backend/evidence-matrix.md` for what broke and was fixed along the way):

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  npx tsx backend/src/scripts/realBackupRestoreDrill.ts
```

This seeds one record, takes a real `CreateBackupCommand` backup, withdraws + starts deletion
against live data, restores the backup into a fresh table via `RestoreTableFromBackupCommand`,
reconciles the restored (stale, still-"published") record against the live (correctly
"withdrawn") restriction register, asserts the restored content is NOT servable, then deletes its
own temporary restored table and backup. Takes up to ~10 minutes — DynamoDB restore time is
variable and not simply proportional to table size. Not run in CI (real cost, real time, needs
credentials); manually invoked only.

## Full-fixture seed and correctness checks against real DynamoDB

Separate from the restore drill above — this script seeds the FULL four-fixture set (not just the
one `active` case) and exercises a LIVE-only grant-revocation check (no restore involved — see the
dedicated drill below for that), plus the concurrency and export-authorization findings, directly
against real DynamoDB. Creates no disposable AWS resources (no temporary table or backup); the
seeded fixtures are left in place afterward. Not run in CI; manually invoked only.

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  npx tsx backend/src/scripts/realFullFixtureChecks.ts
```

Runs 9 checks and exits non-zero if any fails: 4 permission-parity checks (one per fixture case),
a grant-revocation check, two concurrency checks (a direct `RestrictionRegisterStore.setCurrent`
compare-and-swap race, plus a full `startDeletion`/`restrict` integration race), and two
export-authorization checks (`public-redacted` and `complete-preservation` scopes both excluding
the expired-consent and disputed-authority records). Last run 2026-10-03: all 9 passed on the first
try — see `docs/backend/evidence-matrix.md` for the full results.

## Grant-level revocation restore drill against real DynamoDB

Distinct from both scripts above: a reviewer correctly pointed out that
`realFullFixtureChecks.ts`'s grant-revocation check never restores anything, so it isn't evidence
that a backup predating a revocation stays denied after a real restore. This script closes that
specific gap with its own real T0→T1→T2→T3 sequence.

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  npx tsx backend/src/scripts/realGrantRevocationRestoreDrill.ts
```

Seeds one record, takes a real `CreateBackupCommand` backup WHILE its grant is still active,
revokes ONLY that grant against live data (the record itself is left otherwise fully publishable —
not withdrawn, not deleted), restores the pre-revocation backup into a fresh table via
`RestoreTableFromBackupCommand`, confirms the restored grant row looks stale (unrevoked), then runs
BOTH `evaluatePermission` and `reconcileRestoredRecords` against the restored store plus the LIVE
(untouched) register and asserts both deny. Deletes its own temporary restored table and backup
afterward; the live primary/register tables and the one seeded-then-revoked record are left in
place. Takes up to ~10 minutes, same restore-time variability as the other drill. Not run in CI;
manually invoked only.

## S3 media acceptance drill against real AWS

One reusable script covers the full S3 media milestone PLUS the `completeDeletion`/
`retainForPreservationOnly` checks several review rounds have left outstanding (partial-failure
recovery, stale-precondition refusal, the media-purge claim's ownership-based resumption, and
retention rejecting an already-deleted tombstone) — see `docs/backend/evidence-matrix.md`'s "Real
S3 media acceptance drill" for the full 41-check result.

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  TIRO_MEDIA_BUCKET=<MediaBucketName output from cdk deploy> \
  TIRO_STAFF_API_URL=<StaffApiUrl output> \
  TIRO_STAFF_USER_POOL_ID=<StaffUserPoolId output> \
  TIRO_STAFF_USER_POOL_CLIENT_ID=<StaffUserPoolClientId output> \
  npx tsx backend/src/scripts/realS3MediaAcceptanceDrill.ts
```

Creates its own disposable Cognito test user (deleted at the end) and seeds several fresh fixtures
with real, version-bound S3 media — all left in place afterward, same precedent as every other
real-AWS check. Exits non-zero if any of its 41 checks fail.

## Correction/redaction acceptance drill against real AWS

Same env vars as the S3 media drill above:

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  TIRO_MEDIA_BUCKET=<MediaBucketName output from cdk deploy> \
  TIRO_STAFF_API_URL=<StaffApiUrl output> \
  TIRO_STAFF_USER_POOL_ID=<StaffUserPoolId output> \
  TIRO_STAFF_USER_POOL_CLIENT_ID=<StaffUserPoolClientId output> \
  npx tsx backend/src/scripts/realCorrectionRedactionDrill.ts
```

Exercises `correctRecord`/`disputeCorrection`/`redactText`/`redactMedia` through the real deployed
API, confirming the pre-correction/pre-redaction originals are preserved in history but never
served through `GET /records/:id`, and that export/restore carry (preservation scope) or omit
(public scope) them correctly. Also confirms: a redacted field's correction history is masked too;
a replayed `correct` requestId never corrupts history; restoring a pre-redaction backup directly
into the real primary table doesn't revive the served text, checked against the real, unchanged
register; the real `/export` response carries the new `recordsSkippedForResponseBudget` field; a
concurrent correction's stale version is rejected by a real DynamoDB `ConditionExpression`; and a
retry reusing an already-committed correction id is rejected by a real `TransactWriteItems`
conditional check on the history row, never corrupting it. Creates its own disposable Cognito test
user (deleted at the end); the fixtures it seeds are left in place. Exits non-zero if any of its
38 checks fail. Note: this drill deliberately does NOT attempt to force the export response
budget's actual whole-record TEXT exclusion live — that needs reading several real MB out of this
stack's deliberately tiny, always-free-tier DynamoDB provisioning inside one Lambda invocation.
Every attempt tried observably throttled, but that's an observed result from those specific
attempts, not proof it's categorically impossible at this provisioning (AWS documents burst
capacity beyond the nominal provisioned rate) — and per explicit instruction this shared table's
capacity stays unchanged for now (see the evidence matrix's seventh-review-round note); that exact
scale stays proven by `export.test.ts` locally instead.

## Seeding real, version-bound media into a fixture

`backend/src/fixtures/media.ts`'s `bindSeedMedia(mediaStore, fixture)` uploads real tiny text/binary
bytes for a `Fixture` from `buildSeedFixtures()`, computes genuine SHA-256 checksums, and binds each
`MediaRef` to the exact S3 version that upload produced:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { S3MediaStore } from "./backend/src/store/s3MediaStore";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "./backend/src/store/dynamoStore";
import { buildSeedFixtures } from "./backend/src/fixtures/seed";
import { bindSeedMedia } from "./backend/src/fixtures/media";
import { seedStore } from "./backend/src/fixtures/load";

const mediaStore = new S3MediaStore({ client: new S3Client({ region: "us-east-1" }), bucketName: "<bucket>" });
const [active] = buildSeedFixtures();
await bindSeedMedia(mediaStore, active); // mutates active in place
await seedStore(fixtureStore, registerStore, [active]);
```

A `MediaRef` never touched by `bindSeedMedia` keeps `versionId: null` — a legacy, pre-binding
reference. `services/media.ts`'s authenticated retrieval fails closed (409) for these rather than
guessing a version; nothing migrates them automatically.

## Browser setup verification

`staff-ui/serve.json` (committed, `{"cleanUrls": false}`) must stay in place — `serve`'s default
behavior 301-redirects `callback.html?code=...&state=...` to `/callback` and DROPS the query string,
silently breaking real sign-in every time (not a corner case — the normal Hosted-UI redirect).
Verify it's actually in effect after any change to `staff-ui/` or its serving command:

```bash
curl -i "http://localhost:4300/callback.html?code=test&state=test"
# must return 200 directly, never a 301 to /callback
```

## Cleanup

```bash
cd infra
npx cdk destroy --context namespace=<the-same-namespace> --profile <your-profile>
```

Because `removalPolicy: RemovalPolicy.DESTROY` and `autoDeleteObjects: true` are set throughout the
stack, `cdk destroy` removes everything it created, including the S3 bucket's contents. The
restriction-register table and primary table are both scoped to this one namespace — destroying one
drill's stack cannot affect another namespace's resources, by construction (different physical
table/bucket/pool names).

## What this runbook does not cover

Everything listed under "Explicitly not built in this pass" in
`docs/backend/evidence-matrix.md` — there's no runbook for operating something that doesn't exist
yet (the staff UI, the authenticated API routes, a full-fixture-set real-AWS seed script).
