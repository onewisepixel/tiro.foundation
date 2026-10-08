# Fixture-Preservation Backend — Current Status

Dated 2026-10-02, corrected 2026-10-03. This note exists to keep three things from blurring
together, per `docs/ethos.txt` §6.0's own concern about conflating prototype, demonstration, and
evidence.

**2026-10-03:** an independent review of commit `93427f7` found and this pass fixed five real
correctness gaps — grant-level consent revocation wasn't protected against restore, concurrent
lifecycle actions could silently clobber each other, export bypassed scoped permission checks,
legal-rights disputes were never checked, and `completeDeletion()` didn't actually delete the
record (plus a too-weak checksum check). Each has a regression test now. A same-day follow-up review
found a sixth gap in the first fix: `reconcileRestoredRecords()` could disagree with
`evaluatePermission()` on the same restored record (it didn't account for grant-level revocation at
all). Fixed by having reconciliation delegate directly to `evaluatePermission()`. 55 tests pass (up
from 45). See `docs/backend/evidence-matrix.md` for the corrected claim on what the real-AWS drill
does and does not establish — the PR implementing this fix pass was held for these corrections
before merge, per the reviewer's explicit request.

**Also 2026-10-03, after the fixes above:** `backend/src/scripts/realFullFixtureChecks.ts` seeded
the FULL four-fixture set into real DynamoDB (not just the one `active` record the restore drill
used) and re-ran the concurrency and export-authorization checks, plus a LIVE-only (no restore
involved) grant-revocation check, against the live deployed stack instead of the in-memory fake. All
9 checks passed on the first run.

**2026-10-03, third review round:** a reviewer caught three remaining problems, all now addressed:
1. CI was red — `next build` (Turbopack) failed resolving the Karla Google Font, and `npm install`
   reported 6 high-severity advisories. Root-caused and fixed/documented below under "CI: self-hosted
   fonts and the dependency audit."
2. `evidence-matrix.md` overstated the grant-revocation real-AWS evidence —
   `realFullFixtureChecks.ts` proves live denial after revocation but never restores anything, so it
   is not evidence that a restored pre-revocation backup stays denied. The claim is corrected, and a
   dedicated drill (`realGrantRevocationRestoreDrill.ts`) now exists to actually test that — see the
   evidence matrix for its result.
3. A check in `realFullFixtureChecks.ts` — `grantAfterRevoke?.revokedAt !== null` — falsely passes
   when the grant is simply missing (`undefined !== null` is `true`). Fixed to require the grant to
   exist and have a populated `revokedAt`.

**2026-10-03, authenticated API + staff UI:** built and deployed `backend/src/api/` (router +
Lambda handler), an HTTP API with a Cognito JWT authorizer, and `staff-ui/` (a standalone static
page, not part of the public Next.js site). 76 tests pass (up from 55). Smoke-tested against the
real deployed stack: unauthenticated calls get 401, a real Cognito token succeeds, and a lifecycle
action correctly attributes itself to the authenticated caller even when the request body tries to
claim a different identity. See `docs/backend/evidence-matrix.md`'s "Real staff API smoke test" for
the full sequence.

**2026-10-03, API milestone review — three defects held sign-off, all fixed:**
1. **Record reads bypassed scoped permission checks.** `GET /records/:id` returned full
   content+evidence to any authenticated staff member regardless of `evaluatePermission` — now
   requires `purpose`/`audience` and returns a limited metadata view (counts, not evidence
   contents) when denied.
2. **Reused request IDs silently suppressed different operations.** Withdrawing record A, then
   reusing that `requestId` for record B, used to return A's result and leave B untouched while
   reporting 200. `getOrCreateRequest` now fingerprints the full operation (record, action, caller,
   payload); a mismatch is a 409, not a silent no-op.
3. **Deletion completion bypassed the deletion workflow.** `completeDeletion()` took a bare
   `recordId` and would delete a record with zero custody copies even if `startDeletion()` was
   never called. Now requires a `deletionRequestId` linking to a completed `"delete"` request and
   the register's `currentCustodyStatus` actually being `"deletion-pending"` — either missing link
   denies, never silently deletes.

All three fixed with regression tests (84 tests, up from 76) and re-verified against the live
deployed stack. Also this round: the Hosted UI → callback → API flow was verified using the real
`auth.js` file executed in a real JS engine against live Cognito/API — with an honestly-stated gap
(no browser-automation tool here, so no literal click-through) — see the evidence matrix's
"Browser-flow verification."

**2026-10-03, fourth review round — two more `completeDeletion` defects, both fixed:**
1. **Partial failure couldn't recover.** The register write (to `"deleted"`) happens before the
   primary-record removal; if removal failed after the register write landed, every retry was
   permanently denied for custody no longer being `"deletion-pending"` — even though the record was
   still present and the job just needed finishing. Fixed: the precondition now also accepts
   `"deleted"` (the exact state a partial failure leaves behind) and skips removal if the record is
   already gone.
2. **The prerequisite check read a stale, discarded snapshot.** The check and the actual write used
   two separate reads of the register; a retention action landing between them was invisible to the
   write, which deleted the record anyway. Fixed: the check now runs inside the same
   `computePatch` callback that supplies the write's expected version — one snapshot, not two — and
   denies (terminal, not retryable) if custody isn't `"deletion-pending"`/`"deleted"` at that exact
   point.

Both fixed with regression tests (86 tests, up from 84), proven at the logic level (the shared
store interface) only — not yet re-run against live AWS, unlike the three Finding 1-3 fixes above.
See `docs/backend/evidence-matrix.md`'s fourth-review-round note and "AWS checks still not run"
table.

**2026-10-03, S3 media milestone:** real, version-bound synthetic media, authenticated retrieval,
media-aware/resumable deletion, and media-carrying export/restore — plus a single reusable live-AWS
acceptance drill that also closed the two outstanding `completeDeletion` checks from the fourth
review round above.

- **Storage.** New `backend/src/store/mediaStore.ts` (`MediaStore` interface + `InMemoryMediaStore`)
  and `s3MediaStore.ts` (`S3MediaStore`, the real adapter). Every `MediaRef` now carries a real
  `contentType` and a `versionId` PINNED to one exact S3 object version at bind time — never
  "latest". `versionId: null` marks a legacy reference (pre-version-binding); retrieval fails closed
  (409) for these rather than guessing. `fixtures/media.ts`'s `bindSeedMedia` uploads real tiny
  text/binary objects (including one object given a second, superseded S3 version) and computes
  genuine SHA-256 checksums from the actual bytes — the old all-zero placeholder checksum is gone
  wherever `bindSeedMedia` runs.
