# Flight Deck: staging acceptance (Architecture A, real providers)

For: the founder, and whoever helps run the tests.
Status: **Not run.** Every test needs the staging accounts in `staging-setup.md`, which do not exist yet.
Revision date: 2026-10-21 (adds C7, C8 and E7 for Vercel Deployment Protection; E1 and E4 extended). Supersedes the topology-neutral plan of 2026-10-18.

Staging is synthetic only. Use test operators and invented records; never a real prospect's details. Record each test's date, who ran it, the outcome, and any defect in `acceptance.md` §7. Stop at the first failure, fix it, and repeat that stage.

**Done when:** you can sign in to the isolated staging environment with MFA, work with synthetic records, watch the scheduled worker, deliberately restore the database, and see Flight Deck protect its state, with the alarms reaching both addresses.

## A. Identity: Cognito with MFA

| # | Test | Pass when |
| --- | --- | --- |
| A1 | Deploy the template (schedule DISABLED). Run `aws cloudformation validate-template` first | Validates; the stack creates without errors |
| A2 | Create yourself in the pool; first sign-in | TOTP enrolment is forced; you cannot finish without it |
| A3 | Sign in, then sign out; replay the old session cookie | Sign-in needs password + code. After sign-out the cookie is refused (server-side revocation) |
| A4 | Open `/flight-deck/gates` more than 10 minutes after signing in; choose "Sign in again" | Cognito asks for the password **and** the code again (`prompt=login`, `max_age=0`). If it does not, approval stays refused (safe): record it as a defect |
| A5 | Approve the console gate; run `list-gates` | "signature and approver verified"; event 1 in the S3 log is `gate-recorded` |
| A6 | A user outside the `flight-deck` group; a user without MFA | Both refused |
| A7 | **Operator deactivation.** A second test operator signs in on another browser; deactivate them from Health | Their next click goes to sign-in. The deactivation is an event in the S3 log |

## B. Neon PostgreSQL

| # | Test | Pass when |
| --- | --- | --- |
| B1 | `check-config` with the staging variables | Complete; a `-pooler` URL is refused |
| B2 | `migrate`, `init --synthetic`, `add-operator` as the owner role. As the app role: `TRUNCATE fd_audit`, `UPDATE fd_audit`, `CREATE TABLE x()` | Migrations apply over `verify-full`; the three app-role statements fail |
| B3 | Point staging at a database marked **real** (a scratch Neon branch with `init --real`) | Staging refuses to start (synthetic mismatch). Delete the scratch branch |
| B4 | Confirm the history window is 14 days and compute is fixed at 0.25 CU | As configured |

## C. Protective log, Object Lock, and OIDC

| # | Test | Pass when |
| --- | --- | --- |
| C1 | Record a synthetic opt-out in the console | A new `events/…json` object exists, holding no name or address |
| C2 | Inspect the bucket | Versioning on; Object Lock GOVERNANCE with the default retention set (≥ 35 days) |
| C3 | As an administrator: delete an event version; delete it with `x-amz-bypass-governance-retention`; change its retention | All denied |
| C4 | **OIDC scope.** Deploy a **preview** of the staging project (or call from a local `vercel dev`) and record an opt-out | Refused: the preview environment cannot assume the role, and nothing changes. Production of the staging project works (C1) |
| C5 | Confirm no AWS access key exists in Vercel, GitHub, or the repository | None; credentials are only the one-hour OIDC sessions |
| C6 | **Retention coverage.** List Neon branches and any exports | None older than the log retention (`staging-setup.md` §7) |
| C7 | **Deployment Protection.** Run `staging-setup.md` §10.6 against the deployment | No bypass → refused by Vercel (401 or a redirect to sign-in, never 200). Wrong bypass → refused. Bypass on `/pilot` → 200 with the closed form. Bypass but no bearer token on `/flight-deck/internal/status` and `POST /flight-deck/internal/worker` → 401 (404 before the console gate) |
| C8 | **Connection configuration.** Run `staging-setup.md` §10.5 | Both connections `AUTHORIZED`, `API_KEY` with `Authorization`, plus one secret header `x-vercel-protection-bypass`. No secret value is displayed anywhere |

## D. Point-in-time restore and recovery isolation

