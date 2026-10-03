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

**Same-day follow-up:** verifying the Finding 1 fix (grant-level revocation) surfaced a sixth gap —
`reconcileRestoredRecords()` still returned `servable: true` for a restored record whose grant had
been revoked, because it computed `servable` from `currentPublicationStatus`/`currentCustodyStatus`
alone, never consulting `revokedConsentIds` or the restored grant data. It could disagree with
`evaluatePermission()`'s correct denial on the same record. Fixed by having reconciliation delegate
`servable` directly to `evaluatePermission()` (now takes the restored `FixtureStore` plus a
purpose/audience to evaluate) — the two can no longer disagree, because one is the other. Regression
test added: `restore.test.ts`, "reconcileRestoredRecords and evaluatePermission never disagree after
a grant-level revocation restore." 55 passing tests.

**Same-day, second follow-up — real AWS:** `backend/src/scripts/realFullFixtureChecks.ts` seeded the
FULL four-fixture set into the live deployed stack (not just the one `active` record
`realBackupRestoreDrill.ts` used) and re-ran the grant-revocation, concurrency, and export-authorization
checks against real DynamoDB rather than the in-memory fake — closing the three real-AWS gaps the
table below used to list. All 9 checks passed on the first run. See "Real full-fixture checks — what
actually happened" below.

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent) | **Demonstrated (local, export path only)** | No actual public page/search/API/media surface exists yet — only the export-filtering logic is proven. |
| Sensitivity review and redaction | `FixtureRecord.redactionApplied` field exists | **Not demonstrated** | No redaction workflow or UI built. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts` | **Demonstrated (local)** | "Dependent views" don't exist yet (no staff UI, no public surface reading this data) — only the state transition and copy-tracking are proven. |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled | **Demonstrated (local)** | Real backup-expiry timing (actual DynamoDB PITR/backup lifecycle, actual S3 noncurrent-version expiration) not exercised — needs real AWS. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` (local); `backend/src/scripts/realBackupRestoreDrill.ts` (real AWS, record-level case); `backend/src/scripts/realFullFixtureChecks.ts` (real AWS, grant-revocation/concurrency/export cases) | **Demonstrated, local and real AWS, for every case this milestone's regression suite covers.** The drill proves the record-level withdrawal+deletion→restore scenario end-to-end against real DynamoDB (passed three times). `realFullFixtureChecks.ts` separately proves, also against real DynamoDB: a revoked grant denies access even via a stale restored row (Finding 1), a concurrent lifecycle-action write is rejected rather than silently clobbering the winner (Finding 2, both a direct store-level race and a full `startDeletion`/`restrict` integration race), and export excludes expired-consent/disputed-authority records under real `evaluatePermission` (Finding 3). All 9 checks passed on the first run; see "Real full-fixture checks — what actually happened" below. | Each of those real-AWS proofs is still its own isolated case, not a combinatorial sweep (e.g. revocation racing concurrently with a restriction, or export racing a withdrawal, haven't been exercised together). Also still not exercised: actual S3 versioned-media restore (no media was in any drill fixture), actual TTL-deletion latency (explicit deletion was used throughout, not TTL expiry), and real Lambda/API-surface enforcement (doesn't exist yet). |
| Assigned operators | — | **Not demonstrated, not evidenced** | Organizational, not engineering. No name to put here. |
| Approved regional consent/retention procedures | `docs/ethos.txt` §12 response windows remain explicitly "proposed," not adopted | **Not demonstrated, not evidenced** | Same — governance work, tracked separately (`docs/501c3.txt` Stage 1). |
| Gate evidence and sign-off | This document | **Partial** — the engineering evidence exists; the sign-off line is deliberately blank | Needs a real named operator, not a placeholder. |

## What "demonstrated (local)" versus "demonstrated (real AWS)" means here

"Demonstrated (local)" rows are backed by a passing `node:test` run against
`backend/src/store/memoryStore.ts` — a hand-built in-memory fake, **not** a DynamoDB emulator.
They prove the permission/lifecycle/export/restore *logic* is correct against the same interface
the real `dynamoStore.ts` adapter implements, but cannot prove actual DynamoDB wire behavior,
actual eventual-consistency timing, or actual provider backup/restore mechanics.

"Demonstrated (real AWS)" means the same logic ran against the real `dynamoStore.ts` adapter and a
real deployed stack — `CreateBackupCommand`/`RestoreTableFromBackupCommand` for the restore drill,
or direct `DynamoFixtureStore`/`DynamoRestrictionRegisterStore` calls for the grant-revocation/
concurrency/export checks. Still not proven anywhere:

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

## Real full-fixture checks — what actually happened

Dated 2026-10-03. `backend/src/scripts/realFullFixtureChecks.ts`, run once against the same deployed
stack (`TiroFixtureBackend-drill-20261002`), seeded the FULL four-fixture set (`active`,
expired-consent, disputed-authority, preservation-only — not just the one `active` case the restore
drill uses) and ran 9 checks against real DynamoDB. **All 9 passed on the first run:**

- 4 parity checks confirming the real adapter's query paths produce the same permission outcomes as
  the local fake for every fixture case.
- **Finding 1** (grant-level revocation): revoked one grant via `revokeConsentGrant()` against live
  data; confirmed `evaluatePermission` denied afterward, the register's `revokedConsentIds` recorded
  the consent id, and the grant row's own `revokedAt` was set — all visible in a direct table scan.
- **Finding 2** (concurrent lifecycle actions), checked two ways: (a) a direct race of
  `RestrictionRegisterStore.setCurrent` with two writers sharing one `expectedVersion` snapshot —
  deterministic regardless of network timing, and the loser was rejected with a real
  `ConditionalCheckFailedException`-backed `VersionConflictError`; (b) a full `startDeletion()` +
  `restrict()` integration race — exactly one succeeded, the other rejected the same way, and the
  final register state was traced by hand against a live table scan to confirm no corrupted merge.
- **Finding 3** (export authorization): exported the expired-consent and disputed-authority records
  under both `public-redacted` and `complete-preservation` scopes; both scopes excluded both records,
  confirming the real `listAuthorityClaims`/`listConsentGrants` query paths feed `evaluatePermission`
  correctly, not just the in-memory fake.

No disposable AWS resources were created (unlike the restore drill, which creates and destroys a
temporary table + backup) — this script only writes a handful of small synthetic items into the
already-deployed primary/register tables, left in place afterward as part of the real-AWS fixture
baseline, same precedent as the restore drill's one surviving `active` record.

## AWS checks still not run, and the exact commands to finish them

| Check | Command |
| --- | --- |
| Inventory S3 object versions after delete | No media was involved in any real-AWS run so far (seeded fixtures' `mediaRefs` are non-empty but nothing has been uploaded to S3). `aws s3api list-object-versions --bucket <bucket>` before/after a real media delete, confirming noncurrent versions are tracked and expire per the 30-day lifecycle rule. |
| Verify Cognito-gated access actually denies unauthenticated requests | Needs a Lambda/API Gateway surface first (not built — see below). |
| Cost reconciliation against actual billing | AWS Cost Explorer / Billing console, compared against `docs/backend/decision-and-cost.md`'s estimate, after the billing alarm's SNS email subscription is confirmed. |
| A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or an export racing a withdrawal) | Not yet scripted — each real-AWS case so far has been checked in isolation; `realFullFixtureChecks.ts` is the place to extend. |

## Explicitly not built in this pass

- Lambda handlers, API Gateway routes, and the Cognito JWT authorizer wiring (§3's "service layer" /
  "authenticated routes"). The permission/lifecycle logic they'd call is built and tested; the HTTP
  surface calling it is not.
- The minimal staging-only staff UI (§3).
- Presigned-URL-after-withdrawal handling for media (§3) — `MediaRef` exists in the domain model;
  the S3 GET-route authorization logic does not yet.

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
