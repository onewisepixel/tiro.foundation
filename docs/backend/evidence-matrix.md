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
`realBackupRestoreDrill.ts` used) and re-ran the concurrency and export-authorization checks against
real DynamoDB. All 9 checks passed on the first run. See "Real full-fixture checks — what actually
happened" below. **Correction, reviewed separately:** this script's grant-revocation check only
proves a revoked grant denies LIVE access — it never restores a backup, so on its own it is NOT
evidence that a restored pre-revocation backup still gets denied. That specific restoration claim
was previously overstated in the table row below; it is corrected here and closed by a dedicated
drill, `realGrantRevocationRestoreDrill.ts`, which passed on its first real run — see "Real
grant-revocation restore drill" below for the actual, not assumed, result. Also caught in the same
review: a check in
`realFullFixtureChecks.ts` used `grantAfterRevoke?.revokedAt !== null`, which is `true` (a false
pass) when the grant is simply missing, since `undefined !== null`. Fixed to require the grant to
exist AND have a populated `revokedAt`.

**2026-10-03, authenticated API + staff UI:** added `backend/src/api/` (a transport-agnostic
`router.ts` plus the real Lambda `handler.ts`), an HTTP API with a Cognito JWT authorizer, and
`staff-ui/` (a standalone static page — not part of the public Next.js site). Deployed and smoke-
tested against the live stack — see "Real staff API smoke test" below. 76 passing tests (up from
55: 14 router tests, 7 handler-parsing tests). The hard rule carries over unchanged: Cognito
authentication gates who may call the API at all and whose identity lands in the audit trail; it is
never a substitute for `evaluatePermission`'s own scoped checks, which run exactly as before
regardless of caller.

**2026-10-03, API milestone review — three defects held sign-off, all fixed, all with regression
tests, all re-verified against real AWS:**

1. **Record reads bypassed scoped permission checks (Finding 1 of this round).** `GET
   /records/:recordId` returned full content and every piece of consent/authority evidence to any
   authenticated staff member unconditionally — exactly the "staff role substitutes for a scoped
   grant" bypass `permissions.ts` forbids everywhere else. Fixed: the route now requires
   `purpose`/`audience` query params and runs the same `evaluatePermission` check as everything
   else. Allowed → full content + evidence. Denied → a limited metadata view: identifying fields
   only (no title/summary/mediaRefs), register/lifecycle state, custody copies and audit receipts
   (safe by their own type design), and evidence **counts**, never contents. `router.test.ts` (4
   new cases).
2. **Reused request IDs silently suppressed different operations (Finding 2).** `getOrCreateRequest`
   treated any existing request matching a reused `requestId` as a safe replay, regardless of
   whether it was actually the same operation — withdrawing record A, then reusing that `requestId`
   to "withdraw" record B, returned A's completed request and left B untouched while reporting 200.
   Fixed: every request now carries a `payloadFingerprint` (recordId, action, caller, reason,
   protectiveHold, and action-specific payload like `purposes`/`consentId`); a reused id with a
   different fingerprint throws `IdempotencyKeyConflictError`, mapped to 409. An exact replay (same
   fingerprint) is still a safe no-op. `router.test.ts` (3 new cases) — confirmed against real AWS
   below.
3. **Deletion completion bypassed the deletion workflow (Finding 3).** `completeDeletion()` took a
   bare `recordId` and would delete any record with zero outstanding custody copies, including one
   that had never gone through `startDeletion()` — no request, no link, no receipt, just a silent
   delete. Fixed: `completeDeletion()` is now a full lifecycle action requiring a `deletionRequestId`
   that must resolve to a completed `"delete"` request for the SAME record, and the register's
   `currentCustodyStatus` must actually be `"deletion-pending"` — either failing check **denies**
   (status `"denied"`, its own audit receipt) rather than silently deleting or silently no-op'ing.
   `lifecycle.test.ts` + `router.test.ts` (2 new cases).

All three re-verified against the live deployed stack after redeploying the fixed Lambda — see "Real
defect-fix verification" below. 84 passing tests (up from 76).

**2026-10-03, fourth review round — two more `completeDeletion` defects, both fixed, both with local
regression tests (86 passing, up from 84):**

