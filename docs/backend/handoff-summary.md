# Fixture-Preservation Backend — Reviewer Handoff Summary

Dated 2026-10-03. Branch `backend/fixture-preservation-milestone`, commits `b4c5172` (implementation)
and `93427f7` (real-AWS verification), on top of `3de6d66`. 29 files changed, ~3,000 lines added. Not
yet merged to `main`.

**Update, same day:** review of `93427f7` found five real correctness gaps (listed below, under
"Correctness fixes after review"). All five are now fixed with regression tests. A same-day
follow-up review of the first fix found a sixth: `reconcileRestoredRecords()` could disagree with
`evaluatePermission()` on the same restored record, because it never accounted for grant-level
revocation — fixed by having reconciliation delegate directly to `evaluatePermission()` instead of
re-deriving its own, looser approximation. 55 tests pass (up from 45). The PR was held for these
fixes before merge, per the reviewer's request. The real-AWS drill's result (below) is accurate for
the one scenario it tests; it was not, and is not, evidence for the gaps the reviewer additionally
found by testing cases the drill doesn't exercise.

**Update, later the same day:** `backend/src/scripts/realFullFixtureChecks.ts` closed that gap —
seeded the full four-fixture set into the live deployed stack and re-ran the grant-revocation,
concurrency, and export-authorization checks against real DynamoDB. All 9 checks passed on the
first run. See "What was proven, and how" below.

This document is the entry point. For depth on any specific claim below, the four docs it points to
are the actual source of truth — this summary should not be quoted as authoritative where it
disagrees with them.

## What was asked

Implement a small, persistent AWS backend demonstrating permissions, record lifecycle operations,
preservation export, and safe restoration, using non-sensitive synthetic fixtures — per the
`tiro-aws-backend-handoff.md` brief and `docs/ethos.txt` §§3.3, 3.10, 4, 6.1, 12. Real collection
stays disabled; this is an engineering exercise, not a data-intake system.

## What was built

**Database decision: DynamoDB**, single-table design, with the lifecycle control state (what's
currently allowed to be served) kept in a **separate table** from the data itself. Full reasoning
and a pricing-grounded cost estimate in `docs/backend/decision-and-cost.md`.