- **Authenticated retrieval.** New `GET /records/:recordId/media/:mediaId` route
  (`services/media.ts` + `router.ts`/`handler.ts`). Runs the SAME `evaluatePermission` check as every
  other route, on every single fetch — no presigned URLs, no cached/reusable download capability, so
  a withdrawal or grant revocation denies the very next fetch of a previously-allowed URL, not just
  future ones. Enforces a 256 KiB cap from the record's own recorded size BEFORE buffering, verifies
  the retrieved bytes' SHA-256 against the bound reference, and is delivered with
  `cache-control: private, no-store`.
- **Media-aware, resumable deletion.** `completeDeletion()` now purges EVERY S3 version and delete
  marker for each media-tracked custody copy — not just the version a `MediaRef` happens to be
  pinned to — and reconciles that copy only once a fresh listing confirms the key is actually empty.
  Tolerant of partial progress: an already-reconciled copy is skipped, a missing record means nothing
  left to purge, and S3's own idempotent delete means retrying an already-gone version is a no-op —
  so a transient purge failure leaves the request retryable and a later retry finishes cleanly.
- **Export/restore with media.** `exportFixtureSet` (complete-preservation scope only — public
  exports omit media bytes the same way they redact consent evidence) now embeds each bound media
  object's real bytes (base64) plus safe lifecycle history (`auditReceipts`). `validateExport` now
  decodes and re-hashes every included media object against the record's own declared
  length/checksum and rejects a mismatch outright — real tamper detection, not just a hex-format
  check. `importExport` can re-upload media into an isolated target's own `MediaStore` and rebind
  each reference to the version THAT upload produced (the export's original versionId means nothing
  in a target that never received it).
- **Live acceptance drill
  (`backend/src/scripts/realS3MediaAcceptanceDrill.ts`), 25/25 checks passed** against the real
  deployed stack: unauthenticated API/direct-S3 denial, exact-byte retrieval, purpose/audience/
  consent/authority denial, denial of a previously-allowed saved URL immediately after a real
  withdrawal AND after a real grant revocation, export/restore integrity with real tamper rejection
  and a positive control, real S3 version+delete-marker inventory and full removal (including a
  delete marker deliberately created outside this system's own path), and the two previously
  outstanding `completeDeletion` checks — partial-failure recovery (via a clearly-labeled,
  deterministic drill-only register-write hook simulating exactly that state, since a real transient
  AWS failure can't be forced on demand) and the stale-custody-precondition refusal (no hook needed,
  just the real operations in the real order). One real bug caught and fixed IN THIS drill script
  itself before it could falsely report success: two inventory assertions assumed a single
  pre-existing S3 version where the actual (correct) fixture had two by design. See the evidence
  matrix's "Real S3 media acceptance drill" for the full, corrected result.
- **Browser setup.** `staff-ui/serve.json` (`cleanUrls: false`) is committed — without it, `serve`
  301-redirects `callback.html?code=...` to `/callback` and drops the query string, silently
  breaking every real sign-in. README now documents why and how to re-verify it.

119 tests pass (up from 86).

**2026-10-03, fifth review round — four gaps reproduced against the actual service code with
in-memory stores, all fixed, regression-tested, and re-verified live:**

1. **Retention preserved the record but destroyed its media.** `completeDeletion()`'s media-purge
   step ran unconditionally, before the final write's custody-status validation — so
   `startDeletion` → `retainForPreservationOnly` → `completeDeletion` correctly returned `"denied"`,
   but every S3 version was already gone by the time that happened. Fixed: a fresh custody-status
   read now gates the purge itself, BEFORE anything irreversible runs, not deferred to the
   (necessarily later) register write. The live retention drill previously used an unbound fixture
   and couldn't have caught this; it now uses one with real bound media and directly confirms the
   media is untouched after a denial.
2. **Export had no size budget; retrieval buffered before checking actual size.** A reviewer
   reproduced a 7MB export response by repeating one record id 20 times, and noted that even the
   per-request retrieval cap only checked OUR OWN recorded size before fully buffering the real S3
   object. Fixed: `exportFixtureSet` deduplicates `recordIds`, and both it and
   `services/media.ts`'s retrieval route now call a new `MediaStore.headObjectSize` (a bodyless
   HEAD, never a GetObject) to check the REAL size before ever buffering a body — plus a per-object
   cap (reusing the existing 256 KiB retrieval cap) and a new aggregate budget
   (`MAX_EXPORT_AGGREGATE_MEDIA_BYTES`, 5 MiB) across an entire export call, skipping (not silently
   dropping) anything that would exceed either.
3. **Restore dropped audit history.** `importExport` never wrote `auditReceipts` at all, despite
   the export carrying them — a restored store always showed zero. Fixed: `importExport` now writes
   them, and `InMemoryFixtureStore.putAuditReceipt` (previously the one entity-put in that file NOT
   upsert-by-id) now dedupes by `receiptId`, so replaying the same import is a safe no-op instead of
   duplicating receipts.
4. **Removing packaged media still passed validation.** Emptying a complete-preservation package's
   `mediaObjects` to `[]` still validated and imported successfully, because `validateExport` only
   checked objects that WERE present. Fixed: every version-bound `MediaRef` must now be accounted
   for in either `mediaObjects` (included) or `mediaObjectsSkipped` (honestly recorded as skipped at
   export time) — unaccounted-for gaps are rejected as incomplete/tampered. For genuinely,
   honestly-skipped media, `importExport` now also clears that reference's `versionId` to `null` on
   the restored record, so a later fetch fails closed (409, legacy) instead of 404ing confusingly
   against a binding nothing ever carried through.

127 tests pass (up from 119). The live acceptance drill (`realS3MediaAcceptanceDrill.ts`) was
redeployed and extended — its retention-before-completion check now uses a fixture with real bound
media and directly confirms every version survives a denial, and its restore check now confirms the
restored audit receipt and restored media bytes are both actually present, not just that
reconciliation denies. **29/29 checks passed.**

