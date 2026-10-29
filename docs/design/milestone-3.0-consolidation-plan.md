# Milestone 3.0: Repository reconciliation and integration architecture

Status: **Plan for review.** Nothing has been merged, moved, deleted, deployed, or changed in any authorization path. The only change made to the repository is this document.
Date: 2026-10-29.
Owner: TIRO founder / Steward.
Builds on: `living-archive-consolidation.md` (component inventory, V5 ↔ Memory v1), `decisions.md` (decisions 30–39).

## 0. Verified baseline

Every figure below was checked against GitHub after `git fetch --prune` on 2026-10-29, not taken from earlier summaries.

| Fact | Evidence |
| --- | --- |
| 13 remote branches: `main`, 11 fully merged, 1 with unique work | `git merge-base --is-ancestor` and `git cherry` per branch (§6) |
| `flight-deck/cognito-managed-login-branding` is 8 ahead, 16 behind `origin/main` | `git rev-list --left-right --count`; merge base `f2ad317` |
| The two sides touch **no common file** | Intersection of `git diff --name-only` from the merge base: empty |
| The merge is clean | `git merge-tree --write-tree`: no conflicts |
| The merged tree builds, lints, and holds the disclosure boundary | Trial merge in a throwaway worktree (not pushed, since removed): `npm run build` passes; `eslint` 0 errors (2 pre-existing warnings in `backend/`); `npm run verify:disclosure`: "disclosure boundary holds in the production build" |
| Unit tests | 522 of 540 pass. The 18 failures are all in `stagingScripts.test.ts` and `managedLoginScript.test.ts`, which run Bash scripts; they fail identically on the unmerged branch on this Windows host, and CI (Ubuntu) passes them on `main`. **Must be re-confirmed in CI on the integration PR.** Not run: `test:flight-deck-pg`. |
| Local `main` is behind `origin/main` | Local branches otherwise match their remotes |

Two record-keeping corrections to make during Phase 1: the 2026-10-30 entry in `decisions.md` and the revision date in `living-archive-consolidation.md` are dated after their commits (2026-10-28) and after today; and the comment in `next.config.ts` still refers to `src/middleware.ts`, which Next 16 renamed `src/proxy.ts`.

### Governance precondition

`decisions.md` currently records production adoption of V5, the Memory Project, and the record interface as **not authorized** (decision 37) and global navigation changes as **deferred** (decision 38). The milestone proposal supersedes both. Phases 1, 2 and 4 do not depend on that; **Phase 3 must not begin until a new decision superseding 37 and 38 is recorded** in `decisions.md`.

## 1. Commits to transplant

All eight, oldest first, from `flight-deck/cognito-managed-login-branding` (tip `627ae58`):

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
- The public `tiro-foundation` project builds the same `main`, so it must accept the worker route even though its proxy answers 404 for every `/flight-deck` path there.
- The repository cannot show the public project's plan or settings (no `vercel.json`, no project link).

**To verify first (read-only, in the Vercel dashboard):** the public project's plan; whether Fluid compute is enabled on it; and its deployment history since 2026-10-19. A 60-second ceiling is the limit for Hobby *without* Fluid compute; Vercel documents a higher ceiling with Fluid compute enabled (check the current figure). If the limit is real, **production deployments of the public site may have been failing since 2026-10-19**, and tiro.foundation may be serving an older build.

| Option | Change | Cost | Risk |
| --- | --- | --- | --- |
| A. Enable Fluid compute on the public project | A project setting; no code | $0 | Low, if its Hobby ceiling is ≥ 120 s. Leaves the Hobby terms question open |
| B. Move the public project to the existing Pro team | Hosting change; no code | Within the team's included credit, per `staging-setup.md`, but **do not** enable the spend hard-limit pause: it pauses every project on the team, including the public site | Low. Also resolves the Hobby non-commercial-use concern already recorded in `staging-setup.md` and `staging-decision-packet.md` |
| C. Lower to 60 s | Change `maxDuration` **and** `idle_session_timeout`, with timing evidence that a tick finishes well inside 60 s (statements are bounded at 15 s, S3 calls at 5 s; recovery resumes on the next tick) | $0 | A Flight Deck operational change: needs explicit approval and a rehearsal |
| D. Split Flight Deck into its own app | Architecture | High | Not proportionate for 3.0 |

