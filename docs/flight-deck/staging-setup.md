# Flight Deck: synthetic staging setup (Architecture A)

For: the founder, and whoever helps set up staging.
Status: **Prepared, not provisioned.** No account has been created, nothing has been bought, and nothing is deployed. Every step that creates an account, a resource, or a charge waits for your explicit approval (`staging-activation-checklist.md`).
Revision date: 2026-10-19. Decision: Architecture A (Vercel + Neon Scale + AWS Cognito and S3), for synthetic staging only (`staging-decision-packet.md`). The production topology is undecided.
**Region: us-east-1 (N. Virginia), in the existing `tiro-stage` AWS account**, with Neon `aws-us-east-1` and Vercel functions in `iad1`. This replaces the London (eu-west-2) configuration used in the earlier comparison, which was a convenience for comparing costs, not a requirement: staging holds only synthetic data. Production's region and account remain open, subject to counsel's residency review.

## 1. What staging is

Staging is a separate copy of Flight Deck, holding synthetic records only, that runs against the real managed services:

- Cognito with MFA;
- Neon PostgreSQL with point-in-time restore;
- the S3 protective log with Object Lock;
- EventBridge scheduling and CloudWatch alarms.

Its purpose is operational evidence (`staging-acceptance.md`).

**Isolation, enforced by the code and the template:**

| Boundary | How it is enforced |
| --- | --- |
| Staging never holds real data | `FLIGHT_DECK_DEPLOYMENT=staging` opens only a database marked synthetic (`init --synthetic`). Production opens only one marked real. A configuration mistake in either direction is refused at start-up |
| The public form never opens on staging | Refused in code whenever `FLIGHT_DECK_DEPLOYMENT=staging`, whatever its flag says. The deploy pipeline also refuses a configuration with the flag on, and smoke-checks `/pilot` after each deploy |
| No outbound messages | Production mode has no email provider. The pipeline refuses `FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED=true` |
| AWS access only for the staging project | The IAM role trusts only `owner:<team>:project:<staging project>:environment:<production>` through Vercel OIDC, by exact match. It can only put, get, and list under `flight-deck/` in the staging log bucket. Credentials last one hour, and no AWS key is stored anywhere |
| The public site is untouched | A **separate Vercel project**. The pipeline refuses to deploy if the target is the public site's project. No Flight Deck variable is added to the public site's project |
| Not indexed | Staging sends `X-Robots-Tag: noindex, nofollow` on every page |
| Separate AWS account | All AWS resources live in the existing **`tiro-stage`** account, in **us-east-1**, in Flight Deck's own stack: no IAM role, secret, log, or bucket is shared with anything else there (§2). Production will use a different account |

## 2. Accounts and structure (to validate before provisioning)

**AWS.** Staging uses the existing **`tiro-stage`** account, region **us-east-1 (N. Virginia)**. No new account is created. Production will use a different account, in a region chosen after counsel's residency review.

Access to `tiro-stage`:

