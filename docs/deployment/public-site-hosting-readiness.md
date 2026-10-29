# Public site: deployment record and hosting readiness

Status: **Gate 0 technical evidence complete; administrative actions pending founder authorization.** No hosting setting, project, domain, repository setting, or branch has been changed.
Date: 2026-10-29 (revision 2, after independent verification in GitHub and Vercel).
Owner: TIRO founder / Steward.
Context: Milestone 3.0, Gate 0 (`docs/design/milestone-3.0-consolidation-plan.md` §7.1, §8).

## 1. Gate 0 evidence (complete)

Items marked *independent* were confirmed directly in Vercel or GitHub by an independent reviewer on 2026-10-29. Items marked *API* were read by Claude through the GitHub API or public HTTP.

| # | Finding | Source |
| --- | --- | --- |
| 1 | Team project `tiro-9e61715e/tiro-foundation` owns `tiro.foundation` and `www.tiro.foundation`; both are **verified** | Independent (Vercel) |
| 2 | The personal project's corresponding domains are **unverified**: it serves neither | Independent (Vercel) |
| 3 | The team project's production deployment is **READY at `d7b6b1a`**, matching current `main` | Independent (Vercel) |
| 4 | The team project's preview of PR #13 head `989c292` is **READY** | Independent (Vercel); API (commit status) |
| 5 | GitHub Actions run `40833064286` (`build-lint-test`) passed every step, including the Bash-script suites, PostgreSQL integration, and CDK synth | Independent; API (job steps) |
| 6 | The personal project `onewisepixels-projects/tiro-foundation` succeeded through `118187e` and has failed on every commit since `bb64d48`, which added `maxDuration = 120` | API (commit statuses) |
| 7 | Production keeps Flight Deck absent: `/flight-deck`, `/flight-deck/sign-in` and `/flight-deck/internal/status` answer 404 with `no-store` and `noindex`; no `/preview/` route is live | API (HTTP) |

**Conclusion.** The production release path works. The worker's 120-second duration does not block it: the team project accepts it. The failing personal project serves no domain and is a superseded duplicate. **Gate 0's technical condition is met.** The remaining items in §3 are administrative hygiene, and none of them blocks the PR.

## 2. Configuration review

Claude has no Vercel access from this machine, so the dashboards could not be compared directly. This section gives the reference each project should be compared against: what the code reads. A comparison against it needs **names only**; no value need be revealed.

### 2.1 Environment variables the deployed application reads

| Name | Read by | Public site (team project) |
| --- | --- | --- |
| `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL` | `/memories`, `/memories/[id]` (`src/lib/publicMemoryApi.ts`) | The only variable the public pages use. **See finding 2.2** |
| `FLIGHT_DECK_MODE` | `src/lib/flightDeck/config.ts` | **Must be absent.** Flight Deck exists only when it is `production` (with complete configuration and a matching Host) or `local-demo` (refused on any hosting platform and any non-loopback Host) |
| `FLIGHT_DECK_DEPLOYMENT` | `next.config.ts`, `config.ts`, `runtime.ts` | Must be absent: `staging` adds `noindex` to every public page |
| `FLIGHT_DECK_PUBLIC_ORIGIN`, `FLIGHT_DECK_DATABASE_URL`, `FLIGHT_DECK_DATABASE_CA_PEM`, `FLIGHT_DECK_SESSION_SECRET`, `FLIGHT_DECK_EMAIL_HASH_PEPPER`, `FLIGHT_DECK_WORKER_TOKEN`, `FLIGHT_DECK_MONITOR_TOKEN`, `FLIGHT_DECK_COGNITO_*` (region, user pool, client ID and secret, domain, required group), `FLIGHT_DECK_PROTECTIVE_*` (bucket, region, prefix, endpoint), `FLIGHT_DECK_AWS_ROLE_ARN`, `FLIGHT_DECK_*_ENABLED` (public form, outbound email, social publishing, background jobs), `FLIGHT_DECK_LOCAL_STORE_PATH` | Flight Deck | **Should be absent.** They are inert without `FLIGHT_DECK_MODE=production`, but Flight Deck secrets do not belong on the public project. Their place is `tiro-flight-deck-staging` |
| `FLIGHT_DECK_DIST_DIR` | `next.config.ts` (local dev only) | Absent |

