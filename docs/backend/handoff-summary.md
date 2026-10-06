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

**Update, a third review round the same day:** CI was red (a Turbopack/Google-Fonts build failure
plus 6 high-severity `npm audit` findings — both root-caused and fixed/documented), the grant-
revocation restoration claim was still overstated (closed by a dedicated real-AWS drill,
`realGrantRevocationRestoreDrill.ts`, which passed), and one assertion could falsely pass on a
missing grant (`undefined !== null`). All three fixed; see `docs/backend/status.md`.

**Update, authenticated API + staff UI:** built `backend/src/api/` (router + Lambda handler), wired
an HTTP API with a Cognito JWT authorizer and a Hosted-UI OAuth app client into
`infra/lib/fixture-backend-stack.ts`, and built `staff-ui/` (a standalone static page). Deployed and
smoke-tested against the real stack — unauthenticated calls get 401, a real Cognito token succeeds,
and a lifecycle action correctly attributes itself to the authenticated caller even when the request
body tries to spoof a different one. 76 tests pass (up from 55). See the evidence matrix's "Real
staff API smoke test."

**Update, API milestone review — three defects held sign-off, all fixed and re-verified against
real AWS:** (1) record reads bypassed scoped permission checks — `GET /records/:id` now requires
`purpose`/`audience` and returns a limited metadata view (no content, no evidence contents, counts
only) when `evaluatePermission` denies; (2) reused request IDs silently suppressed different
operations — `getOrCreateRequest` now fingerprints the full operation and a mismatched reuse is a
409, confirmed against live DynamoDB (second record provably untouched); (3) deletion completion
bypassed the deletion workflow — `completeDeletion()` now requires a `deletionRequestId` linking to
a completed `startDeletion()` request and the register actually showing `"deletion-pending"`, or it
denies rather than silently deleting, confirmed against a live record that was never deleted. 84
tests pass (up from 76). Also verified: Hosted UI → callback → API, using the real `auth.js` file
executed in a real JS engine against the live Cognito domain and API — honestly short of a literal
browser click-through, since no browser-automation tool is available here; see the evidence
matrix's "Browser-flow verification" for exactly what that does and doesn't prove.

**Update, a fourth review round — two more `completeDeletion` defects, fixed with regression tests
but at first only proven locally:** partial-failure recovery (the register write landing before the
record-removal write meant a transient failure there left the request permanently denied, never
resumable) and a stale-custody-precondition race (the prerequisite check used a separate, discarded
register read instead of the exact snapshot the write itself used, so a retention action landing in
between went undetected). 86 tests pass (up from 84).