- MFA on the root user; root credentials not used day to day.
- Day-to-day access through IAM Identity Center (or the account's existing single sign-on) with MFA.
- No IAM users and no long-lived access keys for Flight Deck. The app uses Vercel OIDC; people use single sign-on.

Flight Deck shares the account, but none of its resources:

- Everything Flight Deck uses is created by its own stack.
- No IAM role, secret, log group, or bucket is shared with any other workload in `tiro-stage`. That includes `infra/`'s synthetic backend, if it is deployed there.
- Flight Deck's deny-bypass rule is in its bucket policy, so it does not depend on an account-wide policy.

Check in `tiro-stage` before deploying:

- **What else runs there, and in which regions.** A region-restricting service control policy is suitable only if nothing in the account needs another region. Otherwise rely on the stack's own scoping and skip the policy.
- **Name collisions.** The template uses three fixed names: the SNS topic `tiro-flight-deck-alarms`, the budget `tiro-flight-deck-staging-aws`, and the Cognito domain prefix you choose. None may already exist.
- **An existing Vercel OIDC provider.** An account can hold only one IAM OIDC provider for `https://oidc.vercel.com`. If one already exists (for another Vercel project), leave `VercelTeamSlug` empty in the stack, and create the role against the existing provider instead (§3).
- **The budget's scope.** The template's budget counts **all** spend in `tiro-stage`, not only Flight Deck's. If other workloads cost money there, either raise `AwsMonthlyBudgetUsd` by their usual monthly cost, or, after activating the `aws:cloudformation:stack-name` cost-allocation tag, add a filter on Flight Deck's stack name to the budget in the Billing console.
- **Billing alerts** can be received at the operations mailbox.

**Vercel.** Your current plan could not be identified from the repository: it contains no `vercel.json` or project link. Check it in the Vercel dashboard under Settings → Billing:

| Current plan | Do this | Incremental cost |
| --- | --- | --- |
| The site is on **Hobby** (personal, non-commercial use only) | Create a **new Pro team for staging only** and put the staging project there. This also isolates billing, and the spend hard limit can pause only staging | $20/month |
| The site is on a **Pro team** | Add a new project, `tiro-flight-deck-staging`, to that team | $0, within the $20 included credit. **But** do not enable the spend hard-limit pause: it pauses every project on the team, including the public site |

**Neon.** Create an organization and one project, `tiro-flight-deck-staging`, in **AWS US East, N. Virginia (`aws-us-east-1`)**, on the Scale plan. This is the same region as the AWS resources and the Vercel functions. The compute settings:

- autoscaling **min = max = 0.25 CU**: a fixed size, which caps compute spend;
- scale-to-zero after 5 minutes (the default);
- history retention (instant restore window) **14 days**.

Use the **direct** endpoint, not the `-pooler` one. The worker's single-runner lock needs a real session; configuration refuses a `-pooler` host.

## 3. AWS resources (one template)

Deploy `deploy/flight-deck/flight-deck.template.json` into **`tiro-stage`**, region **us-east-1**, as a stack named, for example, `tiro-flight-deck-staging`. Set these parameters:

| Parameter | Staging value |
| --- | --- |
| `PublicOrigin` | The staging project's https origin, for example `https://tiro-flight-deck-staging.vercel.app` or `https://ops-staging.tiro.foundation` |
| `CognitoDomainPrefix` | A unique prefix, for example `tiro-ops-staging` |
| `WorkerScheduleState` | `DISABLED` until the console gate is approved |
| `AlarmEmail` | The dedicated, monitored TIRO operations mailbox |
| `EscalationEmail` | Your escalation address |
| `AwsMonthlyBudgetUsd` | `15` (the AWS share of the $75 ceiling), **plus** the usual monthly cost of anything else in `tiro-stage` (§2) |
| `ProtectiveRetentionDays` | `35` or more (§7) |
| `VercelTeamSlug` / `VercelProjectName` / `VercelEnvironment` | The team slug, the staging project's name, and `production` |

What it creates:

- the Cognito pool (MFA required);
- four generated secrets;
- the worker schedule, plus a status monitor that alarms on any non-200 status;
- two alarms, with email to both addresses;
- an AWS cost budget;
- the protective log bucket (versioned, Object Lock, deny-bypass);
- the Vercel OIDC provider and the staging-only role.

In Vercel, set the team's **OIDC issuer mode to Global**. The role's trust policy uses the global issuer `https://oidc.vercel.com`, still pinned to the exact team, project, and environment.

If `tiro-stage` already has an IAM OIDC provider for `https://oidc.vercel.com`, leave `VercelTeamSlug` and `VercelProjectName` empty, so the stack creates neither provider nor role. Then:

1. Add `https://vercel.com/<team slug>` to that provider's audiences.
2. Create the role by hand, with the same trust conditions and inline policy as `VercelAppRole` in the template: exact `oidc.vercel.com:sub` and `oidc.vercel.com:aud`, put/get/list under `flight-deck/` in this stack's bucket only, and a 3600-second maximum session.

Never widen an existing role to cover staging.

## 4. The Vercel staging project and its configuration

1. Create the project from this repository. **Do not connect automatic Git deployments**: deploys happen only through the approved pipeline below. If the project is Git-connected, disable automatic deployments in its settings.
2. Keep the Functions region at **Washington, D.C. (`iad1`)**, Vercel's default, next to us-east-1.
3. Set the environment variables for the **Production** environment of the staging project only:

| Variable | Value | Type |
| --- | --- | --- |
| `FLIGHT_DECK_MODE` | `production` | Plain |
| `FLIGHT_DECK_DEPLOYMENT` | `staging` | Plain (checked by the pipeline) |
| `FLIGHT_DECK_PUBLIC_FORM_ENABLED`, `FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED`, `FLIGHT_DECK_SOCIAL_PUBLISHING_ENABLED` | `false` | Plain |
| `FLIGHT_DECK_PUBLIC_ORIGIN` | The staging origin (the same as `PublicOrigin`) | Plain |
| `FLIGHT_DECK_DATABASE_URL` | Neon **direct** URL for the **app** role, with `?sslmode=verify-full` | Sensitive |
| `FLIGHT_DECK_EMAIL_HASH_PEPPER`, `FLIGHT_DECK_SESSION_SECRET`, `FLIGHT_DECK_WORKER_TOKEN`, `FLIGHT_DECK_MONITOR_TOKEN` | From the template's four secrets (copied once; Secrets Manager stays the durable copy) | Sensitive |
| `FLIGHT_DECK_COGNITO_REGION`, `_USER_POOL_ID`, `_CLIENT_ID`, `_DOMAIN` | Template outputs | Plain |
| `FLIGHT_DECK_COGNITO_CLIENT_SECRET` | From the Cognito app client | Sensitive |
| `FLIGHT_DECK_PROTECTIVE_BUCKET`, `FLIGHT_DECK_PROTECTIVE_REGION` | Template output; `us-east-1` | Plain |
| `FLIGHT_DECK_AWS_ROLE_ARN` | Template output `VercelAppRoleArn` | Plain (checked by the pipeline) |
| `AWS_REGION` | `us-east-1`. Set it explicitly even though the functions run nearby: Vercel otherwise sets it to the function's execution region, which can change | Plain |

4. In GitHub, create the environment **`flight-deck-staging`**, with **you as a required reviewer**. Then add:
   - variables: `VERCEL_ORG_ID`, `VERCEL_STAGING_PROJECT_ID`, `VERCEL_PUBLIC_SITE_PROJECT_ID` (so the pipeline can refuse it), and `FLIGHT_DECK_STAGING_ORIGIN`;
   - secrets: `VERCEL_STAGING_TOKEN` (a token scoped to the staging team or project, if possible) and `FLIGHT_DECK_STAGING_OWNER_DATABASE_URL` (the Neon **owner** role's direct URL, used only for migrations).
5. Deploy: Actions → **Deploy Flight Deck staging** → Run, with the ref and `deploy synthetic staging` typed. The run then:
   - runs lint, the unit tests, and the PostgreSQL tests;
   - waits for your approval;
   - checks the target project and the pulled configuration;
   - migrates the database, if asked;
   - builds and deploys;
   - smoke-checks that `/pilot` is closed and that the status endpoint refuses an unauthenticated call.

**First-time database setup** (from your machine, with the owner URL):

```
npm run flight-deck:admin -- migrate
npm run flight-deck:admin -- init --synthetic
npm run flight-deck:admin -- add-operator --email … --name … --role founder
```

For these commands also set `FLIGHT_DECK_PROTECTIVE_BUCKET` and `FLIGHT_DECK_PROTECTIVE_REGION`, and sign in to `tiro-stage` (us-east-1) through single sign-on, with a role that may write under `flight-deck/` in the log bucket. The admin script then journals to the same S3 log as the app; without those settings, a synthetic database would use a local file log instead. Synthetic records are entered through the console (Relationships → New).

Then sign in, approve the console gate at `/flight-deck/gates`, and set `WorkerScheduleState=ENABLED`.

## 5. The worker on Vercel Functions (reviewed)

| Concern | Finding | What the code does |
| --- | --- | --- |
| **EventBridge waits at most 5 seconds** for an API destination, then retries (AWS documentation) | A tick touches the database and the log and may reconcile, so it can take longer | The route accepts at once (**202**) and runs the tick after the response with `after()`, within `maxDuration = 120 s`. `?wait=1` runs it synchronously for operators and the rehearsal. Tested in the rehearsal: 202 in well under 2 seconds, then the run completes |
| Execution duration | Vercel (Fluid compute): 300 s default; Pro up to 800 s | 120 s per tick is ample: every S3 call is bounded at 5 s and every statement at 15 s. A longer backlog is resumed by the next tick (recovery is interrupt-safe) |
| Concurrency | Overlapping calls are possible (EventBridge retries, manual runs, multiple instances) | A Postgres advisory lock allows one tick at a time; others record `skipped-locked`. It needs Neon's direct endpoint, which configuration enforces |
| An instance frozen or killed while holding the lock | The lock would be held until the connection dropped | The lock's connection sets `idle_session_timeout = 150s`, so the server releases it shortly after any tick could have ended |
| Failure detection with an immediate 202 | EventBridge no longer sees tick failures | The **status monitor** (every 15 minutes, no retries) turns any non-200 status into an alarm. That covers a stale worker (none completed for 20 minutes), three failed runs, a recovery lock, and an unreachable log. The worker-failure alarm still catches authentication and reachability failures |
| Restore fence | Advanced once per healthy tick, after commit | A 5-minute schedule means a fence resolution of about 5 minutes (`recovery-guarantees.md` W10). Overlapping calls cannot advance it twice; locked or unhealthy ticks do not advance it |
| OIDC token after the response | The AWS SDK fetches credentials through the Vercel request context; `after()` keeps that context on Vercel | To verify on staging (stage E1). A failure is visible: the tick fails, and the status monitor alarms |
| Cold starts | The 5-minute worker keeps both the function and Neon warm | — |

## 6. Billing alerts and their limits

| Provider | Alert | Limits |
| --- | --- | --- |
| AWS | The template's budget: $15/month, email at 50% and 100% of actual spend and 100% of forecast, to both addresses | Alerts only; AWS does not stop spending. Cost data can lag by many hours (a day or more), and alerts are evaluated a few times a day. It covers only the staging account. The first two budgets are free (per AWS; confirm on the Billing page) |
| Neon | Spending notifications (email at 80% and 100%), set at $45 | Alerts, not a cap. The **fixed 0.25 CU compute size** is the real limit: about $40.50/month whatever the use. Storage and history are uncapped but tiny |
| Vercel | Spend Management: set the on-demand budget low (for example $10 above the included credit), with notifications | The optional hard-limit pause stops **every project on the team**. Use it only if staging has its own team (§2) |
| All three | — | No single control enforces the combined $75. Check all three dashboards weekly during the first month. Taxes and currency conversion are extra |

## 7. Retention

- **Database:** Neon history window, 14 days.
- **Protective log:** Object Lock retention of 35 days or more covers every restorable point in that window, plus margin.

Two rules make this hold:

- **Any Neon branch is a restorable copy.** A drill branch, or one kept for any other reason, must be deleted within the protective-log retention, or the retention raised above its age. The same applies to any manual export.
- **35 days is a minimum, not a deletion policy.** Event objects are never deleted automatically. When records must eventually be deleted is a separate decision for production, after legal review.

## 8. First-month estimate (itemized)

USD, us-east-1 (N. Virginia), before tax. Flight Deck's resources only: anything else in `tiro-stage` is not included. Monthly figures; the first month may be pro-rated by the start date.

| Item | Basis | Estimate |
| --- | --- | --- |
| Neon Scale compute | 0.25 CU × 730 h × $0.222/CU-h (kept awake by the 5-minute worker; no monthly minimum) | $40.52 |
| Neon storage | Under 1 GB × $0.35/GB-month | ≤ $0.35 |
| Neon instant-restore history (14 days) | Under 1 GB of changes × $0.20/GB-month | ≤ $0.20 |
| Neon network transfer | Within 500 GB included | $0 |
| AWS Secrets Manager | 4 template secrets + 2 created by the EventBridge connections, × $0.40 | $2.40 |
| AWS S3 protective log | Kilobytes stored; about 17,000 PUT (checkpoints and fence) and some tens of thousands of GET/LIST a month | ≤ $0.30 |
| AWS EventBridge | About 11,500 API destination calls × $0.20 per million | ≈ $0.00 |
| AWS CloudWatch alarms (2), SNS email, Budgets (1) | Within free allowances (confirm) | $0–0.20 |
| AWS Cognito | 1–3 monthly active users | $0 |
| **Infrastructure subtotal** | | **≈ $44** |
| Vercel | $0 on an existing Pro team, or $20 for a new Pro team (includes $20 of usage credit, ample for staging) | $0 or $20 |
| **Total** | | **≈ $44, or ≈ $64 with a new Vercel Pro team** |

That leaves headroom under the $75 planning ceiling. Sources: Neon's pricing page and Vercel's pricing page (both read on 2026-10-19), and the public AWS Price List for us-east-1 (2026-10-18). Neon's prices are the same in every region. The AWS lines used here are the same as, or slightly below, London's (S3 storage $0.023 against $0.024 per GB-month; Secrets Manager $0.40 in both), so the total is unchanged. Confirm each before approving spend.

## 9. Shutting staging down safely

In this order, so nothing keeps running or charging:

1. **Stop traffic and jobs.** Update the stack with `WorkerScheduleState=DISABLED`, which stops both the worker and the status monitor.
2. **Vercel.** Delete the staging project, or at least remove its domains and environment variables. Revoke `VERCEL_STAGING_TOKEN`, and delete the GitHub environment `flight-deck-staging` with its secrets. If a Pro team was created only for staging, cancel that subscription.
3. **Neon.** Delete the staging project. This deletes every branch and its history, irreversibly; acceptable, because it is synthetic. Billing stops at deletion; check the final invoice.
4. **AWS.**
   - Delete the stack. Retained resources stay and must be removed by hand: the Cognito pool (turn off deletion protection first), the four secrets (deletion takes a 7–30-day waiting period), and the log bucket.
   - **The log bucket cannot be emptied until every object version's retention has passed** (35 days after its last write), and the bucket policy denies the governance bypass to everyone, deliberately. Its cost is cents. After retention, delete all versions, then the bucket.
   - Remove the IAM OIDC provider and role. They are deleted with the stack.
5. **Do not close `tiro-stage`.** It is a shared, existing account. Remove only Flight Deck's resources: the stack, the retained resources above, the budget `tiro-flight-deck-staging-aws` (deleted with the stack), and, if you created them by hand (§3), the OIDC role and the extra audience on a shared Vercel OIDC provider. Leave the provider itself if another project uses it.
6. **Confirm** zero charges in the next billing cycle: AWS Cost Explorer, Neon billing, and Vercel usage.