**2026-10-04, sixth review round — two residual gaps in the fifth round's fixes, reproduced against
the real service code, both now closed with genuine fixes (not narrowed-but-documented residuals),
regression-tested, and re-verified against real DynamoDB/S3/Lambda:**

1. **Retention could still succeed immediately before media destruction.** The fifth round's guard
   read custody via a bare `getCurrent()` before purging — a real fix compared to no check at all,
   but a reviewer deterministically proved the read never actually CLAIMED anything: inserting
   retention right after that read let retention win the register while the purge, having already
   passed its one-time check, destroyed all three media versions anyway. The real fix is mutual
   exclusion via the register's own conditional-write mechanism, not a tighter read-then-act window:
   `completeDeletion` now CLAIMS the purge with a conditional write (a new `mediaPurgeClaim` field on
   `RestrictionRegisterEntry`), and `retainForPreservationOnly` itself now refuses outright if that
   claim is active. Whichever write actually lands first in DynamoDB wins — the loser either denies
   (sees the claim, or finds custody no longer eligible) or is refused (sees an active claim) —
   never both "believing" they safely proceeded. The claim is released in a `finally` so a purge
   failure never leaves retention stuck. A new `MediaPurgeInProgressError` surfaces as 409, same
   family as a version conflict. Regression test uses a real interleaving wrapper around the
   register store to force retention into the EXACT gap between the read and the write,
   deterministically, rather than hoping for real concurrency to reproduce it.
2. **The export budget measured raw bytes; Lambda's real limit is on the serialized response.**
   20 distinct, individually-authorized, individually-under-cap (256 KiB raw) records fit the fifth
   round's 5 MiB RAW aggregate budget but produced over 7 MB of serialized JSON — because base64
   inflates raw bytes by ~4/3 and the budget never accounted for that inflation or the JSON
   structure wrapping each object, and Lambda's synchronous invocation response has a real, hard
   6 MB limit. Fixed: the budget (`MAX_EXPORT_RESPONSE_BYTES`) is now measured in the ACTUAL
   serialized contribution — computed from a HEAD-only size via the exact base64-length formula
   before ever fetching anything, confirmed against the real measured base64 string length once
   fetched — plus a conservative per-object JSON-overhead estimate. Still bounded-read: an
   over-budget object is skipped before any `GetObject` call, not after buffering it.

131 tests pass (up from 127). The live drill now includes a real-DynamoDB interleaving check
(using the exact same deterministic-hook pattern as the regression test, wrapping the real
`DynamoRestrictionRegisterStore`) that reproduces the claimed-write-vs-retention race for real and
confirms it's caught by a genuine `VersionConflictError`, plus a check that seeds 20 real 256 KiB S3
objects and calls the real deployed `/export` route directly — confirming the real HTTP response
(4,946,321 bytes on the run that closed this) stays safely under Lambda's 6 MB limit, down from the
7,035,395 bytes the unfixed budget produced. **34/34 checks passed.**

**2026-10-04, versioned correction and redaction milestone:** implements §12's "Correct" action and
§3.5's redaction tooling, scoped to what this backend can actually do (text masking and a hard
media-access override — never image/audio/video processing, which needs infrastructure this
project doesn't have).

- **Versioned correction.** New `Correction` entity + `correctRecord()`/`disputeCorrection()`
  (`services/lifecycle.ts`). A correction replaces the live `title`/`summary`/`provenanceRef` field
  immediately (so readers see the fix) but PRESERVES the previous value permanently — never erased.
  A later disagreement about the correction itself (`disputeCorrection`) marks it `"disputed"`
  WITHOUT reverting it — "disagreements remain attributed," per §3.5, applied to the correction
  record itself.
- **Redaction.** New `Redaction` entity (discriminated by `scope: "text" | "media"`) +
  `redactText()`/`redactMedia()`. Text redaction masks the field with `"[REDACTED]"` in the live
  record while preserving the original ONLY in redaction history — `GET /records/:recordId` never
  serves it, even to a fully authorized caller. Media redaction adds the mediaId to a new
  `redactedMediaIds` register field, checked by `evaluatePermission` (now takes an optional
  `mediaId`) as a HARD override independent of purpose/audience — denies every fetch regardless of
  how permissive the record's own consent is. Underlying S3 bytes are never touched; redaction is
  not deletion.
- **Export/restore.** `complete-preservation` exports carry full correction history and the REAL
  pre-redaction text (custody there is authorized to hold the complete archival record);
  `public-redacted` exports omit the original redacted text the same way they already redact
  consent evidence and media — reusing the identical `"redacted-for-public-export"` sentinel
  pattern.
- **API.** Four new routes: `POST /records/:id/correct`, `.../dispute-correction`,
  `.../redact-text`, `.../redact-media` — the existing `/records/{recordId}/{action}` wildcard
  route already covers them, so no infra change was needed beyond redeploying the Lambda. `GET
  /records/:id` now includes full `corrections` (safe — same sensitivity as the record's own
  title/summary) and metadata-only `redactions` (scope/field/reason/timestamp, never the original)
  in both the allowed and limited-view branches. Minimal staff-UI forms added.

150 tests pass (up from 131). **`realCorrectionRedactionDrill.ts`** — a new live-AWS drill — passed
**19/19 on its first real run**: real correction + dispute through the live API with the original
value confirmed preserved; real text redaction confirmed never exposed through the live `GET
/records/:id`, even to this fully-authorized caller; real media redaction confirmed denied through
the live media route while a DIFFERENT object on the same record stayed fetchable and the redacted
object's S3 bytes stayed completely intact; and real export/restore confirmed carrying
(preservation scope) or omitting (public scope) the real pre-redaction text.

**2026-10-04, seventh review round — five gaps reproduced as deterministic LOCAL reproductions
against the actual service code, all fixed, regression-tested, and re-verified against real
DynamoDB/S3/Lambda:**

