# Phase 4.7: Gate G4 preflight

**Status: preflight. Read-only investigation, local synthetic verification and documentation only.** It proposes; it authorizes nothing. No application code, protected file, configuration, credential, staging setting or operational data was changed. It returns to the founder and Veris for review.

- **Branch:** `phase-4/integration-verification-4-7`, from `main` at `bc3caf5` (PR #33, Phase 4.6). This document is its only change.
- **Plan:** `docs/design/milestone-3.0-phase-4-flight-deck.md` §7 (Gate G4). Findings R1–R12: `docs/design/phase-4/pr-4-6/semantic-review.md` §6.
- **Date:** 2026-11-12.
- **Evidence** (logs, reports, captures, scripts) is outside the repository, in `C:\tiro\dev\evidence\phase-4-7\`.

Throughout, a passing automated check is never counted as a manual acceptance. "Verified" means verified for `bc3caf5` by the evidence named; "observed" means seen in a GitHub record, which is not proof of enforcement.

## 1. Verified GitHub baseline

`origin/main` was fetched and is `bc3caf5c86fc0b952360c284312ca02f82fa6cd4`, as expected. The worktree `C:\tiro\dev\tiro-4-7` was created from it; earlier Phase 4 worktrees were not touched.

GitHub was read only through the read-only `tiro-gh` tool (`evidence` and `api GET`). Every merge below is a two-parent merge commit on `main`'s first-parent history, merged by `onewisepixel`.

| PR | Scope | Head | Merge commit | Merged (UTC) | CI on the PR head (`pull_request`) | CI on the merge (`push`) |
| --- | --- | --- | --- | --- | --- | --- |
| #26 | 4.1 Boundary and baseline | `cd1ee99` | `c0ba7cb` | 2026-11-05 04:38 | run 41955142202: both jobs success | both jobs success |
| #27 | Governance: self-test anchor (header offsets) | `5ac5079` | `5d42f9a` | 2026-11-07 21:13 | run 42394682390: both success | both success |
| #28 | 4.2 Shell and navigation | `6792310` | `35f119d` | 2026-11-07 22:46 | run 42420566028: both success | both success |
| #29 | 4.3 Shared components | `671b3eb` | `3c531a8` | 2026-11-10 18:16 | run 42532034189: both success | both success |
| #30 | 4.4 Read-only screens | `068a54b` | `f1d9168` | 2026-11-10 21:13 | run 42902419200: both success | both success |
| #31 | 4.5 Working forms | `2d6c8cd` | `d535e68` | 2026-11-11 20:13 | run 43032198647: both success | both success |
| #32 | Governance: self-test anchor (Approvals) | `dadb3a9` | `e4fda32` | 2026-11-12 07:26 | run 43175029402: both success | both success |
| #33 | 4.6 Consequential and authorization screens | `63e0f56` | `bc3caf5` | 2026-11-12 08:57 | run 43182260446: both success | **run 43187205552: both success** |

"Both jobs" are `build-lint-test` and `flight-deck-boundary`, each attempt 1.

**Limits of this evidence:**
- It is *observed*: those jobs ran for those commits and concluded as shown. It does not prove that GitHub enforced them; that is branch protection, which the founder confirms in the web UI (the tool cannot read it: route 16 is excluded).
- The non-required status "Vercel – tiro-foundation" reports **failure** on every one of the eight merge commits. It is not a required check and Phase 4 did not touch deployment, but it is unexplained here.
- The tool refused to read the job logs: GitHub redirects them to blob storage, and the tool refuses a response without its token-expiry header. The boundary job's mode and findings were therefore re-established locally (§2, condition 3), not read from CI.

## 2. Gate G4 requirements matrix

Status: **verified**, **partially verified**, **blocked** (cannot proceed without a decision, access or change), or **unverified**. "Needs" names what completing the item requires: a protected-code change (P), a human test (H), infrastructure or staging access (I), separate founder authorization (A).

| # | Requirement and acceptance criterion (plan §7) | Evidence | Applies to `bc3caf5`? | Status | Remaining work, and who | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PRs 4.1–4.6 merged with merge commits | §1: #26 `c0ba7cb`, #28 `35f119d`, #29 `3c531a8`, #30 `f1d9168`, #31 `d535e68`, #33 `bc3caf5`; all two-parent merges on the first-parent history. Governance #27 `5d42f9a` and #32 `e4fda32` likewise | Yes | **Verified** | — | — |
| 2 | `build-lint-test` and `flight-deck-boundary` green on each PR and on the final `main` | §1: one `pull_request` run per PR head and one `push` run per merge, both jobs success, attempt 1; `bc3caf5`: run 43187205552 | Yes | **Verified (observed)** | Enforcement as required checks is confirmed only in the GitHub UI (founder). The non-required Vercel status fails on every merge (decision 8) | — |
| 3 | The boundary checker reports no protected change; the exceptions file holds nothing beyond what the founder approved | The checker re-run locally on each PR head against its merge base (`boundary/pr-*.log`): all PASS. **Enforce mode** for the six `phase-4/*` PRs (PR 4.6: Recovery and sign-in noted for founder review). **Report mode** for #27 and #32, each changing only `scripts/test/flight-deck-boundary.test.mjs` under its own review. The exceptions file has one entry (decision 58, PR 4.1), unchanged since `7d94e2c`. Protected paths changed since PR 4.1's merge: that test file only | Yes | **Verified**, with the two governance changes disclosed | — | — |
| 4 | The census is identical to the baseline for all four roles | `final/census-file.log`, `final/census-pg.log`: IDENTICAL on both stores. Also identical in 13 of 13 print-view trials (§5) | Yes | **Verified** (local demo, Chromium) | The PR 4.6 run-1 anomaly remains open (§5) | — |
| 5 | E2E passes on the file store and on PostgreSQL, with at least the baseline's 53 checks | `final/e2e-file.log`, `final/e2e-pg.log`: 53/53 each | Yes | **Verified** | — | — |
| 6 | `test:flight-deck-pg`, `verify:disclosure` and the public-site release suite pass; `/pilot` and approved public-page captures unchanged | `test:flight-deck-pg` 28/28. `verify:disclosure`: "disclosure boundary holds". Release suite (`public-site-checks.mjs check`, production build): **241/241**. Parity, pre-Phase-4 build `bec57d2` vs `bc3caf5`, 96 captures: **92 identical, including all 12 of `/pilot`**. The 4 that differ are `/living-trace` with motion on (10–14 pixels; style fingerprint identical; the reduced-motion captures identical), which is animation timing. No public `src` file differs between the two commits | Yes | **Verified (local)** | No Phase 4 PR had run the release suite or parity before this preflight. CI does not run them | — |
| 7 | axe: no serious or critical violations on every console screen, both themes, 1440 and 390 px; no horizontal overflow from 320 px; every focus stop visible | State sweep (Approvals, Health, Recovery, Sign-in in 9 states): axe 0 in 116 runs; overflow 0 of 174; 3,012 focus stops, every console stop visible. Regression sweep (16 screens, including Now, a relationship, print, outreach, content, campaigns, cases, digest): axe 0 in 96; overflow 0 of 288; 2,668 stops, all visible | Yes | **Partially verified** | **Not in this sweep:** the relationship, outreach, content and case lists, Activity and Signed out (covered at PR 4.4, before later PRs). **Not renderable:** Gates and the production sections (R12). Chromium only. Who: Claude, with an extended out-of-repository sweep; R12 for Gates | P (R12) for Gates |
| 8 | `SyntheticBanner` text byte-identical; the print view keeps its banner and its CONFIDENTIAL or SYNTHETIC label in both themes | Both strings identical in `ui.tsx` at `bec57d2` and `bc3caf5` (and enforced by the checker on every PR). Print emulation, founder and operator, dark and light: the banner text is exact and displayed, and the label "SYNTHETIC DEMO DATA" is displayed after it; PDFs in `print/` | Yes | **Verified** for the local demo's synthetic label | The CONFIDENTIAL label needs a non-synthetic store: production only; not seen | — |
| 9 | A manual assistive-technology pass of `manual-tests.md` §2 tasks 2–7, with a desktop and a phone screen reader | None. `manual-tests.md`: "Not performed" | — | **Unverified** | A person runs §7. Tasks 2–6 on the local demo; task 7 on staging | H; I and A for task 7 |
| 10 | The founder's review of the local synthetic demo, recorded | None found. The founder approved each PR's semantic review, but there is no recorded review of the demo as a whole | — | **Unverified** | The founder (§7.2, decision 12) | H |
| 11 | Then, under its own approval, a staging deployment through the approval-gated workflow | Staging last recorded at `b632c24` (2026-10-23), before Phase 4 | No | **Blocked** pending authorization | Founder decision on approach (decision 9); then the deployment workflow | I, A |
| 12 | Every public `/flight-deck` route answers 404 in production; no real data, contact or outbound capability introduced | **A local production build** of `bc3caf5` with no Flight Deck variables (`final/prod404.json`): 93 probes (27 routes, including auth, internal, export, print, an unknown route, an upper-case and an encoded path; GET on each, and POST with a server-action header on four; three hosts). All 404, except `/flight-deck/` with a trailing slash, which Next.js redirects (308) to `/flight-deck`, which is 404. Phase 4 changed no protected path (condition 3), so no data path, provider or outbound capability changed | Yes, for a local build | **Partially verified** | The **deployed** production site was not probed: a read of the live site is outside this preflight. Who: the founder, or Claude if authorized (decision 1) | A |

**Conditions verified for `bc3caf5`:** 1–6 and 8. **Partially verified:** 7 and 12. **Unverified:** 9 and 10. **Blocked:** 11. Gate G4 is **not** met.

## 3. Protected correction register (R1–R12)

Re-read against `bc3caf5`. PR 4.6 implemented none of these, and its presentation does not make any of them look resolved (PR 4.6 record, § Not implemented). **None is implemented here.**

**Severity:**
- **High:** a person could act on a false state, or a manual acceptance task would fail.
- **Medium:** misleading or incomplete, but the correct state is on screen nearby.
- **Low:** evidence or readability.

### 3.1 Prioritized register

| Priority | # | Finding | Severity | Reproducible | Proposed resolution | Gate G4 impact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **R2** | A failed recovery is announced as a confirmation (✓, the confirmation form, `role="status"`, no "Error") | **High** | Always, on the local demo: move the local protective log aside, then a founder presses "Verify and replay now" (PR 4.6 state run, `recovery.log-missing-attempt`) | Failure-class notice codes render through the existing alert branch (§4.1) | Manual task 6 ("check whether contact is safe") would be judged against a success signal for a failure. Fix before the manual pass |
| 2 | **R1** | "Verified: contact allowed" on Health, and "Contact may resume." in the `recovery-verified` notice, while outbound activity may be paused, and without any consent or dispatch check behind them | **High** | Always: pause outbound activity, open Health | State what verification establishes, and only that (§4.2) | Task 6's own pass criterion quotes "Verified: contact allowed". Fix before the manual pass, and amend the criterion with it |
| 3 | **R3** | "Paused" names both the founder's outbound switch and the recovery lock | Medium | Always (any lock) | "Locked until recovery is verified" / "Locked: …"; keep "Paused" for the outbound switch only (§3.2) | Task 6 vocabulary. Best done with R1 |
| 4 | **R10** | Firefox: server-action POSTs carry `Origin: null` and are refused | **High if confirmed** | In Playwright's Firefox 159 (PR 4.5). **Not checked in a release Firefox** | Reproduce first; then a separately reviewed security proposal (§3.4). No change here | Not a numbered G4 condition, but no Firefox user can sign in to the demo or act on any consequential control. The manual pass must use Chrome or Edge until resolved |
| 5 | **R12** | Gates, production sign-in and Health's production sections cannot be captured | Medium | n/a: an evidence gap | An output override and capture step for the production rehearsal (§6) | Blocks visual verification of P9 and preparation for task 7 |
| 6 | **R5** | Recovery's consequence ("everyone is signed out") comes after the button, and is untrue in the local demo | Medium | Always | Move the sentence before the button; state it only where an identity store exists (§3.2) | Task 6: the consequence is announced after the decision point |
| 7 | **R4** | Recovery says the scheduled worker replays automatically (none exists in the local demo), and never says who can resolve a lock | Medium | Always on the local demo | Runtime- and role-conditional wording (§3.2) | Task 6 on the local demo shows a promise that does not hold there |
| 8 | **R9** | A lift waiting for confirmation shows only a suppression id | Medium | Always: a restored copy with a lift after it, then verify (PR 4.6 state run) | Show the suppression's scope, basis, effective date and who recorded it (§3.3) | Task 6: "any lift-confirmation rows are understandable" |
| 9 | **R8** | Gates: authentication freshness uses the done ✓ form of a completed approval; the approver shown as six id characters; primary fill when stale | Medium | Source only (production) | A state line with the expiry time; approver's display name; default tone when stale (§3.3) | Task 7 (staging) |
| 10 | **R7** | Approvals is silent about pause and recovery; every item's three buttons have the same accessible names | Low–Medium | Always | Measure in manual task 3 first; then a state line and/or `aria-describedby` (§3.4) | Task 3 may record identical names as friction |
| 11 | **R6** | Readiness ("Off" by decision) and restriction share the blocked form | Low | Always (Health) | Split the "Off" label and tone (§3.4) | None directly |
| 12 | **R11** | The seed has no "NOT PERMITTED" item, evidence-asset warning, or campaign in review | Low | n/a: an evidence gap | An out-of-repository state script first; a seed variant only if committed fixtures are wanted (§3.4) | Evidence completeness for warnings (§7.3) |

**A second instance of R2,** found in this review: `deactivate-not-durable` ("Signed out everywhere now. The deactivation itself could NOT be recorded in the protective log, so it was not applied…") is also a `notice`, so it too renders with ✓ and `role="status"`. It occurs only in production (operator deactivation with the log unreachable). The R2 correction covers it by the same rule (§4.1).

### 3.2 Recovery terminology and consequences (R3–R5)

**What the code does** (`recovery.ts`, `worker.ts`, `guard.ts`):
- A **recovery lock** is set when the database is behind or inconsistent with the protective log (`journal-ahead`, `restore-in-progress`, `journal-mismatch`, `journal-integrity`), or the log cannot be reached (`sink-unavailable`, not persisted). While locked, every console page and action except Recovery redirects there, and every contact path refuses.
- It is cleared only by `reconcile()`: by a founder ("Verify and replay now"), or in production by the scheduled worker (`worker.ts` runs `reconcile` as SYSTEM). The worker never clears `journal-integrity`; only a founder may, after investigating.
- In production, clearing a lock ends every session (`revokeEverySession`, only when an identity store exists). The local demo has no identity store and no scheduled worker.
- An **outbound pause** is a separate switch in settings, set by any role and cleared only by a founder. It blocks dispatch and attestation. Recovery verification does not touch it.

**Proposals** (wording for the founder's decision; nothing implemented):

| # | Where | Today | Proposed |
| --- | --- | --- | --- |
| R3 | Recovery title (locked) | "Paused until recovery is verified" | "Locked until recovery is verified" |
| R3 | Recovery status, every reason | "Paused: …" | "Locked: …" |
| R3 | `recovery-incomplete`, `protective-log-unavailable` messages | "Contact stays paused" / "Contact is paused until the log is reachable" | "Contact stays blocked" / "Contact is blocked until the log is reachable" |
| R4 | Recovery, locked, production, founder | — | "The scheduled worker resolves this on its next run, if its schedule is on. You can resolve it now:" before the button. (Staging's schedules are off by decision, so an unconditional "within minutes" would be untrue there.) |
| R4 | Recovery, locked, production, other roles | (nothing) | "Only a founder, or the scheduled worker, can resolve this lock." |
| R4 | Recovery, locked, local demo | "The scheduled worker replays them automatically" | "This demo has no scheduled worker: a founder resolves the lock with Verify and replay now." |
| R4 | `journal-integrity`, any runtime | (unchanged) | Unchanged: "A founder must investigate before recovery can run" |
| R5 | Recovery consequence | After the button, unconditional | **Before** the button. With an identity store: "When it succeeds, everyone is signed out, you included, and signs in again." Without (local demo): omitted, or "In this demo nobody is signed out." |

The conditions use values the page already has (`rt.mode`, `rt.identity`, `actor.role`, the lock reason). Execution is unchanged: `reconcileAction`, `reconcile()`, the worker and session revocation are untouched, so moving or conditioning the sentence cannot change what happens.

**Scope:**
- **Files:** `src/app/flight-deck/recovery/page.tsx` (mixed: visible text, conditions, element order), `src/lib/flightDeck/messages.ts` (protected).
- **Tests:** the census baseline is unaffected: it records Recovery only in the verified state. E2E checks only the verified texts. No boundary self-test anchors on these strings.
- **Rollback:** revert the merge commit.
- **Governance:** an exception naming the branch, the decision, `src/lib/flightDeck/messages.ts` as a protected path and `recovery/page.tsx` as structural (§3.5).

### 3.3 Authorization context (R8, R9)

**R8, Gates freshness** (`gates/page.tsx`, from source only):
- **Is the boundary sound?** Yes. Freshness is computed at render, and `approveGate()` checks it again on submit. A stale session is redirected to `/flight-deck/auth/login?reauth=1`, never approved (`gates/actions.ts`). The presentation issue is only that a precondition looks like a completed approval.
- **The page can go stale while open.** "Fresh enough to approve" is true at render. After 10 minutes the same screen still says so, and the submit is redirected to sign in again. Showing the time it lapses is truthful and needs no new data.
- **Proposal:**
  - Replace the ✓ done badge with a plain state line: "You signed in with your second factor at 14:02; you can approve until 14:12." When stale, keep the existing link.
  - Show the approver's display name, through `operatorDirectory()`, which Health already uses, instead of `operatorId.slice(-6)`.
  - Give the submit button the default tone when stale ("Sign in again, then approve").
- **Files:** `gates/page.tsx` (mixed, an authorization screen: founder review required).
- **Verification:** needs R12's captures. The rehearsal already mints sessions, so a stale `authTime` can be produced without touching authentication.

**R9, lifted-suppression confirmation** (`health/page.tsx`):
- **What a founder sees:** `sup_…` and "Confirm lift again". That is not enough for an informed decision: the founder cannot tell whose opt-out it is, its scope, or when it was recorded.
- **What can be shown without new collection:**
  - the suppression's scope and basis;
  - when it took effect;
  - who recorded it;
  - the name of a current relationship with the same email key, **only if one exists and has not been erased**. Otherwise "no current relationship record".

  An erased person's details must never reappear.
- **The boundary is unchanged:** `confirmLiftAction` still requires the `settings` capability, and confirming still writes a new protective event.
- **Files:** `health/page.tsx` (mixed: a new data read and text).
- **Tests:** a domain test that an erased person's name is never returned; the PR 4.6 state script's pending-lift capture.

### 3.4 R6, R7, R10, R11, R12

| # | Severity · reproducibility | Proposed resolution | Files | G4 impact |
| --- | --- | --- | --- | --- |
| R6 | Low · always | Split `TONE_LABEL`'s "Off" into "Off by decision" (neutral) and "Not configured" (blocked) | `health/page.tsx` (label map). **The self-test "integration-state label changed (Off -> Disabled)" anchors on `blocked: "Off"`**: re-anchor first in its own governance PR, as #27 and #32 did | None |
| R7 | Low–Medium · always | First record what task 3 actually announces. If identical names are a real obstacle, add `aria-describedby` to the item heading rather than changing `aria-label` (the census records accessible names, so a name change would alter the protected baseline). A paused-state line needs a new data read | `approvals/page.tsx` | Task 3 |
| R10 | High if confirmed · Playwright Firefox only | **No change proposed here.** Step 1, read-only and human: on the local demo in a release Firefox, record the network panel for "Continue as founder" (`Origin`, `Referer`, response), then the same in Chrome. Step 2, only if reproduced: a security proposal, separately reviewed. It must not weaken the Server Actions origin check, accept `Origin: null`, or add allowed origins. The candidate to evaluate is `Referrer-Policy: same-origin` for `/flight-deck` responses (same-origin requests then carry their origin; nothing is sent cross-origin), with the rehearsal's header assertions updated | `src/proxy.ts` (protected; security configuration) | Supported browsers for the console and for the manual pass |
| R11 | Low · evidence gap | An out-of-repository script that builds the three missing Approvals states through ordinary demo actions (no protected change). A seed variant (`seed.ts`) only if the founder wants committed fixtures | None, or `src/lib/flightDeck/seed.ts` and `scripts/` | Evidence for §7.3 |
| R12 | Medium · evidence gap | §6, option C | `scripts/flight-deck/rehearse-production.mjs` | P9; task 7 preparation |

The R10 cause given in PR 4.6 (`Referrer-Policy: no-referrer` on every `/flight-deck` response) is still a **hypothesis**. It is consistent with the Fetch standard's origin serialization, which sends `Origin: null` for a non-CORS POST under `no-referrer`. Chrome evidently does not apply that rule to these requests, because the E2E passes there.

### 3.5 The governance exception procedure (every protected correction)

From plan §3.3 rule 4 and `scripts/test/flight-deck-boundary.exceptions.json`. A change to a mixed file is enforced whatever its branch is called, so R1–R9 each need this. R10–R12 touch no presentation file, so the checker only reports them, and they follow their own founder review, as PRs #27 and #32 did.

1. **A founder decision,** with a number, naming the finding and its scope.
2. **A governance PR** that adds one entry to the exceptions file:
   - `branch`: the exact branch;
   - `decision` and `reason`;
   - `paths`: the protected paths, for example `src/lib/flightDeck/messages.ts` and `scripts/flight-deck/e2e.mjs`;
   - `structural`: the mixed files allowed to change structurally.

   It is **merged into `main` first**: exceptions are read from the merge base, so a branch cannot grant itself one. The exceptions file is itself protected, so this PR is reviewed like #27 and #32.
3. **If a boundary self-test anchors on text the fix changes,** it is re-anchored in its own governance PR first. Known cases: R6 (`blocked: "Off"`). R2 must keep `<p role="alert"` and the `Error:` span unique (§4.1).
4. **The fix PR** on exactly that branch, with:
   - the boundary job;
   - the census against the baseline (unchanged for R1–R5 and R9, checked in §4);
   - E2E on both stores (at least 53 checks; more where a correction adds one);
   - before and after captures from the same script.
5. **Merge with a merge commit.**

**Rollback:** revert that merge commit, then remove the exception in a follow-up governance PR. No correction here involves data, a migration, configuration or a deployment.

## 4. Detailed proposals: R2 and R1

### 4.1 R2: a failed recovery presented as success

**The path, traced on `bc3caf5`:**

1. Recovery (`recovery/page.tsx`, while locked, founder only) and Health (`health/page.tsx`, founder) render `<form action={reconcileAction}>` with a `returnTo` token.
2. `reconcileAction` (`src/app/flight-deck/actions.ts`, line 520) runs through `act(…, { duringRecovery: true })`. It requires a founder, calls `checkRecovery`, then `reconcile()`, then `checkRecovery` again, and returns:
   ```ts
   { notice: report.ok && status.ok ? "recovery-verified" : "recovery-incomplete", to: "/flight-deck/recovery" }
   ```
3. `act()` (`guard.ts`, line 82) turns that into a redirect to `/flight-deck/recovery?notice=recovery-incomplete`. Only a **thrown** error becomes `?error=<code>`.
4. `reconcile()` (`recovery.ts`) reports failure **without throwing** in four cases:
   - the log fails its integrity check (it also sets the `journal-integrity` lock);
   - the log cannot be reached during verification;
   - the replay is interrupted, or the log's tail or fence cannot be confirmed;
   - it succeeds, but the second `checkRecovery` is still not ok.

   All four become `recovery-incomplete`. (A thrown error, such as the store being unavailable, already reaches the error branch correctly.)
5. Recovery renders `<Notice params={params} />` above its Status section.
6. `Notice` (`src/components/flight-deck/ui.tsx`, line 80) has two branches:
   - `error` gives `<p role="alert">`, ✕ in the contested colour, a screen-reader "Error: " prefix and `ERROR_TEXT`;
   - any `notice` gives `<p role="status">`, ✓ in the mineral colour and `NOTICE_TEXT`.

   No notice code is classified, so every notice gets the confirmation form.
7. `NOTICE_TEXT["recovery-incomplete"]` (`src/lib/flightDeck/messages.ts`, line 96) is "Recovery did not complete. Contact stays paused; see the recovery status below."

**Result:**
- A sighted founder sees a ✓ confirmation above a lock.
- A screen-reader user hears the failure politely, as a status, with nothing marking it as an error.

The words are correct. The form and the announcement are wrong.

**Minimal correction (recommended): classify failure notices, and render them through the existing alert branch.**

- `messages.ts`: export `NOTICE_FAILURE = new Set(["recovery-incomplete", "deactivate-not-durable"])`.
- `Notice` chooses the alert branch for an `error` **or** a failure-class `notice`. It keeps **one** alert element and **one** "Error: " span:

  ```tsx
  const failure = error ? (ERROR_TEXT[error] ?? ERROR_TEXT.error) : notice && NOTICE_FAILURE.has(notice) ? NOTICE_TEXT[notice] : null;
  if (failure) {
    return (<p role="alert" className="fd-notice fd-notice-error"> … ✕ … <span className="sr-only">Error: </span>{failure} … </p>);
  }
  if (notice) { /* the success branch, unchanged */ }
  ```

**What it does not change:**
- the URL;
- the notice code;
- `reconcileAction`, `act()` and `reconcile()`;
- the redirect target;
- the success path: `recovery-verified` keeps its ✓, `role="status"` and words;
- every other notice and error.

**Why not make the action throw instead.** `act()` sends errors back to the form's `returnTo`. From Health that is `/flight-deck/health`, which redirects to Recovery while locked, and the redirect drops the query, so the message would be lost. Fixing that means changing `act()`, which every action shares, or Health's token: a wider change.

**Screen-reader announcement:** `role="alert"` (assertive) with "Error:", the same as every console error today. Whether an alert already present when a page loads is announced varies by screen reader and browser. That is true of every existing error notice, and manual task 6 checks it with real assistive technology. Moving focus would be new behaviour, so it is not proposed.

**Wording:** unchanged by R2. If R3 is accepted with it: "Recovery did not complete. Contact stays blocked; see the recovery status below."

**`deactivate-not-durable`** reports that the deactivation was **not applied**, so it is a failure of the requested action. Including it is recommended. The founder may instead keep R2 to recovery only.

**Regression tests:**
1. **Unit,** in an existing file in `npm test`'s list (for example `src/lib/flightDeck/flightDeck.test.ts`):
   - every `NOTICE_FAILURE` code exists in `NOTICE_TEXT`;
   - `recovery-incomplete` and `deactivate-not-durable` are failures;
   - `recovery-verified` and every other code are not.
2. **Render,** with `react-dom/server`. `ui.tsx` imports only `messages`, `types` and `workflow`, so it renders outside Next.js:
   - `Notice` with `notice=recovery-incomplete` gives `role="alert"`, "Error: " and ✕, and no `role="status"` or ✓;
   - `recovery-verified` still gives `role="status"` and ✓;
   - an `error` is unchanged.

   A new `.test.tsx` file must be added to `package.json`'s test list, which is protected. Alternatively the test uses `createElement` in an existing `.ts` file.
3. **End to end** (`scripts/flight-deck/e2e.mjs`), after the existing "verify on demand" check:
   - move the demo's protective-log folder aside;
   - press "Verify and replay now";
   - assert the alert, "Error:" and the lock badge;
   - put the folder back and verify again, as the founder. In the PR 4.6 state run, the screen after the attempt still showed `journal-mismatch`. Whether the attempt also persists a `journal-integrity` lock, which only a founder may clear, was not established here; a founder's verify clears either;
   - assert success.

   This adds E2E checks (more than 53). It is the first E2E step that touches the demo's disposable files, so it needs the founder's explicit approval.

**Boundary self-tests:**
- "live region downgraded (alert -> status)" and "screen-reader-only text removed" plant changes at `<p role="alert"` and `<span className="sr-only">Error: </span>`, and require each anchor to be **unique**.
- The single-branch form keeps both unique, so no re-anchor is needed.
- A form that copied the alert markup would break both cases.

**Census:** unaffected. No census screen carries a notice parameter.

**Scope:**
- **Files:** `src/components/flight-deck/ui.tsx` (mixed: structural), `src/lib/flightDeck/messages.ts` (protected), one test file (protected), `scripts/flight-deck/e2e.mjs` (protected), and `package.json` only if a new test file is added.
- **Exception:** `structural: ["src/components/flight-deck/ui.tsx"]`, plus `paths` for the rest (§3.5).
- **Rollback:** revert the merge commit.

### 4.2 R1: recovery verification described as contact permission

**Every user-facing assertion found** (a search of `src/`, `scripts/` and `docs/` on `bc3caf5`):

| Where | Text | Assessment |
| --- | --- | --- |
| `health/page.tsx`, line 98: Recovery section, Status | "Verified: contact allowed" (done ✓) | **Wrong.** Reads as permission; shown beside "Paused" when outbound is paused (PR 4.6, all roles) |
| `health/page.tsx`, line 102 | "Contact blocked: {reason}" | Shows a raw reason code (for example `journal-ahead`). Nearly unreachable: Health redirects to Recovery while unverified, so it renders only if the state changes between the guard and the page |
| `messages.ts`, line 95: `recovery-verified` | "Recovery verified: the database matches the protective log. Contact may resume." | First sentence exact. **"Contact may resume" is wrong** when paused, and implies a permission no check has given |
| `messages.ts`, lines 96 and 60 | "Contact stays paused", "Contact is paused until the log is reachable" | Accurate about contact, but "paused" is R3 |
| Health lede | "…all contact stops until the missing events are replayed and verified" | Accurate; keep |
| Recovery lede and verified badge | "…contacts no one." / "Verified: the database matches the protective log" | Accurate; keep |
| `docs/flight-deck/manual-tests.md` §2 task 6 and §3.2 step 7 | Quotes "Verified: contact allowed"; "contact is verified safe" | Must change with R1 |
| `scripts/flight-deck/e2e.mjs`, line 339 | Asserts "Verified: contact allowed" | Must change with R1 (same check, same count) |

**What recovery verification establishes** (`checkRecovery()` returning ok):
- the database's latest protective event is the log's latest: none missing, none mismatched;
- the database is not behind the restore fence (it is not a stale restored copy);
- the log was reachable for the check.

**What it does not establish:**
- any person's consent, or permission to contact them;
- that any message is approved, unsuppressed or permitted (every dispatch checks these when it runs);
- that outbound activity is running (the pause is separate);
- that any channel can send (email and social are off by decision).

**Proposed language** (for the founder's decision; nothing implemented):

| Where | Proposed |
| --- | --- |
| Health Status, verified | **"Verified: the database matches the protective log"**: Recovery's existing words, so no new term |
| Health Status, not verified | "Locked until recovery is verified" (with R3), instead of a raw code |
| `recovery-verified` | Option A (recommended): "Recovery verified: the database matches the protective log. The recovery lock is lifted; this does not resume paused outbound activity or permit any message." Option B: drop "Contact may resume." and add nothing |
| `manual-tests.md` task 6 | "The status ('Verified: the database matches the protective log' / 'Locked …') is read as text and is not presented as permission to contact; 'Verify and replay now' is reachable; any lift-confirmation rows are understandable." Step 7: "Check on Health that recovery is verified after those changes" |
| `e2e.mjs`, line 339 | The same check against the new Health text |

"Lock" in Option A depends on R3. Without R3: "…The recovery check passes; this does not resume paused outbound activity or permit any message."

**Scope:**
- **Files:** `health/page.tsx` (mixed: visible text), `messages.ts` (protected), `e2e.mjs` (protected), `manual-tests.md` (documentation).
- **Census:** unaffected. "contact allowed" is not in `census.json`, and Health's status is a definition value, not a heading or live region.
- **Boundary self-tests:** no case anchors on these strings.
- **Captures:** Health before and after, in the paused and running states.
- **Exception:** `structural: ["src/app/flight-deck/health/page.tsx"]`, `paths: ["src/lib/flightDeck/messages.ts", "scripts/flight-deck/e2e.mjs"]`.
- **Rollback:** revert the merge commit.

R1 and R3 touch the same strings and the same E2E check. One PR for both, with one exception, is smaller than two.

## 5. The intermittent print-view 404

**The anomaly (PR 4.6 final verification, run 1, file store):**
- The census found the relationship print view (`/flight-deck/relationships/<B-02>/print`) answering 404 for founder, operator and reviewer.
- Run 2, on the same code, was identical to the baseline.
- PR 4.6 recorded the cause as not established.

### 5.1 What run 1's own records show (observed)

From `C:\tiro\dev\evidence\phase-4-6\final\run1\` (the census log and the demo server log):

1. **The same id throughout.** The census resolved B-02 as `prs_hVhaAPoKhda9sadE` from the relationships list after the reset. For each role, the relationship page for that id answered **200** less than a second before the print view answered **404**.
   - There was one reset, at the start, and none between the two requests.
   - No other client and no worker was active: the log shows only the census's sequential requests.
2. **The 404 was not the print page's own `notFound()`.** The two kinds of 404 render differently. Run 1's census recorded the print view's 404 with:
   - the document title **"The Tiro Foundation"**;
   - the public site's header and footer, and no console shell.

   In the same run, Gates, whose page calls `notFound()`, recorded **"404: This page could not be found."**, identical to the baseline. The controls below show which form is which.
3. **The route was not compiled.**
   - In every passing run, the first print request spends 700–950 ms in Next.js (compiling the route), then 57–98 ms in application code.
   - In run 1 the first print request spent **190 ms** in Next.js, and each 404 only **26–29 ms** in application code.
4. **PostgreSQL was unaffected.** In the same session, the PostgreSQL census was identical to the baseline and its print view answered 200. E2E passed 53/53 on both stores.
5. **Run 1 was the first demo start after the rebase.**
   - The rebase finished at 01:31:06, and the census log was written at 01:32.
   - The rebase checked out `e4fda32` and re-applied the PR 4.6 commits, so it rewrote the PR 4.6 files. The print view was not one of them.
   - The demo's Turbopack cache persists in the worktree's `.next-flight-deck/dev/cache/turbopack` (filesystem caching for dev is on by default in this Next.js).

### 5.2 Controls and repeated trials on unchanged `main` (observed)

Script: `scripts/print404-4-7.mjs` (outside the repository). Each trial starts a fresh demo on :3100 from `bc3caf5` under one condition:
- **cold:** the Turbopack cache deleted;
- **warm:** the cache kept, the server restarted;
- **post-checkout:** the worktree checked out to `e4fda32` and back to the branch, so the content is identical but the PR 4.6 files are rewritten, as the rebase did.

Each trial then runs:
- a probe in the census's order: reset; sign in; resolve B-02; then per role, the relationship page, a read of the file store on disk to check the record exists, and the print view;
- two controls;
- the unchanged census against the baseline;
- five more reset-and-print cycles on the warm server.

| Trials | Store and condition | Print view | Census |
| --- | --- | --- | --- |
| 13 | File: cold ×2, warm ×3, post-checkout ×5. PostgreSQL: cold, warm, post-checkout | **102 of 102 answered 200** | **Identical in 13 of 13** |

**The record existed** on disk immediately before every one of the 78 file-store print requests. The id was the same across the list, the relationship page and the print view.

**The controls, every trial:**

| Request | Status | Title | Application code |
| --- | --- | --- | --- |
| Print view, id that does not exist (the page's `notFound()`) | 404 | "404: This page could not be found." | 72–92 ms |
| `…/printx`, an unmatched route | 404 | **"The Tiro Foundation"** | 34–41 ms |
| Gates (the page's `notFound()`) | 404 | "404: This page could not be found." | 47–67 ms |
| Print view, first request in a trial | 200 | the console | Next.js 765–950 ms; application 65–92 ms |

**Run 1 matches the unmatched-route form** in title, layout and timing. It does not match the page's own `notFound()`, which would also have taken longer: it runs the store transaction.

### 5.3 Disposition

- **Observed cause:** in run 1, the development server answered the print-view URL with its **route-level** not-found. The print page's code, which includes its data path, was not run. This is established by the rendered form and the timing, against controls run in this preflight.
- **Excluded by that observation:**
  - a missing or mismatched relationship;
  - the file store's transaction or read path (one cached state per process, serialized);
  - seeding, or the reset sequence;
  - concurrent activity.
- **Hypothesis, not established:** the Turbopack development server's route resolution, on its persistent cache, at its first start after the rebase rewrote files in the worktree. **Not reproduced:** 13 trials, five of them reproducing the checkout pattern, gave 102 of 102 successful print views.
- **Scope:** development server only. Production builds compile every route at build time. The census and E2E run only against the development demo.
- **Status:** **not resolved.** It is not a defect in Flight Deck's code as far as the evidence goes, but its trigger is unknown.

**Recommendation** (no change authorized here):
- When a census difference appears, rerun it, and record the document title and the server's timing line beside it.
- If it recurs, delete `.next-flight-deck` and run again, and record both runs.
- A future, separately authorized census improvement could record whether a 404 is route-level or page-level. That is a `scripts/` change.

No data-access code, seed, checker or census script was changed.

## 6. Production-only evidence plan

**Screens that render only in production mode** (404 in the local demo for every role, by design, and not weakened here):
- **Gates**, in every state: absent, invalid (unsigned, bad signature, approver inactive or no longer founder, subject mismatch, notice changed), approved, and authentication stale;
- **production sign-in**: one link to the identity provider;
- **Health's Operators and Launch-gates sections**, with operator management;
- **session revocation** when recovery is verified;
- **the scheduled worker's replay**.

**Constraints for any option:**
- no change to an authorization check, the gate rule, sign-in or `src/proxy.ts`;
- no Cognito, staging, credentials or real data;
- nothing written to a protected path;
- loopback only.

| Option | What it is | Visual evidence | Repository change | Assessment |
| --- | --- | --- | --- | --- |
| A | Run the unchanged `npm run rehearse:flight-deck` in a disposable clone; discard the JSON it writes to `docs/flight-deck/screens/` there | None: HTTP checks only, as today | None | Adds nothing that PR 4.6 did not already cite |
| B | An out-of-repository harness that rebuilds the rehearsal's environment (production build, TLS-only PostgreSQL, the S3 test server, fictitious Cognito settings), records gates with the console's own approval code (`rehearse-approve-gate.ts`), mints sessions as the rehearsal does (an old `authTime` for the stale case), and drives Chrome with the configured host mapped to 127.0.0.1 | Gates (absent, unsigned, approved, stale), production sign-in, Health's production sections | None | Works, but duplicates the rehearsal outside review. The repository's browser helper refuses any console without the local-demo banner, by design, so the harness needs its own equivalent guards. Interim only |
| **C (recommended)** | **R12:** in `scripts/flight-deck/rehearse-production.mjs`, an output override (`REHEARSAL_OUT`, like `E2E_OUT`) and an opt-in capture step for the same screens, both themes, 1440 and 390 px | As B, committed and repeatable | `scripts/` only (protected; the checker reports it, and it follows founder review like #27 and #32) | Smallest reviewed route. Unblocks P9 (PR 4.6b) and R8 |

Gate reasons other than "unsigned" need a deliberately altered gate row, for example a changed signature, in the rehearsal's throwaway database. Option C can do that there, never in staging.

**What still needs staging** (separately approved access; not part of this plan):
- a real Cognito sign-in with MFA and re-authentication (`staging-acceptance.md` A3–A6);
- manual task 7.

Staging still runs `b632c24` (2026-10-23), before Phase 4. Task 7 there would test the old presentation until a Phase 4 deployment is separately approved (G4 condition 11).

## 7. Manual acceptance plan

G4 condition 9 requires a **genuine manual pass** of `manual-tests.md` §2 tasks 2–7, with at least one desktop and one phone screen reader. Nothing in this preflight is, or substitutes for, that pass. Synthetic scripts, browser automation and source review are not manual acceptance.

### 7.1 Where each task can run

| Task (`manual-tests.md` §2) | Local demo | Needs staging (separately approved) |
| --- | --- | --- |
| 2 Find the most urgent item and open it (Now) | Yes | — |
| 3 Review and approve an outreach draft (Approvals) | Yes | — |
| 4 Record an opt-out and confirm it holds | Yes | — |
| 5 Work a deletion request to the end | Yes | — |
| 6 Check whether contact is safe after a restore (Health, Recovery) | Yes. The locked states are prepared from the demo's disposable files (§7.2) | — |
| 7 Approve a launch gate | **No:** Gates is 404 in the local demo | **Yes:** Cognito with MFA, and Phase 4 deployed there (condition 11) |

**Devices:**
- **Desktop:** Windows with NVDA, in **Chrome or Edge**. Not Firefox until R10 is resolved: there, sign-in and every consequential action fail (PR 4.5 finding, unconfirmed in a release Firefox).
- **Phone, on the local demo:** **Android with TalkBack, through USB port forwarding** (`adb reverse tcp:3100 tcp:3100`, then `http://localhost:3100/flight-deck` in Chrome on the phone).
  - The local demo accepts only loopback hosts (`isLoopbackHost`, `src/lib/flightDeck/config.ts`). This route keeps that rule.
  - No code, configuration or network change is needed.
