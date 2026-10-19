# Flight Deck: staging acceptance plan (0.2.1)

For: the founder, and whoever helps run the drills.
Status: **Plan only. Nothing here has been run.** Every step needs an AWS account, money, or a real device, which this candidate does not have.
Revision date: 2026-10-19. The topology decision is now in `staging-decision-packet.md`.

Staging runs the production build in production mode, against real Cognito, a hosted PostgreSQL, and the protective log bucket. **Staging holds test records only.** Use addresses the testers own (for example `you+staging1@…`), never a prospect's. The public form, email, and social stay off throughout.

## 1. Decisions needed before staging

| # | Decision | Options and recommendation | Why it matters |
| --- | --- | --- | --- |
| 1 | **Topology** | A: Vercel + Neon Scale (recommended for synthetic staging), or B: AWS Fargate + private RDS. Full comparison in `staging-decision-packet.md` | Network exposure, maintenance, and cost (~$43 vs ~$63 a month) |
| 2 | **Database provider and size** | RDS db.t4g.micro single-AZ (provisional); Neon Scale if a second vendor is acceptable. Neon Launch cannot meet a 14-day window | Backup capability and cost |
| 3 | **Region** | After counsel's residency review. The same region for the database, Cognito, and the log bucket keeps one jurisdiction | Data residency |
| 4 | **Point-in-time window** | 14 days (planning target). Then set `ProtectiveRetentionDays` to at least the window + 21 (default 35 is enough) | The log must outlast every restorable backup (`recovery-guarantees.md` W1) |
| 5 | **Spending authorization** | About $22 to $55 a month at London prices, plus app hosting (`integrations.md` §4.2) | No resource is created without it |
| 6 | **Alarm recipient** | An address the founder reads daily | Worker and log-outage alerts |
| 7 | **Staging account** | A separate AWS account or, at least, a separate stack and bucket from production | A staging mistake must not touch production's log |

## 2. Stages

Record each step's date, who ran it, the outcome, and any defect in `acceptance.md` §7. Stop at the first failure, fix it, and repeat the stage.

### A. Identity: real Cognito with MFA

1. Deploy `deploy/flight-deck/flight-deck.template.json` into the staging stack, with the schedule DISABLED. Run `aws cloudformation validate-template` first and record the result. `cfn-lint` already passes locally.
2. Create the founder in the pool, enrol TOTP MFA at first sign-in, and add them to `flight-deck`. Then run `flight-deck:admin -- add-operator … --role founder`.
3. Sign in, then sign out. After sign-out, the old session cookie must be refused. Test it by replaying the cookie with curl or devtools.
4. **Re-authentication for gates.** Wait more than 10 minutes, then open `/flight-deck/gates`. It must offer "Sign in again". Confirm Cognito shows the sign-in **and** asks for the TOTP code again (`prompt=login`, `max_age=0`), and that approval then succeeds. If Cognito skips the prompt, approval stays refused (safe). Record it as a defect to resolve before launch.
5. Approve the console gate. Run `flight-deck:admin -- list-gates`: it must show "signature and approver verified".
6. Create a second test operator. While they are signed in, deactivate them from Health: their next click must fail. Also check:
   - a user outside the `flight-deck` group is refused;
   - a user without MFA cannot complete sign-in.

### B. Hosted PostgreSQL

1. Provision per decisions 1 to 3, with:
   - encryption at rest;
   - TLS required (RDS: `rds.force_ssl=1`);
   - automated backups with the 14-day window;
   - deletion protection;
   - no superuser credential in the app.
2. Create an **owner role** (migrations) and an **app role** with DML only. The app role has no `TRUNCATE`, no DDL, and does not own the schema.
3. Set `FLIGHT_DECK_DATABASE_URL` with `sslmode=verify-full` and the provider CA (`FLIGHT_DECK_DATABASE_CA_PEM`).
4. Run `check-config`, then `migrate` as the owner, then `init --real`. Then check, as the app role:
   - `TRUNCATE fd_audit` fails;
   - `UPDATE fd_audit` fails;
   - a non-TLS connection is refused.

