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

Already deployed as of 2026-10-02: `TiroFixtureBackend-drill-20261002`, account `440744257823`,
`us-east-1`. Table names: `tiro-fixture-primary-drill-20261002`,
`tiro-restriction-register-drill-20261002`.

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