- **iPhone with VoiceOver** cannot reach the local demo without changing the loopback rule or the network. Neither is proposed. It needs staging. An iOS Simulator is not a real device and does not count.

### 7.2 Protocol (tasks 2–7)

**Who:** preferably someone who uses a screen reader daily; otherwise the founder, following the protocol exactly. Record which.

**Preparation:**
1. Record the device, OS, browser and assistive technology, each with its version.
2. Start the demo with `npm run dev:flight-deck` on the tester's machine. Never port 3000's server.
3. Sign in as founder, then Health → Reset to synthetic seed.
4. Do not read the code or documentation during the run.

**Each task:**
1. Start from the stated page.
2. Use the screen reader's own navigation (landmarks, headings, form controls); no mouse for screen-reader runs.
3. Write down what was announced, where you hesitated or got stuck, and the time taken.

**States for task 6.** The tester prepares these from the demo's disposable, git-ignored files, as PR 4.6's state run did. Stop the demo before copying files.

| State | Preparation |
| --- | --- |
| Verified | The seed |
| Verified **while outbound is paused** (R1) | Health → "Pause all outbound activity" |
| Locked, restored copy behind the log | Stop the demo. Copy `.flight-deck/local-store.json` aside. Start the demo and record an opt-out on a relationship. Stop, put the copy back, start |
| A lift to confirm after recovery (R9) | As above, but record a lift ("Lift (only if they asked)") after the copy; then the founder verifies |
| A failed verification (R2) | Stop the demo. Move `.flight-deck/protective-file` aside. Start; the founder presses "Verify and replay now". Afterwards stop, put the folder back, start, verify again |

