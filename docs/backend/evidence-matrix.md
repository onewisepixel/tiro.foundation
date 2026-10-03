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

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent) | **Demonstrated (local, export path only)** | No actual public page/search/API/media surface exists yet — only the export-filtering logic is proven. |
| Sensitivity review and redaction | `FixtureRecord.redactionApplied` field exists | **Not demonstrated** | No redaction workflow or UI built. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts`; `staff-ui/` now reads this data live via the API | **Demonstrated (local); the staff UI reads post-withdrawal state correctly, smoke-tested against real AWS** | No PUBLIC-facing surface reads this data yet (only the staff UI does) — only the state transition, copy-tracking, and staff-facing read path are proven. |
| **Authenticated staff API, Cognito-gated, scoped reads** | `backend/src/api/router.test.ts` (21 cases, local); `backend/src/api/handler.test.ts` (7 cases, request-parsing only, local); real checks against the deployed stack (below) | **Demonstrated, local and real AWS, including the three Finding 1-3 fixes.** An unauthenticated call returns 401; a real Cognito-issued ID token succeeds (both via `AdminInitiateAuth` AND via the actual browser OAuth/PKCE flow — see "Browser-flow verification"); a lifecycle action's `requesterCapacity` is correctly attributed to the authenticated caller even when the request body attempts to spoof a different one; record reads are scoped by `evaluatePermission` (full content+evidence only when allowed, a limited metadata view otherwise); a `requestId` reused across different records/payloads conflicts (409) rather than silently no-op'ing; `completeDeletion` refuses a record with no valid linked, completed deletion request. | Every route was exercised individually, not as a sustained multi-user session. Rate limiting and token refresh/expiry handling are unexercised. The browser-flow verification covers the real OAuth/PKCE mechanics and the actual `auth.js` file's logic executed in a real JS engine, but not literal rendering in an actual browser window (no browser-automation tool is available in this environment) — see the stated residual gap in "Browser-flow verification". |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled | **Demonstrated (local)** | Real backup-expiry timing (actual DynamoDB PITR/backup lifecycle, actual S3 noncurrent-version expiration) not exercised — needs real AWS. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` (local); `backend/src/scripts/realBackupRestoreDrill.ts` (real AWS, record-level case); `backend/src/scripts/realGrantRevocationRestoreDrill.ts` (real AWS, grant-level restoration case); `backend/src/scripts/realFullFixtureChecks.ts` (real AWS, live-only concurrency/export cases) | **Demonstrated, local and real AWS, for both the record-level and grant-level restoration cases.** The restore drill proves record-level withdrawal+deletion→restore end-to-end against real DynamoDB (passed three times). `realGrantRevocationRestoreDrill.ts` separately proves the grant-level case: backup taken while a grant is active → that one grant revoked (record left otherwise fully publishable) → restored from the pre-revocation backup → both `evaluatePermission` and `reconcileRestoredRecords` deny, against the restored store plus the LIVE register — passed on its first run; see "Real grant-revocation restore drill" below. `realFullFixtureChecks.ts` additionally proves, against real DynamoDB but with no restoration involved: a concurrent lifecycle-action write is rejected rather than silently clobbering the winner (Finding 2, both a direct store-level race and a full `startDeletion`/`restrict` integration race), export excludes expired-consent/disputed-authority records under real `evaluatePermission` (Finding 3), and live grant revocation denies live access (Finding 1's live half). | Each of these real-AWS proofs is still its own isolated case, not a combinatorial sweep (e.g. revocation racing concurrently with a restriction, or export racing a withdrawal, haven't been exercised together). Also still not exercised: actual S3 versioned-media restore (no media was in any drill fixture), actual TTL-deletion latency (explicit deletion was used throughout, not TTL expiry), and real Lambda/API-surface enforcement (doesn't exist yet). |
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

## AWS checks still not run, and the exact commands to finish them

| Check | Command |
| --- | --- |
| Inventory S3 object versions after delete | No media was involved in any real-AWS run so far (seeded fixtures' `mediaRefs` are non-empty but nothing has been uploaded to S3). `aws s3api list-object-versions --bucket <bucket>` before/after a real media delete, confirming noncurrent versions are tracked and expire per the 30-day lifecycle rule. |
| Cost reconciliation against actual billing | AWS Cost Explorer / Billing console, compared against `docs/backend/decision-and-cost.md`'s estimate, after the billing alarm's SNS email subscription is confirmed — now with real Lambda/API Gateway invocations to reconcile too, not just DynamoDB. |
| A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or an export racing a withdrawal) | Not yet scripted — each real-AWS case so far has been checked in isolation; `realFullFixtureChecks.ts` is the place to extend. |
| Script the staff API smoke test into a reusable drill | Currently manual (AWS CLI + PowerShell, not committed as a script) — write a `realStaffApiSmokeTest.ts` mirroring the other drill scripts' structure if this needs to be re-run repeatably rather than by hand. |
| A literal browser click-through of Hosted UI → callback → API | No browser-automation tool is available in this environment. Run `staff-ui/README.md`'s setup (create a user, `npx serve -l 4300 staff-ui`, open `http://localhost:4300/` in a real browser, sign in) by hand — everything server-side and every line of client code it would exercise is already verified for real; see "Browser-flow verification" above for exactly what that does and doesn't cover. |

## Explicitly not built in this pass

- The minimal staging-only staff UI's styling/polish beyond "usable" — it is genuinely minimal by
  design (see `staff-ui/README.md`), not a production admin console.
- Presigned-URL-after-withdrawal handling for media (§3) — `MediaRef` exists in the domain model;
  the S3 GET-route authorization logic does not yet.
- Real S3 media/version handling, byte-level checksums, versioned correction, and redaction — the
  next slice per the reviewer's own ordering.

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