1. **Correction history bypassed text redaction.** Correcting then redacting the SAME field left
   the live value masked but the correction's historical values fully readable through `GET
   /records/:id` and public exports. Fixed by a new shared `services/redactionView.ts` module whose
   `maskCorrectionsForRedactedFields` masks history for any currently-redacted field, wired into
   both the live route (always) and public exports (archival exports keep full history).
2. **Restoration revived redacted text.** Text redaction had no durable register state, unlike
   media's `redactedMediaIds` — restoring a pre-redaction backup could silently un-redact it. Fixed
   by adding `redactedTextFields` to the register and enforcing masking from it at serve time
   (`applyTextRedactions`), never from the record's own restorable content — the same principle
   media redaction already had, now extended to text.
3. **A failed history write could permanently lose originals.** The field change and its history
   row were two separate writes; a failure between them (or a retry after success) could corrupt or
   lose the true original. Fixed with genuine atomicity — new `putRecordWithCorrection`/
   `putRecordWithRedaction` store methods (a real DynamoDB `TransactWriteItems`) plus stable,
   requestId-derived history ids and an already-applied guard.
4. **The media-purge claim's lifetime and recovery were incomplete.** It was released right after
   the purge, before the final commit, reopening the exact race it exists to prevent; and a retry
   under its own `requestId` was wrongly refused as foreign. Fixed: the claim is held continuously
   through the final write and resumed by its own `requestId`, never a different one.
5. **The response budget excluded text/history.** The previous budget measured only media; 20
   records with large text produced 9 MB+ despite it. Fixed: `exportFixtureSet` now measures each
   record's REAL complete serialized envelope and excludes the whole record (never trims) if it
   would cross the limit, reported in a new `recordsSkippedForResponseBudget` field.

158 tests pass (up from 150). Both live drills were extended and re-run: `realS3MediaAcceptanceDrill.ts`
(Finding 4) — **36/36**; `realCorrectionRedactionDrill.ts` (Findings 1-3 and the API-shape half of
Finding 5) — **32/32**. One honestly-named limitation: Finding 5's actual whole-response TEXT
exclusion couldn't be forced live — every attempt against this fixture stack's deliberately tiny,
always-free-tier DynamoDB provisioning observably throttled (confirmed directly against
CloudWatch/Lambda logs), but that's an observed result from these specific attempts, not proof
it's categorically impossible at 5 RCU/s (AWS documents burst capacity beyond the nominal rate) —
so that exact scale stays proven byte-for-byte by the deterministic local test instead. See the
evidence matrix's seventh-review-round note.

**2026-10-04, eighth review round — four more gaps reproduced as deterministic LOCAL
reproductions, all fixed, regression-tested, and re-verified against real DynamoDB/S3:**

1. **Concurrent corrections silently lost an edit.** `FixtureRecord.version` never actually
   advanced — every caller spread a freshly-read copy without incrementing it, so two concurrent
   corrections both reading version 0 would both pass the conditional-write check and the second
   would silently clobber the first. Fixed by making the STORE itself (not the caller) own the
   persisted version, incrementing it on every successful write — closes the bug for every current
   and future caller structurally, not just the ones this round caught.
2. **A retry could still destroy the original history value.** The "already applied" guard used a
   query-style lookup that, on the real adapter, is eventually consistent and can miss a
   just-committed write — a retry landing in that window could re-capture the already-corrected
   value as a fake "previous" one. Fixed two ways: a strongly consistent by-id lookup
   (`getCorrection`/`getRedaction`) for the common case, AND a conditional write on the history row
   itself (rejecting a duplicate id outright) as the real, unconditional guard even if the pre-check
   is somehow still wrong.
3. **Retention could overwrite a deleted tombstone.** `retainForPreservationOnly()` checked only
   the media-purge claim, never custody status — retention immediately after a completed deletion
   could flip an already-`"deleted"` tombstone back to `"preserved"`. Fixed by rejecting
   `"deleted"` custody outright, covering both a fully completed deletion and the narrower
   mid-recovery window.
4. **The export budget still missed Lambda's real response encoding.** The budget measured this
   export object's own single encoding, not what the Lambda handler actually returns — the body
   gets embedded as a STRING inside the response wrapper and re-escaped, so quote/backslash-heavy
   content could measure safely under budget yet nearly double once really wrapped. Fixed by
   measuring that real re-escaped cost directly.

164 tests pass (up from 158). Both live drills were extended and re-run:
`realCorrectionRedactionDrill.ts` (Findings 1 and 2, against real DynamoDB's own
`ConditionExpression`/`TransactWriteItems`) — **38/38**; `realS3MediaAcceptanceDrill.ts`
(Finding 3, a real deletion run to completion then retention immediately after) — **41/41**.
Finding 4 wasn't re-attempted live beyond the API-shape check the seventh round already did —
per explicit instruction, this shared table's capacity stays unchanged, and the same
observed-throttling (not categorical-impossibility) caveat applies. See the evidence matrix's
eighth-review-round note.

**2026-10-04, ninth review round — one residual export-budget gap with two reproducible paths,
neither about any one record's content, both fixed, regression-tested, and re-verified against
real DynamoDB/Lambda:**

1. **The manifest still got a fixed, optimistic allowance.** `fixtureSetId` has no length limit
   and the manifest embeds it verbatim — 20 ordinary records plus a 2 MiB `fixtureSetId` produced a
   real 7,026,838-byte response. Fixed with a `MAX_FIXTURE_SET_ID_LENGTH` cap (enforced at the API
   boundary and defensively inside `exportFixtureSet`) and by seeding the running budget total from
   the manifest's REAL encoded size, not a fixed guess.
2. **Skipped-record entries were counted but appended unconditionally.** 8,000 requested records
   (903 included, 7,097 skipped) produced a real 7,291,455-byte response, because the skip report
   itself could grow without bound. Fixed with a `MAX_EXPORT_RECORD_IDS` batch-size cap AND a loop
   that stops — reporting a new `recordsNotProcessed` field honestly — the moment even one more
   skip entry would itself exceed budget.
3. **A final, outermost guard.** `router.ts`'s `/export` route now computes the real wrapped
   response size and answers a `413` if it would still exceed Lambda's hard limit despite
   everything above.

168 tests pass (up from 164). `realCorrectionRedactionDrill.ts` was extended and re-run: the real
deployed API rejects both an oversized `fixtureSetId` and an oversized batch with a real 400,
before any record is even looked at — **40/40**. Unlike the prior round's residual gap, these two
fixes make the deployed API do LESS work on bad input, so confirming them live needed no capacity
change and consumed essentially no RCU. See the evidence matrix's ninth-review-round note.

## CI: self-hosted fonts and the dependency audit

`next/font/google`'s Turbopack resolution fetches font files from Google at build time — a
documented, recurring source of CI flakiness (network-dependent, non-hermetic builds; see
upstream reports on this exact failure mode). Fixed by switching `src/app/layout.tsx` from
`next/font/google` to `next/font/local`, with the same files/weights/styles (latin subset)
downloaded once and committed under `src/fonts/`. The build is now hermetic — no network access
needed at build time for fonts.

`npm audit` reports 6 high-severity advisories, investigated rather than blindly run through
`npm audit fix --force`:
- 5 trace through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` →
  `braces`. `braces@3.0.3` (the advisory's vulnerable range is `<=3.0.3`) is the latest version
  published on the registry — **no fixed version exists yet**, so no override or upgrade can close
  this; `npm audit`'s suggested "fix" (downgrading `eslint-config-next` to a Next-14-targeted
  `14.2.35`) is a red herring, not a real fix, and would be actively wrong for a Next-16 project.
