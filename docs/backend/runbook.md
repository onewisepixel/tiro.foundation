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

Exits non-zero if any check fails: 4 permission-parity checks (one per fixture case),
a grant-revocation check, two concurrency checks (a direct `RestrictionRegisterStore.setCurrent`
compare-and-swap race, plus a full `startDeletion`/`restrict` integration race — `Finding 2b`, with
the same accept-either-outcome, retry-the-original-requestId handling as the combinatorial case
below), two export-authorization checks (`public-redacted` and `complete-preservation` scopes both
excluding the expired-consent and disputed-authority records), six combinatorial-case checks added
for operational-readiness review: revocation racing restriction (a FORCED deterministic
shared-version-conflict check, a real timing-dependent race accepting EITHER a genuine conflict or
both calls serializing cleanly, a convergence check, and a retry-resumes-the-original-requestId
check), and export racing withdrawal/deletion (one each), and two checks exercising
`CustodyCopyCommitter` (the cross-table transaction `services/legacyMediaMigration.ts` uses to
close a TOCTOU race against deletion) directly against real DynamoDB — a successful commit, and a
real cross-table `ConditionCheck` refusal once custody is `"deletion-pending"`. See
`docs/backend/evidence-matrix.md`'s "Combinatorial cases" and "Legacy media migration" notes for
the expected outcome each case defines and the reviewer-caught findings (2026-10-05, 2026-10-06)
that drove these checks, plus the real `TransactionConflict` cancellation-reason bug the forced
check uncovered in `dynamoStore.ts`'s `isConditionalFailure`. Last run 2026-10-06: all 19 passed —
see the evidence matrix for the full results.

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
concurrent correction's stale version is rejected by a real DynamoDB `ConditionExpression`; a
retry reusing an already-committed correction id is rejected by a real `TransactWriteItems`
conditional check on the history row, never corrupting it; and the real deployed API rejects both
an oversized `fixtureSetId` and an oversized export batch with a real 400, before any record is
even looked at. Creates its own disposable Cognito test user (deleted at the end); the fixtures it
seeds are left in place. Exits non-zero if any of its 40 checks fail. Note: this drill deliberately
does NOT attempt to force the export response budget's actual whole-record TEXT exclusion live —
that needs reading several real MB out of this stack's deliberately tiny, always-free-tier
DynamoDB provisioning inside one Lambda invocation. Every attempt tried observably throttled, but
that's an observed result from those specific attempts, not proof it's categorically impossible at
this provisioning (AWS documents burst capacity beyond the nominal provisioned rate) — and per
explicit instruction this shared table's capacity stays unchanged for now (see the evidence
matrix's seventh-review-round note); that exact scale stays proven by `export.test.ts` locally
instead.

## Staff API smoke test against real AWS

Scripts the manual "Real staff API smoke test" steps from
`docs/backend/evidence-matrix.md` into a reusable, repeatable drill — same
env vars as the S3 media drill above:

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  TIRO_MEDIA_BUCKET=<MediaBucketName output from cdk deploy> \
  TIRO_STAFF_API_URL=<StaffApiUrl output> \
  TIRO_STAFF_USER_POOL_ID=<StaffUserPoolId output> \
  TIRO_STAFF_USER_POOL_CLIENT_ID=<StaffUserPoolClientId output> \
  npx tsx backend/src/scripts/realStaffApiSmokeTest.ts