**Recommendation:** verify, then B (A as the immediate unblock if B waits on a billing decision). Avoid C unless the evidence supports it.

### 7.2 Other release gates already known

- The 18 Bash-script tests must pass in CI on the integration PR (they cannot be confirmed on this Windows host).
- `verify-disclosure.mjs` hard-codes `/preview/memory-v1/records/DEMO-MP-*` and `/living-trace/*`; it must follow the routes in Phase 3, or it will pass vacuously or fail.
- No production page may link to `/preview/` (decision 30): add an automated check.

## 8. Implementation plan

Each phase is one or more PRs into `main`, merged with a merge commit so a phase can be reverted as a unit. Nothing deploys to production until the release gate for that phase is passed and the worker blocker (§7.1) is resolved.

| Phase | Work | Tests and checks | Rollback point | Release gate |
| --- | --- | --- | --- | --- |
| **0. Approve** | Founder review of this plan; record the §2 decisions; verify §7.1 in Vercel | — | — | **G0:** plan approved |
| **1. Reconcile** | Fast-forward local `main`. Tag `checkpoint/3.0-start` at `d7b6b1a`. Create `integration/living-archive-3.0`, merge the branch (§1), fix the dates and the `next.config.ts` comment. PR to `main` | CI: build, lint, `npm test` (incl. the Bash suites), `test:flight-deck-pg`, CDK synth; `verify:disclosure` | `checkpoint/3.0-start`; revert the merge commit | **G1:** CI green. The site gains only `/preview/*` routes (`noindex`), so this is safe to deploy once §7.1 is resolved |
| **2. Design system** | Extract `--la-*` tokens, type roles, motion, `LayerStack`, `r2()`, `--la-header` into `components/archive/` and `components/record/`. V5 and v1 previews consume them; no route moves | Before/after screenshots of `/preview/home-v5`, `/preview/memory-v1` and one record page, light and dark, desktop and mobile: no visible difference. Reduced-motion check. `verify:disclosure` | Revert the phase PR | **G2:** visual parity confirmed |
| **3. Public experience** | *Requires the decision superseding 37 and 38.* Move V5 to `/`, v1 to `/memory-project`, records to `/memory-project/records/[id]`; temporary redirects from `/preview/*`; update `TopNav`, `Footer` and internal links. **3b:** restyle the inner pages, `/memories` and `/pilot` (presentation only), one PR per page | `verify:disclosure` retargeted to the new routes; a no-`/preview/`-links check; redirect tests; axe-core plus `accessibility-manual-test.md`; Lighthouse LCP and CLS against the current homepage; synthetic labels present on every demonstration; content review that each inner page's substance is unchanged | Revert the phase PR; Vercel instant rollback for production | **G3:** founder sign-off on a preview deployment, then production |
| **4. Flight Deck** | Apply the shared foundation to the shell, navigation, tables, forms, records and status displays within §4. Add the boundary-check script | Boundary script in CI; `test:flight-deck-pg`; `e2e:flight-deck`; local synthetic demo screenshots; print view; `SyntheticBanner` text unchanged | Revert the phase PR | **G4:** founder review on the local demo, then the approval-gated staging deploy. No auth or workflow change |
| **5. Clean house** | Write `docs/design/history/`; tag `archive/living-archive-previews`; remove V2–V4 previews, the preview redirects (after a stated period), the obsolete `trace/` components (§5), boilerplate assets; retire `/living-trace` if decided; delete the twelve merged branches | Build, full test suite, `verify:disclosure`; repeat the importer scan to show zero consumers for each removed file | The archive tag; branch tips recorded in §6 | **G5:** each deletion list approved before it runs |

## 9. Decisions needed from the founder

1. Approve this plan (G0), including the merge method in §1.
2. Record a decision superseding 37 (production adoption) and 38 (navigation) before Phase 3, and decide the navigation structure.
3. `/living-trace`: retire in Phase 5 with a redirect, or keep as a reference page.
4. `/memories`: keep separate from `/memory-project/records` in 3.0 (recommended), or plan a merge.
5. Worker duration: the Vercel facts in §7.1, then option A, B or C.
6. Whether synthetic record pages under `/memory-project/records/` stay `noindex` in production (recommended while they are demonstrations).