1. **Partial failure could not recover.** The old precondition check required
   `currentCustodyStatus === "deletion-pending"` exactly. But the register write (to `"deleted"`)
   happened BEFORE the primary-record removal, so if removal failed after the register write
   succeeded, every retry — same `requestId` or a fresh one — hit a register that now read
   `"deleted"`, not `"deletion-pending"`, and was permanently denied even though the record was
   still physically present. Fixed: the custody-status check (see #2 below) now accepts `"deleted"`
   as well as `"deletion-pending"` — specifically to allow resuming exactly this partial-failure
   state — and the record-removal step itself is skipped (not re-attempted as an error) if the
   record is already gone. `lifecycle.test.ts`, "completeDeletion resumes a partial failure instead
   of being permanently denied."
2. **The prerequisite check read a different, discarded snapshot than the one used for the actual
   write.** The old code read the register once to check `currentCustodyStatus`, then
   `transitionControl` read it AGAIN internally to perform the version-matched write — and that
   second read's `computePatch` ignored custody status entirely, unconditionally setting it to
   `"deleted"`. A retention action landing between the two reads (e.g. `retainForPreservationOnly()`
   flipping custody to `"preserved"`) was invisible to the write, which deleted the record anyway.
   Fixed: the outer, throwaway pre-check is gone; the validation now happens *inside*
   `transitionControl`'s `computePatch`, against the exact snapshot that also supplies
   `setCurrent`'s expected version — the same snapshot, not a stale copy of it. An invalid status at
   that point throws `StaleCustodyStatusError`, caught and turned into a terminal `"denied"` (not a
   retryable failure, since a human retention decision should not be silently overridden by a
   retry). `lifecycle.test.ts`, "completeDeletion refuses when custody changes away from
   deletion-pending before the final transition."

Both fixes are proven **at the logic level only** — regression tests against
`InMemoryFixtureStore`/`InMemoryRestrictionRegisterStore`, the same interface `dynamoStore.ts`
implements, but not yet re-run against the real deployed stack. Unlike the three Finding 1-3 fixes
above, these have not had a dedicated real-AWS confirmation pass; see the "AWS checks still not run"
table below. The reviewer's own instruction was to land the fix and regression coverage as the first
part of the upcoming S3 slice, not to re-verify against live AWS in this round — noted here so that
distinction isn't lost.

**Also this round: Hosted UI → callback → authenticated API, verified against real AWS — with an
honest limitation stated.** The prior round's real-AWS smoke test proved CLI-token (`AdminInitiateAuth`)
access, not the actual browser OAuth flow a staff member uses. No browser-automation tool (Playwright/
Puppeteer/computer-use) is available in this environment, so a literal "opened Chrome and clicked
Sign In" run was not performed — that gap is named, not hidden. What WAS done: the real Cognito
Hosted UI login form was fetched and submitted over HTTP exactly as a browser's form POST would
(same session cookies, same CSRF token, same PKCE challenge), yielding a real authorization code from
the live Cognito domain; that code was then fed into the actual, unmodified `staff-ui/auth.js` file's
`completeSignIn()` function — not a reimplementation of its logic — executed in a real JS engine
(Node, via `vm`, with `window`/`sessionStorage` shimmed), which performed the real PKCE token exchange
against the live Cognito domain and stored a real ID token; that same file's `apiFetch()` function
then called the live deployed API and got back a real 200. Residual, low-risk, unverified-by-this:
`redirectToSignIn()`'s `window.location.href` assignment and `index.html`/`callback.html`'s DOM
rendering, under an actual browser's navigation and HTML parser — standard, low-complexity browser
APIs, not exercised here. See "Browser-flow verification" below for the full sequence.

**2026-10-03, S3 media milestone — real version-bound media, authenticated retrieval, media-aware
deletion, media-carrying export/restore, and ONE live-AWS acceptance drill that also closed the two
`completeDeletion` checks the fourth-review-round note above left open:**

- **Storage.** New `MediaStore` interface (`backend/src/store/mediaStore.ts`), an `InMemoryMediaStore`
  fake, and the real `S3MediaStore` adapter (`s3MediaStore.ts`) — same relationship as
  `FixtureStore`/`dynamoStore.ts`. Every `MediaRef` now has a real `contentType` and a `versionId`
  PINNED to one exact S3 version — never "latest" — so a later re-upload to the same key can never
  change what an already-approved reference serves. `versionId: null` means a legacy, pre-binding
  reference; `services/media.ts` fails closed (409) for these rather than guessing.
  `fixtures/media.ts`'s `bindSeedMedia` uploads real tiny text/binary bytes (one object deliberately
  given a SECOND, superseded version) and computes genuine SHA-256 from them — closing the old
  all-zero placeholder-checksum gap wherever it runs.