```

Creates its own disposable Cognito test user (deleted at the end), seeds a
fresh `active` fixture and a fresh `disputed`-authority fixture, and walks
both through the real deployed API: unauthenticated and malformed requests
are rejected, a real allowed fixture returns the full detail bundle, and —
separately — a real disputed-authority fixture is correctly DENIED (no
title, no content). That second check replaces an earlier, stale manual
observation (dated 2026-10-03) that used the disputed fixture to assert a
full bundle; that observation predates Finding 1's fix, which started
enforcing `evaluatePermission` on this route. Exits non-zero if any of its
8 checks fail. Last run 2026-10-04: all 8 passed on the first try.

## Legacy media migration against real AWS

Inventories every live `MediaRef` with `versionId: null` (seeded before S3 version binding
existed) and reports which match this project's one known, exact placeholder signature AND are not
in the deletion workflow (rebindable) versus which don't match (no trustworthy origin — stay
unavailable, never guessed at) versus which match but are ineligible because the record's custody
status is `"deletion-pending"` or `"deleted"` (recognizing a placeholder does not by itself
establish migration eligibility — a reviewer-caught finding, see
`docs/backend/evidence-matrix.md`'s "Legacy media migration" entry). The classification/apply logic
lives in `backend/src/services/legacyMediaMigration.ts`, unit-tested against the in-memory fakes
(`legacyMediaMigration.test.ts`); this script is a thin CLI wrapper. Dry run by default:

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=tiro-fixture-primary-drill-20261002 \
  TIRO_REGISTER_TABLE=tiro-restriction-register-drill-20261002 \
  TIRO_MEDIA_BUCKET=<MediaBucketName output from cdk deploy> \
  npx tsx backend/src/scripts/realLegacyMediaMigration.ts
```

Pass `--apply` to actually rebind entries still eligible at apply time. Eligibility is re-checked
FRESH immediately before any S3 upload (never trusting the dry-run snapshot) — but that fresh check
alone was found (2026-10-06) not to be enough, since deletion can start AND finish entirely in the
real wall-clock gap between it and the upload completing. The record's `MediaRef` rewrite plus its
new `CustodyCopy` are now committed via `CustodyCopyCommitter` (`store.ts`/`dynamoStore.ts`), ONE
DynamoDB transaction spanning both the primary table and the restriction register table, asserting
custody status as PART OF the same atomic commit rather than a separate earlier read — the one
place in this codebase that writes across both tables together, deliberately narrow. If the write
is refused this way, or fails for any other reason, the client-side error is resolved via an
idempotent re-read BEFORE any cleanup — a write that actually committed but merely failed to report
success is never mistaken for one that didn't, which would otherwise destroy a real, successful
binding. A third round (2026-10-06) found that recheck itself needed guarding too: a DEFINITE
refusal (`DeletionInProgressError`/`VersionConflictError`) now skips the recheck entirely rather
than depending on a second read that could itself fail, and if the recheck IS attempted (for
genuinely uncertain errors) and fails, both failure messages are preserved in a dedicated
`"needs-reconciliation"` outcome instead of an uncaught exception. Any orphan that cleanup could not
confirm removed — for any reason — is reported this way, with its exact `objectKey`/`versionId`, and
the CLI exits non-zero whenever one exists. A fourth round (2026-10-06) caught that an ORDINARY
write failure (e.g. a real `AccessDeniedException`) could still land in `"skipped-ineligible"` once
cleanup succeeded — reported as a benign skip with the CLI exiting 0, even though the record stayed
genuinely un-migrated. Fixed: `"skipped-ineligible"` is now reserved for refusals that are correct
BY DESIGN (the early eligibility checks, plus `DeletionInProgressError`/`VersionConflictError`,
which mean "should not migrate" or "something else changed it" respectively); every other confirmed
non-commit is now `"failed"` — the CLI counts it, prints it under its own banner, and exits non-zero.
See `docs/backend/evidence-matrix.md`'s "Legacy media migration" entry (second through fourth
review rounds) for the full detail and the regression tests proving all five findings closed.

Last run (dry run) 2026-10-06 against the drill stack, with the TOCTOU/cleanup fixes above: 41
legacy references found, 37 rebindable, 4 correctly classified ineligible because their record is
in the deletion workflow (would have been misreported as rebindable under the pre-fix logic), 0
with no trustworthy origin. `--apply` has NOT been run against the live drill stack; that is a
separate, real-data-mutating decision left to whoever operates this stack, not something this
script does on its own.