The observed production behaviour (Flight Deck 404 on `www.tiro.foundation`) is consistent with `FLIGHT_DECK_MODE` being absent. It is equally consistent with production mode configured for another Host, which only the dashboard can rule out.

### 2.2 Finding: live records are unavailable in production

`https://www.tiro.foundation/memories` shows "Live records are temporarily unavailable" on every request. The public records API documented in `docs/backend/handoff-summary.md` answered 200 to three read-only requests on 2026-10-29, in 2.7 to 7.1 s. The page's fetch has no timeout, only error handling. The most likely cause is that the team project has **no `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL`** (or a different value). That may be a gap from setting up the team project, or a deliberate choice: the backend is a synthetic fixture stack, and showing its records on the production site is a founder decision. **Compare this name across both projects before disconnecting the personal project** (§4, step 1). The value is also recorded in the handoff summary.

### 2.3 Settings to compare (names and states only)

| Setting | Expected for the public site | Why it matters |
| --- | --- | --- |
| Git: repository, production branch | `onewisepixel/tiro.foundation`, `main` | Both projects currently build every push |
| Ignored Build Step | None | A silent skip would freeze production |
| Deployment Protection | Off for production; previews may be protected | A protected production would hide the site |
| Fluid compute / function duration | Any setting that accepts 120 s (the team project already does) | Applies only to the personal project's failures |
| Domains | Team: both verified (confirmed). Personal: none verified (confirmed) | Unverified entries on the personal project should be removed when it is retired |
| Linked resources: deploy hooks, cron jobs, log drains, storage, Edge Config | None expected on the personal project | Anything found must be moved or retired deliberately |
| Spend management on team `tiro-9e61715e` | **No hard-limit pause** | A pause stops every project on the team: public site and staging |

## 3. Remaining administrative checks (non-blocking)

| # | Check | Why |
| --- | --- | --- |
| A1 | Compare environment variable names across both projects, especially `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL` (§2.2) and any `FLIGHT_DECK_*` on the public project (§2.1) | Before disconnecting the personal project; confirms the public project holds no Flight Deck secrets |
| A2 | List linked resources on the personal project (§2.3) | Nothing should depend on it |
| A3 | Personal project build log for `dpl_4hjv7zQVq36x1XhQ56KjpQ7phsDU` (`bb64d48`) | Confirms the cause (expected: duration limit). Historical interest only now |
| A4 | Team spend management and members | §2.3 |
| A5 | Plan terms: whether anything else of TIRO remains on the Hobby scope | The public site is already on the team |

## 4. Recommended procedure: disconnect the personal project (not executed)

Each step is reversible until step 5.

1. **Record (read-only).** In the personal project, note its environment variable names, linked resources, and the unverified domains. If `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL` exists only there, decide (§2.2) whether the team project should have it **before** going further.
2. **Remove the unverified domain entries** from the personal project. They serve nothing, and the team project's verified ownership is unaffected. Reversible.
3. **Disconnect Git** in the personal project (Settings → Git → Disconnect). This stops its builds and its failing GitHub check. Reversible by reconnecting. **Do not** uninstall or restrict the Vercel GitHub App on the account or repository: the team project and staging may rely on the same installation.
4. **Verify** on the next push to any branch: exactly one "Vercel – tiro-foundation" status (the team's), green; the team project still builds; the production domain is unchanged.
5. **After an observation period** (suggested two weeks): optionally delete the personal project. This is irreversible; its deployment history is preserved here (§1) and in GitHub's commit statuses.

## 5. Recommended branch protection for `main` (not applied)

`main` has no protection today. Recommended, as a repository ruleset or a classic branch protection rule:

| Setting | Value | Note |
| --- | --- | --- |
| Require a pull request before merging | On; **required approvals: 0** | A sole maintainer cannot approve their own PR; one required approval would block every merge |
| Require status checks to pass | **`build-lint-test`**, with the source pinned to **GitHub Actions** | The job in `.github/workflows/ci.yml`. Pinning the source prevents a commit status of the same name from satisfying it |
| Require branches to be up to date | On | The check then runs against what `main` will actually contain |
| Vercel checks | **Not required** | The personal project's check fails by design until disconnected; the team's preview is reviewed, not gated, by GitHub |
| Block force pushes and deletion of `main` | On | |
| Bypass | Founder (repository admin) only, for emergencies | Every bypass is visible in the PR or audit log |

`CI` also runs on every push to `main`. Under this rule every change arrives by PR, so those runs confirm the merged result.