- **Authenticated retrieval.** `GET /records/:recordId/media/:mediaId` (`services/media.ts`,
  wired through `router.ts`/`handler.ts`) runs the identical `evaluatePermission` check as every
  other route, on EVERY fetch — never a presigned URL, never a cached or reusable download
  capability. Enforces a 256 KiB cap from the record's own recorded size before ever calling
  `mediaStore.getObject` (not after buffering), re-verifies the retrieved bytes' SHA-256, and ships
  with `cache-control: private, no-store`.
- **Media-aware, resumable deletion.** `completeDeletion()`'s existing "outstanding custody copies"
  gate (already proven resumable for non-media copies — see the fourth-review-round fixes) now also
  drives a real purge step for media-tracked copies: list every version AND delete marker for the
  copy's exact S3 key, delete every one of them, and reconcile the copy only once a fresh listing
  confirms the key is actually empty — never merely "attempted". A record already gone, a copy
  already reconciled, or a version already deleted are all treated as already-done, not errors — the
  exact tolerance a retry after a partial purge failure needs.
- **Export/restore with media.** `complete-preservation` exports now embed each bound media object's
  real base64 bytes plus safe lifecycle history (`auditReceipts`); `public-redacted` omits media the
  same way it redacts consent evidence. `validateExport` decodes and re-hashes every included media
  object against the record's own declared length/checksum — a mismatch is rejected as tampering,
  closing the byte-level gap the original Finding 5b fix left open (format-only checking). An
  optional `targetMediaStore` on `importExport` re-uploads media into the restore target's OWN store
  and rebinds each reference to the version that upload produced.
- Local: 119 tests pass (up from 86) — `mediaStore.test.ts`, `s3MediaStore.test.ts` (including a
  mocked-client proof of the `ListObjectVersions` pagination loop, which no real-AWS run with only a
  handful of versions would ever force into a second page), `media.test.ts`, plus new cases in
  `lifecycle.test.ts`, `router.test.ts`, `export.test.ts`, `restore.test.ts`.

