# Milestone 3.0: Repository reconciliation and integration architecture

Status: **Revision 2: Gate 0 evidence verified; decisions prepared for approval.** (Revision 1 followed the founder review.) Direction approved conditionally; the decisions in §9 are **proposed, pending founder confirmation**. Nothing has been merged into `main`, deleted, or changed in any authorization path or hosting setting. Nothing has been successfully published by this work. Pushes have, however, triggered automatic Vercel deployment attempts: they fail on one of two connected Vercel projects and succeed, as previews, on the other (§7.1).
Date: 2026-10-29 (revisions 1 and 2, same day).
Owner: TIRO founder / Steward.
Builds on: `living-archive-consolidation.md` (component inventory, V5 ↔ Memory v1), `decisions.md` (decisions 30–39).

> **Implementation status, 2026-10-30.** Added after the fact. The status line above and everything below it are the plan's baseline as approved on 2026-10-29, and are kept unedited as the historical record.
>
> | Phase | State | Record |
> | --- | --- | --- |
> | 0. Approve and restore the release path | **Done** (2026-10-29). Decisions 40–45 confirmed; Gate 0 met; branch protection on `main` | `decisions.md`; `docs/deployment/public-site-hosting-readiness.md` |
> | 1. Reconcile | **Done** (2026-10-29). PR #13 merged (`1f64387`); tag `checkpoint/3.0-start` at `d7b6b1a`; disclosure verifier in CI (PR #14, `6a6eef5`) | PRs #13, #14 |
> | 2. Design system | **Done** (2026-10-29). G2 approved; PR #15 merged (`5715821`) | `milestone-3.0-phase-2-design-system.md` |
> | 3a. Public experience | **Released** (2026-10-30). G3 approved (decisions 46–49); PR #16 merged (`6cd0920`) and deployed to production | `milestone-3.0-phase-3a-release-gate.md` |
> | 3b. Inner pages | **In progress.** `/manifesto` approved and released (decision 50; PR #17 merged, `3c997d4`). The `/pilot` overflow (P3B-1) repaired and released (PR #18, `512bebe`). `/community-rights` released as the policy page (decision 51; PR #19, `acf6372`); `/about` approved for release as a finding aid (decision 52; PR #20); the other pages are inventoried | `milestone-3.0-phase-3b-inner-pages.md` |
> | 4. Flight Deck | Not started | — |
> | 5. Clean house | Not started. No branch, preview or asset deleted; every remaining remote branch is contained in `main` | — |
>
> Where the plan and the records differ, the records govern. In particular:
> - the worker blocker of §7.1 was resolved at Gate 0 without shortening the worker;
> - navigation followed decisions 42 and 46;
> - `/memories` follows decision 48.

## 0. Verified baseline

Every figure below was checked against GitHub after `git fetch --prune` on 2026-10-29, not taken from earlier summaries.

| Fact | Evidence |
| --- | --- |
| 13 remote branches: `main`, 11 fully merged, 1 with unique work | `git merge-base --is-ancestor` and `git cherry` per branch (§6) |
| `flight-deck/cognito-managed-login-branding` was 8 ahead, 16 behind `origin/main` when audited; it is now **9 ahead**, the ninth being this plan (`501e8f7`). The eight implementation commits are unchanged | `git rev-list --left-right --count`; merge base `f2ad317` |
| The two sides touch **no common file** | Intersection of `git diff --name-only` from the merge base: empty |
| The merge is clean | `git merge-tree --write-tree`: no conflicts |
| The merged tree builds, lints, and holds the disclosure boundary | Trial merge in a throwaway worktree (not pushed, since removed): `npm run build` passes; `eslint` 0 errors (2 pre-existing warnings in `backend/`); `npm run verify:disclosure`: "disclosure boundary holds in the production build" |
| Unit tests | 522 of 540 pass. The 18 failures are all in `stagingScripts.test.ts` and `managedLoginScript.test.ts`, which run Bash scripts; they fail identically on the unmerged branch on this Windows host, and CI (Ubuntu) passes them on `main`. **Must be re-confirmed in CI on the integration PR.** Not run: `test:flight-deck-pg`. |
| Local `main` is behind `origin/main` | Local branches otherwise match their remotes |

Record-keeping corrections, **made** on the integration branch (`bc3f9b7`): every "2026-10-30" (the `decisions.md` entry and its header, the revision dates and approval references in `citation-standard-v0.1.md`, `living-archive-consolidation.md` and `record-view-contract.md`, the synthetic authority scenario's history, code comments, and the citation examples and tests) now reads 2026-10-28, the date of the commits that introduced them. If a decision was made on another day, that day should replace it. The `next.config.ts` comment now refers to `src/proxy.ts` instead of `src/middleware.ts`.

### Governance precondition

`decisions.md` currently records production adoption of V5, the Memory Project, and the record interface as **not authorized** (decision 37) and global navigation changes as **deferred** (decision 38). The milestone proposal supersedes both. Phases 1, 2 and 4 do not depend on that; **Phase 3 must not begin until a new decision superseding 37 and 38 is recorded** in `decisions.md`.

## 1. Commits to transplant

All eight, oldest first, from `flight-deck/cognito-managed-login-branding` (implementation tip `627ae58`; the branch tip is now the plan, `501e8f7`, which is merged with them):

| # | Commit | Date | Subject |
| --- | --- | --- | --- |
| 1 | `bda5a40` | 2026-10-23 | feat(preview): homepage v2 "Archival Futurism" at `/preview/home-v2` |
| 2 | `975647d` | 2026-10-23 | feat(preview): homepage v3 "Written for people we will never meet" |
| 3 | `f8cc2ef` | 2026-10-23 | feat(preview): homepage v3.1 refinement |
| 4 | `303feab` | 2026-10-28 | feat(preview): homepage v4 "A section through an imagined site" |
| 5 | `ccd49d0` | 2026-10-28 | feat(preview): homepage v5 "The Living Archive" |
| 6 | `3e8ec11` | 2026-10-28 | feat(preview): Memory Project v1 with record pages |
| 7 | `5c86390` | 2026-10-28 | feat(memory): authority scenario, Citation Standard v0.1, record-view contract |
| 8 | `627ae58` | 2026-10-28 | fix(memory): separate authority from its execution; safe consent summary |

Footprint: 57 files, +12,302 / −5. The only edits to existing files are `docs/design/decisions.md`, `package.json` (three test files added to `npm test`) and `scripts/test/verify-disclosure.mjs`.

**Method: a no-fast-forward merge, not cherry-picks.** Merging keeps the original SHAs, so the design history V2 → V5 stays addressable by the commits that already appear in reviews and documents. Cherry-picking would mint eight new SHAs and orphan the originals once the branch is deleted.

```
git switch -c integration/living-archive-3.0 origin/main     # d7b6b1a
git merge --no-ff flight-deck/cognito-managed-login-branding
```

The branch name is misleading (Living Archive work on a Cognito branding branch, whose Cognito work already merged as PR #8). The merge commit message should say so. Once merged, that branch becomes the twelfth cleanup candidate.

## 2. Route inventory and destinations

### Public

| Current route | Today | Destination | Phase | Notes |
| --- | --- | --- | --- | --- |
| `/` | Living Trace 0.2 homepage (`OriginHero`, constellation, specimen) | **V5 content** | 3 | |
| `/preview/home-v5` | V5 preview | Moves to `/`; preview path redirects to `/` (temporary) | 3 | Files moved with `git mv`, not copied |
| `/memory-project` | 89-line overview | **Memory Project v1** | 3 | Stays "in development"; never an operating collection |
| `/preview/memory-v1` | v1 preview | Moves to `/memory-project`; redirect | 3 | |
| `/preview/memory-v1/records/[id]` | 5 synthetic records (`DEMO-LT-*`, `DEMO-MP-0001`) | `/memory-project/records/[id]`; redirect | 3 | Keep `noindex`, `SyntheticNotice`, restricted-record handling |
| `/preview/home-v2`, `-v3`, `-v3-1`, `-v4` | Superseded explorations | Retire after the history record (§5, §8 Phase 5) | 5 | |
| `/living-trace`, `/living-trace/records/[id]`, `/living-trace/graph.json` | Living Trace 0.2 reference; not in navigation | **Decision needed.** Recommended: keep through Phase 4; retire in Phase 5 with a redirect to `/memory-project`, after moving its disclosure checks to the new routes | 5 | `verify-disclosure.mjs` hard-codes these routes; `graph.json` is public, so external consumers are unknown |
| `/memories`, `/memories/[id]`, `/memories/demo` | Backend-connected public listing (no-store, bfcache revalidation, retired-slug redirects) | **Unchanged in 3.0.** Restyle only | 3b | How it relates to `/memory-project/records` is a separate decision; it is wired to the backend API and the proxy |
| `/manifesto`, `/about`, `/community-rights`, `/contact`, `/nodes`, `/nodes/lagos`, `/nodes/nigerian-pidgin` | Current pages | Same routes, progressively restyled; substance unchanged | 3b | |
| `/pilot` | Public interest form, gated by Flight Deck's public-form gate | Same route; **presentation only** | 3b | Form logic, tokens and privacy-notice version stay in the Flight Deck boundary (§4) |

### Private

All 27 `/flight-deck/*` routes (pages, auth callback/login, `internal/status`, `internal/worker`, `export/[id]`) stay where they are. Their destination is unchanged; only their presentation changes (§4).

### Navigation

`TopNav` and `Footer` are the only global navigation. The reference structure (Purpose / The Memory Project / Principles / Get involved) is an information-architecture decision for the founder (decision 38). Phase 3 can ship with today's items pointing at production routes and change the structure separately.

## 3. Shared design system to extract

`living-archive-consolidation.md` already inventories what V5 and Memory v1 share; this plan adopts its target structure (`src/components/archive/`, `src/components/record/`, `src/components/home/`). Additions from this audit:

| Item | Finding | Proposal |
| --- | --- | --- |
| Header height | Memory v1 hard-codes the site header as `63px`; Flight Deck's layout hard-codes it as `61px` (`pt-[61px]`, `top-[61px]`) | One `--la-header` variable set by `TopNav`; both consume it |
| Tokens | `--hv5-*` / `--mv1-*` duplicates (max, pad, hair, faint) | `--la-*` in `globals.css`, beside the existing `--tiro-*` colours |
| Type roles | Eyebrow, h1/h2, lede, cite, CTA, secondary link written twice | Shared classes; Flight Deck's `PageTitle` and `Section` use the same roles at a denser scale |
| Motion | Identical rise / enter / separate keyframes under two prefixes | Fold into the existing Living Trace motion vocabulary (`--lt-ease`, reduced-motion safe) |
| Record drawing | `RecordLayers` (V5) vs `LayerStack` + `layers.ts` (v1); same geometry | One `LayerStack` (v1's, with Derived and sealed variants) |
| Two accounts | Four forks of `TwoAccounts` (v3, v3.1, v4, v5) | Keep V5's as homepage-only; keep `Concordance` for records |
| Geometry determinism | Hydration mismatch fixed by rounding in V5 | Shared `r2()` helper; no `**` / `Math.pow` in rendered coordinates |
| Status language | Flight Deck `Badge` tones (neutral / attention / blocked / done) and `EvidenceTag` states are separate vocabularies | Share colour and line-pattern tokens, not components: an operational status is not an evidence state |

Unchanged and shared already: `TiroMark`, `trace/` primitives, `livingTrace/evidence.ts`, `livingTrace/projection.ts`, fonts and theme script in `layout.tsx`.

## 4. Flight Deck design-integration boundary

**In scope (presentation):**

- `src/components/flight-deck/ui.tsx` and `client.tsx` (`Badge`, `StatusBadge`, `StageBadge`, `Notice`, `PageTitle`, `Section`, `Field`, `Empty`, `FlightDeckNav`, `SubmitButton`, `CopyButton`): markup and classes.
- `src/app/flight-deck/layout.tsx`: shell markup and classes only.
- The `fd-*` rules in `globals.css` (`fd-row`, `fd-button`, `fd-panel`, `fd-badge`, `fd-hash`, `fd-pre`, `fd-nav`, `fd-noprint`).
- `src/app/flight-deck/**/page.tsx`: JSX structure and `className` only — tables, forms, record and status displays, print styles.

**Out of scope without explicit, separate approval:**

- `src/proxy.ts`; everything under `src/lib/flightDeck/` (config, runtime, gates, store, worker, providers, Postgres, managed login).
- Auth and machine routes: `flight-deck/auth/*`, `internal/*`, `export/[id]`; every `actions.ts` (server actions).
- In pages: data reads, imports from `@/lib/flightDeck`, `action=` bindings, form field `name`s, hidden form tokens, and the conditions under which an action appears (approval, gate and permission checks must render exactly as before).
- The `SyntheticBanner` **text** (corrected in PR #6); its styling may change.
- `deploy/flight-deck/**`, including the Cognito managed-login branding (applies to AWS); `.github/workflows/*`.

**Enforcement:** a script (added in Phase 4, run in CI on those PRs) that fails if a Flight Deck PR touches any out-of-scope path, plus a reviewer checklist for the page-level rules a path check cannot see. Phase 4 is tested with `npm run dev:flight-deck` (local synthetic demo), `npm run e2e:flight-deck`, and `npm run test:flight-deck-pg`. A staging deploy uses the existing manual, approval-gated workflow.

## 5. Potentially redundant code and assets

Dependency evidence: every module under `src/components`, `src/lib`, `src/data` was matched against every importer in `src/`. "Consumers" means files that import it.

| Item | Consumers | Class | Disposition |
| --- | --- | --- | --- |
| `components/preview/home-v2/*` (5), `home-v3/*` (4), `home-v3-1/*` (4), `home-v4/*` (6) and their four `app/preview/home-v*/` pages and CSS | Only their own preview page | Superseded design experiment | Write the history record (below), tag, then remove (Phase 5) |
| `components/preview/home-v5/*`, `memory-v1/*` and their pages | Only their preview pages | Becomes production | Moved, not duplicated (Phase 3). `RecordLayers.tsx` is replaced by `LayerStack` (Phase 2) |
| `trace/OriginHero` | `app/page.tsx` only | Obsolete once `/` is V5 | Remove in Phase 5 |
| `trace/ConstellationIsland`, `ConstellationPreview`, `Constellation`, `RecordSpecimen`, `lib/livingTrace/layout` (+ test) | `app/page.tsx` and `/living-trace` only | Obsolete if `/living-trace` retires | Remove in Phase 5, conditional on the §2 decision |
| `trace/PaletteScope` | `/living-trace` only | Same | Same |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | None | create-next-app boilerplate | Remove (Phase 5) |
| `public/tiro-mark-micro.svg` | None in code | Unknown | **Keep** until checked for absolute-URL use (email, Cognito, external pages) |
| `hv5-*` / `mv1-*` CSS duplicates | Each preview | Duplicate implementation | Consolidated in Phase 2 |

**Not redundant, despite appearances:** `trace/Movement` (also used by `/pilot`); `trace/Boundary`, `EvidenceTag`, `OriginPoint`, `TemporalRail`, `PermissionGrid`, `VoiceSource`, `Reveal`, `SyntheticNotice` (all used by V5 or Memory v1); `lib/livingTrace/disclosureGuards` (a test helper by design); `lib/flightDeck/postgres/pool` (imported by `runtime.ts`); `design-explorations/archive/` (already the archived history of pre-Manifesto studies, unserved); `staff-ui/` (the backend fixture staff tool, documented in `docs/backend/runbook.md`).

**Design history V2 → V5.** Preserved in three forms before any preview code is removed: (1) an annotated tag, `archive/living-archive-previews`, on the last commit containing every preview, so each remains buildable; (2) `docs/design/history/` with one page per version: date, commit, thesis, light and dark screenshots, and what was carried forward or rejected; (3) the decision log, which already records the approvals.

## 6. Branches eligible for cleanup

All eleven are ancestors of `origin/main` with no patch-unique commits (`git cherry`: 0). No workflow depends on them: CI triggers on `main` only, and the staging deploy takes a ref by hand.

| Branch | Tip | Last commit |
| --- | --- | --- |
| `backend/fixture-preservation-milestone` | `93427f7` | 2026-10-03 |
| `docs/flight-deck-staging-checkpoint-20261023` | `d842801` | 2026-10-23 (PR #12) |
| `docs/stewardship-alignment-20261002` | `6c75f80` | 2026-10-02 |
| `fix/flight-deck-cognito-logo-aspect-ratio` | `9417a90` | 2026-10-23 (PR #10) |
| `fix/flight-deck-managed-login-cli-input` | `7d700de` | 2026-10-23 (PR #9) |
| `fix/flight-deck-operator-directory` | `0894782` | 2026-10-21 (PR #7) |
| `fix/flight-deck-staging-banner` | `9930b81` | 2026-10-21 |
| `flight-deck/change-set-dependency-validation` | `9bd4029` | 2026-10-21 |
| `flight-deck/change-set-dynamic-direct-modification` | `7d20bda` | 2026-10-21 |
| `flight-deck/staging-automation-bypass` | `e630238` | 2026-10-21 |
| `test/flight-deck-stale-approval-pg-20261023` | `1f83a65` | 2026-10-23 (PR #11) |

Five of these also exist as local branches (identical to their remotes). The twelfth, `flight-deck/cognito-managed-login-branding`, joins the list once the integration PR merges. Deletion is recoverable: every tip is reachable from `main`, and the tips are recorded above.

## 7. Deployment blockers

### 7.1 Worker `maxDuration = 120` on the public project

What the repository shows:

- `src/app/flight-deck/internal/worker/route.ts` declares `maxDuration = 120`, introduced in `bb64d48` on 2026-10-19.
- The duration is coupled: `runtime.ts` sets the worker lock connection's `idle_session_timeout` to 150 s, so that a killed tick releases the single-runner lock *after* any tick could still be running. Changing one without the other risks two workers running at once.
- Flight Deck staging is a **separate Vercel project on a Pro team** (`tiro-flight-deck-staging`; `staging-checkpoint-2026-10-23.md`), so staging is not affected.
- Every project that builds `main` must accept the worker route, even where the proxy answers 404 for every `/flight-deck` path.

**Revision 1, verified from Vercel's commit statuses on GitHub** (full record and checklist: `docs/deployment/public-site-hosting-readiness.md`):

- **Two** Vercel projects named `tiro-foundation` build this repository: one in the personal scope (`onewisepixels-projects`) and one in team `tiro-9e61715e`, the team that also hosts staging.
- The **personal** project succeeded through `118187e` and has **failed on every commit since `bb64d48`**, the commit that added `maxDuration = 120`. That points strongly to the 60-second Hobby ceiling without Fluid compute; the build log would confirm it.
- The **team** project was first deployed at `bb64d48` and has **succeeded on every `main` tip and on all nine Living Archive and plan commits**. Vercel can therefore build and finalize this code, worker route included.
- Production (`www.tiro.foundation`) is live and current in its behaviour: Flight Deck answers 404 with private headers, and no `/preview/` route is exposed. Its cache age fits the team project's production deploy of `d7b6b1a`. Which project owns the domain is visible only in Vercel.

**Revision 2 (independently verified in Vercel and GitHub):** the team project owns both domains, both verified; its production deployment is READY at `d7b6b1a`; and its preview of PR #13 is READY. The personal project's domains are unverified. **Gate 0's technical condition is met**; retiring the duplicate is administrative and non-blocking (`public-site-hosting-readiness.md` §1, §4).

Revision 1's inference, now confirmed: Gate 0 meant **confirming that the team project serves the domains and retiring the failing duplicate**, not repairing a broken pipeline. If the personal project turns out to own the domains, production has been frozen since 2026-10-19 and the options below apply to it.

| Option | Change | Cost | Risk |
| --- | --- | --- | --- |
| A. Enable Fluid compute on the Hobby project | A project setting; no code | $0 | Low. Vercel documents up to 300 s on Hobby with Fluid compute; confirm in the project. Leaves the Hobby terms question open |
| B. Serve the public site from the team project | If it already does (expected): disconnect the personal project after checking its domains and configuration. Otherwise: move the domains | Within the team's included credit, per `staging-setup.md`. **Do not** enable the spend hard-limit pause: it pauses every project on the team, including the public site | Low. Also settles the Hobby non-commercial-use question |
| C. Lower to 60 s | Change `maxDuration` **and** `idle_session_timeout`, with timing evidence that a tick finishes well inside 60 s | $0 | A Flight Deck operational change: needs explicit approval and a rehearsal. **Not recommended without operational evidence** |
| D. Split Flight Deck into its own app | Architecture | High | Not proportionate for 3.0 |

**Recommendation:** complete the read-only checklist, then B. A is the immediate fallback only if the personal project owns the domains.

### 7.2 Other release gates already known

- The 18 Bash-script tests must pass in CI on the integration PR (they cannot be confirmed on this Windows host).
- `main` has **no branch protection** (verified through the GitHub API). Until a required status check is configured, "CI before merge" is a convention, not an enforced gate.
- While the personal Vercel project stays connected, every commit and PR carries a failing "Vercel – tiro-foundation" check from it. On the integration PR that failure is expected and is not a regression; the team project's check is the meaningful one.
- `verify-disclosure.mjs` hard-codes `/preview/memory-v1/records/DEMO-MP-*` and `/living-trace/*`; it must follow the routes in Phase 3, or it will pass vacuously or fail. **Confirmed vacuous case:** when no `/preview/memory-v1/records/DEMO-MP-*` route exists, it prints "scenario-page checks skipped" and passes. Moving the records in Phase 3 would silently disable the authority-scenario checks.
- **The disclosure verifier is not in CI** (revision 2 assessment). Recommendation: add it **before Phase 3**, as its own small PR:
  1. Add a step `npm run verify:disclosure` after `Test` in `ci.yml`. CI's build already writes `.next`, the directory the verifier reads, and the verifier runs in seconds with no network or credentials. It passes on PR #13's head today.
  2. In the same PR, make the skipped case fail: replace the hard-coded preview prefix with the list of routes expected to carry the scenario, and fail if none is found.
  3. In Phase 3, retarget those routes to `/memory-project/records/*` and add the decision-45 `noindex` check for every synthetic record page.

  Merging it before Phase 3 means the phase that moves the routes is the first one checked by them. Risk is low: it changes a workflow file, not hosting or repository settings. It does need its own approval, as it changes CI.
- No production page may link to `/preview/` (decision 30): add an automated check.

## 8. Implementation plan

Each phase is one or more PRs into `main`, merged with a merge commit so a phase can be reverted as a unit. Nothing deploys to production until the release gate for that phase is passed and the worker blocker (§7.1) is resolved.

| Phase | Work | Tests and checks | Rollback point | Release gate |
| --- | --- | --- | --- | --- |
| **0. Approve and restore the release path** | Founder review of this plan; confirm the §9 decisions; complete the hosting checklist (`docs/deployment/public-site-hosting-readiness.md`) and act on §7.1 | Checklist answers recorded | — | **G0:** plan approved **and** a verified working release path: the project that owns the domains completes a production deployment of current `main`. **No application code merges into `main` before G0** |
| **1. Reconcile** | *Prepared in revision 1:* local `main` fast-forwarded; `integration/living-archive-3.0` created from `d7b6b1a`; branch merged with original SHAs (`a32809d`); dates and `next.config.ts` comment corrected (`bc3f9b7`); PR opened, **not merged**. Remaining: tag `checkpoint/3.0-start` at `d7b6b1a` at merge time | CI on the PR: build, lint, `npm test` (incl. the Bash suites), `test:flight-deck-pg`, CDK synth. `verify:disclosure` (not in CI; run locally on the merged tree) | `checkpoint/3.0-start`; revert the merge commit | **G1:** G0 passed; CI green on Linux; the team project's preview deployment succeeds; founder approves the PR. **Merging deploys to production automatically** (team project, Git integration). Existing routes are unchanged, but the `/preview/*` pages become reachable by anyone with their URLs: `noindex` discourages indexing and is not access control. Their content is synthetic and labelled, within the agreed scope. The merge approval must acknowledge this explicitly |
| **2. Design system** | Extract `--la-*` tokens, type roles, motion, `LayerStack`, `r2()`, `--la-header` into `components/archive/` and `components/record/`. V5 and v1 previews consume them; no route moves | Before/after screenshots of `/preview/home-v5`, `/preview/memory-v1` and one record page, light and dark, desktop and mobile: no visible difference. Reduced-motion check. `verify:disclosure` | Revert the phase PR | **G2:** visual parity confirmed |
| **3. Public experience** | *Requires the decision superseding 37 and 38.* Move V5 to `/`, v1 to `/memory-project`, records to `/memory-project/records/[id]`; temporary redirects from `/preview/*`; update `TopNav`, `Footer` and internal links. **3b:** restyle the inner pages, `/memories` and `/pilot` (presentation only), one PR per page | `verify:disclosure` retargeted to the new routes; a no-`/preview/`-links check; redirect tests; axe-core plus `accessibility-manual-test.md`; Lighthouse LCP and CLS against the current homepage; synthetic labels present on every demonstration; content review that each inner page's substance is unchanged | Revert the phase PR; Vercel instant rollback for production | **G3:** founder sign-off on a preview deployment, then production |
| **4. Flight Deck** | Apply the shared foundation to the shell, navigation, tables, forms, records and status displays within §4. Add the boundary-check script | Boundary script in CI; `test:flight-deck-pg`; `e2e:flight-deck`; local synthetic demo screenshots; print view; `SyntheticBanner` text unchanged | Revert the phase PR | **G4:** founder review on the local demo, then the approval-gated staging deploy. No auth or workflow change |
| **5. Clean house** | Write `docs/design/history/`; tag `archive/living-archive-previews`; remove V2–V4 previews, the preview redirects (after a stated period), the obsolete `trace/` components (§5), boilerplate assets; retire `/living-trace` if decided; delete the twelve merged branches | Build, full test suite, `verify:disclosure`; repeat the importer scan to show zero consumers for each removed file | The archive tag; branch tips recorded in §6 | **G5:** each deletion list approved before it runs |

## 9. Decisions needed from the founder

**Proposed founder positions, pending confirmation.** These are the founder's recommended positions from the review of 2026-10-29. They are **not recorded** in `decisions.md` and authorize nothing until the founder confirms them there. Revision 2 prepared them as drafts 40–45 (`milestone-3.0-founder-decisions.md`). **Confirmed by the founder on 2026-10-29 and recorded in `decisions.md` as decisions 40–45 (44 amended); the table below is the proposal as it stood.** Item 5 became an administrative matter after Gate 0.

| # | Question | Proposed position | Consequence for this plan |
| --- | --- | --- | --- |
| 1 | Approve Milestone 3.0 | **Yes, conditionally.** No-fast-forward merge into a review branch; CI must pass before anything merges into `main` | Implemented as `integration/living-archive-3.0` and an open PR. Merge waits for G0 and G1 |
| 2 | Production adoption and navigation (supersedes decisions 37 and 38) | **Authorize planning and implementation; release only after testing and founder sign-off.** Navigation: Purpose / Memory Project / Principles / Get involved, **preserving existing destinations** | Phase 3 may be built and previewed; production release stays behind G3. Every current route keeps a place in the new navigation |
| 3 | `/living-trace` | **Keep temporarily**, especially for relationship exploration. Retire only once its valuable functionality and its disclosure checks are accounted for elsewhere | Phase 5's retirement becomes conditional on a functionality and disclosure-coverage mapping; the Constellation components stay until then |
| 4 | `/memories` | **Keep separate during 3.0.** It is backend-connected; the new record pages demonstrate a proposed experience. Combining them would blur that distinction | As planned: restyle only |
| 5 | Worker duration | **Immediate:** investigate and, if suitable, enable Fluid compute. **Strategic:** evaluate the existing Pro team for the public project. **Do not shorten the worker without operational evidence** | Revision 1 finding: a team-scope project already builds and may already serve the site (§7.1), so the strategic path may already exist. The checklist decides between them |
| 6 | Synthetic-record indexing | **Keep `noindex`.** The project and its principles may be discoverable; fictional records must not be mistaken for historical evidence | `/memory-project/records/*` keeps `robots: noindex` in production; add a build-output check for it in Phase 3 |
