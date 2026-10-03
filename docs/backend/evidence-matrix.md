# §6.1 Evidence Matrix — Fixture-Only Preservation Milestone

Dated 2026-10-02. Statuses: `demonstrated` (proven, locally or on real AWS — specified),
`pending` (built, not yet exercised against the thing that would prove it), `not demonstrated`
(not built). Local results and real-AWS results are kept separate per the brief's §9 instruction —
nothing here conflates a logic-level fake passing with a real AWS service behaving correctly.

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent) | **Demonstrated (local, export path only)** | No actual public page/search/API/media surface exists yet — only the export-filtering logic is proven. |
| Sensitivity review and redaction | `FixtureRecord.redactionApplied` field exists | **Not demonstrated** | No redaction workflow or UI built. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts` | **Demonstrated (local)** | "Dependent views" don't exist yet (no staff UI, no public surface reading this data) — only the state transition and copy-tracking are proven. |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled | **Demonstrated (local)** | Real backup-expiry timing (actual DynamoDB PITR/backup lifecycle, actual S3 noncurrent-version expiration) not exercised — needs real AWS. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` — the T0→T1→T2→T3 sequence from the brief's §6, plus a negative control and a concurrent-restriction case | **Demonstrated (local)** — this is the central guarantee, and it's the most thoroughly tested thing in this milestone | This is a **logic-level** proof against `InMemoryFixtureStore`/`InMemoryRestrictionRegisterStore`. It does **not** prove actual DynamoDB backup/restore behavior, actual eventual-consistency edge cases, or actual TTL/S3-version deletion timing. Needs a real AWS backup/restore drill per the brief's own §6 distinction ("An emulator, JSON reload, or logical export test does not prove provider backup behavior"). |
| Assigned operators | — | **Not demonstrated, not evidenced** | Organizational, not engineering. No name to put here. |
| Approved regional consent/retention procedures | `docs/ethos.txt` §12 response windows remain explicitly "proposed," not adopted | **Not demonstrated, not evidenced** | Same — governance work, tracked separately (`docs/501c3.txt` Stage 1). |
| Gate evidence and sign-off | This document | **Partial** — the engineering evidence exists; the sign-off line is deliberately blank | Needs a real named operator, not a placeholder. |

## What "demonstrated (local)" actually means here

Every "demonstrated (local)" row above is backed by a passing `node:test` run against
`backend/src/store/memoryStore.ts` — a hand-built in-memory fake, **not** a DynamoDB emulator.
It proves the permission/lifecycle/export/restore *logic* is correct against the same interface
the real `dynamoStore.ts` adapter implements. It does not and cannot prove:

- Actual DynamoDB `ConditionExpression`/`TransactWriteItems` wire behavior.
- Actual eventual-consistency timing on GSI reads.
- Actual DynamoDB TTL deletion latency (the brief notes this is typically asynchronous, taking days).
- Actual S3 versioned-delete-marker behavior.
- Actual provider backup/restore (DynamoDB point-in-time restore creates a **new table** with
  its own security/capacity/tag settings that must be reapplied and verified — untested here).

## AWS-only checks not run, and the exact commands to finish them

None of the following were run because this environment has no AWS CLI, no CDK CLI (invoked via
`npx` instead, which worked for synth), no Docker, no Java, and no AWS credentials:

| Check | Command once an AWS profile is configured |
| --- | --- |
| Deploy the stack | `cd infra && npx cdk bootstrap && npx cdk deploy --context namespace=drill-<date>` |
| Seed fixtures into real DynamoDB | A seed script wiring `buildSeedFixtures()` through `DynamoFixtureStore`/`DynamoRestrictionRegisterStore` — **not yet written**; the local tests use `InMemoryFixtureStore` directly. |
| Real backup/restore drill (the actual point of this milestone) | `aws dynamodb create-backup --table-name <primary-table> --backup-name t0-backup`, then after lifecycle actions run, `aws dynamodb restore-table-from-backup --target-table-name <restored-table> --backup-arn <t0-backup-arn>`, then re-verify §6's reconciliation against the **live** restriction-register table (untouched by the restore) before permitting any serving from the restored table. |
| Inventory S3 object versions after delete | `aws s3api list-object-versions --bucket <bucket>` before/after a delete, confirming noncurrent versions are tracked and expire per the 30-day lifecycle rule. |
| Verify Cognito-gated access actually denies unauthenticated requests | Once a Lambda/API Gateway surface exists (not yet built) — needs the JWT authorizer wiring from the brief's §3, which is explicitly deferred in this pass. |
| Cost reconciliation against actual billing | AWS Cost Explorer / Billing console, compared against `docs/backend/decision-and-cost.md`'s estimate. |

## Explicitly not built in this pass

- Lambda handlers, API Gateway routes, and the Cognito JWT authorizer wiring (§3's "service layer" /
  "authenticated routes"). The permission/lifecycle logic they'd call is built and tested; the HTTP
  surface calling it is not.
- The minimal staging-only staff UI (§3).
- Presigned-URL-after-withdrawal handling for media (§3) — `MediaRef` exists in the domain model;
  the S3 GET-route authorization logic does not yet.
- A seed script that writes fixtures into real DynamoDB (as opposed to the in-memory fake used by tests).

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
