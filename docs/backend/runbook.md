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
one drill's resources without touching anything else.

Cost: see `docs/backend/decision-and-cost.md`. At fixture scale this should land near $0/month
(DynamoDB provisioned capacity is set well inside the always-free 25/25 allowance); a CloudWatch
billing alarm at $5 is deployed as a notification, not an enforced cap.

## Seeding fixtures (not yet wired to real AWS)

Locally, tests call `seedStore()` (`backend/src/fixtures/load.ts`) against the in-memory fake
directly — no script needed. A script that does the same against a deployed `DynamoFixtureStore` /
`DynamoRestrictionRegisterStore` has **not been written yet** — see
`docs/backend/evidence-matrix.md`'s "not built" list. Until it exists, there's no supported way to
get fixtures into a real table other than writing one-off AWS SDK calls by hand.

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

const backup = await exportFixtureSet(fixtureStore, registerStore, [recordId], "complete-preservation", "t0");
const jsonl = toJsonl(backup);
// ... later, after some lifecycle action has run against the ORIGINAL registerStore ...
const restoredTarget = new InMemoryFixtureStore();
await importExport(restoredTarget, backup);
const reconciliation = await reconcileRestoredRecords(registerStore, backup.records); // note: the ORIGINAL registerStore, never the restored target's
```

Real AWS (not yet run — see `docs/backend/evidence-matrix.md` for the exact `aws dynamodb` commands).

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
yet (the staff UI, the authenticated API routes, a real-AWS seed script).