**Code** (`backend/`, workspace-isolated from the Next.js app — different `tsconfig`, excluded from
the frontend's typecheck):
- `domain/` — the entity model (`FixtureRecord`, `ConsentGrant`, `AuthorityClaim`,
  `LifecycleRequest`, `RestrictionRegisterEntry`, etc.) and a from-scratch UUIDv7 generator.
- `store/` — a `FixtureStore`/`RestrictionRegisterStore` interface implemented twice: an in-memory
  fake for tests, and a real DynamoDB adapter. Identical service-layer code runs against either.
- `services/` — permission evaluation, lifecycle operations (restrict/withdraw/retain/delete),
  preservation export (JSONL), and restoration with reconciliation against the live control state.
- `fixtures/` — synthetic, clearly-labeled (`isSynthetic: true`) test data.
- `scripts/realBackupRestoreDrill.ts` — the manually-invoked real-AWS drill (below).

**Infrastructure** (`infra/`, CDK/TypeScript): two DynamoDB tables, a private versioned-encrypted S3
bucket, a Cognito staff pool (self-signup disabled), bounded-retention logging, and a billing alarm
wired to a real SNS email subscription.

## What was proven, and how

**Locally (54 passing tests, no AWS credentials needed, runs in CI):** permission evaluation against
every case named in the brief (wrong purpose, wrong audience, expired consent, disputed authority,
disputed legal right, unverified signer capacity, missing control state, staff-role-is-not-a-grant),
lifecycle idempotency, a simulated-failure test proving a lifecycle action is never marked complete
before its control-state write is durable, a concurrency test proving two lifecycle actions racing
against the same snapshot can't silently clobber each other, export-time authorization, and the
T0→T1→T2→T3 restore-after-withdrawal sequence (plus a grant-level revocation variant) against the
in-memory fake.

**Against real AWS (the actual point of this milestone):** the stack is deployed
(`TiroFixtureBackend-drill-20261002`, account `440744257823`, `us-east-1`). The restore drill ran
four times: seed a record → real `CreateBackupCommand` → withdraw + start deletion against live data
→ real `RestoreTableFromBackupCommand` into a fresh table → reconcile the restored (stale,
still-"published") record against the live (correctly "withdrawn") control table → assert denial.
**All four passed.** The fourth run was fully automated including self-cleanup, exit code 0.

Separately, `realFullFixtureChecks.ts` seeded the FULL four-fixture set (not just the one `active`
case above) into the same live tables and ran 9 checks against real DynamoDB: 4 parity checks, the
grant-revocation check (Finding 1), two concurrency checks — a direct register compare-and-swap
race and a full `startDeletion`/`restrict` integration race (Finding 2) — and an export-authorization
check under both export scopes (Finding 3). **All 9 passed on the first run.** No disposable AWS
resources were created; the seeded fixtures were left in place as part of the real-AWS baseline.

Full requirement-by-requirement status — what's `demonstrated (local)`, `demonstrated (real AWS)`,
`pending`, or `not demonstrated`, with gaps stated plainly — is in
`docs/backend/evidence-matrix.md`. Nothing in this summary should be read as stronger than that
table says.

## Correctness fixes after review

Found by an independent review of `93427f7`, fixed the same day, each with a regression test:

1. **Restoration could revive revoked consent.** The restriction register protected record-wide
   withdrawal/deletion but not a single revoked `ConsentGrant` — restoring an old backup of that
   grant row made it look unrevoked again. Fixed by adding `revokedConsentIds` to the register
   itself (checked by `evaluatePermission` in addition to, never instead of, the grant's own
   `revokedAt`) and a new `revokeConsentGrant()` lifecycle action. `restore.test.ts`.
2. **Concurrent lifecycle actions could undo each other.** `transitionControl` read the register
   twice (non-atomically) per call, and callers did a third read before that — two actions
   interleaved could both "succeed" against the same stale snapshot, with the second clobbering the
   first (reviewer's repro: a deletion raced against a restriction ended up `published`/`preserved`).
   Fixed by deriving the full next state from exactly one snapshot and requiring the register write
   to match that snapshot's version exactly (compare-and-swap, not monotonic). `lifecycle.test.ts`.
3. **Export bypassed scoped permission checks.** `exportFixtureSet` only checked
   `currentPublicationStatus` directly for the public scope, and had no check at all for the
   preservation scope — an expired-consent or disputed-authority record could still be exported.
   Fixed by routing every export decision through `evaluatePermission` itself. `export.test.ts`.
4. **Legal-rights disputes were never checked.** `evaluatePermission` checked disputed/unknown
   *authority* claims but never looked at `LegalRight` records at all. Fixed by adding the same
   check (an empty legal-rights list is fine; a disputed or unknown one denies).
   `permissions.test.ts`.
5. **Deletion and checksum validation were incomplete.** `completeDeletion()` updated the register
   to `"deleted"` but never removed the actual `FixtureRecord` — the record stayed present and
   exportable. `validateExport`'s checksum check only required a non-empty string, accepting
   `"not-a-checksum"`. Fixed by adding `FixtureStore.deleteRecord()` (called from
   `completeDeletion()`) and SHA-256 hex-format validation. Byte-level verification against actual
   stored media content remains a separate, unclosed gap — no media bytes flow through export/import
   in this pass. `lifecycle.test.ts`, `restore.test.ts`.

## Real problems found and fixed during implementation

Listed because a clean final report with no bugs mentioned would be a worse signal than this list,
not a better one:

1. A from-scratch UUIDv7 implementation was silently one byte short (wrong string length) — caught
   by tracing the bit-packing by hand before it shipped, rewritten with a buffer-based approach.
2. A test fixture's own setup (`publicationStatus: "review"`) masked the condition the test claimed
   to verify (disputed authority) behind an earlier, unrelated gate (publication status) — the
   fixture was wrong, not the logic; fixed by isolating the variable under test.
3. The CDK stack's S3 bucket name string-interpolated an unresolved CDK token
   (`${this.account}` in environment-agnostic synth), failing S3 naming validation before a single
   AWS credential was involved — fixed by not hand-naming the bucket at all (the idiomatic CDK
   pattern, not a workaround).
4. ESLint was scanning `infra/cdk.out`'s generated/minified JS as if it were hand-written source
   (flat config doesn't read `.gitignore`) — fixed with an explicit ignore entry.
5. Tagging a freshly-restored DynamoDB table leaves it in a transient "in use" lock **not reflected
   in `TableStatus`** — an immediate `DeleteTable` failed twice with `ResourceInUseException` before
   this was understood; fixed with a retry-on-that-specific-exception wrapper, not a blind sleep.
6. The restore-wait timeout (300s) was too short — one real restore took ~10 minutes for a
   near-empty table. AWS documents restore time as variable, not proportional to table size. Bumped
   to 900s.

## Security note

During credential setup, a raw AWS secret access key was briefly visible in the local chat/IDE
context (pasted from a downloaded credentials CSV). Treated as compromised on sight: the key was
deactivated and deleted in IAM before ever being used for anything, a fresh key was generated, and
it was configured directly into the local AWS CLI profile rather than shared again. No access logs
show the exposed key was ever used.

## Cost

Estimated and, after one real month, should be confirmed near $0 — DynamoDB provisioned capacity is
set well inside the always-free 25/25 allowance, and the fixture workload is tiny (four synthetic
records seeded across all drill runs, no sustained traffic). Full estimate with cited AWS pricing in
`docs/backend/decision-and-cost.md`. A CloudWatch billing alarm (notification only, not an enforced
cap) is live, subscribed to `onewisepixel@gmail.com`.

## Explicitly not done — not a vague "more to do" list

- Lambda/API Gateway/Cognito-JWT-authorizer wiring. The permission/lifecycle logic they'd call is
  built and tested; no HTTP surface calls it yet.
- The minimal staging-only staff UI.
- Authorized-media S3 routes (presigned URLs, withdrawal-invalidation handling).
- Real S3 object-version inventory, real Cognito-gated request denial, real TTL-deletion timing —
  all blocked on the engineering above, not on anything organizational.
- A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction) — each real-AWS
  correctness case so far has been checked in isolation, not combined with another.
- **Organizational, not engineering, and not something this document can resolve:** a named
  operator, and adopted (not merely proposed) consent/retention response-window numbers. Both are
  stated prerequisites in `docs/ethos.txt` §6.1. No placeholder values were fabricated for either.

## Where to look for more

- `docs/backend/decision-and-cost.md` — why DynamoDB, access-pattern analysis, cost estimate.
- `docs/backend/evidence-matrix.md` — the requirement-by-requirement table, local vs. real-AWS
  results, every AWS-only check still outstanding with the exact command to run it.
- `docs/backend/runbook.md` — exact commands for local dev, deploy, the real drill, and cleanup.
- `docs/backend/status.md` — keeps the historical static prototype, this fixture milestone, and
  future real-collection readiness from blurring into each other.