**Pass criteria:** `manual-tests.md` §2, unchanged, except task 6's if R1 lands (§4.2). In brief:

| # | Pass when |
| --- | --- |
| 2 | Landmarks and headings let you jump; status badges read as words, not colours |
| 3 | The fingerprint and "Approve this exact version" are reachable and understandable; the outcome is announced |
| 4 | The outcome message is announced; you can tell the person is now blocked |
| 5 | Deadlines and checklist state are clear without colour; "Mark done" buttons say which step they complete |
| 6 | The status is read as text; "Verify and replay now" is reachable; lift-confirmation rows are understandable; **a failed verification is announced as a failure** |
| 7 | The statement, the checkbox, the freshness notice and "Sign in again" link, and the result are all announced |

**Known issues the tester will meet unless corrected first** (to be recorded as found, not excused):
- **R2:** the failure is announced as a status, not an error.
- **R1:** "Verified: contact allowed" while paused.
- **R3:** "Paused" names two different things.
- **R5:** the consequence is announced after the button.
- **R9:** a lift shows only an id.
- **R7:** identical button names in every Approvals item.

**Recommendation:** correct R2 and R1 with R3 before the pass. Otherwise R2 is likely to be recorded as serious.

**Record:** `manual-tests.md` §2's table, one row per task, screen reader and device:
- device and OS, browser, assistive technology, all with versions;
- pass or fail, and time;
- what was announced and what went wrong;
- severity: blocker, serious or minor.