Prepare: three synthetic relationships. Note time **T**. After T:

- opt one out;
- erase one;
- lift an earlier opt-out;
- demote and then deactivate the second operator;
- promote a reviewer to operator;
- re-approve the console gate.

Let the worker run at least twice.

| # | Test | Pass when |
| --- | --- | --- |
| D1 | **In-place restore.** Neon instant restore of the staging branch to T. Do **not** run `mark-restored` | Within one request: every console page redirects to the recovery page, which shows no record; export refused; status 503 (`restore-in-progress` or `journal-ahead`); queueing or sending refused |
| D2 | Wait for the worker (≤ 5 min), or press Verify and replay now | You are signed out. After signing in: opt-out and erasure back; second operator deactivated; lifted opt-out **in force** with a task; the promotion **not** re-applied (task); the gate re-approval made after T **not** re-applied (task), with the approval in the backup still standing; status 200 |
| D3 | **Cut-over to a new branch.** Restore to a new branch at a later point; set `FLIGHT_DECK_DATABASE_URL` to it; redeploy | The new branch is locked until verified; afterwards the **old** branch, if anything still points at it, reports `restore-in-progress` |
| D4 | **Tampered history.** As an administrator, upload an altered copy of one event under the same key (a new version; Object Lock keeps the original) | Contact and console lock as `journal-integrity`; the worker does not clear it. Copy the original version back; a founder verifies; status 200 |
| D5 | Delete the branches created in D3 | Done (C6) |

Time D1 to D2 and record it: it is staging's recovery time.

## E. Scheduled worker, monitoring, and alarm delivery

| # | Test | Pass when |
| --- | --- | --- |
| E1 | Enable the schedule; watch for 24 hours | EventBridge: worker invocations every 5 minutes, `FailedInvocations` 0, each answered 202 in under 5 s. Health: a completed run every ~5 minutes, which shows the tick runs after the response and that OIDC credentials work there. Status 200. Vercel's request logs show the scheduled calls **reaching the function**, not stopped by Deployment Protection: proof that the bypass header is sent |
| E2 | Confirm both SNS email subscriptions | The operations mailbox and the escalation address both confirmed |
| E3 | **Status alarm.** Disable only the worker rule for 25 minutes | The status monitor alarms (worker stale). Email arrives at **both** addresses; an OK email follows after re-enabling |
| E4 | **Worker alarm.** Break the worker token in the EventBridge connection once | The worker-failure alarm fires at both addresses. Restore the token |
| E7 | **Stale bypass.** In a reviewed change set, point `VercelBypassSecretVersionId` at a version holding a wrong value (or rotate in Vercel without step 5 of `staging-setup.md` §10.7); keep the schedules as they are | Scheduled calls are refused by Deployment Protection, and the status and worker alarms fire. Complete the rotation (§10.7, step 5); both clear. Proves that a stale bypass is loud, not silent |
| E5 | **Log outage.** Remove the S3 statements from the Vercel role's policy for 10 minutes | Console shows only the recovery page; status 503 `sink-unavailable`; status alarm. Restore the policy; recovery verifies on the next run |
| E6 | **Budgets.** Check the AWS budget, the Neon spending notification, and Vercel Spend Management | Configured as in `staging-setup.md` §6; the subscribers are correct |

## F. Incident handling

| # | Test | Pass when |
| --- | --- | --- |
| F1 | Pause all outbound activity; open an incident case; resume | As expected; audited |
| F2 | Rotate the worker token (Secrets Manager → Vercel variable → redeploy → EventBridge connection) | The worker keeps running after the rotation |
| F3 | Rotate the session secret | Everyone is signed out; the console gate becomes invalid until re-approved; re-approve |
| F4 | Lost device: reset a test operator's MFA in Cognito; deactivate and re-add them | They can enrol again; the old sessions are gone |

## Exit criteria

- Stages A to F pass, with records.
- The assistive-technology test and the human-paced review are done (`manual-tests.md`).
- The decisions are recorded.

None of this opens the public form or approves production. The remaining short-window limit on restores (`recovery-guarantees.md` W10) is accepted for staging only. It must be closed by an externally enforced cut-over procedure, or a stronger mechanism, before real contact data.
