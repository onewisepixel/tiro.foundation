# Milestone 3.0, Phase 4.1: governance hardening study

> **Status: PROPOSED, NOT APPROVED.** This is an assessment and design for founder review. Nothing here is authorized. No workflow, checker, setting, collaborator or permission has been changed. Decision 59 below is a proposal. It is not entered in `decisions.md`.

Date: 2026-11-04. Branch: `phase-4/boundary-baseline` (PR #26). Reviewed head: `cb4c576`. Related record: `milestone-3.0-phase-4-flight-deck.md` §3.3 and §9.

The study covers two limitations of PR 4.1:

1. **Workflow tampering.** A pull request can redefine the workflow job that produces the required `flight-deck-boundary` check. It can then report success without running the checker.
2. **No approving review.** `main` requires pull requests, but no approving review.

## 1. Verified configuration (read from GitHub on 2026-11-04; nothing changed)

| Item | Found | Matches the brief? |
| --- | --- | --- |
| PR #26 | open, **draft**, not merged, head `cb4c576`, base `main` | yes |
| Required status checks on `main` | `build-lint-test` and `flight-deck-boundary`. Both are pinned to app 15368 (GitHub Actions). **Strict** is on | yes |
| Checks on `cb4c576` | `flight-deck-boundary` success (github-actions); `build-lint-test` success (github-actions); Vercel Preview Comments success | yes |
| Combined commit status | `failure`, from the non-required personal Vercel project (`Vercel – tiro-foundation`). It is the reason the PR shows `mergeable_state: unstable`. It does not block the merge | known, unchanged |
| Pull request reviews | PRs are required, with `required_approving_review_count: 0`. Dismiss stale reviews, code-owner review and last-push approval are all off | yes |
| **Include administrators** (`enforce_admins`) | **off** | **discrepancy, see below** |
| Rulesets | none | — |
| Force pushes / deletions on `main` | blocked / blocked | — |
| Collaborators | `onewisepixel` only (admin). The repository is user-owned, so it has no teams. No pending invitations | — |
| Repository | public, user-owned, default branch `main` | — |
| Actions | `GITHUB_TOKEN` defaults to **read**. Actions **cannot approve** pull requests. Fork PRs from first-time contributors need approval to run | — |
| Secrets | **No repository secrets or variables.** The environment `flight-deck-staging` holds `VERCEL_STAGING_TOKEN` and `VERCEL_AUTOMATION_BYPASS_SECRET`. Its required reviewer is `onewisepixel`, self-review is allowed, and it has **no deployment-branch policy** | see below |
| Workflows | `ci.yml` (`pull_request` and `push` to `main`). `deploy-flight-deck-staging.yml` (`workflow_dispatch` only) | — |
| PR #26 content | 44 files changed. Outside `docs/` and `scripts/test/flight-deck-*`, it changes only the appended `ci.yml` job and the `E2E_OUT` override in `scripts/flight-deck/e2e.mjs`. **No file under `src/`, `backend/`, `infra/` or `deploy/`, and no `package*.json`** | yes |
| Checker sourcing | `ci.yml` takes the checker from the merge base when the base has one. On PR #26 the base has none, so CI used the branch's copy. The log of run 41715405948 says: "The merge base has no checker (the PR that introduces it): using this branch's copy." Exceptions are bootstrapped from the branch for the same reason | yes, with the bootstrap case expected |

**Discrepancies and additional findings**

- **D-1. "Include administrators" is off.** The two required checks bind every account except an admin, and the only account is an admin. An admin can merge past a failing or pending check, and can push directly to `main` without a pull request. The requirement is real for forks and for any future non-admin collaborator. For the founder's account it is advisory.
- **D-2. The agent credential is an administrator credential.** This session reaches GitHub through a classic personal access token in the Git credential store. Its scopes include `repo`, `workflow`, `delete_repo`, `admin:org` and `admin:repo_hook`, and it expires 2027-09-02. An agent using it acts as the founder with full admin rights. It could change branch protection, push to `main` or merge, even though standing instructions forbid all three. GitHub cannot tell the founder's actions from an agent's.
- **D-3. The staging environment has no branch restriction.** Any workflow on any branch can name `environment: flight-deck-staging`. Such a job would wait for the founder's approval and then receive the Vercel token. The approval gate holds. A tampered PR workflow could still request it, and the approval prompt is the only barrier.

## 2. Workflow-definition tampering

### 2.1 Why it is possible

For the `pull_request` event, GitHub runs the workflow files of the **PR merge commit** (`refs/pull/N/merge`). It does not run the base branch's copies. The PR therefore controls the definition of the `flight-deck-boundary` job.

The required check is matched by **name and app**. Every GitHub Actions job is reported by the same app, 15368, so a job with that name in any PR-controlled workflow satisfies the pin. PR 4.1 takes the checker *file* from the merge base. That defends against a weakened checker, but not against a weakened job. The logic that copies the checker, `BASE_REF` and `MODE` all live in the job definition, and the PR can rewrite it.

GitHub's documentation also states that "a job that is skipped will report its status as Success … even if it is a required check".

### 2.2 Local demonstration (throwaway repository, nothing pushed)

**Setup.** The script builds a temporary git repository. Its `main` holds the PR 4.1 checker, the exceptions file and `ci.yml`, taken from `cb4c576` as if PR 4.1 were merged.

**Each variant:**
1. A branch makes a forbidden change: a class change in `ui.tsx`, plus an edit to `src/lib/flightDeck/briefing.ts`. It adds one workflow tamper.
2. The script builds the merge commit the way GitHub does.
3. It runs every job that the **merge commit's** `pull_request` workflows name `flight-deck-boundary`.
4. It also runs `main`'s checker outside the PR's workflow, for comparison.

**Simulation limits.** `uses:` steps, `npm ci` and the self-test step are not executed, and the `${{ }}` expressions in `ci.yml` are evaluated for a `pull_request` event. The script is kept outside the repository. Step 1 of §4 turns it into an automated test.

| Variant | Tamper | Required check from the PR's own workflow | `main`'s checker run outside the PR |
| --- | --- | --- | --- |
| control | none | **failure** (merge-base checker, enforce) | fail: `src/lib/flightDeck/briefing.ts` protected |
| V1 | boundary step's script replaced with `echo "boundary ok"` | **success** | fail (also flags `.github/workflows/ci.yml`) |
| V2 | `MODE: report` | **success** (checker ran, reported only) | fail |
| V3 | `BASE_REF: HEAD`. The PR becomes its own merge base, so both the checker and the exceptions come from the PR | **success** | fail |
| V4 | job `if: false` | **skipped, which GitHub reports as Success** | fail |
| V5 | step `continue-on-error: true` | **success** (checker failed; job passed) | fail |
| V6 | job deleted from `ci.yml`; new `extra.yml` defines a job with the same name that runs `true` | **success** | fail |
| V7 | workflow-only PR that no-ops the job, with no Flight Deck change | **success** | **pass**. The checker only reports, because no presentation changed |

**Conclusion.** Every tamper V1–V6 turns a forbidden change into a passing required check. The same checker, run from trusted code outside the PR's workflow, rejects all six.

V7 shows a second gap. A PR that changes only the workflow passes even the trusted checker today. Once merged, it removes enforcement for **every later PR**, because later merge commits inherit the weakened `ci.yml`.

**What a PR cannot do without a workflow change.** The other job, `build-lint-test`, runs PR code (`npm ci`, `npm run build`, `npm test`). Its token is read-only, because the repository default is read and `ci.yml` grants nothing more. So it cannot create a check run or a commit status. Every forgery therefore requires a change under `.github/`.

### 2.3 Options

| | O1 Trusted `pull_request_target` workflow + "workflow changes travel alone" rule | O2 O1, with the check reported by a dedicated GitHub App | O3 Code-owner review of `.github/**` | O4 Organization ruleset "require workflows" | O5 Procedure only |
| --- | --- | --- | --- | --- | --- |
| **Prevents tampering how** | GitHub runs `pull_request_target` from the **default branch's** workflow file. Since 2025-12-08 it always uses the default branch, whatever the PR's base. The PR cannot edit the job that judges it. A new checker rule fails any PR that changes `.github/**` together with anything other than documentation. Every forged same-name check is therefore accompanied by a failing trusted check | The check is created through the Checks API by an App with its own app id. Branch protection pins that id. No Actions job, the PR's included, can produce a check under it | A human must approve any change to workflows | GitHub runs a workflow named by the organization, outside the PR's control | The founder inspects every workflow diff |
| **How it reads the PR** | It checks out `main` (trusted). It fetches `refs/pull/N/head` as **git objects only** and verifies that the SHA equals the event's head SHA. The checker reads files with `git show <sha>:<path>` and lists changes with `git diff`. PR files are never written to the working tree and never executed | Same as O1 | — | Like O1 | — |
| **TypeScript** | `npm ci --ignore-scripts` from **`main`'s** lockfile. TypeScript is used only as a parser (`createSourceFile`), so PR text is data. The worst case is a slow or crashing parse. Either fails the check, so it fails closed | Same | — | Same | — |
| **Settings, permissions, cost** | `permissions: contents: read`, no `environment:`, no secrets. Required check changed to the new job name. Free on a public repository | A new GitHub App (free) and its private key, held in an environment restricted to `main`. A second credential to rotate and protect | Needs a reviewer other than the author. **None exists today** (§3) | The repository would have to move to an organization. Availability on free plans for this rule is unverified | none |
| **Bootstrap** | The workflow runs only once it exists on `main`. The PR that adds it is judged by the current regime and by founder review | As O1, plus App registration | — | Repository transfer | — |
| **Residual risk** | GitHub does not document how two check runs with the **same name from the same app** are resolved. If the forged one can satisfy the requirement, O1's protection reduces to "the trusted check visibly fails". Acceptance test G-3 settles this | Smallest. A forged check comes from the wrong app and is rejected | Sole-maintainer deadlock or routine bypass | Platform and plan dependency | Human error |

`pull_request_target` alone is **not** sufficient and is not proposed alone. Its known risks are:
- checking out and building PR code with a privileged token;
- interpolating PR-controlled strings (branch names, titles) into scripts;
- cache poisoning;
- reaching secrets.

O1 is defined to avoid every one:
- no PR checkout;
- no PR code executed;
- read-only token;
- no secrets or environments;
- PR strings passed only through `env:`;
- no dependency cache;
- actions pinned by commit SHA;
- `persist-credentials: false`.

### 2.4 Recommendation: O1, with O2 held in reserve

O1 meets every requirement in the brief without new infrastructure. It has two parts.

**Part 1. The trusted workflow** (sketch, for review):

```yaml
# .github/workflows/flight-deck-boundary-trusted.yml  (PROPOSED)
name: Flight Deck boundary (trusted)
on:
  pull_request_target:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: fd-boundary-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  flight-deck-boundary-trusted:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<pinned sha>        # main: trusted code only
        with: { fetch-depth: 0, persist-credentials: false }
      - uses: actions/setup-node@<pinned sha>      # no dependency cache
        with: { node-version: 22 }
      - run: npm ci --ignore-scripts                # main's lockfile
      - name: Fetch the pull request as data
        env:
          PR: ${{ github.event.pull_request.number }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          git fetch --no-tags origin "+refs/pull/$PR/head:refs/boundary/head"
          test "$(git rev-parse refs/boundary/head)" = "$HEAD_SHA"
      - name: Flight Deck protected boundary
        env:
          BOUNDARY_BRANCH: ${{ github.event.pull_request.head.ref }}
        run: node scripts/test/flight-deck-boundary.mjs --base origin/main --head refs/boundary/head --branch "$BOUNDARY_BRANCH" --mode auto --trusted
```

**Part 2. Checker changes**, which ship in their own PR first:

- `--head <rev>`: compare against a git object instead of `HEAD`. The working tree stays `main`'s.
- `--trusted`: enables two rules that apply whatever the branch name and whatever presentation changed:
  - **R1, workflow changes travel alone.** A PR that changes `.github/**` fails if it also changes anything outside `docs/`. A forged check can then never accompany the code it would vouch for. Unrelated PRs, which never touch `.github/`, are unaffected.
  - **R2, control-plane changes travel alone.** A PR that changes the trusted workflow, the checker, its tests or the exceptions file fails if it also changes anything outside those files and `docs/`. The report states "control-plane change: merge only with a recorded founder decision".
- Exceptions are read from `main` (trusted). Strict mode keeps the PR current with `main`, so this equals the merge base at merge time.

**The old job.** The `ci.yml` job is renamed `flight-deck-boundary-selftest` and stops being required. It keeps running the self-tests on the PR's own code, unprivileged. `ci.yml` gains a top-level `permissions: contents: read`, so PR code can never create checks or statuses, even if the repository default changes.

**Fallback.** If acceptance test G-3 shows that a forged same-name check can satisfy the requirement while the trusted check fails, adopt **O2**. Rename the required context so no Actions job can match its app pin.

## 3. Approval enforcement

**Current position.**
- There is one collaborator, `onewisepixel`, an admin. A user-owned repository has no teams.
- GitHub does not let an author approve their own pull request, and Actions is barred from approving.
- Agents push and open PRs **as `onewisepixel`** (D-2). So every PR, agent-written or not, has the founder as its author.

**There is no eligible independent reviewer today.**

| | Option A: founder-controlled acceptance | Option B: enforced independent review |
| --- | --- | --- |
| Mechanism | The founder records acceptance in `decisions.md` before anyone marks a PR ready or merges it. Agents never mark ready or merge (already a standing instruction) | `required_approving_review_count: 1`, dismiss stale approvals, require approval of the most recent push, code-owner review for `.github/**` and the control plane, Include administrators on |
| With one maintainer | Works. The founder's review is real, but GitHub neither enforces nor attributes it | **Deadlocks or becomes ceremonial.** No one can approve the founder's PRs. With Include administrators off, every merge is an admin bypass and bypass becomes routine. With it on, nothing can merge |
| What it relies on | The founder's discipline, and agents respecting instructions while holding an admin credential | A second identity with write access |
| New commits after acceptance | Must be re-accepted by hand. The decision should name the accepted head SHA | Enforced: stale approvals are dismissed |
| Workflow and control-plane changes | Founder review, plus R1/R2 (§2.4) | Code-owner approval, plus R1/R2 |

**Making Option B workable without a second human.** Agents work through a **separate machine account** (or an App) with write access, and never through the founder's credential. Agent PRs then have a different author, and the founder's approval becomes a genuine, enforced, independent review of agent work. The founder's own PRs would still need a second human, or a recorded admin bypass.

GitHub's terms allow one machine account alongside a personal account. On a public repository this is free. It is a collaborator addition, so it needs the founder's decision. This study does not make it.

**Recommended near-term policy: Option A, strengthened.**
1. Acceptance is recorded in `decisions.md` with the accepted head SHA before a PR is marked ready or merged. Any later commit needs re-acceptance.
2. Agents never mark ready, merge, change settings or push to `main`.
3. Turn **Include administrators on** (D-1). Keep required approvals at 0. The founder can then still merge their own PRs, but only through a pull request whose required checks pass. Turning it off again is an audited emergency setting change.
4. Replace the agent's admin token (D-2) with a fine-grained token for this repository only:
   - Contents: read and write;
   - Pull requests: read and write;
   - Metadata: read;
   - no Administration;
   - Workflows only when a workflow change is authorized;
   - expiry of 90 days or less.

**Recommended longer-term institutional policy: Option B.**
- Agents use a dedicated machine account with write access, no admin.
- Require one approving review, with stale approvals dismissed and the most recent push approved.
- `CODEOWNERS` assigns `.github/**` and the boundary control plane to the founder, and code-owner review is required.
- Include administrators stays on.
- When TIRO has a second maintainer, they become the required reviewer for founder-authored PRs and for control-plane changes. Until then, a founder-authored PR merges only through a recorded admin bypass that names the decision.

## 4. Implementation sequence (after approval; each step separately authorized)

1. **Disposable GitHub acceptance repository.** It is public, free, owned by the founder and created by the founder. Run tests G-1 to G-10 there before anything changes on this repository. Pushing tampered workflows there is the purpose of the repository; nothing tampered is pushed here.
2. **PR 4.1b-1, checker only** (`scripts/test/` and `docs/`):
   - `--head`, `--trusted`, R1 and R2;
   - the tamper variants V1–V7 from §2.2 as automated tests;
   - tests showing the trusted mode never writes PR files to disk.

   It is judged by the current regime and by founder review.
3. **PR 4.1b-2, the trusted workflow file alone** (R1-compliant). After merge, a docs-only probe PR must show `flight-deck-boundary-trusted` running and passing.
4. **Setting S1:** add `flight-deck-boundary-trusted` (GitHub Actions) as a required check.
5. **Setting S2:** remove `flight-deck-boundary` from the required checks.
6. **PR 4.1b-3, `ci.yml` alone:** rename the job to `flight-deck-boundary-selftest` and add `permissions: contents: read`. S2 must come first, or this PR would wait forever for a check that no longer runs.
7. **Real-repository demonstration:** a draft PR with a deliberate protected-path change, as `08de3fb` did. It must fail the trusted check. Then close it. No tampered workflow is pushed here.
8. **Settings S3 to S5** (§6), at the founder's chosen time.

## 5. Test and acceptance matrix

| # | Where | Case | Expected |
| --- | --- | --- | --- |
| L-1 | local, CI | trusted mode with `--head` on a permitted presentation change | pass; the working tree is unchanged and no PR file is written |
| L-2 | local, CI | V1–V6, each with a forbidden change | trusted check fails (R1 and protected path) |
| L-3 | local, CI | V7, a workflow-only change | passes, reported as "control-plane change" |
| L-4 | local, CI | workflow change + Flight Deck change | fails (R1) |
| L-5 | local, CI | checker or exceptions change + app change | fails (R2) |
| L-6 | local, CI | unrelated operational PR, docs-only PR | pass without action |
| L-7 | local, CI | PR grants itself an exception | ignored, so the PR fails |
| L-8 | local, CI | all 132 existing tests | still pass |
| G-1 | acceptance repo | the `pull_request_target` check appears on the **PR head SHA**, can be selected as required, and re-runs on each push | yes |
| G-2 | acceptance repo | PR edits the trusted workflow file | the run uses `main`'s definition; the PR's edit has no effect |
| G-3 | acceptance repo | PR adds a `pull_request` job named `flight-deck-boundary-trusted` that runs `true`, with a forbidden change. Try with the forged job finishing **before and after** the trusted one | **the PR stays blocked**. If not, adopt O2 |
| G-4 | acceptance repo | a commit status with the same context, posted by a personal token | does not satisfy the app-pinned check |
| G-5 | acceptance repo | fork PR whose `package.json` has a `preinstall` that writes a marker, and a test file that writes a marker | no marker in the trusted run, so no PR code executed |
| G-6 | acceptance repo | branch name and title containing `$(…)`, backticks and `${{ }}` | treated as text; nothing executes |
| G-7 | acceptance repo | job permissions shown in "Set up job" | `Contents: read` only; no secrets in the environment |
| G-8 | acceptance repo | base moves while the PR is open (strict mode) | update required; the trusted check re-runs on the update |
| G-9 | acceptance repo | docs-only and unrelated PRs | pass with no special handling |
| G-10 | acceptance repo | PR that adds `environment:` to a job | waits for approval; with S4, refused for non-`main` branches |
| R-1 | this repository, after step 6 | deliberate protected-path draft PR | trusted check fails; the PR is blocked for a non-admin and, with S3, for the admin |

## 6. Repository-setting changes required (all founder actions; none made)

| # | Setting | Change | When |
| --- | --- | --- | --- |
| S1 | Branch protection `main`, required checks | add `flight-deck-boundary-trusted` (source: GitHub Actions) | after step 3 |
| S2 | same | remove `flight-deck-boundary` | after S1, before PR 4.1b-3 |
| S3 | Branch protection `main` | **Include administrators: on** | near term; independent of the rest |
| S4 | Environment `flight-deck-staging` | deployment branches: `main` only. Consider "prevent self-review" once a second reviewer exists | near term. Compatible with the manual deploy, which runs from `main` |
| S5 | Account credentials | replace the agent's classic admin token with a fine-grained repository token (§3) | near term |
| S6 | Later, Option B | machine account (write), 1 approval, dismiss stale, last-push approval, `CODEOWNERS` with code-owner review | when the founder decides |
| S7 | Only if G-3 fails | GitHub App for the trusted check; private key in an environment restricted to `main`; required check pinned to the App | conditional |

## 7. Costs and dependencies

- **No new paid services.** Actions minutes are free on a public repository, and so are the acceptance repository, a machine account and a GitHub App.
- **New dependency.** The trusted workflow depends on GitHub's documented `pull_request_target` semantics. GitHub changed those semantics on 2025-12-08. The acceptance tests can be re-run after any platform change.
- **O2 only.** It adds an App and a private key to rotate.

## 8. Limitations that will remain

1. **The admin can still bypass,** until S3 is on and the agent credential is narrowed (S5). Even then, an admin can change branch protection. Every technical control here binds an administrator only as far as they choose to keep it on.
2. **Same-name check resolution is undocumented** until G-3 runs. O2 removes the dependency.
3. **Control-plane changes are judged by people.** R1 and R2 make them travel alone and visible. Whether a workflow or checker change is acceptable is still the founder's judgement, and with Option A there is no second reviewer.
4. **The PR that introduces the trusted workflow,** and PR #26 itself, are judged under the old regime and by founder review (the bootstrap).
5. **The parser reads untrusted input.** A crafted file can at worst slow or crash the check, which fails closed.
6. **PR 4.1's structural limits remain,** as listed in `milestone-3.0-phase-4-flight-deck.md` §3.4.
7. **GitHub cannot tell founder from agent** until agents have their own identity (§3).

## 9. Proposed decision 59 (PROPOSED, NOT APPROVED; not entered in `decisions.md`)

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 59 | **Boundary governance hardening.** The Flight Deck boundary is enforced by a trusted `pull_request_target` workflow (`flight-deck-boundary-trusted`) that runs only `main`'s checker and treats PR content as git data. It has a read-only token, no secrets and no PR code execution. Changes to workflows and to the boundary control plane must travel alone. Near term, approval is founder-controlled (Option A, strengthened): acceptance is recorded with the head SHA, Include administrators is on, and agents use a non-admin credential. Longer term, independent review is enforced through a separate agent identity (Option B) | **Proposed** | Demonstrated: a PR can redefine the job behind a required check (`…-governance-hardening.md` §2.2, V1–V6). A merge-base checker cannot defend its own invocation. There is no eligible independent reviewer today, so a required approval would deadlock or be bypassed routinely | Sequence §4. Each PR (4.1b-1 to 4.1b-3) and each setting (S1–S7) needs separate authorization. Acceptance tests G-1 to G-10 first, in a disposable repository. If G-3 fails, O2 replaces the reliance on check names. Does not authorize PR 4.2, staging deployment or live records |

## 10. Founder decisions needed before implementation

1. Approve, amend or reject **decision 59**.
2. **PR #26.** Either merge it with this limitation recorded (recommended: it protects against everything except a deliberate workflow edit, which shows in the diff), or hold it until the trusted check exists.
3. Authorize the **disposable acceptance repository** and tests G-1 to G-10, including pushing tampered workflows there.
4. Authorize **PRs 4.1b-1, 4.1b-2 and 4.1b-3**.
5. Approve and schedule **settings S1–S5**, which the founder performs.
6. Choose the **review policy**: Option A strengthened now. Then decide whether and when to add a machine account for agents (Option B).
7. Confirm the **fallback**: adopt O2 automatically if G-3 fails, or return for review.