**Update, the S3 media milestone — real, version-bound media; authenticated retrieval; media-aware,
resumable deletion; media-carrying export/restore; and ONE live-AWS acceptance drill that also
closed the fourth round's two real-AWS gaps:** every `MediaRef` now pins an exact S3 version (never
"latest") with a genuine SHA-256 computed from real uploaded bytes — not the old all-zero
placeholder. `GET /records/:recordId/media/:mediaId` runs the identical `evaluatePermission` check
as every other route, on every fetch, with no presigned URLs and no reusable download capability.
`completeDeletion()` now purges every real S3 version AND delete marker for media-tracked custody
copies before reconciling them, tolerant of partial progress. `exportFixtureSet` embeds real media
bytes for complete-preservation exports (never for public ones); `validateExport` now rejects a
tampered package by re-hashing its actual bytes, not just checking checksum format.
119 tests pass (up from 86). **`realS3MediaAcceptanceDrill.ts` passed 25/25 checks against the live
redeployed stack** — unauthenticated/direct-S3 denial, exact-byte retrieval, every denial case,
no-reusable-URL confirmation after a real withdrawal AND a real grant revocation, export/restore
integrity with real tamper rejection and a positive control, real S3 version/delete-marker inventory
and removal (including a marker deliberately created outside this system's own path), and the two
previously-local-only `completeDeletion` fixes now confirmed against real DynamoDB. One real bug —
in the drill script's own assumptions, not the system under test — was caught and fixed before the
corrected run passed outright. See the evidence matrix's "Real S3 media acceptance drill" for the
full, exact result.

**Update, a fifth review round — four gaps reproduced against the real service code, all fixed:**
(1) `completeDeletion()` purged every S3 version BEFORE validating custody status, so a real
retention action still got its media destroyed even though completion correctly returned
`"denied"` — fixed with a fresh pre-purge custody check; (2) export had no size budget and
retrieval buffered bytes before checking their real size — a reviewer reproduced a 7MB export from
one repeated record id — fixed with a new bodyless-HEAD size check (`MediaStore.headObjectSize`),
record-id deduplication, and a per-object plus aggregate export byte budget; (3) `importExport`
never wrote restored `auditReceipts` at all — fixed, with the in-memory store's one
non-upsert-by-id entity-put corrected for safe replay; (4) emptying a package's `mediaObjects`
still passed validation — fixed by requiring every version-bound reference to be accounted for in
either the included objects or an honest skip record, rejecting the rest as incomplete/tampered.
127 tests pass (up from 119); the live drill was redeployed, extended to use real bound media for
the retention check, and re-run — **29/29**. See the evidence matrix's fifth-review-round note.

**Update, a sixth review round (2026-10-04) — two residual gaps in the fifth round's fixes, both
genuinely CLOSED this time, not narrowed-and-documented:** (1) the fifth round's retention guard
was a bare read, not a claim — a reviewer deterministically proved retention could still win the
register while an already-in-flight purge destroyed the media anyway; fixed with real mutual
exclusion (a conditional-write `mediaPurgeClaim` that `retainForPreservationOnly` itself now
checks and refuses to override, not just a tighter window on the deletion side); (2) the export
budget measured raw bytes while Lambda's real limit is on the serialized (base64 + JSON) response —
20 distinct, individually-authorized, under-cap records still produced 7MB+ serialized; fixed by
budgeting the actual serialized contribution, computed from a HEAD-only size before fetching
anything. 131 tests pass (up from 127); the live drill now includes a real-DynamoDB interleaving
check (closing Finding 1 with a genuine `VersionConflictError`, not a local approximation) and a
real 20-object `/export` call through the live Lambda confirming a 4,946,321-byte response, down
from 7,035,395 — **34/34**. See the evidence matrix's sixth-review-round note.

**Update, the versioned correction and redaction milestone (2026-10-04):** implements §12's
"Correct" action (`correctRecord()`/`disputeCorrection()` — replaces the live field immediately,
preserves the previous value permanently, and a later dispute marks it `"disputed"` without
reverting it) and §3.5's redaction tooling, scoped honestly to text masking and a hard media-access
override (`redactText()`/`redactMedia()`) — never actual image/audio/video content processing, which
needs infrastructure this project doesn't have. The pre-redaction original is never served through
the normal record-read path; `complete-preservation` exports carry it (custody there is authorized
to hold the full archival record), `public-redacted` exports omit it, reusing the existing
redacted-for-public-export pattern. Four new API routes, no infra change needed. 150 tests pass (up
from 131); a new live drill, `realCorrectionRedactionDrill.ts`, passed **19/19 on its first real
run** against the deployed stack.

**Update, a seventh review round (2026-10-04) — five gaps reported as deterministic LOCAL
reproductions against the actual service code, not fresh AWS runs, all genuinely fixed:** (1)
correcting then redacting the same field left the correction's historical values unmasked — fixed
by a shared `services/redactionView.ts` module enforcing masking on history too, from the current
register, wired into the live route and public exports; (2) restoring a pre-redaction backup could
revive redacted text, because text redaction (unlike media) had no durable register state — fixed
by adding `redactedTextFields` to the register and masking from it at serve time, restore-proof the
same way media already was; (3) a failed history write could lose the true original — fixed with
genuine atomicity (`putRecordWithCorrection`/`putRecordWithRedaction`, a real DynamoDB
`TransactWriteItems`) plus stable, requestId-derived history ids; (4) the media-purge claim was
released too early (reopening the exact race it exists to prevent) and didn't recognize its own
`requestId` on retry — fixed by holding it continuously through the final commit and comparing
ownership; (5) the export response budget measured only media, so 20 large-text records still
produced 9 MB+ — fixed by budgeting each record's complete real serialized envelope and excluding
the whole record, never trimming, when it would cross the limit.

158 tests pass (up from 150). `realS3MediaAcceptanceDrill.ts` (Finding 4) now passes **36/36**;
`realCorrectionRedactionDrill.ts` (Findings 1-3, plus Finding 5's API-shape half) now passes
**32/32**. One limitation is named rather than hidden: Finding 5's actual whole-response TEXT
exclusion couldn't be forced live — every attempt against this fixture stack's deliberately tiny,
always-free-tier DynamoDB provisioning observably throttled (confirmed directly against CloudWatch
metrics and Lambda logs), but that's an observed result from these specific attempts, not proof
it's categorically impossible at 5 RCU/s (AWS documents burst capacity beyond the nominal
provisioned rate) — so that exact scale (the reviewer's 9,032,712-byte, 20-record reproduction)
stays proven byte-for-byte by the deterministic local test instead. See the evidence matrix's
seventh-review-round note for the full detail.

**Update, an eighth review round (2026-10-04) — four more gaps reported as deterministic LOCAL
reproductions, all genuinely fixed:** (1) `FixtureRecord.version` never actually advanced — every
caller spread a freshly-read copy without incrementing it, so two concurrent corrections both
reading the same version could both "succeed," the second silently clobbering the first — fixed by
making the STORE itself (not the caller) own the persisted version, closing the bug structurally
for every current and future caller; (2) a retry's "already applied" guard used a query that, on
the real adapter, is eventually consistent and could miss a just-committed write, letting a retry
corrupt history with an already-changed value as a fake "previous" one — fixed with a strongly
consistent by-id lookup AND a conditional history write that rejects a duplicate id outright, the
real unconditional guard even if the pre-check is wrong; (3) retention checked only the media-purge
claim, never custody status, so retention immediately after a completed deletion could flip an
already-`"deleted"` tombstone back to `"preserved"` — fixed by rejecting `"deleted"` custody
outright, including during deletion recovery; (4) the export budget still measured only this
object's own single encoding, not the Lambda handler's actual doubly-escaped response — content
rich in quotes/backslashes could measure safely under budget yet nearly double once really
wrapped — fixed by measuring that real re-escaped cost directly.

164 tests pass (up from 158). Both live drills were extended and re-run:
`realCorrectionRedactionDrill.ts` (Findings 1 and 2, against real DynamoDB's own
`ConditionExpression`/`TransactWriteItems`) now passes **38/38**; `realS3MediaAcceptanceDrill.ts`
(Finding 3, a real deletion run to completion then retention immediately after) now passes
**41/41**. Finding 4 wasn't re-attempted live beyond the prior round's API-shape check — per
explicit instruction, this shared table's capacity stays unchanged, and the observed-throttling
(not categorical-impossibility) caveat still applies. See the evidence matrix's eighth-review-round
note for the full detail.

**Update, a ninth review round (2026-10-04) — one residual export-budget gap with two reproducible
paths, neither about any one record's content, both genuinely fixed:** (1) `fixtureSetId` has no
length limit and the manifest embeds it verbatim — 20 ordinary records plus a 2 MiB `fixtureSetId`
produced a real 7,026,838-byte response — fixed with a length cap (API boundary + defensively
inside `exportFixtureSet`) and by budgeting the manifest's REAL encoded size instead of a fixed
guess; (2) skipped-record entries were counted but appended unconditionally — 8,000 requested
records (903 included, 7,097 skipped) produced a real 7,291,455-byte response because the skip
report itself could grow without bound — fixed with a batch-size cap AND a loop that stops,
reporting a new `recordsNotProcessed` field honestly, the moment even one more skip entry would
itself exceed budget; a final, outermost guard in `router.ts` now also answers a real `413` if the
complete wrapped response would still exceed Lambda's hard limit despite all of the above.

168 tests pass (up from 164). `realCorrectionRedactionDrill.ts` was extended and re-run: the real
deployed API rejects both an oversized `fixtureSetId` and an oversized batch with a real 400,
before any record is even looked at — now passes **40/40**. Unlike the prior round's residual gap,
these two fixes make the deployed API do LESS work on bad input, so confirming them live needed no
capacity change and consumed essentially no RCU. See the evidence matrix's ninth-review-round note
for the full detail.

**Update, operational readiness (2026-10-04) — making the already-reviewed lifecycle features
dependable to operate, not adding new ones:** (1) `realStaffApiSmokeTest.ts` scripts the prior
manual smoke test into a reusable drill (8/8); in doing so it caught that one of its own assertions
was stale — a disputed-authority fixture used to assert a full detail bundle, which was correct
only BEFORE Finding 1's permission-enforcement fix; fixed by seeding a real `active` fixture for
the allowed case and keeping a corrected, separate denial check for the disputed one. (2)
`realFullFixtureChecks.ts` grew four combinatorial-case checks with the expected outcome defined
for EITHER ordering: revocation racing restriction (a genuine two-writer race — symmetric
first-wins, and the loser's retry converges to both changes present) and export racing
withdrawal/deletion (a writer-vs-reader case — `evaluatePermission` reads the register once per
call, so a record is either excluded or included with a fully self-consistent snapshot, never
torn). 13/13. (3) `realLegacyMediaMigration.ts` inventories every live `versionId: null` media
reference and dry-run-reports which match a known, exact, reconstructable placeholder signature
(rebindable) versus which have no trustworthy known origin (stay unavailable) — narrow exact
matching only, never fuzzy, because a near-miss is exactly where guessing would be most tempting
and most wrong; `--apply` is gated behind an explicit flag and not run against live data without
separate sign-off. (4) A 16-step browser-acceptance checklist and its fixture-seeding script are
now prepared for a human to run end-to-end (correction → dispute → text/media redaction → export →
deletion, including denied access and audit attribution) — genuinely not yet executed, since no
browser-automation tool exists in this environment. (5) Real AWS Cost Explorer and billing-alarm
state were reconciled against `decision-and-cost.md`'s estimate (actual cost confirms the estimate;
one real, human-actionable gap found: the billing alarm's SNS email subscription is stuck
`PendingConfirmation`). (6) Confirmed DynamoDB TTL — distinct from S3's lifecycle rule — is not
configured on any table in this system; deletion is exclusively explicit. Seeded a dedicated,
isolated S3 noncurrent-version observation of the bucket's real 30-day expiration rule; genuinely
PENDING until 2026-11-03 (never fabricated early). DynamoDB capacity was left unchanged throughout,
per explicit instruction. See the evidence matrix's "Combinatorial cases," "Real staff API smoke
test," "Legacy media migration," and "S3 noncurrent-version expiration observation" notes.

**Update, review of the operational-readiness round (2026-10-05) — three real gaps found by
actually executing the new scripts against local fakes and reasoning about the new drill's forced
timing, all genuinely fixed:** (1) the legacy-media migration had no deletion-workflow eligibility
check at all and wrote its record-rewrite and custody-copy as two separate calls — reproduced as
two real failures (rebinding media for an already-deleted record; a failed custody-copy write
leaving an uploaded object permanently untracked, so a later deletion could report success while it
survived) — fixed by extracting the logic into a new, unit-tested module
(`services/legacyMediaMigration.ts`), checking custody status FRESH immediately before any upload
(never trusting the dry-run snapshot), and writing the record and its copy in one atomic DynamoDB
transaction (`FixtureStore.putRecordWithCustodyCopy`) with best-effort cleanup of an orphaned
upload if that transaction still fails; 6 new regression tests reproduce both original failures and
prove them closed. (2) The prior round's new "revocation racing restriction" combinatorial check
required a genuine CAS conflict that isn't actually guaranteed — two independent service calls can
legitimately serialize cleanly with nothing to retry — and its retry step used a brand-new
requestId instead of the original one, abandoning the loser's `LifecycleRequest` permanently
"in-progress"; fixed by accepting either valid outcome, adding a NEW deterministic forced-conflict
check (mirroring Finding 2a's technique), and retrying with the original requestId. That forced
check immediately caught a THIRD, genuinely new production bug: DynamoDB's `TransactWriteItems`
can cancel with reason `TransactionConflict` (simultaneous item contention) without ever evaluating
the `ConditionExpression`, and `dynamoStore.ts`'s `isConditionalFailure` only recognized
`ConditionalCheckFailed` — so a real race loss could propagate unmapped instead of becoming the
`VersionConflictError` every caller expects; now fixed. `realFullFixtureChecks.ts` passes **15/15**
against real DynamoDB after both fixes. (3) The S3 expiry observation's printed eligibility date
was a raw `+30 days` instant; S3's lifecycle engine actually sweeps once daily around UTC midnight
on whole elapsed days, so the real earliest eligibility is 2026-11-04T00:00:00Z, not
2026-11-03T22:44 — and `--check` could falsely report "expired" for an empty listing or for the
inverted case where the current version vanished instead of the noncurrent one; fixed by persisting
the exact seeded version ids as ground truth and requiring the current version to survive as a
positive control before ever reporting an observed expiration. 174 tests pass (up from 168). See
the evidence matrix's "Combinatorial cases," "Legacy media migration," and "S3 noncurrent-version
expiration observation" notes for the full detail.

**Update, same day (2026-10-05):** the billing alarm's SNS email subscription — the one real,
human-actionable gap the operational-readiness round found — is now confirmed. The user subscribed
and confirmed a different, organizational address (`cero@tiro.foundation`) rather than the original
`onewisepixel@gmail.com`; re-verified directly via `aws sns list-subscriptions-by-topic` (a real
`SubscriptionArn`, not just the confirmation screen), not merely taken on the confirmation
screenshot's word. The billing alarm now has a real, confirmed, actionable recipient.

**Update, a second review round of the operational-readiness work (2026-10-06) — five more real
gaps, all fixed:** (1) legacy-media migration could still race deletion EVEN with the fresh custody
check from the first round — `startDeletion()` + `completeDeletion()` can run to full completion
entirely in the real wall-clock gap between that check and the S3 upload finishing, leaving a newly
migrated object and its unreconciled `CustodyCopy` to survive an already-"completed" deletion. Fixed
with `CustodyCopyCommitter` (`store.ts`/`dynamoStore.ts`): the record+copy write and a
`ConditionCheck` on the restriction register's custody status now commit in ONE DynamoDB
transaction spanning both tables — the one place in this codebase that does — so there is no window
left for a concurrent deletion to land in. `listCustodyCopies` was also made strongly consistent,
closing the matching read-side gap. (2) The cleanup-on-failure path could destroy a binding that
actually committed — a timeout can report failure even after the server applied the write — fixed
by re-reading the record fresh before ever deleting the uploaded object, resolving the uncertainty
the same way `services/lifecycle.ts` already does for corrections and redactions, rather than
assuming any error means "didn't commit." (3) The S3 expiry checker's eligibility-date guard only
ran when v1 was still present, so v1 disappearing for any OTHER reason before real eligibility
would have been misreported as an early, lucky pass — fixed, and the whole eligibility/`--check`
decision tree was extracted into a new unit-tested module, `services/s3ExpiryObservation.ts`. (4)
The older `Finding 2b` concurrency check (`startDeletion` racing `restrict`) carried the exact same
two defects the first round's revocation/restriction combinatorial check did (requiring a
conflict that isn't guaranteed, never retrying a real loser) — fixed with the identical pattern.
(5) The staff UI's action forms showed their response only in a spot the next record reload wiped
almost immediately — losing `start-deletion`'s requestId and every action's actor attribution
before a human tester could read them — fixed with a persistent, page-level Action log.

11 new regression tests prove these closed (185 total, up from 174): 3 new tests in
`legacyMediaMigration.test.ts` (now 9) reproduce the TOCTOU race and the false-cleanup scenario
directly and prove both fixed; a new `s3ExpiryObservation.test.ts` (8 tests) covers the full
`--check` decision tree, including the exact third-finding repro. `realFullFixtureChecks.ts` also
grew two checks that exercise
`CustodyCopyCommitter` directly against real DynamoDB (a successful commit, and a real cross-table
refusal) and re-confirmed Finding 2b's fix live. See the evidence matrix's "Legacy media
migration," "Combinatorial cases," and "S3 noncurrent-version expiration observation" notes, and
"Browser-flow verification" for the staff-UI fix, for the full detail and real results.

**Update, a third review round (2026-10-06) — the second round's own fixes had two more gaps, both
fixed:** (1) the idempotent-recovery recheck added to resolve an uncertain commit was itself an
unguarded network call that could fail — a reviewer forced a DEFINITE custody refusal
(`DeletionInProgressError`, which GUARANTEES the whole transaction was atomically cancelled, no
ambiguity) immediately followed by a recheck failure; the uncaught exception skipped cleanup
entirely, and a later `completeDeletion()` reported `"completed"` while the untracked upload
survived — resurrecting the FIRST round's original bug via a brand-new path. Fixed: definite
non-commit signals (`DeletionInProgressError`/`VersionConflictError`) now go straight to cleanup
with no recheck at all, since there is no uncertainty to resolve for them; the recheck, kept only
for genuinely uncertain errors, is now wrapped in its own `try`/`catch` so a failure there preserves
BOTH failure messages in a new outcome instead of throwing uncaught. (2) A failed cleanup was still
reported as `"skipped-ineligible"` — implying nothing was left behind — so the CLI's failure count
and exit code never reflected a real orphan. Fixed with a dedicated `"needs-reconciliation"`
outcome carrying the exact `objectKey`/`versionId` as structured fields; the CLI now counts these,
prints them under their own banner, and exits non-zero whenever any exist. 3 new regression tests
(188 total, up from 185) reproduce both findings exactly. These are local, fault-injection-proven
fixes to service-layer control flow — not independently re-verified against real AWS this round,
since the underlying `DeletionInProgressError`/`VersionConflictError` classification itself was
already proven live in the second round. `--apply` stays deliberately unrun. See the evidence
matrix's "Legacy media migration" entry (third review round) for the full detail.

**Update, a fourth review round (2026-10-06) — one reporting gap in the third round's own fix:** an
ORDINARY write failure (reproduced by injecting a real `AccessDeniedException` directly into the
CLI) still landed in `"skipped-ineligible"` once cleanup succeeded — reported as a benign skip with
the CLI exiting 0, the record left genuinely un-migrated with nothing in the output distinguishing
it from a correct-by-design exclusion. Fixed by splitting that one outcome into two with a real
semantic difference: `"skipped-ineligible"` stays reserved for refusals that are correct BY DESIGN
(the early eligibility checks, plus `DeletionInProgressError`/`VersionConflictError`, per explicit
instruction to keep eligibility/concurrency refusals there); every OTHER confirmed non-commit — a
genuine operational error — is now its own `"failed"` outcome, counted and reported, never folded
into a label implying nothing went wrong. The existing regression test for this exact path was
corrected in place to assert `"failed"`, directly reproducing the reviewer's CLI finding at the
service layer; 188 tests still pass (a test was corrected, not added). `--apply` stays deliberately
unrun. See the evidence matrix's "Legacy media migration" entry (fourth review round).

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
- `scripts/realBackupRestoreDrill.ts`, `realFullFixtureChecks.ts`, `realGrantRevocationRestoreDrill.ts`
  — the manually-invoked real-AWS drills (below).
- `api/` — added for the authenticated-API slice: a transport-agnostic `router.ts` (every route
  re-runs `evaluatePermission`/the lifecycle functions unchanged — Cognito authentication only gates
  who may call the API at all) and the real Lambda entrypoint, `handler.ts`.

**Infrastructure** (`infra/`, CDK/TypeScript): two DynamoDB tables, a private versioned-encrypted S3
bucket, a Cognito staff pool (self-signup disabled, Hosted-UI OAuth2+PKCE app client), an HTTP API
with a Cognito JWT authorizer fronting the Lambda above, bounded-retention logging, and a billing
alarm wired to a real SNS email subscription.

**`staff-ui/`** (new, standalone — not part of the Next.js app): a minimal static page using
Cognito Hosted UI to sign in, then calling every route on the API above. See `staff-ui/README.md`.

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
cap) is live, with a confirmed subscription at `cero@tiro.foundation` (confirmed 2026-10-05).

## Explicitly not done — not a vague "more to do" list

- Migrating the already-live legacy (`versionId: null`) media references seeded before version
  binding existed — they correctly fail closed (409), but nothing re-uploads/rebinds them
  automatically; would need a dedicated one-off migration script.
- Real TTL-deletion timing and real S3 noncurrent-version lifecycle-rule expiration timing — every
  deletion in every drill so far has been explicit, not timing-based.
- A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or a media purge
  racing an export) — each real-AWS correctness case so far has been checked in isolation.
- Forcing the export response budget's real whole-record TEXT exclusion live (as opposed to proving
  the field exists) — needs reading several real MB out of this stack's deliberately tiny,
  always-free-tier DynamoDB provisioning inside one Lambda invocation; every attempt tried
  observably throttled, but that's an observed result from those specific attempts, not proof it's
  categorically impossible at this provisioning (AWS documents burst capacity beyond the nominal
  provisioned rate) — and a real, billed capacity bump wasn't made unilaterally, per explicit
  instruction to leave this shared table's capacity unchanged. See the evidence matrix's
  seventh-review-round note.
- **Done as of the S3 media milestone, previously listed here:** authorized-media S3 routes
  (presigned URLs deliberately NOT used — see `services/media.ts`'s "no reusable download
  capability" design), real S3 version/delete-marker handling, byte-level checksums, and real S3
  object-version inventory/removal. See the evidence matrix's "Real S3 media acceptance drill".
- **Done as of the versioned correction and redaction milestone, previously listed here:**
  §3.5/§12's "Correct" action and text/media redaction tooling. See that milestone's note above and
  the evidence matrix's "Real correction/redaction drill".
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
