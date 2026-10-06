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

**2026-10-03, fifth review round — four gaps reproduced against the actual service code with
in-memory stores (not AWS), all fixed, regression-tested, and re-verified live:**

1. **Retention preserved the record but destroyed its media.** `completeDeletion()`'s media-purge
   ran unconditionally and BEFORE the final write's custody-status check — `startDeletion` →
   `retainForPreservationOnly` → `completeDeletion` correctly returned `"denied"`, but every S3
   version was already gone. The ORIGINAL live retention drill used an unbound fixture and
   couldn't have caught this. Fixed: a fresh custody-status read now gates the purge itself before
   anything irreversible runs. `lifecycle.test.ts` adds a regression using real bound media; the
   live drill's retention check was upgraded to use bound media too — see below.
2. **Export had no size budget; retrieval buffered before checking actual size.** Reproduced: a
   7MB export response from repeating one record id 20 times, plus retrieval trusting only its own
   recorded size before fully buffering the real S3 object regardless of actual size. Fixed: a new
   `MediaStore.headObjectSize` (bodyless HEAD, never GetObject) checks the REAL size before ever
   buffering, in both `services/media.ts`'s retrieval route and `exportFixtureSet`; `exportFixtureSet`
   also deduplicates `recordIds` and enforces a new aggregate budget
   (`MAX_EXPORT_AGGREGATE_MEDIA_BYTES`, 5 MiB) across a whole export call, skipping (not silently
   dropping) anything that would exceed either the per-object or aggregate limit.
3. **Restore dropped audit history.** `importExport` never wrote `auditReceipts` — a restored
   store always showed zero despite the export carrying them. Fixed: `importExport` writes them,
   and `InMemoryFixtureStore.putAuditReceipt` (the one entity-put in that file not already
   upsert-by-id) now dedupes by `receiptId` for safe replay.
4. **Removing packaged media still passed validation.** Emptying `mediaObjects` to `[]` on a
   complete-preservation package still validated and imported, since `validateExport` only checked
   objects that WERE present. Fixed: every version-bound `MediaRef` must now be accounted for in
   either `mediaObjects` or `mediaObjectsSkipped` — unaccounted gaps are rejected outright.
   Honestly-skipped media gets its restored `versionId` cleared to `null` so a later fetch fails
   closed instead of 404ing confusingly.

127 tests pass (up from 119). The live drill was redeployed and extended — see "Real S3 media
acceptance drill" below for the full, updated **29/29** result, including direct confirmation that
retained media survives a denial and that restored audit receipts/media bytes actually persist.

**2026-10-04, sixth review round — two residual gaps in the fifth round's fixes, both CLOSED (not
narrowed-and-documented), regression-tested, and re-verified against real DynamoDB/S3/Lambda:**

1. **Retention could still succeed immediately before media destruction.** A reviewer
   deterministically proved the fifth round's bare-read guard never actually claimed anything:
   inserting retention right after the read let retention win the register while the purge —
   already past its one-time check — destroyed the media anyway. Fixed with genuine mutual
   exclusion: `completeDeletion` claims the purge via a CONDITIONAL WRITE (a new `mediaPurgeClaim`
   field on `RestrictionRegisterEntry`), and `retainForPreservationOnly` itself now refuses while
   that claim is active. Whichever write lands first in DynamoDB wins; the loser denies or is
   refused — never both proceeding. A new `MediaPurgeInProgressError` maps to 409.
2. **The export budget measured raw bytes; Lambda's real limit is on the serialized response.**
   20 distinct, individually-authorized, individually-under-cap records fit the raw-byte budget but
   produced 7MB+ of serialized JSON (base64 inflates by ~4/3; the old budget never accounted for
   that or for JSON structural overhead) — over Lambda's real, hard 6 MB synchronous response
   limit. Fixed: `MAX_EXPORT_RESPONSE_BYTES` now budgets the ACTUAL serialized contribution
   (base64 length, computed from a HEAD-only size before fetching, plus a conservative per-object
   JSON-overhead estimate), still bounded-read throughout.

131 tests pass (up from 127). The live drill now includes a real-DynamoDB interleaving check (the
same deterministic-hook pattern as the regression test, wrapping the real
`DynamoRestrictionRegisterStore`) confirming the race is caught by a genuine `VersionConflictError`,
and a check that seeds 20 real 256 KiB S3 objects and calls the real deployed `/export` route
directly, confirming the real response (4,946,321 bytes) stays under Lambda's 6 MB limit — down
from the 7,035,395 bytes the unfixed budget produced. **34/34 checks passed.** See "Real S3 media
acceptance drill" below.

**2026-10-04, versioned correction and redaction milestone — §12's "Correct" action and §3.5's
redaction tooling, scoped to what this backend can actually do:**

- **Versioned correction.** New `Correction` entity + `correctRecord()`/`disputeCorrection()`
  (`services/lifecycle.ts`). Replaces the live `title`/`summary`/`provenanceRef` field immediately
  while PRESERVING the previous value permanently in history — never erased. A later dispute marks
  the correction `"disputed"` WITHOUT reverting it.
- **Redaction.** New `Redaction` entity (`scope: "text" | "media"`) + `redactText()`/
  `redactMedia()`. Text redaction masks the field with `"[REDACTED]"` while preserving the original
  only in history, never served through `GET /records/:recordId`, even to a fully authorized
  caller. Media redaction adds the mediaId to a new `redactedMediaIds` register field, checked by
  `evaluatePermission` (now takes an optional `mediaId`) as a HARD override independent of purpose/
  audience. Underlying S3 bytes are never touched — redaction is not deletion.
- **Export/restore.** `complete-preservation` exports carry the real pre-redaction text and full
  correction history (custody there is authorized to hold the complete archival record);
  `public-redacted` exports omit it, reusing the identical `"redacted-for-public-export"` sentinel
  already used for consent evidence and media.
- **API.** Four new routes (`correct`, `dispute-correction`, `redact-text`, `redact-media`) — the
  existing `/records/{recordId}/{action}` wildcard route already covered them, so only a Lambda
  code redeploy was needed, no infra change. `GET /records/:id` now includes full `corrections`
  and metadata-only `redactions` (never the original) in both view branches.

150 tests pass (up from 131). See "Real correction/redaction drill" below for the live-AWS
result — **19/19 checks passed on the first real run.**

**2026-10-04, seventh review round — five gaps reproduced as deterministic LOCAL reproductions
against the actual service code (not fresh AWS runs), all fixed, regression-tested, and re-verified
against real DynamoDB/S3/Lambda:**

1. **Correction history bypassed text redaction.** Correcting a field and then redacting that SAME
   field left `[REDACTED]` on the live value but the correction's historical `previousValue`/
   `correctedValue` for that field fully readable through `GET /records/:id`'s `corrections` and
   through public exports — a complete end-run around the redaction. Root cause: masking was
   enforced only on the live field, never on history for the same field. Fixed by a new shared
   module, `services/redactionView.ts`, whose `maskCorrectionsForRedactedFields` masks a
   correction's historical values for any field the CURRENT register lists as redacted — wired into
   both `router.ts`'s `GET /records/:id` (unconditionally, live reads never see unredacted history)
   and `export.ts` (only for `public-redacted` scope; `complete-preservation` keeps the full
   archival history, the same exemption `Redaction.previousValue` already has for that scope).
   `router.test.ts`, `export.test.ts`.
2. **Restoration revived redacted text.** Text redaction had NO durable, register-level control
   state — unlike media redaction's `redactedMediaIds` — so it lived only in the primary
   `FixtureStore` (the live field + a `Redaction` row), the one place a restored backup can
   silently resurrect it. Reproduced exactly: export before redaction, redact the source, restore
   that pre-redaction backup — the live register was untouched (correctly still "allowed"), but the
   served field reverted to the pre-redaction original despite that. Fixed by adding
   `redactedTextFields` to `RestrictionRegisterEntry`, written by `redactText()` the same way
   `redactedMediaIds` already is, and enforcing it at serve time via
   `redactionView.ts`'s `applyTextRedactions` — reading the CURRENT register, never the record's
   own (restorable) stored value — wired into both `router.ts` and `export.ts` (for BOTH export
   scopes; the live field is always masked once redacted, same as media). `restore.test.ts`,
   `export.test.ts`.
3. **A failed history write permanently lost originals.** `correctRecord()`/`redactText()` wrote the
   changed field and its history row as two SEPARATE writes; a failure in between (or a retry after
   full success) could lose the true original or corrupt history with the already-changed live
   value. Fixed with genuine atomicity: new `FixtureStore.putRecordWithCorrection`/
   `putRecordWithRedaction` methods — a real `TransactWriteItems` in DynamoDB, a single
   non-overridable mutation in the in-memory fake — commit the field change and its history row
   together or not at all. Combined with stable, `requestId`-derived history-row ids (not a fresh
   `uuidv7()` per attempt) and an "already applied" existence guard, a retry after a failure is a
   safe resume and a retry after full success is a safe no-op, never a second, corrupting write.
   `lifecycle.test.ts` (new atomicity regression tests for both `correctRecord` and `redactText`,
   injecting one history-write failure then retrying — the exact repro).
4. **The purge claim's lifetime and recovery were incomplete.** Two distinct bugs in
   `completeDeletion()`'s media-purge claim: (a) the claim was released in a `finally` block
   immediately after the purge attempt, BEFORE the final commit — reopening the exact race the
   claim exists to prevent, just moved later: retention could win the register in that now-
   unprotected window, after the media was already destroyed, leaving "preserved" custody with zero
   media versions. (b) the claim check never compared ownership, so a retry of the SAME completion
   under the SAME `requestId` (resuming after an earlier partial failure) was wrongly refused as a
   foreign conflict. Fixed: the claim is now held CONTINUOUSLY from claim-time through the FINAL
   write, released only as part of that write (success) or in the deny/abandon branch (never as a
   separate step with its own failure window); the claim check now compares
   `mediaPurgeClaim.requestId` against the caller's own — a different requestId still refuses, the
   SAME requestId resumes. `lifecycle.test.ts` (a real `InterleavingRegisterStore` race landing
   retention in the exact post-purge, pre-commit window; a simulated stuck-claim resumption test).