Blockers and serious issues are fixed, and their tasks repeated, before G4. The record is committed by the person who ran it, or on their written account, with the date.

**G4 condition 10 (the founder's review of the local demo)** is separate. `manual-tests.md` §3 (the session and simulated week) is its existing kit. A dated record of what the founder reviewed and accepted, on which commit, would satisfy condition 10. None exists yet.

### 7.3 Acceptance-evidence gaps

| Area | Covered on `bc3caf5` (§10) | Gap | How to close |
| --- | --- | --- | --- |
| Recovery-lock states | Journal-ahead, restore fence, log unavailable, log missing, failed attempt, verified, pending lift: out-of-repository state script, **file store** | `journal-integrity` (needs altered log contents); every locked state on **PostgreSQL**; worker auto-replay; session revocation (production rehearsal, HTTP only) | Option C (§6) for production behaviour; a PostgreSQL run of the state script needs the demo database password, which this work does not handle (founder decision) |
| Approval warnings | One warning type (the seed's) | "NOT PERMITTED" basis, evidence-asset warning, a campaign in review (R11) | Out-of-repository state script first |
| Browser compatibility | Chromium (Chrome) only, everywhere | **Firefox** (R10); **WebKit/Safari** never run | Release-Firefox reproduction (human); a Safari check during the staging iPhone pass |
| Print rendering | Chrome print-to-PDF of the print view, both themes (§10) | Paper; Firefox and Safari print | Founder prints one page from each browser in the manual pass |
| Accessibility | axe, overflow, focus, contrast, targets: automated, Chromium (§10) | **Every manual check** (condition 9); forced colours, 200% and 400% zoom, reduced motion by hand | §7.2 |
| Public-site regression | §10: the release suite and parity against the pre-Phase-4 build | No Phase 4 PR ran them before this preflight | — |
| Gates and production screens | HTTP rehearsal (historical), source review | No rendered evidence (R12) | §6, option C |

## 8. Proposed sequence of narrowly scoped PRs

Each is separately authorized, merged with a merge commit, and revertible alone. None involves data, migrations, configuration or deployment. Every PR that touches Flight Deck presentation needs:
- the boundary job;
- the census against the baseline;
- E2E on both stores;
- before and after captures.

| # | PR | Contents | Protected? | Prerequisite |
| --- | --- | --- | --- | --- |
| 1 | **Governance: exceptions for the recovery corrections** | Exceptions-file entries for PRs 2 and 3, with their decision numbers | `scripts/test/` (founder review, like #27 and #32) | Decisions 2 and 3 in §9 |
| 2 | **R2: failure notices** | `Notice` alert branch for failure-class notices; `NOTICE_FAILURE`; unit and render tests; an E2E failure step | Yes: `ui.tsx` structural; `messages.ts`, tests, `e2e.mjs` | PR 1 merged |
| 3 | **R1 + R3: recovery wording** | Health status and `recovery-verified` text; "Locked" for the recovery lock; E2E text check; `manual-tests.md` task 6 | Yes: `health/page.tsx` and `recovery/page.tsx` text; `messages.ts`, `e2e.mjs` | PR 1 merged |
| 4 | **R12: rehearsal capture** | `REHEARSAL_OUT`; an opt-in capture step for Gates, production sign-in and Health's production sections | `scripts/` only | Decision 4 |
| 5 | **PR 4.6b: Gates presentation (P9)**, optionally with **R8** | P9 as accepted in PR 4.6's review; R8 only if separately authorized (it changes tone and text on an authorization screen) | P9: presentation; R8: yes | PR 4 merged, with its captures |
| 6 | **R4 + R5: Recovery conditions and order** | Who can resolve a lock; the worker sentence by runtime; the consequence before the button, conditional on an identity store | Yes: `recovery/page.tsx` | Its own exception |
| 7 | **R9, then R6 and R7** | Lift context; the "Off" split (after its self-test re-anchor); Approvals names, only if the manual pass shows the need | Yes | After the manual pass |
| 8 | **R10 (security track)** | Release-Firefox reproduction (human, read-only), then a security proposal, then any `src/proxy.ts` change | Yes: security configuration | Separate review |
| 9 | **G4 record** | The final evidence record: this matrix brought up to date, the manual pass and the founder's review, on the final `main` | Documentation only | Manual pass and founder review done |
| 10 | **Staging** (not a PR) | Plan §7.11: a separately approved baseline deployment of pre-Phase-4 `main`, then Phase 4 | Infrastructure; founder approval | Decision 9 |

Order: PRs 2 and 3 before the manual pass. PR 4 before 5. PR 9 last, after the human steps.

## 9. Founder decisions required before proceeding

1. **The matrix (§2):** accept the statuses, in particular what counts as evidence for conditions 2 (observed CI, not enforcement), 6 (local release suite and parity) and 12 (a local production build, not the deployed site).
2. **R2:** authorize the correction in §4.1 (classify failure notices; one alert branch), with or without `deactivate-not-durable`; authorize its E2E step, which touches the demo's disposable log files.
3. **R1 and R3:** choose the wording (§4.2: Option A or B; "Locked" for the recovery lock), and whether they land in one PR.
4. **R12:** authorize the rehearsal capture (§6, option C). If not, decide whether P9 waits indefinitely, or proceeds on option B's out-of-repository evidence.
5. **R10:** authorize a release-Firefox reproduction on the local demo (human, read-only). Until it is resolved, record Chromium-based browsers as the console's supported browsers.
6. **The manual pass (§7):**
   - who performs it;
   - the devices: NVDA with Chrome or Edge, and Android TalkBack through `adb reverse`;
   - whether it waits for R2 and R1/R3 (recommended);
   - whether task 7 waits for staging.
7. **The print-view 404 (§5):** accept the disposition, or ask for more investigation.
8. **The "Vercel – tiro-foundation" failure status** on every Phase 4 merge commit: investigate separately, or record as known. It is not a required check.
9. **Staging (condition 11):** the approach. A separately approved baseline deployment of pre-Phase-4 `main` first, then Phase 4.
10. **Evidence for locked states:** whether the out-of-repository state script is enough for G4 condition 7, or whether committed fixtures are wanted (R11, a seed variant). Also whether the PostgreSQL demo's locked states should be run, which needs the local demo database password.
11. **R4–R9 and R6/R7:** which to authorize, and in what order (§8).
12. **G4 condition 10:** what the founder's recorded review of the local demo should contain, and on which commit.

## 10. Verification performed for this preflight

Local, Windows 11, Node 22.17.1, on unchanged `main` at `bc3caf5` in `C:\tiro\dev\tiro-4-7`. Chromium (Chrome) for every browser check. Logs are in `C:\tiro\dev\evidence\phase-4-7\final\` unless stated.

| Check | Result |
| --- | --- |
| Boundary self-tests | 124/124 |
| Census self-tests | 8/8 |
| Boundary checker on each Phase 4 PR (`boundary/`) | PASS ×8 (§2, condition 3) |
| Census against the baseline, file store and PostgreSQL | IDENTICAL, both |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 file store; 53/53 PostgreSQL |
| State sweep (`sweep/states/`): 29 screen-states | axe 0 serious or critical (116 runs); overflow 0 of 174; 3,012 focus stops, all console stops visible |
| Regression sweep (`sweep/inspect/`): 16 screens, 6 widths | axe 0 (96); overflow 0 of 288; 2,668 stops, all visible |
| Print check (`print/`) | Banner exact and shown; "SYNTHETIC DEMO DATA" label shown after it; both themes, founder and operator |
| `test:flight-deck-pg` | 28/28 |
| Lint | 0 errors; the 2 known `backend/` warnings |
| `npm test` | 555 pass. 4 fail: the known Windows-only failures in `managedLoginScript.test.ts` (374, 375, 376, 379), which pass on Linux CI |
| Build; `verify:disclosure` | Pass; "disclosure boundary holds in the production build" |
| Production 404 probe, local build (`prod404.json`) | 93 probes: 404, except the `/flight-deck/` trailing-slash 308 to the 404 |
| Public-site release suite (`public-site-checks.json`) | 241/241 |
| Parity, `bec57d2` vs `bc3caf5` (`../parity/report/`) | 92 of 96 identical; 4 `/living-trace` motion captures differ by 10–14 pixels (animation timing) |
| Print-view trials (`print404/`) | 13 trials; 102/102 print views 200; census identical 13/13 (§5) |
| GitHub CI evidence (`ci/`), read-only tool | §1 |

**Disposable data and servers:**
- Every run deleted the demo's local store, protective log, ledger and local database under the worktree's git-ignored `.flight-deck/`, which is empty.
- Ports 3100, 3200, 3201 and 55433 are closed. Two `next start` servers outlived the script and were stopped by process id after it finished.
- Port 3000 was not touched.

**Worktrees:**
- `C:\tiro\dev\tiro-4-7` is at `bc3caf5` plus this document. It was checked out to `e4fda32` and back during the trials; its content is restored and it has no tracked change.
- `C:\tiro\dev\tiro-4-7-base` (detached at `bec57d2`) was created for the parity build only.
- Earlier Phase 4 worktrees were not modified.

**Not done:**
- no push, PR, merge or deployment;
- no credential retrieved;
- no staging, Vercel or GitHub setting read or changed, beyond the read-only CI evidence;
- no real data;
- no outbound operation.