See "Real S3 media acceptance drill" below for the live-AWS result — **25/25 checks passed** after
one real bug was caught and fixed in the DRILL SCRIPT itself (not the system under test) before it
could falsely report success.

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent); `services/media.ts`'s `GET /records/:id/media/:mediaId` runs the same `evaluatePermission` gate as every other route, local AND real-AWS (see "Real S3 media acceptance drill") | **Demonstrated (local, and real AWS for the media route)** | No actual public page/search surface exists yet — only the export-filtering and the authenticated-staff media-route logic are proven. |
| Sensitivity review and redaction | `FixtureRecord.redactionApplied` field exists | **Not demonstrated** | No redaction workflow or UI built. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts`; `staff-ui/` now reads this data live via the API | **Demonstrated (local); the staff UI reads post-withdrawal state correctly, smoke-tested against real AWS** | No PUBLIC-facing surface reads this data yet (only the staff UI does) — only the state transition, copy-tracking, and staff-facing read path are proven. |
| **Authenticated staff API, Cognito-gated, scoped reads** | `backend/src/api/router.test.ts` (26 cases, local); `backend/src/api/handler.test.ts` (7 cases, request-parsing only, local); real checks against the deployed stack (below and "Real S3 media acceptance drill") | **Demonstrated, local and real AWS, including the three Finding 1-3 fixes and the authenticated media route.** An unauthenticated call returns 401 (confirmed again for the media route specifically, real AWS); a real Cognito-issued ID token succeeds (via `AdminInitiateAuth`, the actual browser OAuth/PKCE flow, and this drill's own scripted auth); a lifecycle action's `requesterCapacity` is correctly attributed to the authenticated caller even when the request body attempts to spoof a different one; record AND media reads are scoped by `evaluatePermission` (full content/bytes only when allowed, a limited metadata view or a denial otherwise); a `requestId` reused across different records/payloads conflicts (409); `completeDeletion` refuses a record with no valid linked, completed deletion request. | Every route was exercised individually, not as a sustained multi-user session. Rate limiting and token refresh/expiry handling are unexercised. The browser-flow verification covers the real OAuth/PKCE mechanics and the actual `auth.js` file's logic executed in a real JS engine, but not literal rendering in an actual browser window (no browser-automation tool is available in this environment) — see the stated residual gap in "Browser-flow verification". |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled; `completeDeletion` requires a linked, completed deletion request (Finding 3); resumes correctly after a partial failure instead of being permanently denied; refuses when custody changes away from `deletion-pending` before the final write instead of deleting anyway; purges every S3 version AND delete marker for media-tracked copies before reconciling them | **Demonstrated, local and real AWS.** Both the partial-failure-recovery and stale-precondition fixes — previously proven locally only — are now confirmed against real DynamoDB (one via a clearly-labeled, deterministic drill-only hook simulating the exact partial-failure state; the other via the real operations in the real order, no hook needed). Media-aware purging is confirmed against real S3, including a delete marker created outside this system's own path. See "Real S3 media acceptance drill". | Real backup-EXPIRY timing specifically (actual DynamoDB PITR lifecycle, actual S3 noncurrent-version 30-day expiration elapsing on its own schedule) is still not exercised — every deletion in every drill so far has been explicit, not timing-based. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` (local); `backend/src/scripts/realBackupRestoreDrill.ts` (real AWS, record-level case); `backend/src/scripts/realGrantRevocationRestoreDrill.ts` (real AWS, grant-level restoration case); `backend/src/scripts/realFullFixtureChecks.ts` (real AWS, live-only concurrency/export cases); `backend/src/scripts/realS3MediaAcceptanceDrill.ts` (real AWS, media bytes carried through export/restore, tamper rejection, positive control) | **Demonstrated, local and real AWS, for the record-level, grant-level, AND media-carrying restoration cases.** The restore drill proves record-level withdrawal+deletion→restore end-to-end against real DynamoDB (passed three times). `realGrantRevocationRestoreDrill.ts` separately proves the grant-level case. `realS3MediaAcceptanceDrill.ts` proves a complete-preservation export actually carries real media bytes, that a tampered copy is rejected by both `validateExport` and `importExport`, that restoring a pre-revocation backup (media included) into an isolated target and reconciling against the LIVE register still denies, and — as a positive control — that an untouched record's restored backup remains servable. `realFullFixtureChecks.ts` additionally proves, against real DynamoDB but with no restoration involved: a concurrent lifecycle-action write is rejected rather than silently clobbering the winner (Finding 2), export excludes expired-consent/disputed-authority records under real `evaluatePermission` (Finding 3), and live grant revocation denies live access (Finding 1's live half). | Each of these real-AWS proofs is still its own isolated case, not a combinatorial sweep (e.g. revocation racing concurrently with a restriction, or export racing a withdrawal, haven't been exercised together). The media-carrying restore used an isolated IN-PROCESS `FixtureStore` target (a fresh real DynamoDB table/backup for the record side is already proven separately by the other two drills) plus a real, separately-prefixed `S3MediaStore` in the same bucket — not a second bucket. Actual TTL-deletion latency (explicit deletion was used throughout, not TTL expiry) is still not exercised. |
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

## Real grant-revocation restore drill — what actually happened

Dated 2026-10-03. `backend/src/scripts/realGrantRevocationRestoreDrill.ts` ran the real T0→T1→T2→T3
sequence a reviewer specifically asked for, against the same deployed stack: seed one record, take
a real `CreateBackupCommand` backup WHILE its grant is still active, revoke ONLY that grant
(`revokeConsentGrant()`) against live data — confirmed the record stayed otherwise fully
publishable (`currentPublicationStatus` stayed `"published"`; nothing withdrawn or deleted) — then
`RestoreTableFromBackupCommand` into a fresh table from the pre-revocation backup, confirmed the
restored grant row showed `revokedAt: null` (genuinely stale, not trivially already-denied), then
ran both `evaluatePermission` and `reconcileRestoredRecords` against the restored store plus the
LIVE (untouched) register.

**Result: PASSED on the first run.** Both checks denied — `evaluatePermission`:
`{ allowed: false, reason: "No active consent grant for purpose \"publication\" and audience
\"public\"." }`; `reconcileRestoredRecords`: `{ servable: false, reason: "No active consent grant
... (regardless of exported state)." }`. This is the actual evidence for the claim the table row
above now makes about grant-level restoration — not inferred from the live-only
`realFullFixtureChecks.ts` run, which was the precise overstatement a reviewer caught.

One more thing caught (by this session, not the reviewer) while writing this script: an early
version logged the restored grant's `revokedAt` via `restoredGrant?.revokedAt ?? "MISSING"`, which
would print "MISSING" for an actually-present `revokedAt: null` (the correct, expected value) just
as readily as for a genuinely absent grant — the same undefined/null confusion as the
`grantAfterRevoke?.revokedAt !== null` bug, just in a log line instead of an assertion. Fixed before
this was ever run for real; the actual sanity check a few lines below it (`restoredGrant ===
undefined || restoredGrant.revokedAt !== null`) always used a correct strict comparison, so this was
a misleading log message, not a false-passing check.

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

## Real staff API smoke test — what actually happened

Dated 2026-10-03. Deployed the new Lambda + HTTP API + Cognito JWT authorizer to the same stack
(`TiroFixtureBackend-drill-20261002`) and manually exercised it against real AWS — not scripted into
a reusable drill (unlike the three above), run by hand via the AWS CLI and PowerShell:

1. Created a synthetic test staff user (`admin-create-user` + `admin-set-user-password`), authenticated
   via `admin-initiate-auth` (`ADMIN_USER_PASSWORD_AUTH` — added to the app client specifically to make
   this kind of scripted check possible without implementing SRP by hand; gated by IAM, never reachable
   from the public internet).
2. `GET /lifecycle-requests` with no `Authorization` header → **401**, confirming the Cognito authorizer
   actually rejects unauthenticated requests (the one real-AWS check that was explicitly pending — see
   the previous revision of this document).
3. The same call with a real ID token → **200**, `{"requests":[]}`, reading the real GSI1-status-index.
4. `GET /records/:id` on a real disputed-authority fixture → full detail bundle (record, control,
   claims, grants, copies, receipts) read correctly from live DynamoDB.
5. `POST /records/:id/permission-check` on the same record → `{"allowed":false,"reason":"Authority
   claim ... is \"disputed\"."}` — the real `evaluatePermission` path, unchanged by any of this.
6. `POST /records/:id/restrict`, with the request body attempting to set `requesterCapacity` to
   `"someone-else-entirely"` → the real response's `requesterCapacity` was
   `"staff:staff-smoke-test@example.invalid"` — the spoofed value was silently ignored, exactly as
   designed (`handler.ts`'s `extractCallerIdentity` never reads the body). The action itself landed
   correctly (`restrictedPurposes: ["model-training"]` on a live table scan afterward).
7. `POST /export` (`public-redacted` scope) against an expired-consent record and a
   since-restricted record → `recordCount: 0`, correctly excluding both.

All seven checks passed. The test user was deleted immediately afterward
(`admin-delete-user`); the one mutated fixture record (step 6) was left in place, same precedent as
every other synthetic fixture mutation in this milestone.

## Real defect-fix verification — what actually happened

Dated 2026-10-03. After redeploying the Lambda with all three fixes, re-checked each against the
live stack (not just the 7 new local tests) via the AWS CLI + a real ID token:

1. **Finding 1 (scoped reads).** `GET /records/:id` with no query params → **400**. The same route
   on the real disputed-authority fixture with `purpose=publication&audience=public` (denied) →
   `access.allowed: false`, no `title` field, no `consentGrants` field, `consentGrantCount: 1` — the
   limited view, confirmed against real DynamoDB data, not a fixture-level approximation.
2. **Finding 2 (idempotency binding).** Seeded two fresh records (A, B). Withdrew A with a given
   `requestId` → 200. Reused that exact `requestId` to "withdraw" B → **409**. A live table scan
   afterward confirmed B's `currentPublicationStatus` was still `"published"` — the reused id never
   touched B, matching the reviewer's exact repro but now caught.
3. **Finding 3 (deletion linkage).** Called `complete-deletion` on record B — which had never gone
   through `startDeletion()` — with a nonexistent `deletionRequestId` → response `status: "denied"`.
   A live table scan afterward confirmed B's primary record still exists and its custody status is
   still `"preserved"` — no silent delete.

All three confirmed. Test artifacts (one seed script, one test Cognito user) were deleted
afterward; the two seeded records and the one withdrawn-by-the-defect-2-check record (A) were left
in place, same precedent as every other synthetic fixture mutation in this milestone.

## Browser-flow verification — what actually happened, and what's honestly not covered

Dated 2026-10-03. The reviewer correctly pointed out the prior smoke test proved CLI-token
(`AdminInitiateAuth`) access, not the actual Hosted-UI → callback → API flow a staff member uses in
a browser. **This environment has no browser-automation tool** (no Playwright, Puppeteer, or
computer-use capability) — a literal "opened Chrome, clicked Sign In, watched the redirect" run was
not possible. Named here rather than worked around quietly. What was done instead, in order of how
closely each step mirrors a real browser:

1. **The real Cognito Hosted UI login form**, fetched and submitted over raw HTTP exactly as a
   browser's form POST would: same session cookies (via a cookie jar), the same `_csrf` token
   scraped from the live-rendered login page, a real PKCE challenge/verifier pair generated the same
   way `auth.js`'s `randomVerifier()`/`challengeFor()` do. Submitting real credentials for a
   synthetic test user to this real, live, server-rendered page returned a real `302` with
   `Location: http://localhost:4300/callback.html?code=<real code>` — the exact URL a browser would
   navigate to next.
2. **The actual, unmodified `staff-ui/auth.js` file** — not a reimplementation of its logic — loaded
   into a real JS engine (Node, via the `vm` module, with only `window`/`sessionStorage` shimmed;
   `crypto`, `fetch`, `TextEncoder`, `URL`/`URLSearchParams`, `btoa`/`atob` are all real, native to
   Node 22, the same APIs a browser provides). Its real `completeSignIn()` function was called with
   `window.location.search` set to the real callback URL's query string and the real PKCE verifier
   pre-stored in the shimmed `sessionStorage` — exactly the state a browser would be in after
   navigating there. It performed a real PKCE token exchange against the live Cognito domain and
   returned without throwing. Its real `apiFetch()` function was then called and returned
   `{"status":200,"body":{"requests":[]}}` from the live deployed API.
3. **The real ID token's claims** were decoded and confirmed: `aud` matches the real app client id,
   `email` matches the test user, `token_use: "id"`, `iss` matches the real deployed user pool —
   confirming `handler.ts`'s `extractCallerIdentity` assumptions hold against a token obtained this
   way, not just via `AdminInitiateAuth`.

**What this does not cover, stated plainly rather than implied away:** `redirectToSignIn()`'s
`window.location.href = ...` assignment (the actual browser navigation away from the staff UI) and
`index.html`/`callback.html`'s DOM rendering (`document.getElementById`, `innerHTML`) were not
exercised under a real browser's navigation stack or HTML parser. Both are standard, low-complexity
browser APIs used in the most ordinary way — low risk — but "not exercised here" is the honest
statement, not "equivalent to a browser." If a literal click-through is required before sign-off,
it needs either a browser-automation tool this environment doesn't have, or a human doing it by
hand (2 minutes, per `staff-ui/README.md`'s setup steps).

Test artifacts (two synthetic Cognito users, one across both this and the smoke-test section) were
created and deleted within this check; no lasting state changes beyond the ordinary fixture
mutations already described.

## Real S3 media acceptance drill — what actually happened

Dated 2026-10-03. `backend/src/scripts/realS3MediaAcceptanceDrill.ts`, run against the redeployed
live stack (`TiroFixtureBackend-drill-20261002`, now with the S3 media IAM/env var changes and the
new `GET /records/:recordId/media/:mediaId` route). **25/25 checks passed** on the corrected run
(see the bug below). What it actually did, in order:

1. Created its own disposable Cognito test user (`AdminCreateUser`/`AdminInitiateAuth`), deleted at
   the end — the staff user and every seeded fixture were left in place, same precedent as every
   other real-AWS check in this project.
2. Seeded three fresh fixtures (active, expired-consent, disputed-authority) with real bound S3
   media via `bindSeedMedia`.
3. **Unauthenticated denial, two ways:** a call to the media route with no `Authorization` header →
   real **401**. A plain, UNSIGNED HTTPS GET straight at the S3 object's bucket URL (no credentials
   at all, bypassing the API/Lambda entirely) → real **403** — proving `BlockPublicAccess` plus no
   bucket policy denies direct access on their own, independent of the application layer.
4. **Permitted retrieval:** an authenticated, authorized fetch returned the exact uploaded bytes —
   their SHA-256 matched the recorded checksum exactly — with `cache-control: private, no-store`.
5. **Denial cases:** the expired-consent record's media, the disputed-authority record's media, and
   a wrong-purpose request against the otherwise-allowed record all returned real **403**s through
   the real route.
6. **No reusable download capability:** fetched the active record's media URL (200), ran a REAL
   `withdraw()` through the REAL API, then re-fetched the EXACT SAME URL string — **403**. Repeated
   the same pattern with a REAL `revokeConsentGrant()` on a separate record — same result. Neither
   case needed a new URL or a cache-bust; the identical saved string simply stopped working.
7. **Export/restore/tamper:** a complete-preservation export taken AFTER a revocation correctly
   contained zero records (export never includes denied content, even under the preservation scope).
   A separate backup taken BEFORE a (then-performed) revocation carried real media bytes (`count:
   2`). Corrupting one object's base64 in that backup made `validateExport` reject it
   (`"...is 32 bytes, but the record declares 80 — possible tampering."`) AND made `importExport`
   throw outright, not just the standalone validator. Restoring the UNTAMPERED pre-revocation backup
   into an isolated in-process target (fresh `FixtureStore` + a real, separately-prefixed
   `S3MediaStore` in the same bucket) and reconciling against the LIVE register still denied —
   `servable: false`, despite the restored copy looking unrevoked. A THIRD, never-touched record's
   backup was restored the same way as a positive control and came back `servable: true` — proving
   reconciliation isn't just unconditionally denying every restore.
8. **Real version/delete-marker inventory and removal:** confirmed `listObjectVersions` saw both of
   a binary object's real pre-existing versions. Then — simulating a delete marker created OUTSIDE
   this system's own path, e.g. a console action or another tool — ran a bare, no-`VersionId`
   `DeleteObjectCommand` directly against S3 on that same key: the real result was a THIRD entry (a
   delete marker), with both original versions' bytes completely untouched — direct, live proof that
   a delete marker never erases anything on its own. Running the real deletion workflow
   (`startDeletion` + `completeDeletion` with the real `mediaStore`) then purged all three entries —
   confirmed by a fresh `listObjectVersions` call showing zero remaining, not just that completion
   reported success.
9. **The two outstanding `completeDeletion` checks, against real DynamoDB:**
   - *Partial-failure recovery.* There is no reliable way to force a real, transient AWS failure
     between the register write and the record-removal write on demand, so this step uses a
     **deterministic, explicitly labeled drill-only hook**: a raw `registerStore.setCurrent()` call,
     bypassing `completeDeletion` entirely, that flips the LIVE register straight to
     `currentCustodyStatus: "deleted"` — recreating exactly the state a real partial failure leaves
     behind, without ever touching the record itself. Confirmed the record was still physically
     present immediately after. Then called the real `completeDeletion()` — it resumed from that
     state and actually finished, confirmed by a subsequent `getRecord()` returning `null`.
   - *Stale-precondition refusal.* No hook needed at all — just the real operations in the real
     vulnerable order: `startDeletion()`, then a REAL `retainForPreservationOnly()`, then
     `completeDeletion()` with the original `deletionRequestId`. Result: `status: "denied"`, and a
     direct DynamoDB `GetItemCommand` (not even going through the service layer) confirmed the
     record was still present with `currentCustodyStatus: "preserved"` — the retention action won,
     exactly as the fix intends.

**One real bug, caught in the drill script itself before it could report a false pass:** the first
run of this drill failed two of the inventory checks. The cause wasn't the system under test — it
was a wrong assumption in the drill: `disputedAuthorityFixture()` (`fixtures/seed.ts`) starts with
an empty `mediaRefs` array, so `bindSeedMedia`'s text-binding branch (guarded by
`mediaRefs.length > 0`) never ran for it, leaving `mediaRefs[0]` as its BINARY ref — which
`bindSeedMedia` deliberately gives a SECOND, superseded version. The check assumed exactly one
pre-existing version and got two. Fixed by correcting the expected counts (2 before the marker, 3
after it includes the marker) rather than changing which object the check uses — the underlying
system behavior was already correct; only the test's expectation was wrong. Re-run: 25/25.

Cleanup: only the drill's own disposable Cognito test user was deleted. Every fixture it seeded
(several more active/expired/disputed/positive-control/partial-failure/stale-precondition records),
the live primary/register tables, and the staff user from the browser-setup task were all left in
place, per this project's standing precedent.

## AWS checks still not run, and the exact commands to finish them

| Check | Command |
| --- | --- |
| Cost reconciliation against actual billing | AWS Cost Explorer / Billing console, compared against `docs/backend/decision-and-cost.md`'s estimate, after the billing alarm's SNS email subscription is confirmed — now with real Lambda/API Gateway/S3 invocations to reconcile too, not just DynamoDB. |
| A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or an export racing a withdrawal) | Not yet scripted — each real-AWS case so far has been checked in isolation; `realFullFixtureChecks.ts` or `realS3MediaAcceptanceDrill.ts` are the places to extend. |
| Script the staff API smoke test into a reusable drill | Currently manual (AWS CLI + PowerShell, not committed as a script) — write a `realStaffApiSmokeTest.ts` mirroring the other drill scripts' structure if this needs to be re-run repeatably rather than by hand. |
| A literal browser click-through of Hosted UI → callback → API | No browser-automation tool is available in this environment. Run `staff-ui/README.md`'s setup (create a user, `npx serve -l 4300 staff-ui`, open `http://localhost:4300/` in a real browser, sign in) by hand — everything server-side and every line of client code it would exercise is already verified for real; see "Browser-flow verification" above for exactly what that does and doesn't cover. |
| Migrating already-live legacy (`versionId: null`) media references | None exist yet from THIS milestone (every reference `bindSeedMedia` touches is bound for real) — but every `MediaRef` seeded in earlier sessions, before version binding existed, is legacy-shaped. They correctly fail closed (409) rather than guess a version; nothing re-uploads/rebinds them automatically. Not attempted — would need a one-off migration script, intentionally not written speculatively. |

~~Inventory S3 object versions after delete~~, ~~real `completeDeletion` resumability/stale-precondition confirmation~~ — **closed, see "Real S3 media acceptance drill" below.**

## Explicitly not built in this pass

- The minimal staging-only staff UI's styling/polish beyond "usable" — it is genuinely minimal by
  design (see `staff-ui/README.md`), not a production admin console.
- Versioned correction and redaction (§3.5/§12's "Correct" action) — no implementation yet.
- Migrating the already-live legacy (`versionId: null`) media references seeded before version
  binding existed — they correctly fail closed, but nothing re-uploads/rebinds them automatically.
- A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or a media purge
  racing an export) — every real-AWS case so far, media included, has been checked in isolation.

Real S3 media/version handling, authenticated retrieval, byte-level checksums, media-aware
deletion, and media-carrying export/restore — all previously listed here as the next slice — are
now DONE; see the S3 media milestone note above and "Real S3 media acceptance drill".

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