5. **The response budget excluded text/history.** The previous round's export budget measured only
   media's serialized contribution; 20 records with larger TEXT fields and no media produced
   9,032,712 serialized bytes, over Lambda's real 6 MiB synchronous response limit, because nothing
   budgeted title/summary/corrections/redactions/history. Fixed: `exportFixtureSet` now builds each
   record's COMPLETE envelope, measures its REAL serialized size
   (`Buffer.byteLength(JSON.stringify(envelope), "utf8")`), and tracks a running total across the
   WHOLE response — excluding the ENTIRE record (not just trimming media) if it would cross
   `MAX_EXPORT_RESPONSE_BYTES`, reported in a new `recordsSkippedForResponseBudget` field (never
   silently dropped, same pattern as `mediaObjectsSkipped`; also carried losslessly through the
   JSONL `toJsonl`/`fromJsonl` round-trip). `export.test.ts` (twenty records with large text fields
   and no media, reproducing the reviewer's exact byte count before the fix).

**158 tests pass (up from 150).** Both live drills were extended and re-run against the redeployed
stack: `realS3MediaAcceptanceDrill.ts` (Finding 4, the claim's ownership-based resumption) —
**36/36 checks passed**; `realCorrectionRedactionDrill.ts` (Findings 1, 2, 3, and the API-shape half
of Finding 5) — **32/32 checks passed**. See "Real S3 media acceptance drill" and "Real correction/
redaction drill" below for exactly what each ran, including an honestly-named limitation: forcing
Finding 5's actual whole-response TEXT exclusion live (the reviewer's full 9 MB+, 20-record scale)
was attempted and abandoned after every attempt tried observably hit a real
`ProvisionedThroughputExceededException`, confirmed directly against CloudWatch metrics and Lambda
logs — including on a single ~395 KB strongly-consistent read. **That is an observed result from
these specific attempts, not proof a single large read is categorically impossible at this
table's provisioned 5 RCU/s** — AWS documents that provisioned-capacity tables can draw on burst
capacity beyond the nominal rate, so a different attempt or timing could plausibly succeed. That
exact scale stays proven byte-for-byte by the deterministic local test instead, same as several
other real-infra ceilings already named plainly elsewhere in this document (TTL-deletion timing,
no browser-automation tool).

**2026-10-04, eighth review round — four more gaps reproduced as deterministic LOCAL reproductions
against the actual service code (not fresh AWS runs), all fixed, regression-tested, and
re-verified against real DynamoDB/S3/Lambda:**

1. **Concurrent corrections silently lost an edit.** `FixtureRecord.version` never actually
   advanced: `correctRecord()`/`redactText()`/`redactMedia()`/`revokeConsentGrant()` all constructed
   their updated object by spreading a freshly-read copy without ever incrementing `.version`, so
   the conditional-write check in `putRecord`/`putRecordWithCorrection`/`putRecordWithRedaction`/
   `putConsentGrant` compared `expectedVersion` against a value that could never change. Two
   concurrent corrections both reading version N would both pass that check and both "succeed," the
   second silently clobbering the first — reproduced exactly: both read version 0, both completed,
   the second write overwrote the first. Fixed by making the STORE itself (not the caller) the sole
   authority over the persisted version — every write now stores `expectedVersion + 1` (or `1` for
   a first write), ignoring whatever stale value the caller's object carries. Closes the bug
   structurally for every current AND future caller, not just the ones caught this round.
   `lifecycle.test.ts` (a deterministic two-writer race via a new `InterleavingFixtureStore`),
   confirmed live against real DynamoDB's own `ConditionExpression`.
2. **A retry could still destroy the original history value.** The "already applied" guard in
   `correctRecord()`/`redactText()`/`redactMedia()` used a query-style lookup
   (`listCorrections(...).some(...)`) that, on the real adapter, is an eventually consistent read —
   DynamoDB's default reads can lag a recent write by a short, unbounded window. A retry landing in
   that window (e.g. after the transaction succeeded but request completion failed) could see a
   false "not applied," re-read the ALREADY-corrected live value, and overwrite the existing history
   row with that value as a fake "previous" one — permanently losing the true original. Stable,
   requestId-derived history ids alone don't prevent this. Fixed two ways: (a) new
   `FixtureStore.getCorrection`/`getRedaction` methods do a strongly consistent lookup by the EXACT
   id (a real DynamoDB `GetItem` with `ConsistentRead: true`, never a query/scan) — closing the
   common case; (b) the history row's own write inside `putRecordWithCorrection`/
   `putRecordWithRedaction` is now ALSO conditional on that id not already existing
   (`attribute_not_exists(PK)` inside the same `TransactWriteItems`), throwing a new
   `AlreadyAppliedError` the caller treats as a safe no-op — the actual, unconditional guard even if
   the pre-check is somehow still wrong. `lifecycle.test.ts` (a `LyingAboutExistingHistoryFixtureStore`
   that deliberately simulates a stale pre-check), confirmed live against real DynamoDB's own
   `TransactWriteItems` `CancellationReasons`.
3. **Retention could overwrite a deleted tombstone.** `retainForPreservationOnly()` checked only
   whether a media-purge claim was active — never the record's actual custody status — so
   retention landing immediately after `completeDeletion`'s final write (which clears the claim as
   part of that SAME write, once the purge is done) could still flip an already-"deleted" tombstone
   back to `"preserved"`, even though the record and its media were genuinely gone. Reproduced
   exactly: retention inserted right after deletion's final register write cleared the purge claim;
   both actions reported completion; the register ended at `"preserved"` with the record and media
   gone. Fixed by rejecting `currentCustodyStatus === "deleted"` outright (a new, terminal
   `StaleCustodyStatusError` → `denyRequest`, not a retryable failure) — covering both a fully
   completed deletion AND the narrower window during deletion recovery where the register already
   reads `"deleted"` but the physical record-removal write hasn't landed yet. `lifecycle.test.ts`
   (both the fully-deleted and mid-recovery cases), confirmed live by running a real deletion to
   completion and then calling real `retainForPreservationOnly()` immediately after.
4. **The export budget still missed Lambda's real response encoding.** The previous round's budget
   measured this export object's OWN single `JSON.stringify` length — not what `api/handler.ts`
   actually returns. The real Lambda response is
   `{statusCode, headers, body: JSON.stringify(exportResult)}`, itself JSON-stringified ONE more
   time to become the actual transmitted bytes — meaning the already-JSON `body` gets embedded as a
   STRING VALUE, and every quote/backslash in it is escaped again. Records whose text happened to be
   rich in quotes/backslashes measured safely under budget by one encoding (4,935,651 bytes) but
   nearly DOUBLED once actually wrapped this way (9,852,931 bytes); ordinary text inflates far less,
   so a fixed multiplier would be the wrong fix either way. Fixed by measuring the REAL cost of that
   eventual re-escaping directly (`responseEncodedByteLength`, exploiting that JSON string-escaping
   is additive over concatenation, so a running per-record total is exact, not an estimate) —
   applied to each record's envelope AND to the `recordsSkippedForResponseBudget` entries
   themselves, so the skip-list's own growth counts against later records' remaining budget too.
   `export.test.ts` (quote-heavy records that measure safely under a single encoding but exceed
   Lambda's real limit once wrapped exactly as `handler.ts` wraps it — the exact reviewer
   reproduction).

**164 tests pass (up from 158).** Both live drills were extended and re-run against the redeployed
stack: `realCorrectionRedactionDrill.ts` (Findings 1 and 2, exercising the real adapter's
`ConditionExpression` and `TransactWriteItems` `CancellationReasons` directly) — **38/38 checks
passed**; `realS3MediaAcceptanceDrill.ts` (Finding 3, the tombstone-overwrite repro run to
completion against real DynamoDB and real S3) — **41/41 checks passed**. Finding 4 was not
re-attempted live beyond what the seventh round already confirmed (the API shape) — per explicit
instruction, this shared table's provisioned capacity stays unchanged, and the observed-throttling
caveat above applies here too, unchanged.

**2026-10-04, ninth review round — one residual export-budget gap with two reproducible paths,
neither about any one record's content, both fixed, regression-tested, and re-verified against
real DynamoDB/Lambda:**

- **The manifest still got a fixed, optimistic allowance.** `fixtureSetId` is caller-supplied with
  no length limit, and the manifest embeds it verbatim — 20 ordinary records plus a 2 MiB
  `fixtureSetId` produced a real 7,026,838-byte response, because the manifest's budget
  contribution was a flat guess that assumed it was always small. Fixed two ways: a new
  `MAX_FIXTURE_SET_ID_LENGTH` (256 characters) is enforced at the API boundary
  (`validation.ts`) AND defensively inside `exportFixtureSet` itself for callers that bypass it;
  and the running budget total is now seeded from the manifest's REAL encoded size
  (`responseEncodedByteLength`, the same exact-cost measurement the second round introduced), not
  a fixed constant.
- **Skipped-record entries were counted but appended unconditionally.** 8,000 requested records
  (903 included, 7,097 individually skipped-for-budget) produced a real 7,291,455-byte response —
  each skip entry's own cost WAS being counted against the running total, but entries kept being
  appended no matter how large the skip list itself grew, so the report meant to document the
  overage became a second, unbounded source of it. Fixed two ways: a new `MAX_EXPORT_RECORD_IDS`
  (2,000 ids) bounds the batch size at the API boundary AND inside `exportFixtureSet` itself; and
  the loop now checks, BEFORE appending a skip entry, whether even that one more entry would itself
  exceed the budget — if so, processing stops there and a new `recordsNotProcessed: {reason,
  count}` field honestly reports how many requested ids were never evaluated at all, rather than
  growing the skip list past the same limit it exists to enforce.
- **A final, outermost guard.** `api/router.ts`'s `/export` route now computes the REAL wrapped
  response size — replicating exactly what `api/handler.ts`'s Lambda response wrapping produces —
  immediately before returning, and answers `413 Payload Too Large` with a small, honest body if
  it would still exceed Lambda's hard limit despite everything above. Every other mechanism is
  meant to keep this from ever firing; it exists for whatever edge case still gets through.

168 tests pass (up from 164): `export.test.ts` (the exact `fixtureSetId`-length and batch-size
reproductions, both via direct `exportFixtureSet` calls and confirming `recordsNotProcessed`
engages correctly for a smaller-scale, same-structure reproduction within the new batch cap) and
`router.test.ts` (both rejected with a real 400 at the API boundary). `realCorrectionRedactionDrill.ts`
was extended and re-run against the redeployed stack: the real deployed API rejects both an
oversized `fixtureSetId` and an oversized batch with 400, before any record is even looked at —
**40/40 checks passed**. Per explicit instruction, this shared table's provisioned capacity was
left unchanged; these two fixes make the deployed API do LESS work on bad input, not more, so
confirming them live needed no capacity change and no RCU of its own.