- 1 is `brace-expansion` nested under `aws-cdk-lib`'s own `minimatch`. Confirmed mechanically (not
  just by failed override attempts) that `aws-cdk-lib` ships `minimatch`/`brace-expansion` as
  **bundled dependencies** — vendored inside its own published tarball at an exact pinned version —
  which `npm overrides` cannot reach at all, and `aws-cdk-lib@2.272.0` is already the latest release.

All 6 are devDependencies used only by `eslint .` (file-discovery globbing) or `cdk synth`/`cdk
deploy` (asset-staging globbing) — never shipped to the Next.js app or any runtime path, and the
only inputs they ever parse are this repo's own file paths, never untrusted/external input. Accepted
and documented rather than chased further; revisit when either upstream ships a fix.

## Three distinct things, kept distinct

1. **The historical static prototype** (`docs/memory.txt`). The public Next.js site, its three
   labeled demonstration memory records, the node graph. Unchanged by this milestone. Still has no
   database, no auth, no upload flow — nothing in this backend work touches it.

2. **This fixture-preservation milestone** (this folder). A separate `backend/` + `infra/` codebase
   modeling the permission/lifecycle/export/restore machinery `docs/ethos.txt` §3.3/§3.10/§4/§6.1/§12
   describe, exercised against synthetic, invented, non-sensitive fixtures — never the public site's
   real demonstration records, never real collected material. Deployed to a real, dedicated AWS
   account (`440744257823`, `us-east-1`) as of 2026-10-02; the record-level restore-after-withdrawal
   scenario has been proven against real DynamoDB, not just the local fake, and so (as of
   2026-10-03) have concurrent-write rejection and export-time authorization — live grant-level
   revocation too, though its own restoration case is tracked separately (see
   `docs/backend/evidence-matrix.md` for exactly what's covered and what isn't — each case is
   proven in isolation, not yet combinatorially). Still genuinely incomplete for the parts that need
   organizational decisions this document can't make (named operators, adopted retention procedures)
   or further engineering (no Lambda/API/staff-UI surface yet).

3. **Future real-collection readiness.** Not started, and not implied by anything in this
   milestone. §6.1's full gate — real intake, real consent capture, a real named operator roster,
   adopted (not proposed) response-window numbers — remains unmet. Nothing in this backend writes
   real collection, and the code enforces fixture-only mode structurally (every fixture carries
   `isSynthetic: true`; `validateExport` in `restore.ts` refuses to import anything that doesn't).

## What changed, concretely

- New `backend/` package: domain types, a storage abstraction with both an in-memory fake (tested)
  and a real DynamoDB adapter (type-checks, not yet run against AWS), permission evaluation,
  lifecycle operations (restrict/withdraw/retain/delete/the deletion-pending→deleted gate),
  preservation export, and restoration with reconciliation against a durable, separately-stored
  restriction register.
- New `infra/` package: a CDK stack (two DynamoDB tables, an S3 media bucket, a Cognito staff pool,
  bounded-retention logging, a billing alarm with a real SNS email subscription) — deployed as
  `TiroFixtureBackend-drill-20261002`.
- 45 passing local tests as of the original 2026-10-02 delivery (now 54 after the 2026-10-03
  correctness pass above), including the T0→T1→T2→T3 restore-after-withdrawal acceptance test the
  brief names as central, plus a negative control and a concurrent-restriction case.
- That same T0→T1→T2→T3 sequence also run for real (`backend/src/scripts/realBackupRestoreDrill.ts`)
  against the deployed stack: real `CreateBackupCommand`, real withdrawal against live data, real
  `RestoreTableFromBackupCommand`, real reconciliation against the untouched live restriction
  register. Two real bugs found and fixed in the process (a tag-propagation race on table delete,
  and a too-short restore-wait timeout) — see the evidence matrix for exactly what broke and why.
- CI now typechecks and tests both new packages and synths the CDK stack, on every PR, without any
  AWS credentials. The real-AWS drill is deliberately NOT in CI — it costs real (if tiny) money and
  takes up to ~10 minutes; it's a manually-invoked script, documented in the runbook.
- The public Next.js site's content/design is untouched; its build mechanism changed once,
  2026-10-03, purely for CI reliability — `next/font/google` swapped for `next/font/local` with the
  same fonts self-hosted under `src/fonts/` (see "CI: self-hosted fonts and the dependency audit"
  above). Same 45-then-55-test backend baseline either way (18 pre-existing `recordKind` frontend
  checks; the rest are backend tests).
- New `backend/src/api/`: a transport-agnostic router (`router.ts`, 14 tests) and the real Lambda
  entrypoint (`handler.ts`, 7 tests for its pure parsing logic) — every route re-runs
  `evaluatePermission`/the lifecycle functions unchanged; Cognito authentication only gates who may
  call the API and whose identity lands in the audit trail. New `staff-ui/`: a standalone static
  page (not part of the Next.js app) using Cognito Hosted UI OAuth2 + PKCE. 76 tests total.
- `infra/lib/fixture-backend-stack.ts` grew an HTTP API, a Lambda (bundled via esbuild through
  CDK's `NodejsFunction` — no Docker needed, matching this environment's constraints), a Cognito
  Hosted UI domain + OAuth app-client config, and `AdminInitiateAuth` enabled on that client
  (IAM-gated, used for scripted sign-in/smoke-testing without implementing SRP by hand). Deployed
  and smoke-tested against the real stack — see the evidence matrix.
- 2026-10-04, operational readiness: the staff API smoke test is now a reusable script
  (`realStaffApiSmokeTest.ts`, 8/8), `realFullFixtureChecks.ts` grew combinatorial-case checks, a
  legacy-media inventory/dry-run migration script was written and run against the live register, a
  16-step browser-acceptance checklist plus its seeding script are prepared for human execution,
  real AWS cost/billing were reconciled, and an S3 noncurrent-version expiry observation was
  seeded. DynamoDB capacity was deliberately left unchanged throughout. See the evidence matrix for
  full results.
- 2026-10-05, review of the operational-readiness round above found three real gaps, all fixed: (1)
  the legacy-media migration could rebind media for a record already in the deletion workflow, and
  a failed custody-copy write could leave an uploaded S3 object untracked forever — fixed by
  extracting the logic into `services/legacyMediaMigration.ts` (now unit-tested against the
  in-memory fakes), checking custody eligibility FRESH before any upload, writing the record+copy
  atomically (`FixtureStore.putRecordWithCustodyCopy`, a new transactional store method), and
  cleaning up an orphaned upload if the atomic write still fails; (2) the new revocation-vs-
  restriction race check rejected a VALID outcome (both calls serializing cleanly with nothing to
  retry) and retried a conflict loser with a brand-new requestId instead of its original one — fixed
  by accepting either valid outcome, adding a deterministic forced-conflict check, and retrying with
  the original requestId (which also surfaced a genuine production bug: DynamoDB's
  `TransactionConflict` cancellation reason wasn't mapped to `VersionConflictError` in
  `dynamoStore.ts`, now fixed); (3) the S3 expiry checker's eligibility date was computed as a raw
  `+30 days` instant instead of rounding up to S3's actual daily UTC-midnight sweep (corrected:
  2026-11-04T00:00:00Z, not 2026-11-03T22:44), and `--check` could falsely report "expired" for an
  empty listing or for the inverse case where the current version vanished — fixed by persisting
  the exact seeded version ids as a positive control. `realFullFixtureChecks.ts` now passes 15/15
  live. See the evidence matrix for the full detail.
