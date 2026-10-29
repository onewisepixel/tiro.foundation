# Public site: deployment record and hosting readiness

Status: **Evidence record and read-only checklist.** No hosting setting, project, domain, or branch has been changed.
Date: 2026-10-29.
Owner: TIRO founder / Steward.
Context: Milestone 3.0, Gate 0 (`docs/design/milestone-3.0-consolidation-plan.md` §7.1).

## 1. What was found

**Two Vercel projects named `tiro-foundation` build this repository on every push:**

| Scope | Project | First seen | Outcome since 2026-10-19 |
| --- | --- | --- | --- |
| Personal account (`onewisepixels-projects`) | `tiro-foundation` | Before 2026-10-10 | **Fails on every commit**, starting with `bb64d48` |
| Team `tiro-9e61715e` (the team that also hosts `tiro-flight-deck-staging`) | `tiro-foundation` | `bb64d48`, 2026-10-19 | **Succeeds** on every `main` tip and every Living Archive commit |

Evidence: Vercel's commit statuses on GitHub, read through the GitHub API on 2026-10-29. Each status links to its project's scope.

| Commit | Date | Change | Personal | Team |
| --- | --- | --- | --- | --- |
| `118187e` | 2026-10-19 | Flight Deck 0.2.1 review corrections | success (last) | not yet connected |
| `bb64d48` | 2026-10-19 | Flight Deck staging preparation; **adds `maxDuration = 120`** | **failure (first)** | success (first) |
| `17ed715` … `d7b6b1a` | 2026-10-19 to 10-23 | All `main` work since | failure, every commit | success on every merged tip |
| `975647d` … `627ae58` | 2026-10-23 to 10-28 | Living Archive previews and Memory Project | failure, every commit | **success, every commit** |
| `501e8f7` | 2026-10-29 | Milestone 3.0 plan | failure | success |

The team project also shows five non-systemic failures, all on intermediate commits inside PRs whose final commit succeeded: three are "Canceled from the Vercel Dashboard" (`4683ae0`, `b38a546`, `23c526d`), and two failed within about 20 seconds and were corrected later in the same PR (`dc8e2ef`; `916a8f5`, which CI also failed, fixed by `7d700de`).

**Production (read-only HTTP checks, 2026-10-29):** `tiro.foundation` redirects (308) to `www.tiro.foundation`, which is served by Vercel. `/`, `/pilot`, `/memory-project` and `/living-trace` answer 200; `/flight-deck`, `/flight-deck/sign-in` and `/flight-deck/internal/status` answer 404 with `no-store` and `noindex`; no `/preview/` route is live. The homepage's CDN entry was about 5.8 days old, populated around 2026-10-23 10:38 UTC, shortly after the team project's production build of `d7b6b1a`.

## 2. What this proves, suggests, and leaves open

**Established:**

- No push has published anything through the personal project since 2026-10-19. Pushes did trigger **failed deployment attempts** there, on every commit, including the Living Archive branch.
- The team project has built and deployed the current `main` and every Living Archive commit. A Vercel build of this code, including the 120-second worker route, completes on that project.

**Strongly suggested, not proven:**

- The personal project's failures are caused by the worker's 120-second duration exceeding a 60-second ceiling (Hobby without Fluid compute). The first failure is exactly the commit that introduced the setting, and the commit before it succeeded. Confirming it requires the build log (`npx vercel inspect dpl_4hjv7zQVq36x1XhQ56KjpQ7phsDU --logs`, signed in to the personal scope).
- `www.tiro.foundation` is served by the **team** project. The cache age fits only the team project's successful deploy, but the domain assignment is visible only in Vercel.

**Open:**

- Which project owns each domain; each project's plan, Fluid compute setting and environment variables; whether the team project was created deliberately as the public site's new home.

**Consequence for Gate 0:** if the team project owns the domains, the production release pipeline is **working**. The failing project would then be a superseded duplicate that marks every commit and PR with a red Vercel check. Gate 0 becomes "confirm and retire the duplicate", not "repair the pipeline". If the personal project owns the domains instead, production has been frozen since 2026-10-19 and the original Gate 0 stands.

## 3. Read-only verification checklist

Nothing in this list changes a setting. Record each answer here before any decision.

### A. Domains and production

| # | Check | Where | Answer |
| --- | --- | --- | --- |
| A1 | Which project lists `tiro.foundation` and `www.tiro.foundation` under Domains | Each project → Settings → Domains | |
| A2 | The commit of each project's current Production deployment | Each project → Deployments, filter Production | |
| A3 | Where DNS is managed (`www` is a CNAME to a `vercel-dns-017.com` host; apex resolves to Vercel addresses) and who controls the registrar account | Registrar; Vercel → Domains | |

### B. Plan and function limits

| # | Check | Where | Answer |
| --- | --- | --- | --- |
| B1 | Plan of the personal scope (expected Hobby) and of team `tiro-9e61715e` (expected Pro) | Settings → Billing | |
| B2 | Fluid compute on or off, per project | Project → Settings → Functions | |
| B3 | Default and maximum function duration shown for each project | Project → Settings → Functions | |
| B4 | The personal project's failure cause, from the build log of `dpl_4hjv7zQVq36x1XhQ56KjpQ7phsDU` (commit `bb64d48`) | `npx vercel inspect … --logs`, or the deployment page | |

### C. Configuration that must not differ silently

| # | Check | Where | Answer |
| --- | --- | --- | --- |
| C1 | Environment variable **names** (not values) per project and environment | Project → Settings → Environment Variables | |
| C2 | The public project sets **no** Flight Deck production configuration (`FLIGHT_DECK_*`): Flight Deck must keep answering 404 there | Same | |
| C3 | Deployment Protection: off for public production, as intended | Project → Settings → Deployment Protection | |
| C4 | Git connection: repository, production branch (`main`), ignored build step | Project → Settings → Git | |

### D. Billing behaviour on the team

| # | Check | Where | Answer |
| --- | --- | --- | --- |
| D1 | Spend management: whether a hard-limit pause is enabled. **It pauses every project on the team, including the public site and staging** (`docs/flight-deck/staging-setup.md`) | Team → Settings → Billing | |
| D2 | Team members and roles; who can change domains and billing | Team → Settings → Members | |
| D3 | The team's usage against its included credit, with both the public site and staging on it | Team → Usage | |

### E. GitHub

| # | Check | Answer |
| --- | --- | --- |
| E1 | Installed Vercel GitHub integrations and which repositories each may access (GitHub → Settings → Applications) | |
| E2 | Branch protection on `main`: **none today** (verified through the API). Requiring the `build-lint-test` check would make "CI before merge" enforceable | |

## 4. Decision paths after the checklist

| Finding | Recommended action (each is a founder decision; none taken) |
| --- | --- |
| Team project owns the domains (expected) | Disconnect the personal project from the repository (or archive it) after confirming it holds no domain or unique configuration (A1, C1). The worker needs no change. Fluid compute on the personal project becomes moot |
| Personal project owns the domains | Immediate: enable Fluid compute on it, if B2/B3 confirm it allows ≥ 120 s. Then decide whether to move the domains to the team project, after C1–C4 and D1 |
| Either | Do not shorten the worker without operational evidence (lock timeout coupling, plan §7.1). Consider branch protection for `main` (E2) |

Whether TIRO's current activity requires a paid plan under Vercel's Hobby terms is a separate question. It becomes moot if the public site already runs on the team.
