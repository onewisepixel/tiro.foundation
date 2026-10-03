# §6.1 Evidence Matrix — Fixture-Only Preservation Milestone

Dated 2026-10-02, corrected 2026-10-03. Statuses: `demonstrated` (proven, locally or on real AWS —
specified), `pending` (built, not yet exercised against the thing that would prove it), `not
demonstrated` (not built). Local results and real-AWS results are kept separate per the brief's §9
instruction — nothing here conflates a logic-level fake passing with a real AWS service behaving
correctly.

**2026-10-03 correction:** an independent review of commit `93427f7` found five real correctness
gaps the rows below had not accounted for — grant-level consent revocation was not protected
against restore, concurrent lifecycle actions could silently clobber each other, export bypassed
scoped permission checks, legal-rights disputes were never checked at all, and `completeDeletion()`
didn't actually delete the record (plus a too-weak checksum check). All five are fixed as of this
revision, each with a regression test (`permissions.test.ts`, `lifecycle.test.ts`, `export.test.ts`,
`restore.test.ts` — now 54 passing tests, up from 45). The row below for the central restore
guarantee has been reworded accordingly: it was previously overclaimed as proven for the general
case when it had only been exercised for the one specific record-level withdrawal/deletion scenario
the real-AWS drill walks through. See "What the real-AWS drill does and does not cover" below.

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent) | **Demonstrated (local, export path only)** | No actual public page/search/API/media surface exists yet — only the export-filtering logic is proven. |
| Sensitivity review and redaction | `FixtureRecord.redactionApplied` field exists | **Not demonstrated** | No redaction workflow or UI built. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts` | **Demonstrated (local)** | "Dependent views" don't exist yet (no staff UI, no public surface reading this data) — only the state transition and copy-tracking are proven. |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled | **Demonstrated (local)** | Real backup-expiry timing (actual DynamoDB PITR/backup lifecycle, actual S3 noncurrent-version expiration) not exercised — needs real AWS. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` (local) **and** `backend/src/scripts/realBackupRestoreDrill.ts` run against the real deployed stack (`TiroFixtureBackend-drill-20261002`, account `440744257823`, `us-east-1`) | **Demonstrated for the specific tested case (local AND real AWS); the broader guarantee is not yet established.** The drill proves ONE scenario end-to-end against real DynamoDB — a record-level withdrawal + deletion, backed up before the withdrawal, restored after — and that scenario passed three times (two with manual cleanup follow-up after bugs described below, one fully automated end-to-end), each producing `servable: false` and a denied permission check against the restored table. It does not by itself prove the guarantee holds for every way a restore could be attempted; see the three cases below, now closed locally but not yet re-run against real AWS. | Grant-level revocation surviving a restore (not just record-level withdrawal), concurrent lifecycle actions during a restore window, and export-time authorization are now covered by local regression tests (`restore.test.ts`, `lifecycle.test.ts`, `export.test.ts`) added 2026-10-03, but none of the three has been exercised against real AWS yet — only the original record-level scenario has. Also still not exercised: actual S3 versioned-media restore (no media was in the drill fixture), actual TTL-deletion timing (the drill used explicit deletion, not TTL expiry), and real Lambda/API-surface enforcement (doesn't exist yet). |
| Assigned operators | — | **Not demonstrated, not evidenced** | Organizational, not engineering. No name to put here. |
| Approved regional consent/retention procedures | `docs/ethos.txt` §12 response windows remain explicitly "proposed," not adopted | **Not demonstrated, not evidenced** | Same — governance work, tracked separately (`docs/501c3.txt` Stage 1). |
| Gate evidence and sign-off | This document | **Partial** — the engineering evidence exists; the sign-off line is deliberately blank | Needs a real named operator, not a placeholder. |

## What "demonstrated (local)" versus "demonstrated (real AWS)" means here

"Demonstrated (local)" rows are backed by a passing `node:test` run against
`backend/src/store/memoryStore.ts` — a hand-built in-memory fake, **not** a DynamoDB emulator.
They prove the permission/lifecycle/export/restore *logic* is correct against the same interface
the real `dynamoStore.ts` adapter implements, but cannot prove actual DynamoDB wire behavior,
actual eventual-consistency timing, or actual provider backup/restore mechanics.

"Demonstrated (real AWS)" — currently just the central restore guarantee — means the same logic
ran against the real `dynamoStore.ts` adapter, a real deployed stack, and real
`CreateBackupCommand`/`RestoreTableFromBackupCommand` calls. Still not proven anywhere:

- Actual DynamoDB TTL deletion latency (the brief notes this is typically asynchronous, taking
  days) — the drill used explicit deletion, not TTL expiry.
- Actual S3 versioned-delete-marker behavior — no media was exercised in the drill.
- Real Lambda/API-Gateway/Cognito request-level enforcement — that surface doesn't exist yet.

## Real AWS drill — what actually happened

Deployed stack: `TiroFixtureBackend-drill-20261002`, account `440744257823`, `us-east-1`, via
`cdk bootstrap` + `cdk deploy` against a dedicated IAM user (`AdministratorAccess`, access key
rotated once after accidental exposure in a local chat session — the first key was deactivated and
deleted before ever being used).

The drill (`backend/src/scripts/realBackupRestoreDrill.ts`) ran the real T0→T1→T2→T3 sequence —
`CreateBackupCommand` on the live primary table, `withdraw()`/`startDeletion()` against live data,
`RestoreTableFromBackupCommand` into a fresh table, reconciliation against the untouched live
restriction register — three times. Two real bugs surfaced and were fixed, not glossed over:

1. **Cleanup ordering bug.** Tagging a freshly-restored table (`TagResourceCommand`, done to
   demonstrate the brief's explicit callout that tags aren't carried over by restore) leaves it in
   a transient "in use" lock that is **not reflected in `TableStatus`** — `waitUntilTableExists`
   polling for `ACTIVE` was not sufficient, and an immediate `DeleteTableCommand` failed with
   `ResourceInUseException` twice before this was understood. Fixed with a retry-with-backoff
   wrapper around the delete call specifically, which is the correct pattern for an
   eventually-consistent control-plane lock that isn't otherwise observable — not a blind sleep.
2. **Restore-wait timeout too short.** The third run's `RestoreTableFromBackupCommand` took
   roughly 10 minutes to reach `ACTIVE` for a near-empty table — the initial 300-second
   (`maxWaitTime`) budget was based on the first two runs completing quickly and wasn't a safe
   assumption. AWS documents restore time as variable, not simply proportional to table size.
   Bumped to 900 seconds. The drill's actual T2/T3 checks were still run and passed once the table
   became active (confirmed via a one-off continuation script, since discarded); the fix is in the
   reusable script for next time.

Every drill run cleaned up its own disposable artifacts (temporary restored table + backup);
the original primary table, restriction-register table, and their one real seeded-then-withdrawn
record were never deleted — matching the brief's "preserve the baseline dataset and independent
restriction register" instruction.

## AWS checks still not run, and the exact commands to finish them

| Check | Command |
| --- | --- |
| Seed the FULL fixture set (all four cases, not just the one `active` record the drill used) into real DynamoDB | Extend `realBackupRestoreDrill.ts`'s seed step, or write a standalone seed script calling `seedStore()` with `buildSeedFixtures()` in full, against `DynamoFixtureStore`/`DynamoRestrictionRegisterStore`. |
| Inventory S3 object versions after delete | No media was involved in the drill (the seeded fixture's `mediaRefs` was non-empty but nothing was uploaded to S3). `aws s3api list-object-versions --bucket <bucket>` before/after a real media delete, confirming noncurrent versions are tracked and expire per the 30-day lifecycle rule. |
| Verify Cognito-gated access actually denies unauthenticated requests | Needs a Lambda/API Gateway surface first (not built — see below). |
| Cost reconciliation against actual billing | AWS Cost Explorer / Billing console, compared against `docs/backend/decision-and-cost.md`'s estimate, after the billing alarm's SNS email subscription is confirmed. |
| Grant-level consent revocation surviving a real DynamoDB restore (Finding 1, fixed locally 2026-10-03) | Extend `realBackupRestoreDrill.ts`: after T0's backup, call `revokeConsentGrant()` (not just `withdraw()`/`startDeletion()`) against live data, then repeat T2/T3 and additionally assert the restored grant's own `revokedAt` is `null` while `evaluatePermission` against the live register still denies. |
| Concurrent lifecycle actions against real DynamoDB (Finding 2, fixed locally 2026-10-03) | Fire two real lifecycle calls (e.g. `startDeletion` and `restrict`) concurrently against the same live record and confirm exactly one succeeds via DynamoDB's real `ConditionExpression`/`TransactWriteCommand` behavior, not just the in-memory fake's synchronous approximation of it. |
| Export-time authorization against real DynamoDB (Finding 3, fixed locally 2026-10-03) | Call `exportFixtureSet` against a real disputed-authority or expired-consent record seeded into DynamoDB and confirm it's excluded from the export, exercising the real `listAuthorityClaims`/`listConsentGrants` query paths, not just the in-memory fake. |

## Explicitly not built in this pass

- Lambda handlers, API Gateway routes, and the Cognito JWT authorizer wiring (§3's "service layer" /
  "authenticated routes"). The permission/lifecycle logic they'd call is built and tested; the HTTP
  surface calling it is not.
- The minimal staging-only staff UI (§3).
- Presigned-URL-after-withdrawal handling for media (§3) — `MediaRef` exists in the domain model;
  the S3 GET-route authorization logic does not yet.
- A seed script for the FULL fixture set against real DynamoDB — the drill script seeds one record
  (the clean `active` case) inline for its own purposes; the other three fixtures (expired consent,
  disputed authority, preservation-only) have only ever run against the in-memory fake.

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