- 2026-10-06, a second review round of the operational-readiness work above found five more real
  gaps, all fixed: (1) legacy-media migration could still race deletion EVEN with a fresh custody
  check — `startDeletion`+`completeDeletion` can run to completion entirely in the gap between that
  check and the upload finishing — fixed with a new `CustodyCopyCommitter` that commits the
  record+copy in ONE DynamoDB transaction spanning both the primary table and the restriction
  register, asserting custody status as part of that same atomic commit; `listCustodyCopies` was
  also made strongly consistent. (2) The cleanup-on-failure path could destroy a binding that
  actually committed (a timeout can report failure after the server already applied the write) —
  fixed by re-checking the record fresh before ever deleting the uploaded object, the same
  idempotent-recovery idiom used throughout `services/lifecycle.ts`. (3) The S3 expiry checker's
  date guard only ran when v1 was still present, so v1 disappearing for any other reason before real
  eligibility would have been misreported as an early pass — fixed, and the whole eligibility/check
  decision tree was extracted into a unit-tested module, `services/s3ExpiryObservation.ts`. (4) The
  older `Finding 2b` race check carried the exact same two defects the first round's combinatorial
  check did — fixed with the identical accept-either-outcome, retry-the-original-requestId pattern.
  (5) The staff UI wiped every action's response (including `start-deletion`'s requestId and actor
  attribution) almost immediately via its own reload — fixed with a persistent, page-level Action
  log. `realFullFixtureChecks.ts` now also directly verifies the new cross-table transaction
  mechanism against real DynamoDB. See the evidence matrix for the full detail and real re-run
  results.
- 2026-10-06, a third review round found the second round's own fixes had two more gaps: (1) the
  idempotent-recovery recheck (added to resolve an uncertain commit) was itself an unguarded network
  call — a reviewer forced a DEFINITE custody refusal immediately followed by a recheck failure, and
  the resulting uncaught exception skipped cleanup entirely, resurrecting the original orphaned-S3-
  object bug via a new path. Fixed: definite non-commit signals now skip the recheck entirely (no
  dependency on a read that could itself fail), and the recheck — for the genuinely uncertain cases
  that still need it — is now wrapped so a failure there preserves both error messages in a new,
  dedicated outcome rather than throwing uncaught. (2) A failed cleanup was still reported as
  `"skipped-ineligible"`, so the CLI's failure count and exit code never reflected an orphaned
  object — fixed with a new `"needs-reconciliation"` outcome carrying the exact objectKey/versionId,
  which the CLI now counts and exits non-zero on. 3 new regression tests (188 total). Migration
  stays dry-run only. See the evidence matrix for the full detail.
- 2026-10-06, a fourth review round caught that an ORDINARY write failure (e.g. a real
  `AccessDeniedException`, reproduced by injecting one directly into the CLI) still landed in
  `"skipped-ineligible"` once cleanup succeeded — reported as a benign skip, CLI exit 0, record left
  genuinely un-migrated with nothing distinguishing it from a correct-by-design exclusion. Fixed:
  `"skipped-ineligible"` is now reserved for refusals that are correct by design (early eligibility
  checks, plus `DeletionInProgressError`/`VersionConflictError`); every other confirmed non-commit is
  now a distinct `"failed"` outcome that the CLI counts and exits non-zero on. Migration stays
  dry-run only. See the evidence matrix for the full detail.
- 2026-10-06, `--apply` executed for real against the drill stack, after explicit authorization
  (fresh dry-run, then apply, then independent verification). Result: 40 rebound, 0 skipped, 0
  failed, 0 needing reconciliation. All 40 independently re-verified directly against S3 (exact
  object, exact SHA-256) and DynamoDB (exact `MediaRef`, matching `CustodyCopy`). A confirmatory
  dry-run immediately afterward found 0 remaining rebindable — only the 6 records correctly in the
  deletion workflow still carry legacy references. Capacity unchanged throughout. See the evidence
  matrix's "`--apply` executed" entry.