### C. Protective log

1. Set `FLIGHT_DECK_PROTECTIVE_BUCKET` and `_REGION` from the stack outputs. Attach `AppPolicyArn` to the app's identity.
2. With the app's credentials:
   - `PutObject` of a new key under `flight-deck/` succeeds;
   - the same key with `If-None-Match: *` returns 412;
   - `DeleteObject` is denied;
   - `PutObjectRetention` is denied.
3. With an administrator: deleting an event version with `x-amz-bypass-governance-retention` must be denied by the bucket policy. Confirm Object Lock and versioning in the bucket properties.
4. Record a test opt-out in the console. The event appears under `events/`; open it and confirm it holds no address or name.

### D. Restore drills (point-in-time)

Run these on staging data only. Each drill is also recorded as an incident case.

1. **Baseline.** Create three test relationships. Note time **T**.
2. **After T.** Opt one person out, erase another, lift an earlier opt-out, demote and deactivate the second test operator, and re-approve the console gate.
3. **Restore** to T into a **new** instance (never over the live one). Start a **drill copy** of the app pointed at it, with the **read-only** log policy (`ProtectiveLogReadOnlyPolicyArn`), not the app policy (`recovery-guarantees.md` W5). Give the drill copy no worker schedule: its runs would fail when they try to write checkpoints. Verification is run from its recovery page instead.
4. **Without running `mark-restored`**, sign in to the drill copy and check:
   - every console page redirects to the recovery page, which shows no record;
   - the status endpoint is 503 with `restore-in-progress` or `journal-ahead`;
   - sending or queueing anything is refused.

   This proves detection is mechanical.
5. On the recovery page, **Verify and replay now**. Then check:
   - you are signed out, and sign in again;
   - the opt-out and the erasure are back;
   - the second operator is deactivated;
   - the lifted opt-out is **in force** with a confirmation task;
   - the gate re-approval made after T is **not** re-applied (a founder task says so); the approval already in the backup still stands;
   - the status is 200.

   Time steps 3 to 5.
6. **Fail closed in the drill copy.** Record an opt-out in the drill copy. It must be refused (the log is read-only), and production's log must not change.
7. **Integrity.** Copy the log to a drill prefix you control (`aws s3 sync`), alter one event, and point a second drill at the copy. It must lock as `journal-integrity`, and the worker must not clear it.
8. **Cut-over rehearsal** (optional before launch): switch staging to the restored instance, after stopping the old one, and confirm that recovery verifies.

Pass: every decision made after T is in force or awaiting confirmation; nothing was applied from altered history; the drill copy wrote nothing. Record the measured restore and verification times. They become the recovery time in `operations.md` §6.

### E. Scheduled worker and monitoring

1. Enable the schedule. For 24 hours, the status endpoint stays 200 and Health shows a run every five minutes.
2. Break the worker token in the EventBridge connection once. The alarm fires and the email arrives. Restore the token.
3. Point an uptime monitor at `/flight-deck/internal/status` with the monitor token.
4. **Log outage.** Detach the app policy for 10 minutes. Then check:
   - the status endpoint returns 503 with `sink-unavailable`;
   - the console shows only the recovery page;
   - nothing is dispatched.

   Reattach the policy. Recovery verifies on the next run.

### F. Incident recovery

1. Pause all outbound activity from Health; open an incident case; resume as the founder.
2. Rotate the worker token (`operations.md` §7). Then rotate the session secret and **re-approve the console gate**: rotation invalidates gate signatures (`recovery-guarantees.md` W3).
3. Lost device: reset the test operator's MFA in Cognito; deactivate and re-add them.
4. A tabletop exercise of a real restore with the runbook (`operations.md` §6), timed.

## 3. Exit criteria

- Stages A to F pass, with records.
- The manual accessibility test and the human-paced review are done (`manual-tests.md`).
- The decisions in §1 are recorded in `integrations.md` §2.

Only then is the console gate approved on **production**. Opening the public form remains a separate written decision (`privacy-launch-gates.md` §5).