| §6.1 requirement | Test / artifact | Result | Gap |
| --- | --- | --- | --- |
| Applicable authority/capacity evidence | `permissions.test.ts`: disputed authority denies; unverified signer capacity denies | **Demonstrated (local)** | None at logic level. Real evidence capture (actual review workflow) not built. |
| Scoped permission checks | `permissions.test.ts`: 10 cases — wrong purpose, wrong audience, expired, disputed, unverified capacity, missing control state, staff-role-is-not-a-grant | **Demonstrated (local)** | None at logic level. |
| Restricted records absent from public pages, search, API, and media | `export.ts`'s `public-redacted` scope omits non-published records entirely (not redacted — absent); `services/media.ts`'s `GET /records/:id/media/:mediaId` runs the same `evaluatePermission` gate as every other route, local AND real-AWS (see "Real S3 media acceptance drill") | **Demonstrated (local, and real AWS for the media route)** | No actual public page/search surface exists yet — only the export-filtering and the authenticated-staff media-route logic are proven. |
| Sensitivity review and redaction | `redactText()`/`redactMedia()` (`services/lifecycle.ts`), `services/redactionView.ts`'s register-driven masking, local (`lifecycle.test.ts`, `router.test.ts`, `export.test.ts`, `restore.test.ts`) and real AWS (`realCorrectionRedactionDrill.ts`) | **Demonstrated, local and real AWS, for text masking (now restore-proof and history-aware) and a hard media-access override.** Text redaction masks the field and preserves the original only in history. A seventh-round reviewer caught two bypasses: a correction on the same field left its historical values unmasked, and restoring a pre-redaction backup revived the served text despite the live register still listing it redacted. Both closed — masking is now enforced from the CURRENT register state, never the record's own (restorable) content, for both the live field AND its correction history, confirmed live: correcting then redacting the same field masks its history through the real API; restoring a real pre-redaction backup into the live primary table still serves `[REDACTED]`, confirmed against the real, unchanged register. Media redaction denies the exact mediaId through `evaluatePermission`'s hard override, confirmed against the real media route, while a different object on the same record stays fetchable and the redacted object's real S3 bytes stay untouched. | No actual image/audio/video content processing (blur/bleep/crop) — this backend masks TEXT and denies MEDIA ACCESS, never alters media bytes, honestly short of real redaction tooling that needs media-processing infrastructure this project doesn't have. |
| Versioned correction with preserved history | `correctRecord()`/`disputeCorrection()` (`services/lifecycle.ts`), local and real AWS (`realCorrectionRedactionDrill.ts`) | **Demonstrated, local and real AWS.** A correction replaces the live field immediately while preserving the previous value permanently in `Correction` history, confirmed against the real deployed API; a later dispute marks the correction `"disputed"` without reverting it, confirmed live. The combinatorial case this row previously named as unexercised — a correction racing a redaction on the same field — is now exercised (see "Sensitivity review and redaction" above): the field change and its history row commit atomically (`putRecordWithCorrection`, a real DynamoDB `TransactWriteItems`), closing a reviewer-caught gap where a failed history write could lose the true original. An eighth-round reviewer caught two deeper gaps in that same machinery: the stored version never actually advanced, so two genuinely concurrent corrections could both "succeed" with the second silently clobbering the first (fixed by making the store itself own the persisted version); and a retry's "already applied" guard used a query that, on the real adapter, is eventually consistent and could miss a just-committed correction, letting a retry corrupt history with an already-changed value as a fake "previous" one (fixed with a strongly consistent by-id lookup AND a conditional history write that rejects a duplicate id outright, confirmed against real DynamoDB's own `ConditionExpression`/`TransactWriteItems` `CancellationReasons`). | A broader combinatorial sweep (e.g. a correction racing a DIFFERENT record's redaction, or racing a concurrent withdrawal) still hasn't been exercised — only the same-field case and the version-race/stale-pre-check cases reviewers have specifically named so far. |
| Withdrawal across dependent views/copies | `lifecycle.ts withdraw()` + `CustodyCopy.reconciledAt` tracking; `lifecycle.test.ts`; `staff-ui/` now reads this data live via the API | **Demonstrated (local); the staff UI reads post-withdrawal state correctly, smoke-tested against real AWS** | No PUBLIC-facing surface reads this data yet (only the staff UI does) — only the state transition, copy-tracking, and staff-facing read path are proven. |
| **Authenticated staff API, Cognito-gated, scoped reads** | `backend/src/api/router.test.ts` (33 cases, local); `backend/src/api/handler.test.ts` (7 cases, request-parsing only, local); real checks against the deployed stack (below and "Real S3 media acceptance drill") | **Demonstrated, local and real AWS, including the three Finding 1-3 fixes and the authenticated media route.** An unauthenticated call returns 401 (confirmed again for the media route specifically, real AWS); a real Cognito-issued ID token succeeds (via `AdminInitiateAuth`, the actual browser OAuth/PKCE flow, and this drill's own scripted auth); a lifecycle action's `requesterCapacity` is correctly attributed to the authenticated caller even when the request body attempts to spoof a different one; record AND media reads are scoped by `evaluatePermission` (full content/bytes only when allowed, a limited metadata view or a denial otherwise); a `requestId` reused across different records/payloads conflicts (409); `completeDeletion` refuses a record with no valid linked, completed deletion request. | Every route was exercised individually, not as a sustained multi-user session. Rate limiting and token refresh/expiry handling are unexercised. The browser-flow verification covers the real OAuth/PKCE mechanics and the actual `auth.js` file's logic executed in a real JS engine, but not literal rendering in an actual browser window (no browser-automation tool is available in this environment) — see the stated residual gap in "Browser-flow verification". |
| Deletion and backup expiry | `lifecycle.test.ts`: deletion stays `deletion-pending` until all custody copies reconciled; `completeDeletion` requires a linked, completed deletion request (Finding 3); resumes correctly after a partial failure instead of being permanently denied; refuses when custody changes away from `deletion-pending` before the final write instead of deleting anyway; purges every S3 version AND delete marker for media-tracked copies before reconciling them; the media-purge claim is held continuously through the final commit and resumed (never refused) by its own `requestId`; `retainForPreservationOnly` rejects an already-`"deleted"` custody status outright | **Demonstrated, local and real AWS.** The partial-failure-recovery, stale-precondition, and claim-lifetime/ownership fixes are all confirmed against real DynamoDB. A seventh-round reviewer caught that the claim was released too early (reopening the exact race it exists to prevent — retention could win after the media was already purged) and that a resumed completion under its OWN `requestId` was wrongly refused as foreign; both closed and confirmed live. An eighth-round reviewer caught a further gap in the same area: retention checked only the media-purge claim, never custody status itself, so retention immediately after a completed deletion (which clears the claim as part of its own final write) could flip an already-deleted tombstone back to `"preserved"` — reproduced exactly and closed by rejecting `"deleted"` custody outright, confirmed live by running a real deletion to completion and then calling real `retainForPreservationOnly()` immediately after: denied, the real register still read `"deleted"`, and the real purged S3 media stayed purged. Media-aware purging is confirmed against real S3, including a delete marker created outside this system's own path. See "Real S3 media acceptance drill". | Real backup-EXPIRY timing specifically (actual DynamoDB PITR lifecycle, actual S3 noncurrent-version 30-day expiration elapsing on its own schedule) is still not exercised — every deletion in every drill so far has been explicit, not timing-based. |
| **Full preservation export and successful restoration without reviving revoked access** | `restore.test.ts` (local); `backend/src/scripts/realBackupRestoreDrill.ts` (real AWS, record-level case); `backend/src/scripts/realGrantRevocationRestoreDrill.ts` (real AWS, grant-level restoration case); `backend/src/scripts/realFullFixtureChecks.ts` (real AWS, live-only concurrency/export cases); `backend/src/scripts/realS3MediaAcceptanceDrill.ts` (real AWS, media bytes carried through export/restore, tamper rejection, positive control) | **Demonstrated, local and real AWS, for the record-level, grant-level, AND media-carrying restoration cases.** The restore drill proves record-level withdrawal+deletion→restore end-to-end against real DynamoDB (passed three times). `realGrantRevocationRestoreDrill.ts` separately proves the grant-level case. `realS3MediaAcceptanceDrill.ts` proves a complete-preservation export actually carries real media bytes, that a tampered copy is rejected by both `validateExport` and `importExport`, that restoring a pre-revocation backup (media included) into an isolated target and reconciling against the LIVE register still denies, and — as a positive control — that an untouched record's restored backup remains servable. `realFullFixtureChecks.ts` additionally proves, against real DynamoDB but with no restoration involved: a concurrent lifecycle-action write is rejected rather than silently clobbering the winner (Finding 2), export excludes expired-consent/disputed-authority records under real `evaluatePermission` (Finding 3), and live grant revocation denies live access (Finding 1's live half). A seventh-round reviewer caught that restoring a backup taken BEFORE a text redaction could revive the pre-redaction text through export too (not just the live read) — closed by the same register-driven masking as the live route; `export.test.ts`/`restore.test.ts` locally, confirmed live in `realCorrectionRedactionDrill.ts`. The export response budget also now covers the WHOLE serialized envelope (title/summary/corrections/redactions/history), not just media — a whole record is excluded (`recordsSkippedForResponseBudget`), never trimmed, if it would cross the limit; proven byte-for-byte locally (`export.test.ts`, the reviewer's exact 9,032,712-byte, 20-record reproduction) and confirmed live that the real deployed API's response actually carries the new field. An eighth-round reviewer caught that this budget still measured only the export object's own single encoding, not what `api/handler.ts` actually returns (the body gets embedded as a STRING inside the Lambda response wrapper and re-escaped) — content rich in quotes/backslashes could measure safely under budget (4,935,651 bytes) yet nearly double once really wrapped (9,852,931 bytes); fixed by measuring that real re-escaped cost directly, proven locally (`export.test.ts`'s quote-heavy reproduction). A ninth-round reviewer caught two further gaps neither about any one record's content: an unbounded `fixtureSetId` could alone blow the manifest's budget (fixed with a length cap, enforced both at the API boundary and defensively inside `exportFixtureSet`, plus budgeting the manifest's REAL size instead of a fixed guess), and an oversized batch could make the skip-for-budget REPORT itself a second, unbounded source of the same overage (fixed with a batch-size cap AND a loop that stops — reporting `recordsNotProcessed` honestly — the moment even one more skip entry would itself exceed budget). A final, outermost guard in `router.ts` now also answers a real `413` if the complete wrapped response would still exceed Lambda's hard limit despite all of the above. Both new input caps are confirmed live, rejected with a real 400 at the real deployed API, before any record is even looked at. | Each of these real-AWS proofs is still its own isolated case, not a combinatorial sweep (e.g. revocation racing concurrently with a restriction, or export racing a withdrawal, haven't been exercised together). The media-carrying restore used an isolated IN-PROCESS `FixtureStore` target (a fresh real DynamoDB table/backup for the record side is already proven separately by the other two drills) plus a real, separately-prefixed `S3MediaStore` in the same bucket — not a second bucket. Actual TTL-deletion latency (explicit deletion was used throughout, not TTL expiry) is still not exercised. The export-budget's actual whole-response TEXT exclusion (as opposed to the field merely existing) was NOT independently re-forced live — attempted at several scales, and every attempt tried observably throttled against this fixture stack's deliberately tiny, always-free-tier DynamoDB provisioning (an OBSERVED result, not proof it's categorically impossible at 5 RCU/s — AWS documents burst capacity beyond the nominal rate); see "Real correction/redaction drill" below for the measured evidence, and the explicit instruction to leave this shared table's capacity unchanged. |
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

Dated 2026-10-03, extended 2026-10-04. `backend/src/scripts/realFullFixtureChecks.ts`, run against
the same deployed stack (`TiroFixtureBackend-drill-20261002`), seeded the FULL four-fixture set
(`active`, expired-consent, disputed-authority, preservation-only — not just the one `active` case
the restore drill uses) and ran 13 checks against real DynamoDB. **All 13 passed:**

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

### Combinatorial cases added 2026-10-04, corrected 2026-10-05 — operational-readiness review

Two additional races, each defining the expected outcome for EITHER possible ordering (not just
"a race exists").

**Reviewer-caught finding (2026-10-05): the original "revocation racing restriction" check
REJECTED a valid outcome.** It required exactly one of the two real `revokeConsentGrant()`/
`restrict()` calls to be rejected — but that is not actually guaranteed: each call does its OWN
independent `transitionControl` read-then-write round trip, and if one call's full round trip
completes before the other's read even happens, DynamoDB never sees two writes sharing a stale
version at all — both calls genuinely succeed, serialized cleanly, with no conflict to retry. A
reviewer forced that exact ordering and got both changes landing with nothing rejected, which the
drill then wrongly reported as a failure. Separately, the retry step used a BRAND-NEW requestId for
the loser instead of the original one — this system's actual retry contract
(`services/lifecycle.ts`'s `getOrCreateRequest`) is resumption BY THE SAME requestId; a fresh id
abandons the original `LifecycleRequest` permanently `"in-progress"` instead of ever completing it.

Fixed with four checks instead of two:

- **Forced shared-version conflict (NEW, deterministic).** Mirrors Finding 2a's technique exactly:
  both candidate register writes are computed from the SAME captured `expectedVersion`, so one is
  GUARANTEED to lose to a real DynamoDB `ConditionExpression` regardless of timing. This is what
  actually proves the compare-and-swap rejects a stale write for this pair of fields — it doesn't
  depend on how two independent service calls happen to interleave.
- **Real service-level race, timing-dependent — EITHER outcome now accepted.** The two real calls
  fire concurrently via `Promise.allSettled`; the check now passes on EITHER a genuine conflict (one
  rejected, retryable) OR both calls serializing cleanly (both fulfilled, no retry needed) — both
  are valid, safe outcomes, never conflated as a failure.
- **Convergence after resolving any conflict.** Whichever outcome actually occurred, the register
  must hold BOTH `revokedConsentIds` containing the raced consent id AND `restrictedPurposes`
  containing `"research"` afterward — confirmed live.
- **Retry resumption (NEW).** When there WAS a genuine conflict, retrying the loser with its
  ORIGINAL requestId must resume and complete that same `LifecycleRequest` (`status: "completed"`),
  never leave it stuck `"in-progress"` forever. Confirmed live.

**A second, genuinely new production bug was caught by the forced-conflict check above, not by
anything previously in this project:** DynamoDB's `TransactWriteItems` can cancel a transaction with
cancellation reason `"TransactionConflict"` — raised when another transaction is simultaneously
touching the same item — WITHOUT ever evaluating the `ConditionExpression` at all. This is the
SAME situation as a condition mismatch (someone else's concurrent write intervened; retry), but
`dynamoStore.ts`'s `isConditionalFailure` helper only recognized the `"ConditionalCheckFailed"`
reason code, so a `TransactionConflict` cancellation propagated as a raw, unmapped
`TransactionCanceledException` instead of the `VersionConflictError` every caller in
`services/lifecycle.ts` actually checks for — misreporting a genuine, retryable race loss as
"Unexpected error applying lifecycle action." Fixed by recognizing both cancellation reason codes
as equivalent. The forced-conflict check above is exactly the kind of test that catches this —
hitting the same item from two simultaneous `TransactWriteItems` calls is far more likely to
surface `TransactionConflict` than the timing-dependent service-level race is, which is why this
had never been observed before now.

- **Export racing withdrawal, and export racing deletion.** `withdraw()`/`startDeletion()` raced
  against `exportFixtureSet()` on a fresh fixture. This is a WRITER-vs-READER case, not symmetric:
  the writer always fulfills (sole writer on that field), and the real invariant is
  self-consistency, not win/loss — `evaluatePermission` (`services/permissions.ts`) reads the
  control register exactly ONCE per call and reuses that single snapshot for every check inside
  that call, so a record can only ever be excluded from the export (the race was caught) or
  included with a FULLY self-consistent pre-race snapshot — never a torn mix of pre- and
  post-race state within one record. Confirmed live for both withdrawal and deletion variants.

All six combinatorial checks passed against real DynamoDB after both fixes, bringing the script's
total to 15/15.

### Finding 2b carried the same two defects, and a live cross-table transaction check was added — 2026-10-06

Reviewer-caught finding: **Finding 2b** (the original `startDeletion()` + `restrict()` race, at the
top of this section) had the EXACT SAME two defects the combinatorial case above did — it required
a genuine conflict that isn't actually guaranteed, and it never retried a real loser at all,
leaving its `LifecycleRequest` permanently `"in-progress"` whenever one occurred. Fixed with the
identical pattern: accept EITHER a genuine conflict (one rejected, retryable) or both calls
serializing cleanly (both fulfilled); when a conflict DOES occur, retry the loser with its ORIGINAL
requestId and confirm it resumes to `"completed"`. Confirmed live 2026-10-06: the real run that
day DID hit a genuine conflict, exercising the retry-and-complete path for real, not just the
both-succeed path.

**A live, dedicated verification of the NEW cross-table transaction mechanism was also added.**
The legacy-media migration's TOCTOU fix (see "Legacy media migration" below) introduced the ONE
place in this system that writes across BOTH the primary table and the restriction register table
in a single DynamoDB transaction (`CustodyCopyCommitter`/`DynamoCustodyCopyCommitter`,
`store.ts`/`dynamoStore.ts`). Two new checks seed a fresh, dedicated fixture and exercise this
directly against real DynamoDB: (1) a commit succeeds and lands atomically when custody is NOT in
the deletion workflow; (2) a commit is refused — via the real cross-table `ConditionCheck`, not an
earlier separate read — once custody is `"deletion-pending"`, with NOTHING partial landing (record
title unchanged, no custody copy created). Both confirmed live.

**Live result 2026-10-06: 19/19 checks passed** (15 from the prior round, +2 for Finding 2b's fix —
its new retry-completion check fired for real this run, confirming a genuine conflict occurred and
was resumed, not just the both-succeed path — and +2 for the new `CustodyCopyCommitter` checks,
both confirmed live including the real cross-table `ConditionCheck` refusal). See
`docs/backend/runbook.md`'s "Full-fixture seed and correctness checks against real DynamoDB"
section for the run command.

## Real staff API smoke test — what actually happened

Dated 2026-10-03 (manual), scripted into a reusable drill 2026-10-04
(`backend/src/scripts/realStaffApiSmokeTest.ts`) — closing the "script the staff API smoke test
into a reusable drill" item from the AWS-checks-still-not-run table below. Deployed the Lambda +
HTTP API + Cognito JWT authorizer to the same stack (`TiroFixtureBackend-drill-20261002`):

1. Created a synthetic test staff user (`admin-create-user` + `admin-set-user-password`), authenticated
   via `admin-initiate-auth` (`ADMIN_USER_PASSWORD_AUTH` — added to the app client specifically to make
   this kind of scripted check possible without implementing SRP by hand; gated by IAM, never reachable
   from the public internet).
2. `GET /lifecycle-requests` with no `Authorization` header → **401**, confirming the Cognito authorizer
   actually rejects unauthenticated requests.
3. The same call with a real ID token → **200**, `{"requests":[]}`, reading the real GSI1-status-index.
4. `GET /records/:id` on a real ALLOWED (active-authorized) fixture → the full detail bundle (record,
   control, claims, grants, copies, receipts) read correctly from live DynamoDB.
5. **The SAME call on a real disputed-authority fixture → correctly DENIED** (limited view, no
   content). Note: the original manual run of this step (2026-10-03) used the disputed-authority
   fixture for the *allowed* case above and observed a full bundle — but that was BEFORE Finding 1's
   fix started enforcing `evaluatePermission` on this route; under the current, correct behavior a
   disputed authority claim denies every purpose/audience unconditionally, so this script seeds a
   separate `active` fixture for the allowed case and keeps the disputed fixture only for this
   denial check.
6. `POST /records/:id/permission-check` on the disputed fixture → `{"allowed":false,"reason":"Authority
   claim ... is \"disputed\"."}` — the real `evaluatePermission` path, unchanged by any of this.
7. `POST /records/:id/restrict`, with the request body attempting to set `requesterCapacity` to
   `"someone-else-entirely"` → the real response's `requesterCapacity` was
   `"staff:staff-smoke-test@example.invalid"` — the spoofed value was silently ignored, exactly as
   designed (`handler.ts`'s `extractCallerIdentity` never reads the body). The action itself landed
   correctly (`restrictedPurposes: ["model-training"]` on a live table scan afterward).
8. `POST /export` (`public-redacted` scope) against an expired-consent record and a
   since-restricted record → `recordCount: 0`, correctly excluding both.

All 8 checks passed. The test user was deleted immediately afterward (`admin-delete-user`); the
mutated/seeded fixture records were left in place, same precedent as every other synthetic fixture
mutation in this milestone. See `docs/backend/runbook.md`'s "Staff API smoke test against real AWS"
section for the run command.

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

### Reviewer-caught UI defect (2026-10-06): action responses disappeared before they could be read

Preparing for the actual human click-through (`docs/backend/browser-acceptance-checklist.md`), a
reviewer caught a real usability/evidence defect in `staff-ui/app.js`: every `actionForm`'s submit
handler shows the raw JSON response in a `.result` div directly under the form, but its `onDone`
callback (`reload`) then calls `loadRecord()` again, which rewrites the ENTIRE `#record-output`
container the form lives in — wiping that response almost immediately. In practice this meant
`start-deletion`'s returned `requestId` (needed moments later for `complete-deletion`) and every
action's `requesterCapacity` (needed for step 16's attribution check) were visible for only a
fraction of a second after a successful submit, with no way to recover them afterward short of the
browser's network inspector. Fixed by adding a persistent, page-level **Action log** section
(`index.html`, a sibling of `#record-output`, never touched by `loadRecord`'s re-render) that every
`actionForm` and the `permission-check` form now append a durable entry to — timestamp, action,
recordId, and the full JSON response, newest first — alongside the existing ephemeral `.result`
display. `docs/backend/browser-acceptance-checklist.md`'s steps 15 and 16 now point testers at this
log instead of the inline result or the network inspector. Not unit-tested (this is a vanilla-JS,
no-build-step static page with no existing test harness, consistent with the rest of this project's
approach to `staff-ui/`) — verified with `node --check` for syntax only; the actual behavior still
needs the human click-through this exists to support.

## Real S3 media acceptance drill — what actually happened

Dated 2026-10-03, updated after the fifth review round, again after the sixth (2026-10-04), again
after the seventh (2026-10-04), and again after the eighth (2026-10-04).
`backend/src/scripts/realS3MediaAcceptanceDrill.ts`, run against the redeployed live stack
(`TiroFixtureBackend-drill-20261002`, now with the S3 media IAM/env var changes and the new
`GET /records/:recordId/media/:mediaId` route). **25/25 checks passed** on the corrected run (see
the bug below); **29/29** after the fifth-round extensions; **34/34** after the sixth-round
extensions; **36/36** after the seventh-round extension (check 7d); **41/41** after the
eighth-round extension (check 7e, further down). What it actually did, in order:

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

**Extended the same day for the fifth review round's four gaps (redeployed, re-run, 29/29):**

- The retention-before-completion check (#9's second bullet above) now seeds its fixture with real
  bound S3 media via `bindSeedMedia` — the original version used an unbound fixture and could not
  have caught Finding 1 below (the live retention drill really did miss it, exactly as the reviewer
  said). After the real `retainForPreservationOnly()` → `completeDeletion()` → `"denied"` sequence,
  a fresh `listObjectVersions` call confirms BOTH of the binary media object's versions are still
  present with the exact same version ids as before — not just that the record survived, but that
  the media was never touched.
- The pre-revocation backup now also carries a real `AuditReceipt` (written before export), and
  after restoring it into the isolated target, a direct `listAuditReceipts()` call on the restored
  store confirms the receipt is actually there (Finding 3) — and a direct `getObject()` call against
  the restore target's own real, separately-prefixed `S3MediaStore` confirms the restored media's
  bytes are present with a matching SHA-256 (not just that reconciliation's permission decision was
  correct).

All four of the fifth round's fixes (media-purge ordering, export/retrieval size bounds,
restored audit history, package-completeness validation) are proven at the logic level by their own
regression tests (127 tests, up from 119); the retention-before-completion and restore-survival
halves specifically are ALSO now confirmed live, against the real redeployed stack.

**Extended again the next day (2026-10-04) for the sixth review round's two residual gaps
(redeployed, re-run, 34/34):**

- **Real-DynamoDB interleaving check (Finding 1).** A new `InterleavingRegisterStore` wraps the
  REAL `DynamoRestrictionRegisterStore` so that `retainForPreservationOnly()` runs for real, against
  real DynamoDB, in the EXACT gap between `completeDeletion`'s custody read and its own claim
  write — a deterministic forcing function for an otherwise-timing-dependent race, labeled as such
  in the drill's own log output, not presented as naturally occurring. `completeDeletion`'s claim
  write lost the race with a real `ConditionalCheckFailedException`-backed `VersionConflictError`;
  the record's register showed `currentCustodyStatus: "preserved"` (retention actually won), and a
  fresh `listObjectVersions` call confirmed BOTH media versions were completely untouched — the
  exact second-round reviewer reproduction, closed for real.
- **Real Lambda/API export-budget check (Finding 2).** Seeded 20 real, distinct fixtures, each with
  a real 256 KiB object uploaded to the live bucket, and called the REAL deployed `/export` route
  over HTTP (not a local estimate) with all 20 record ids. Real result: **200**, a real HTTP
  response body of **4,946,321 bytes** — safely under Lambda's real 6 MB synchronous-response limit
  and a direct, large improvement on the 7,035,395 bytes the unfixed budget produced from the same
  shape of request — with at least one of the 20 records' media confirmed actually skipped (named
  in the real response body's own `mediaObjectsSkipped`), not just happening to fit.

Both of the sixth round's fixes are proven at the logic level by their own regression tests (131
tests, up from 127) AND now confirmed against the real deployed stack, closing the gap between
"documented residual" and "actually closed" the reviewer asked for.

**Extended again on 2026-10-04 for the seventh review round's claim-lifetime/ownership finding
(redeployed, re-run, 36/36):**

- **Claim ownership resumption (check 7d), real DynamoDB.** A reviewer caught two bugs in the same
  mechanism: the media-purge claim was released right after the purge attempt, BEFORE the final
  commit, reopening the exact race it exists to prevent (retention could win the register in that
  now-unprotected window, after the media was already gone); and the claim check never compared
  ownership, so a retry of the SAME completion under its OWN `requestId` (resuming after an earlier
  partial failure) was wrongly refused as a foreign conflict. Since there's no reliable way to force
  a real failed-purge-plus-failed-release on demand, this check uses the SAME deterministic
  drill-only-hook precedent as check 7a: a raw `registerStore.setCurrent()` write, bypassing
  `completeDeletion`, recreates exactly the state that leaves behind — a claim attributed to a
  specific `requestId`. Against that real register state: a completion attempt under a DIFFERENT
  `requestId` was genuinely refused (`MediaPurgeInProgressError`, confirmed in the real response);
  a completion attempt under the SAME `requestId` that owns the claim resumed and actually
  completed, confirmed by a subsequent `getRecord()` returning `null`.

Both halves of this fix are proven at the logic level by their own regression tests (158 tests, up
from 150 — see `lifecycle.test.ts`'s interleaved-retention and claim-resumption cases) AND now
confirmed against the real deployed stack.

**Extended again on 2026-10-04 for the eighth review round's tombstone-overwrite finding
(redeployed, re-run, 41/41):**

- **Retention vs. an already-deleted tombstone (check 7e), real DynamoDB and real S3.** A reviewer
  caught that `retainForPreservationOnly()` checked only the media-purge claim, never custody
  status itself — so retention landing immediately after `completeDeletion`'s final write (which
  clears the claim as part of that SAME write) could flip an already-`"deleted"` tombstone back to
  `"preserved"`, even though the record and its media were genuinely gone. No hook needed: a real
  fixture with real bound S3 media went through the full real deletion workflow
  (`startDeletion` → `completeDeletion`, media purged for real) to completion, then a real
  `retainForPreservationOnly()` call ran immediately after — exactly the reviewer's repro. Result:
  `"denied"`, the real register's `currentCustodyStatus` still read `"deleted"`, a fresh
  `getRecord()` confirmed the record was still gone, and a fresh `listObjectVersions()` confirmed
  the real media stayed purged — the denial never resurrected what completion had already
  destroyed.

This fix is proven at the logic level by its own regression tests (164 tests, up from 158 — see
`lifecycle.test.ts`'s fully-deleted and mid-recovery tombstone cases) AND now confirmed against the
real deployed stack.

Cleanup: only the drill's own disposable Cognito test user was deleted. Every fixture it seeded
(several more active/expired/disputed/positive-control/partial-failure/stale-precondition/claim-
ownership/tombstone records), the live primary/register tables, and the staff user from the
browser-setup task were all left in place, per this project's standing precedent.

## Real correction/redaction drill — what actually happened

Dated 2026-10-04, extended the same day for the seventh review round, again for the eighth, and
again for the ninth. `backend/src/scripts/realCorrectionRedactionDrill.ts`, run against the
redeployed live stack. **19/19 checks passed on the first real run**; **32/32** after the
seventh-round extensions; **38/38** after the eighth-round extensions; **40/40** after the
ninth-round extensions described below. What it actually did:

1. Created its own disposable Cognito test user, deleted at the end. Seeded one fresh fixture with
   real bound S3 media.
2. **Correction, through the real API:** `POST /records/:id/correct` on `summary` returned 200; the
   live field changed immediately, confirmed via a real `GET /records/:id` call; the correction
   history returned by that same real call contained the ORIGINAL (pre-correction) value, not just
   the new one.
3. **Dispute, through the real API:** `POST /records/:id/dispute-correction` returned 200; a
   follow-up real `GET` confirmed the correction's `status` was `"disputed"` while the live field
   STILL reflected the correction — not reverted.
4. **Text redaction, through the real API:** `POST /records/:id/redact-text` on `title` returned
   200; the live field became `"[REDACTED]"`; the real `GET /records/:id` response's `redactions`
   array carried only safe metadata (scope/field/reason/timestamp) — no `previousValue` key at
   all, confirmed by direct inspection of the real response, even though this caller was fully
   authorized for the record otherwise.
5. **Media redaction, through the real API:** the target media was confirmed fetchable (200)
   before redaction. `POST /records/:id/redact-media` returned 200. Afterward, the EXACT SAME
   media route for that mediaId returned real **403**, while the SAME call for a DIFFERENT,
   non-redacted media object on the SAME record still returned 200 — redaction is scoped to the
   exact object, not the whole record. A real `listObjectVersions` call confirmed the redacted
   object's S3 version was completely untouched before and after.
6. **Export/restore:** a real `complete-preservation` export carried the correction history with
   the real original value AND the real pre-redaction title text (custody there is authorized to
   hold the complete archival record). A real `public-redacted` export of the same record came back
   with `redactions: "redacted-for-public-export"` — the original never included. Restoring the
   complete-preservation export into an isolated in-process target (real S3-backed media store,
   separately prefixed) reproduced both the correction history and the real pre-redaction text.

**Extended the same day for the seventh review round's five findings (redeployed, re-run, 32/32):**

7. **Correcting then redacting the SAME field, through the real API (Finding 1).** A fresh record's
   `title` was corrected, then redacted. The real `GET /records/:id` response's live field came
   back `"[REDACTED]"` — expected — but so did that SAME field's correction history
   (`previousValue`/`correctedValue` both `"[REDACTED]"`), confirming the real deployed API masks a
   redacted field's history too, not just its live value.
8. **Replaying the SAME correct requestId through the real API twice (Finding 3's retry half).**
   Two identical `POST /records/:id/correct` calls with the same explicit `requestId` both returned
   200; a follow-up real `GET` showed exactly ONE correction, with `previousValue` still the TRUE
   original — not a corrupted re-capture of the already-changed live value a two-separate-writes
   design would have produced.
9. **Restoring a backup taken BEFORE a text redaction, directly into the REAL primary table
   (Finding 2).** Exported a fresh record's `complete-preservation` backup BEFORE redacting its
   `title`, then redacted it through the real API, then restored that pre-redaction backup straight
   into the live primary table (`importExport`, which never touches the register). A direct read
   confirmed the primary table's `title` really did revert to the pre-redaction original, and the
   REAL register still listed `title` as redacted — importExport had no way to touch it. The real
   `GET /records/:id` call confirmed `access.allowed: true` (correct — text redaction doesn't deny
   overall access, unlike media) while the served `title` stayed `"[REDACTED]"` — the exact
   reviewer-caught finding, closed against real DynamoDB and the real deployed API.
10. **The real deployed `/export` response shape (Finding 5, API-contract half).** A real
    `complete-preservation` export of two ordinary records came back with the new
    `recordsSkippedForResponseBudget` field present as an array, confirming the deployed Lambda
    actually returns the new shape `export.ts` now produces.

**Named, not hidden: Finding 5's actual whole-response TEXT exclusion was NOT independently forced
live.** An attempt was made at several scales (20, then 14, then 3 near-400-KB records). Every
attempt, at every scale tried, observably hit a real `ProvisionedThroughputExceededException` —
confirmed directly via real CloudWatch `ConsumedReadCapacityUnits` metrics and Lambda CloudWatch
logs, not guessed — including on a single strongly-consistent read of one ~395 KB record
(`DynamoFixtureStore.getRecord` correctly uses `ConsistentRead: true` throughout, for reasons
unrelated to this drill). **This is an observed result from these specific attempts, not a proof
that a single large read is categorically impossible at this table's provisioned 5 RCU/s.** AWS
documents that provisioned-capacity tables can draw on burst capacity beyond the nominal
provisioned rate (the exact amount and timing of which this drill did not control for or measure
precisely), so a different attempt, timing, or recent usage history could plausibly succeed where
these did not. What IS established: repeated attempts under the conditions actually tried (shortly
after this same drill's own write burst, with no deliberate idle warm-up period controlled for)
reliably reproduced the error. Forcing a clean read through would most reliably need either a real,
billed capacity increase on this shared table (not a decision this script makes unilaterally — see
the "Keep the shared table's capacity unchanged for now" note the next review round gave) or a
controlled, isolated idle period this drill did not attempt to construct. Unlike the media-budget
live check above (`realS3MediaAcceptanceDrill.ts`'s check 8/9), where the bulk bytes live in S3 —
no comparable provisioned-RCU ceiling to pass through — this exact exclusion-threshold claim rests
on the deterministic local test instead (`export.test.ts`'s "twenty records with large TEXT
fields..."), which reproduces the reviewer's exact 9,032,712-byte figure with no real
infrastructure's throughput to respect.

158 tests pass (up from 150); all five findings have local regression tests. Four of the five are
also confirmed against the real deployed stack; the fifth's exclusion THRESHOLD specifically is
proven local-only, for the infrastructure reason stated above.

**Extended again the same day for the eighth review round's two findings this drill can confirm
without touching the table's capacity (redeployed, re-run, 38/38):**

- **Concurrent corrections, real DynamoDB (checks 3d).** A fresh record was correctRecord()'d once
  for real (writer B), advancing the real stored version. Writer A then called
  `putRecordWithCorrection` DIRECTLY with the pre-race snapshot's now-stale version — exactly what
  a second concurrent writer that had read the SAME version as B would attempt. Result: a real
  `ConditionExpression` failure (`VersionConflictError`), and a fresh `getRecord()` confirmed B's
  change survived with A's rejected change never landing.
- **Stale "already applied" pre-check vs. the real conditional write (check 3e).** After a real
  correction committed for real, the SAME correction id was written again directly via
  `putRecordWithCorrection` — simulating exactly what a retry fooled by a stale pre-check would
  attempt, previousValue included. Result: a real `TransactWriteItems` conditional-check failure on
  the history row itself (`AlreadyAppliedError`, distinguished from a version conflict via the real
  adapter's `CancellationReasons`), and `listCorrections` confirmed exactly one correction survived
  with the TRUE original intact, never overwritten.

Both are proven at the logic level by their own regression tests (164 tests, up from 158) AND now
confirmed against the real deployed stack. The fifth finding's exclusion THRESHOLD (see above)
remains proven local-only, unchanged by this extension — forcing it live still needs more RCU than
this table's unchanged capacity reliably provides.

**Extended again the same day for the ninth review round's two input-bounding findings
(redeployed, re-run, 40/40):**

- **Oversized `fixtureSetId`, real API (check 8).** `POST /export` with a 2 MiB `fixtureSetId` —
  the exact reviewer reproduction — returned a real **400**, before any record was even looked at.
- **Oversized batch, real API (check 8).** `POST /export` with 2,001 requested record ids (over the
  new `MAX_EXPORT_RECORD_IDS` limit) returned a real **400**, before any record was even looked at.

Both checks are intentionally cheap: unlike the fifth finding's exclusion threshold, these two
fixes make the real deployed API do LESS work on bad input, not more, so confirming them live
needed no capacity change and consumed essentially no RCU — correctly-rejected requests never
reach DynamoDB at all. Both are proven at the logic level by their own regression tests (168
tests, up from 164 — `export.test.ts`'s direct `exportFixtureSet` reproductions plus
`router.test.ts`'s API-boundary cases) AND now confirmed against the real deployed stack.

Cleanup: only the drill's own disposable Cognito test user was deleted each run. Every fixture it
seeded was left in place, same precedent as every other real-AWS check in this project.

## Legacy media migration — what actually happened

Dated 2026-10-04, corrected 2026-10-05. `backend/src/scripts/realLegacyMediaMigration.ts`, run in
dry-run mode (the default; `--apply` requires an explicit flag and was NOT passed) against the same
deployed stack. Enumerates every record currently in the live restriction register (via
`RestrictionRegisterStore.listAll()`'s full table scan, reused rather than adding a new
primary-table scan method), reads each one's `MediaRef`s, and classifies every reference with
`versionId: null` against a narrow, EXACT signature match — never fuzzy — against this project's
one known placeholder (`objectKey: "fixtures/active-authorized/dummy.txt"`, `checksumSha256`
all-zeros, `contentType: "text/plain"`, `bytes: 128`), the exact shape `buildSeedFixtures()` has
always produced before `bindSeedMedia` binds it to real S3 bytes.

**Reviewer-caught finding (2026-10-05): a recognizable placeholder signature alone does not
establish migration eligibility.** Running this logic against the in-memory fakes reproduced two
real failures in the original version of this script: (1) it would happily rebind media for a
record ALREADY in the deletion workflow (custody `"deletion-pending"` or `"deleted"`) just because
the media happened to match the known signature — creating media outside that workflow's tracking
for a record that is being, or has been, deleted; (2) the `MediaRef` rewrite and its `CustodyCopy`
were two SEPARATE writes — if the custody-copy write failed after the record already pointed at
the newly uploaded object, `completeDeletion()`'s purge (which learns what to purge ONLY from
`CustodyCopy` rows — see `purgeMediaCustody` in `services/lifecycle.ts`) would never learn that
object exists, so a LATER deletion could report `"completed"` while that object survived,
untracked, forever.

Both are fixed by extracting the classification/apply logic into a new, unit-tested module,
`backend/src/services/legacyMediaMigration.ts`: eligibility is checked FRESH, immediately before
any S3 upload, against the record's live custody status — never trusted from the dry-run snapshot
alone.

**Real result, re-run against the live stack with the fix (2026-10-05): 37 legacy
(`versionId: null`) references found across every record in the register. 34 matched the known
placeholder signature AND are not in the deletion workflow (rebindable). 3 matched the signature
but ARE in the deletion workflow — correctly classified `ineligible-deletion-in-progress` instead
of rebindable, exactly the case the reviewer's finding (1) named. 0 had no trustworthy origin.**
The 3 ineligible entries are real, concrete proof the new gate is doing actual work, not a
theoretical fix: under the ORIGINAL logic, all 37 would have been reported rebindable.

### Second review round (2026-10-06): the fresh check alone still raced deletion, and cleanup could destroy a real success

**Reviewer-caught finding, part 1: migration can still race deletion.** A deterministic
reproduction showed that even WITH the fresh custody check above, `startDeletion()` AND
`completeDeletion()` can run to full completion ENTIRELY in the gap between that check and the
atomic write landing — uploading real bytes to S3 takes real wall-clock time, and that gap is
exactly the window. The repro: deletion reports `"completed"` and removes the record while one
newly migrated S3 version and its unreconciled `CustodyCopy` survive, untracked, forever.
Compounding this, `completeDeletion`'s own custody-copy reads (`listCustodyCopies`, used by both
`purgeMediaCustody` and the outstanding-copies check) were NOT strongly consistent — even a
correctly-ordered write could be missed by a stale read.

Both are fixed. **`listCustodyCopies`** (`dynamoStore.ts`) is no longer routed through the shared,
eventually-consistent `queryByPrefix` helper — it now issues its own `ConsistentRead: true` query,
so a just-committed copy can never be missed by staleness alone. The write side needed a stronger
guarantee than a read, however: a new, narrow `CustodyCopyCommitter` interface (`store.ts`,
implemented by `DynamoCustodyCopyCommitter` in `dynamoStore.ts`) commits the record+copy write in
ONE DynamoDB transaction that ALSO includes a `ConditionCheck` against the restriction register's
custody status — the ONE place in this codebase that writes across both the primary table and the
register table atomically, deliberately narrow and not a precedent for blurring their separation
elsewhere. Because the custody assertion and the write are now part of the SAME indivisible
transaction, a concurrent `startDeletion()` either lands strictly before (the migration's
`ConditionCheck` then fails, cleanly, nothing commits) or strictly after (the already-committed
`CustodyCopy` is guaranteed visible to `completeDeletion`'s later, now-strongly-consistent read) —
there is no window left in between. `services/legacyMediaMigration.ts`'s former
`FixtureStore.putRecordWithCustodyCopy` call was replaced with this committer; the plain,
single-table `putRecordWithCustodyCopy` method stays in `FixtureStore` as a general-purpose
primitive, just no longer used by the path that needs the stronger, deletion-aware guarantee.

**Reviewer-caught finding, part 2: cleanup can destroy a successful binding.** A reviewer simulated
the atomic transaction committing on the server while its success response failed to reach the
client (a realistic DynamoDB failure mode — a timeout does not mean a write didn't happen). The
previous code treated ANY error from the write as "didn't commit" and deleted the just-uploaded S3
object — leaving the ALREADY-COMMITTED record and `CustodyCopy` pointing at now-missing media.
Fixed by resolving the uncertainty BEFORE ever touching S3: on any error, the record is re-read
fresh; if it already reflects the attempted write, this is treated as the success it actually was
(the same idempotent-recovery idiom `services/lifecycle.ts` already uses for corrections and
redactions) and nothing is cleaned up. Cleanup only proceeds once the record is confirmed to NOT
reflect the write.

Both are proven with new regression tests against the in-memory fakes (`legacyMediaMigration.test.ts`,
now 9 tests total, up from 6) — including a direct test of `CustodyCopyCommitter` refusing
atomically once custody has moved into the deletion workflow, an end-to-end test simulating
`startDeletion()` landing in the exact gap between the early check and the upload completing, and a
test proving a binding that actually committed is never cleaned up even when the client is told it
failed — AND against real DynamoDB: two new checks in `realFullFixtureChecks.ts` exercise
`CustodyCopyCommitter` directly (a successful commit, and a real cross-table `ConditionCheck`
refusal) against a dedicated, fresh fixture — see "Real full-fixture checks" above.

**Dry run re-confirmed against the live stack with all fixes applied (2026-10-06): 41 legacy
references found (up from 37, as this engagement's drill history continues to accumulate records),
37 rebindable, 4 correctly classified ineligible (deletion workflow), 0 with no trustworthy
origin.** The classification logic itself is unaffected by this round's fixes (those are entirely
about the APPLY path's atomicity/cleanup) — this re-run exists to confirm the dry-run path still
works cleanly end to end after the refactor into `services/legacyMediaMigration.ts` and the new
`CustodyCopyCommitter`/`DynamoCustodyCopyCommitter` wiring.

Rebinding here means giving a known, synthetic, reconstructable placeholder its real analog — NOT
"recovering lost original bytes," since the placeholder was never backed by anything real to begin
with. **`--apply` was deliberately NOT run against this shared, live stack** — the request was for
a dry-run report; actually mutating real records' media is a separate decision left open for the
user, and the user has separately asked to keep migration in dry-run mode until these fixes landed.

A first run without throttle-aware retry hit `ProvisionedThroughputExceededException` partway
through (around record 16) — expected, given this deliberately tiny 5-RCU table and the
same pattern seen in every other drill in this project's history. Fixed with the same
`withThrottleRetry` backoff pattern used elsewhere. See `docs/backend/runbook.md`'s "Legacy media
migration against real AWS" section for the run command.

### Third review round (2026-10-06): the uncertain-commit recovery itself could fail, and a failed cleanup still exited clean

**Reviewer-caught finding, part 1: a failed follow-up read bypassed cleanup.** The second round's
idempotent-recovery fix re-read the record on ANY commit error to resolve whether it had actually
landed — but that recheck is itself a network call, and nothing guarded against IT failing. A
reviewer forced a DEFINITE custody refusal (`DeletionInProgressError` — a real `ConditionCheck`
failure, which GUARANTEES the whole transaction was cancelled, no ambiguity at all) immediately
followed by a recheck read failure: the uncaught exception propagated straight out of
`applyLegacyMediaRebind`, skipping cleanup entirely, and a later `completeDeletion()` reported
`"completed"` while the untracked upload survived — resurrecting the ORIGINAL bug (from the first
review round) via a brand-new path. Fixed two ways: (1) DEFINITE non-commit signals
(`DeletionInProgressError`, `VersionConflictError` — both mean DynamoDB itself atomically cancelled
the whole transaction) now go straight to cleanup, with no recheck at all — there is no uncertainty
to resolve for these, and therefore no dependency on a second read that could itself fail; (2) the
recheck is now wrapped in its own `try`/`catch` for the cases that genuinely need it (anything
else) — if it fails, nothing is cleaned up (safety cannot be confirmed), and BOTH the original error
and the recheck failure are preserved in the outcome's `reason`, rather than being lost to an
uncaught exception.

**Reviewer-caught finding, part 2: failed cleanup still produced a successful CLI exit.** When a
commit was refused and the S3 cleanup that followed ALSO failed, the previous code still returned
`"skipped-ineligible"` — a label implying nothing was left behind — so the CLI's failure count and
exit code never reflected the orphan. Fixed by giving "an upload survives untracked and needs a
human to reconcile it" its own outcome kind, `"needs-reconciliation"`, carrying the exact
`objectKey`/`versionId` as structured fields (not just embedded in prose) rather than a boolean
`cleanedUp` flag folded into other outcomes. `realLegacyMediaMigration.ts` now counts these
explicitly, prints them under their own "NEEDS RECONCILIATION" banner with the exact key/version,
and exits non-zero whenever any exist.

Three new regression tests (`legacyMediaMigration.test.ts`, now 12) reproduce both findings exactly
and prove them closed: a DEFINITE refusal whose recheck WOULD fail (proving the recheck is never
attempted at all for that error class); an uncertain error whose recheck ALSO fails (proving both
failure messages survive into a `"needs-reconciliation"` outcome instead of an uncaught exception,
and that cleanup is correctly skipped rather than guessed at); and a DEFINITE refusal whose cleanup
itself fails (proving `"needs-reconciliation"`, not `"skipped-ineligible"`, is reported). These are
local, fault-injection-proven fixes — not independently re-verified against real AWS this round,
since nothing about the real `DeletionInProgressError`/`VersionConflictError` classification itself
changed (that was already proven live in the second round); only the service-layer control flow
around them did. `--apply` stays deliberately unrun against the live stack.

### Fourth review round (2026-10-06): an ordinary write failure was still reported as a benign skip

**Reviewer-caught finding: ordinary write failures became `"skipped-ineligible"` once cleanup
succeeded.** The third round's fix correctly resolved uncertain commits and correctly flagged
unresolved cleanup — but the "confirmed non-commit, cleanup succeeded" branch for UNCERTAIN errors
(anything that isn't a DEFINITE `DeletionInProgressError`/`VersionConflictError` refusal) still
returned `"skipped-ineligible"`. A reviewer injected a real `AccessDeniedException` directly into
the CLI: the commit genuinely failed for an operational reason, the recheck correctly confirmed
nothing had committed, cleanup correctly removed the orphaned upload — and the whole attempt was
reported as `0 rebound · 1 skipped · 0 need reconciliation`, exit `0`. The record stayed
un-migrated with nothing in the output distinguishing it from a record correctly excluded by
design; a caller scanning for failures would see none.

Fixed by splitting what used to be one outcome into two with a real semantic difference:
`"skipped-ineligible"` is now reserved for refusals that are CORRECT BY DESIGN — the early
pre-upload eligibility checks, plus the two DEFINITE commit refusals that mean "this item should not
be migrated" (`DeletionInProgressError`) or "something else concurrently changed this exact record"
(`VersionConflictError`, kept here per explicit instruction, since a fresh inventory run will simply
re-evaluate it). Every OTHER commit failure — a genuine operational error, confirmed via recheck to
have not committed, with cleanup succeeding — is now reported as `"failed"`: nothing is left behind
in S3, but the record is still un-migrated and the attempt genuinely failed, so it is counted and
reported as a failure, never folded into a label implying "nothing to see here."
`realLegacyMediaMigration.ts` now counts `"failed"` alongside `"needs-reconciliation"` for the exit
code, and prints failed items under their own "FAILED" banner, separate from "NEEDS
RECONCILIATION."

The existing regression test for this exact code path (`legacyMediaMigration.test.ts`, the
"atomic write genuinely never committed" test) was corrected in place — it uses a generic,
non-definite error (standing in for `AccessDeniedException` or any other operational failure) and
now asserts `"failed"`, not `"skipped-ineligible"`, directly reproducing the reviewer's exact CLI
finding at the service-layer level. 188 tests pass (unchanged — a test was corrected, not added).
Local, fault-injection-proven; `--apply` stays deliberately unrun against the live stack.

## Real cost and billing-alert reconciliation — what actually happened

Dated 2026-10-04. Queried AWS Cost Explorer directly (`aws ce get-cost-and-usage`, itemized by
service, daily granularity) rather than relying on the CloudWatch `AWS/Billing EstimatedCharges`
metric (coarser, ~6hr granularity, whole-account total only) — covering 2026-09-30 through
2026-10-05, the full span this stack has existed under this round's drills:

**Real total: $0.0021379822** across that window. By service: S3 $0.0018588114, API Gateway
$0.00023, CloudWatch $0.00002, Secrets Manager $0.000015, DynamoDB $0.0000141708, everything else
(Lambda, Cognito, SNS, SQS, KMS, Glue, CloudFormation) $0. This confirms
`docs/backend/decision-and-cost.md`'s **$0-2/month** estimate with real, itemized billing data —
actual spend is several orders of magnitude under even the low end, and no line item (not even API
Gateway, the one the estimate flagged as "not confirmed free") is a meaningful contributor at this
volume.

**Billing alarm, confirmed real and correctly configured:** `tiro-fixture-backend-billing-drill-20261002`,
threshold $5.00, current state `OK` (`aws cloudwatch describe-alarms`) — correctly far from
triggering given actual spend.

**One real, human-actionable gap found 2026-10-04, closed 2026-10-05:** the alarm's SNS topic
(`tiro-fixture-backend-billing-drill-20261002`) had exactly one subscription, and
`aws sns list-subscriptions-by-topic` showed its `SubscriptionArn` as `PendingConfirmation` for
`onewisepixel@gmail.com`, not a real ARN — the alarm and topic were deployed and wired correctly,
but no one was actually being notified yet, since AWS only sends a confirmation link by email once,
at creation time, and nothing in this codebase can click that link. **Confirmed closed 2026-10-05:**
the user subscribed and confirmed a different, organizational address
(`cero@tiro.foundation`) instead; re-verified directly via CLI, not just the confirmation screen —
`aws sns list-subscriptions-by-topic` now returns a real `SubscriptionArn`
(`arn:aws:sns:us-east-1:440744257823:tiro-fixture-backend-billing-drill-20261002:8bd2ab5f-eadd-4c90-9795-c721f0d9d919`)
for `cero@tiro.foundation`. The billing alarm now has a real, confirmed, actionable recipient.

## S3 noncurrent-version expiration observation — pending, dated

Dated 2026-10-04. Two distinct mechanisms get conflated in casual phrasing: DynamoDB
**Time-To-Live** and S3's **`noncurrentVersionExpiration`** lifecycle rule. A grep across
`infra/lib/fixture-backend-stack.ts`, `domain/types.ts`, and every file under `services/`
confirms this project has never configured a `timeToLiveAttribute` on either DynamoDB table — this
is a design fact, not an unexercised feature: record removal here is exclusively `completeDeletion()`,
explicit every time, with no DynamoDB-TTL mechanism to observe at all.

The S3 bucket, however, DOES have a real, deployed `noncurrentVersionExpiration: Duration.days(30)`
rule (confirmed live via `aws s3api get-bucket-lifecycle-configuration`), which every deletion drill
so far has never actually exercised — `completeDeletion()`'s own purge step always explicitly
removes noncurrent versions before the 30-day clock would matter. `realS3ExpiryObservationSeed.ts`
seeds a dedicated, isolated key (`fixtures/ttl-s3-expiry-observation/noncurrent-version-watch.txt`,
touched by nothing else) with two versions, so the first becomes noncurrent immediately:

```
v1 (now noncurrent) versionId: eyOuILjjsdb2_znMFWBxv2eDn1p_POqr
v2 (current — positive control) versionId: ueud8o0WEOEtZTkp07OqZkKeUMsB7APb
Noncurrent since (UTC): 2026-10-04T22:44:18.761Z
```

**Reviewer-caught finding (2026-10-05), two parts, both fixed:**

1. **The eligibility date was wrong.** The original printed date (`noncurrentSince + 30 days` =
   2026-11-03T22:44:18.761Z) treated S3's lifecycle rule as if it fired at an exact instant. It
   doesn't: S3's lifecycle engine evaluates whole elapsed calendar days and runs its sweep once
   around UTC midnight, so the first sweep that can actually pick v1 up is the next UTC midnight
   on/after that instant — **2026-11-04T00:00:00Z** (2026-11-03, 6pm Chicago time under CST).
   Reaching that instant means v1 becomes ELIGIBLE for removal, not that AWS guarantees it's
   physically gone yet — there is no further "deadline" after that, only "ineligible" versus
   "eligible, not yet necessarily removed" versus "observed removed." `realS3ExpiryObservationSeed.ts`
   now computes and prints this correctly, rounding up to the next UTC midnight.
2. **`--check` could falsely pass.** The original logic treated ANY listing of 1-or-fewer real
   versions as "expired" — including a totally EMPTY listing (proving nothing was ever seeded, or
   the key/bucket is wrong, not that anything expired) and including the case where only the
   ORIGINAL v1 remained and the CURRENT v2 had vanished (an inversion/anomaly, never a pass — the
   current version must never be touched by a noncurrent-version rule). Fixed by persisting the
   exact seeded v1/v2 version ids to a separate S3 object
   (`fixtures/ttl-s3-expiry-observation/seed-record.json`) at seed time, and having `--check` read
   that back as ground truth: it now requires v2 (the positive control) to be confirmed present
   BEFORE treating v1's absence as a real, observed expiration; a missing seed record, a missing
   positive control, and a genuine expiration are now three distinct, clearly labeled outcomes,
   never conflated. The seed record for this existing observation (the version ids above) was
   persisted retroactively on 2026-10-05 so `--check` has real ground truth to verify against.

**Reviewer-caught finding (2026-10-06), a third, narrower false pass:** the eligibility-date guard
from fix 1 above only ran inside the "v1 present" branch — if v1 was absent for ANY reason BEFORE
real eligibility was reached (a bug elsewhere, manual intervention, anything other than the
lifecycle rule actually firing on schedule), the code unconditionally reported "EXPIRED, OBSERVED
FOR REAL" regardless of the date. Fixed: the date check now gates BOTH outcomes, not just one — v1
disappearing before `earliestEligibleUtc` is reported as its own distinct `anomaly-early-
disappearance` outcome, never as an early, lucky pass.

All three fixes are now also unit-tested, not just reasoned about: the eligibility-date math and
the full `--check` decision tree were extracted into `backend/src/services/s3ExpiryObservation.ts`
(`realS3ExpiryObservationSeed.ts` is now a thin CLI wrapper around it), with 8 regression tests in
`s3ExpiryObservation.test.ts` against the in-memory `MediaStore` fake — including the exact repro
of this third finding (v2 present, v1 deleted, checked BEFORE the real eligibility date — asserts
`anomaly-early-disappearance`, never `expired-observed`) and the second finding's missing-positive-
control case.

**This is genuinely PENDING until 2026-11-04T00:00:00Z.** Re-run the same script with `--check`
on or after that date to see the real result — checking earlier is harmless and, confirmed live on
2026-10-05, correctly reports "too early" (v1 and the v2 positive control both still present) rather
than fabricating a pass. Per this project's standing rule, a time-dependent result is never recorded
here until it is actually observed.

## AWS checks still not run, and the exact commands to finish them

| Check | Command |
| --- | --- |
| A literal browser click-through of Hosted UI → callback → API | No browser-automation tool is available in this environment. `docs/backend/browser-acceptance-checklist.md` (16 steps, corrected 2026-10-05 — step 16 now checks lifecycle-response `requesterCapacity`/correction `attribution`, not audit receipts, which carry no actor field at all) is PREPARED; its fixtures are SEEDED (2026-10-05) — `ALLOWED` record `01a10b16-a400-7644-b6d3-c463fe20c13d`, `DENIED (expired consent)` record `01a10b16-a400-790f-991c-273171bbb8fe`, `DENIED (disputed authority)` record `01a10b16-a400-72db-a9e9-61f4595f77b4` — ready for a human to run against `staff-ui/README.md`'s setup, but genuinely not yet executed by a human; everything server-side and every line of client code it would exercise is already verified for real; see "Browser-flow verification" above for exactly what that does and doesn't cover. |
| S3 noncurrent-version expiry, actually observed firing | Seeded 2026-10-04T22:44:18.761Z (`realS3ExpiryObservationSeed.ts`); genuinely PENDING until 2026-11-04T00:00:00Z (corrected 2026-10-05 — see "S3 noncurrent-version expiration observation" below for why the original date was wrong). Not something that can be observed early without fabricating a result; checked live on 2026-10-05 and correctly reported "too early." |
| Forcing the export response budget's real whole-record TEXT exclusion live (as opposed to proving the field exists) | Needs reading several real MB back out of this table's deliberately tiny, always-free-tier provisioned RCU (5/s) inside one Lambda invocation. Every attempt tried observably throttled — see "Real correction/redaction drill"'s seventh-round note for the measured CloudWatch/Lambda-log evidence — but that is an observed result, not proof a single large read is categorically impossible at this provisioning (AWS's documented burst capacity means a different attempt or timing could succeed). Keep the shared table's capacity unchanged per explicit instruction; if this needs closing for real anyway, the move is a TEMPORARY `UpdateTable` capacity bump (e.g. to 50+ RCU) for the duration of one drill run, reverted immediately after — a real infra/cost decision, so get sign-off first. |

~~Inventory S3 object versions after delete~~, ~~real `completeDeletion` resumability/stale-precondition confirmation~~,
~~cost reconciliation against actual billing~~, ~~a combinatorial real-AWS case~~,
~~script the staff API smoke test into a reusable drill~~, ~~migrating already-live legacy media
references~~, ~~the billing alarm's SNS email subscription~~ — **all closed, see "Real S3 media
acceptance drill", "Combinatorial cases added 2026-10-04", "Real staff API smoke test", "Legacy
media migration", and "Real cost and billing-alert reconciliation" above/below.**

## Explicitly not built in this pass

- The minimal staging-only staff UI's styling/polish beyond "usable" — it is genuinely minimal by
  design (see `staff-ui/README.md`), not a production admin console.
- Actual image/audio/video content processing (blur/bleep/crop) — this backend's redaction masks
  TEXT and denies MEDIA ACCESS, never alters media bytes; real content redaction needs
  media-processing infrastructure this project doesn't have.
- Automatic migration of EVERY legacy (`versionId: null`) media reference — only references whose
  content matches a known, exact, reconstructable placeholder signature are eligible for rebinding
  at all (see "Legacy media migration" below); anything without a trustworthy known origin stays
  unavailable rather than being guessed at.
- A named operator and adopted (not merely proposed) consent/retention procedures — explicitly
  organizational, not engineering; see `docs/backend/decision-and-cost.md` §"real collection" and
  `docs/ethos.txt` §6.1. No name or procedure document has been provided to put here.

Real S3 media/version handling, authenticated retrieval, byte-level checksums, media-aware
deletion, media-carrying export/restore, versioned correction, and text/media redaction — all
previously listed here as the next slice — are now DONE; see the S3 media and correction/redaction
milestone notes above and "Real S3 media acceptance drill" / "Real correction/redaction drill".

These are the next concrete slice of work, not a vague "more to do" — each is independently scoped
and none of them block what's already demonstrated above.