- 2026-10-07, the literal human browser click-through of `docs/backend/browser-acceptance-checklist.md`
  was run for real against the deployed stack: **16/16 steps passed**, staff identity
  `cero@tiro.foundation`. Caught and fixed one real setup-time bug along the way: `staff-ui/serve.json`'s
  `cleanUrls: false` (needed to stop the `callback.html` query-string-dropping redirect) also silently
  disabled `index.html` auto-serving at the root path, since `serve-handler` gates both behaviors on the
  same flag — `http://localhost:4300/` had been serving a raw directory listing instead of the staff
  page. Fixed with a targeted `rewrites` entry for `/` only. See the evidence matrix's "Browser-flow
  verification" section for the full result and the two specific prior-review-round cases (step 11's
  correction-history masking, steps 13-14's export-scope difference) this run directly confirmed live.

- 2026-10-08, staff intake and review (docs/ethos.txt §§3.2-3.3): a staff member can now originate
  a brand-new synthetic record through the browser — metadata, structured authority/legal-rights/
  consent-grant evidence, a small media file — starting quarantined and unpublished, until a
  reviewer's decision (`approve-preservation`/`approve-publication`/`request-changes`/
  `reject-submission`) promotes it into the exact same permission/export/redaction/deletion
  machinery every other record is already subject to. Five review rounds before a line of
  production code was written found real design gaps, each closed: `evaluatePermission` now
  explicitly denies `"quarantined"` custody unconditionally (closing a window where an approval's
  own multi-step evidence verification could make a record readable before it was actually
  approved); every cross-table intake write (`IntakeRegisterCommitter`, `store.ts`) atomically
  asserts the register's exact state and version, closing races against rejection and deletion a
  separate read-then-write could not; approval is pinned to the exact record AND register
  revision the reviewer actually saw (a metadata correction via the existing `correctRecord`
  bumps the record's own version, never the register's — both are now asserted together);
  approval requires the complete set of a record's unresolved evidence to be named, not a subset,
  and validates named consent grants against the same real `findApprovableGrant` predicate
  `evaluatePermission` itself uses (purpose, audience, revocation — including the register's
  `revokedConsentIds`, not just a grant's own `revokedAt` — and expiry); a wrong claim is
  corrected via a new `supersedeAuthorityClaim`/`supersedeLegalRight` (preserving history, never
  silently overwriting) rather than left as a permanently-blocking stale `"unknown"` row; a new
  `GET /intake/:recordId` (and `/intake/:recordId/media/:mediaId`) read path, authorized by
  nothing but being signed-in staff — never a grant, since none can be verified yet — lets a
  reviewer actually see what they're approving and preview an upload the normal, now-quarantine-
  denying media route can't serve; and the review queue's two stages (`GET /intake/queue`) never
  show a raw title the viewer wouldn't actually be authorized to see. 206 backend tests pass (up
  from 188). `backend/src/scripts/realIntakeAcceptanceDrill.ts` — the reviewer's own stated
  completion test, run for real against the deployed stack — **22/22 checks passed**: create
  through the live API, add real evidence and a real media file, confirm quarantine denies
  staff/preservation access even with that evidence attached, confirm a real metadata correction
  mid-review makes a stale approval attempt fail with a real DynamoDB version conflict (not a
  silent bad approval), approve preservation for real, confirm staff/preservation access is now
  allowed and public/publication access stays denied, confirm `approve-publication` is itself
  denied with no publication grant ever submitted — the exact "publication remains denied without
  its own grant" guarantee — export both scopes, restore into an isolated target, withdraw, and
  delete. `infra/lib/fixture-backend-stack.ts` grew four new routes (`POST /intake`, `GET
  /intake/queue`, `GET /intake/{recordId}`, `GET /intake/{recordId}/media/{mediaId}`) and a
  narrowly scoped `s3:PutObject`-family grant limited to the `fixtures/*` prefix every media
  object in this system already uses — the first thing this Lambda has ever uploaded itself.
  DynamoDB capacity unchanged throughout.

- 2026-10-08, a review of commit `88f5dc7` found seven real gaps (five P1, two P2), all fixed and
  re-verified against the real deployed stack: (1) `addMedia`'s idempotency fingerprint stored the
  full uploaded base64 — persisted forever on the LifecycleRequest row (a different partition key,
  never touched by redaction or deletion), retrievable via `GET /lifecycle-requests` long after the
  record itself was gone. Fixed with a SHA-256 digest instead of the raw bytes, `payloadFingerprint`
  stripped from the queue response entirely, and the two already-persisted rows this stack's own
  drill runs created reconciled directly. (2) `listAuthorityClaims`/`listLegalRights`/
  `listConsentGrants` had neither `ConsistentRead` nor pagination — an eventually consistent miss
  could let `approvePreservation`'s evidence-completeness check (and `evaluatePermission`'s own
  blocking check) overlook a just-committed claim. Fixed with a new strongly consistent, fully
  paginated query path for these three specifically. (3) `readIntakeQueue` masked titles using the
  register entry captured by its own initial scan rather than a fresh read, letting a stale snapshot
  expose a title the detail route correctly withheld. Fixed by re-reading each candidate's register
  state fresh immediately before using it. (4) `addMedia`'s cleanup never distinguished a definite
  non-commit (`VersionConflictError`) from a genuinely uncertain one, so routing every failure
  through the uncertain path's recheck could skip cleanup entirely if that recheck itself failed —
  resurrecting the exact orphaned-upload bug `legacyMediaMigration.ts` had already fixed once, this
  function's own comment claimed equivalence to that fix without actually implementing it. Fixed by
  adding the definite-vs-uncertain split for real, and using a terminal denial (not a retryable
  status) for any case needing human reconciliation. (5) `commitApproval`'s consent-grant flip
  required `signerCapacityVerified === false`, permanently rejecting a grant that legitimately
  covers both preservation and publication purposes and was already verified by the first approval.
  Fixed to require only that the grant exists. (6) Three browser gaps: optional consent fields
  (`mandateRef`/`jurisdiction`/`expiresAt`) sent `""` instead of `null`, always failing validation;
  `approve-publication` was only ever rendered in the intake detail view, unreachable once a record
  is "preserved" (exactly where the publication queue opens it); intake evidence tables omitted the
  fields a reviewer actually needs. All three fixed. (7) The browser never sent a client `requestId`,
  so a lost response followed by a retry created a genuine duplicate on every form, not just
  create-submission. Fixed with a stable, per-form-instance requestId, regenerated only after a
  successful submission. 214 backend tests pass (up from 206).
  `realIntakeAcceptanceDrill.ts` was extended to cover the publication SUCCESS path (a real,
  separate publication-purpose grant, added alongside the preservation grant while still
  quarantined, verified for real) rather than only its denial — **25/25 checks pass live.**

