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

## What remains open, by kind

**Engineering, scoped and ready to pick up:**
Versioned correction and redaction (§3.5/§12's "Correct" action has no implementation yet).
Migrating the many already-live legacy (`versionId: null`) media references seeded in earlier
sessions — they correctly fail closed today, but nothing re-uploads/rebinds them automatically. A
combinatorial real-AWS case or two (e.g. a revocation racing a concurrent restriction, or a media
purge racing an export). Authorized-media S3 routes, real S3 object-version inventory/removal, and
byte-level checksums are now DONE — see the S3 media milestone entry above and the evidence matrix's
"Real S3 media acceptance drill."

**Organizational, not engineering — this document cannot close these:**
A named operator. Adopted (not proposed) consent/retention response-window numbers. Both are
prerequisites §6.1 states explicitly; fabricating placeholder values for either would be exactly
the kind of unearned claim the last several rounds of this project's review process have been
catching and correcting. They stay blank here on purpose.