## S3 noncurrent-version expiry observation

A two-step, DATED observation of the real, deployed
`noncurrentVersionExpiration: Duration.days(30)` S3 lifecycle rule
actually firing — distinct from DynamoDB TTL, which this project has never
configured on any table (no `timeToLiveAttribute` anywhere; deletion is
always explicit via `completeDeletion`). Seed step (uploads two versions
to one dedicated key so the first becomes noncurrent immediately, and
persists the exact seeded version ids to a SEPARATE S3 object as ground
truth for `--check` to verify against later — see below for why):

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_MEDIA_BUCKET=<MediaBucketName output from cdk deploy> \
  npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts
```

Seeded 2026-10-04T22:44:18.761Z against the drill stack's media bucket —
see `docs/backend/evidence-matrix.md`'s "S3 noncurrent-version expiration
observation" entry for the exact version ids. Reviewer-caught finding
(2026-10-05): the ORIGINAL eligibility date printed here
(2026-11-03T22:44:18.761Z, a raw `+30 days`) was wrong — S3's lifecycle
engine evaluates whole elapsed calendar days and sweeps once around UTC
midnight, so the first sweep that can actually pick this up is
**2026-11-04T00:00:00Z** (2026-11-03, 6pm Chicago time), not the exact
30-day instant; reaching it means v1 becomes ELIGIBLE, not that AWS
guarantees it's removed immediately. The ORIGINAL `--check` logic was
also fixed: it used to report "expired" for ANY listing of 1-or-fewer
versions, including a totally empty one (proving nothing, not expiration)
or one where only the ORIGINAL v1 remained and the current v2 had
vanished (an inversion, not a pass). `--check` now reads the exact seeded
version ids back from a persisted S3 object and requires v2 (a surviving
positive control — the current version, which this rule must never
touch) to be confirmed present before treating v1's absence as a real,
observed expiration. A third, narrower false pass was caught on review
(2026-10-06): that date guard only ran when v1 was present, so v1
disappearing for any OTHER reason before real eligibility was reached
would have been misreported as an early, lucky "EXPIRED, OBSERVED FOR
REAL" instead of the anomaly it actually is — fixed, and the eligibility
math plus the full `--check` decision tree are now extracted into
`backend/src/services/s3ExpiryObservation.ts` and unit-tested (8 tests,
`s3ExpiryObservation.test.ts`) against the in-memory fake, including this
exact scenario. On or after 2026-11-04T00:00:00Z, re-run with
`--check`; running it earlier is harmless and just reports "too early"
rather than fabricating a result.

## Browser acceptance checklist

`docs/backend/browser-acceptance-checklist.md` is a human-run, 16-step
click-through of the full admin workflow (denied access, correction,
dispute, text/media redaction, export, deletion, audit attribution)
against the real deployed staff UI. Seed the three fixtures it refers to
and print their record ids with:

```bash
AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
  TIRO_PRIMARY_TABLE=<table> TIRO_REGISTER_TABLE=<table> TIRO_MEDIA_BUCKET=<bucket> \
  npx tsx backend/src/scripts/realSeedBrowserAcceptanceFixtures.ts
```

then follow `staff-ui/README.md` to serve the UI and walk the checklist by
hand — no browser-automation tool exists in this environment, so this
step genuinely requires a human. Status: prepared, not yet executed.

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

Reviewer-caught finding (2026-10-06): every action form's response was shown only in a `.result`
div that gets wiped almost immediately by the next record reload — losing `start-deletion`'s
returned requestId and every action's `requesterCapacity` before a human tester could read them.
Fixed with a persistent, page-level **Action log** section (`index.html`) that `app.js` now appends
every action's full response to, newest first — untouched by record reloads. See
`docs/backend/browser-acceptance-checklist.md`'s steps 15–16.

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