- 2026-10-08, a review of commit `efcc811` found two residual P1s, both closed: (1) the queue-
  redaction fix from the prior round still read the register BEFORE the record — correct for a
  SINGLE read, but the WRONG order relative to the record read that followed it. A redaction
  immediately followed by an unrelated correction (which overwrites the record's raw stored value
  regardless of redaction flags — only a FRESH register read re-masks it) landing in that gap
  produced a real, reproduced leak in both queue halves. Fixed by reading content FIRST and the
  register LAST, consistently, in both `readIntakeSubmission` and `readIntakeQueue` — the register
  snapshot used for eligibility and masking is now always at least as fresh as what it's about to
  decide and mask. (2) The digest fix from the prior round only covered `addMedia`'s base64 field —
  `fingerprintFor` (`services/lifecycle.ts`, shared by every lifecycle action) and
  `getOrCreateSubmission` (`services/intake.ts`) still stored the raw canonical request JSON
  verbatim, including `correctRecord`'s real corrected text and `createSubmission`'s real title/
  summary/provenanceRef — reproduced surviving a real completed deletion. Fixed centrally: both
  functions now store a SHA-256 digest of the canonical payload instead of the payload itself,
  preserving `getOrCreateRequest`'s exact replay-detection contract (two calls with the identical
  payload still produce the identical stored string). All 240 already-persisted LifecycleRequest
  rows across this stack's entire history were reconciled directly (rehashed in place; original
  content never reproduced or logged). Two new regression tests prove the ordering fix with a
  deterministic redact-then-correct race injected between the exact reads being fixed (not just
  "redaction alone"); two more prove the digest fix with real content values asserted absent from
  storage. 218 backend tests pass (up from 214). Redeployed; `realIntakeAcceptanceDrill.ts`
  re-run — **25/25 checks pass live.**

- 2026-10-08, the literal human browser click-through of the staff-intake flow: create →
  evidence (authority claim, legal right with a deliberately blank optional field, two separate
  consent grants) → media upload and preview → confirmed quarantine denies access even with that
  evidence attached → approve preservation → confirmed access change → approve publication via
  the review queue's own `Open` link and the (newly added) approve-publication form on the
  record view → confirmed publication access → withdraw → delete → confirmed gone. One more real
  bug surfaced mid-walkthrough and fixed on the spot: `GET /intake/queue` threw
  `ProvisionedThroughputExceededException` once the register table's accumulated history (240+
  rows from this engagement's own drills) made the prior round's per-entry race fix read every
  single entry rather than just the relevant ones — fixed with a cheap pre-filter using the
  scan's own already-free data before any expensive per-entry read, confirmed live immediately
  after redeploying. 219 backend tests pass (up from 218). This closes the staff-intake-and-
  review milestone's last open item — every control has now been proven both live against AWS
  and through a real human click-through, the same bar every other control in this system has
  met.

- 2026-10-08, a review of commit `f335ea3` (which had already merged to main, CI green at
  219/219) found one more real P1, now closed: `readIntakeQueue`'s `pendingPublication` loop
  still took its OWN separate register read — correct relative to the record read before it
  (the prior round's ordering fix), but WRONG relative to `evaluatePermission`, which does its
  own, independently-timed register read internally and was never told about the caller's
  already-fetched snapshot. The reviewer reproduced a redaction landing between the two reads:
  the queue returned the original title while `GET /intake/:recordId` correctly returned
  "[REDACTED]" for the same record; a stronger repro combining an expired preservation grant
  with concurrent redaction/publication-approval showed access denied before the transition and
  the title still exposed after it. Fixed exactly as specified: `PermissionDecision`
  (`services/permissions.ts`) now carries the exact `control` snapshot `evaluatePermission`
  used internally — every one of its 11 return paths returns it (`null` only in the one branch
  that runs before any register read happens at all). `readIntakeQueue`'s publication loop no
  longer reads the register itself; it calls `evaluatePermission` once and uses
  `decision.control` for the eligibility recheck, the title masking, AND the reported
  `controlVersion` — one register read per candidate, not two. A new regression test
  (`intakeViews.test.ts`) wraps `RestrictionRegisterStore` to return a healthy snapshot on the
  first call and a revoked one on any second call for the target record; confirmed it actually
  fails against the pre-fix code (temporarily reverted to verify, then restored) before trusting
  it as a real regression guard. 220 backend tests pass (up from 219). Redeployed to
  `TiroFixtureBackend-drill-20261002`; `realIntakeAcceptanceDrill.ts` re-run — **25/25 checks
  pass live.** This closes the shared-snapshot gap the reviewer held sign-off on; the staff
  intake and review milestone is now complete.

## What remains open, by kind

**Engineering, scoped and ready to pick up:**
Actual image/audio/video redaction (blur/bleep/crop) — this
backend's redaction is text-masking and a hard media-access override only, honestly short of real
media-content processing, which needs infrastructure this project doesn't have. Forcing the export
response budget's real whole-record TEXT exclusion live, as opposed to proving the field merely
exists — needs reading several real MB out of this stack's deliberately tiny, always-free-tier
DynamoDB provisioning inside one Lambda invocation; every attempt tried observably throttled, but
that's an observed result from those specific attempts, not proof it's categorically impossible at
this provisioning (AWS's documented burst capacity means a different attempt could succeed) — and
a real, billed capacity bump wasn't made unilaterally, per explicit instruction to leave this
shared table's capacity unchanged; see the evidence matrix's seventh-review-round note. Versioned correction and redaction, authorized-media S3 routes, real S3
object-version inventory/removal, and byte-level checksums are now DONE — see the S3 media and
correction/redaction milestone entries above and the evidence matrix's "Real S3 media acceptance
drill" / "Real correction/redaction drill."

**Organizational, not engineering — this document cannot close these:**
A named operator. Adopted (not proposed) consent/retention response-window numbers. Both are
prerequisites §6.1 states explicitly; fabricating placeholder values for either would be exactly
the kind of unearned claim the last several rounds of this project's review process have been
catching and correcting. They stay blank here on purpose.
