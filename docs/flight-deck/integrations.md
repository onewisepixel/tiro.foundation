# Flight Deck: integrations and provider decisions (0.2.1)

Status: **Founder decisions are recorded where they have been made. RDS and a 14-day point-in-time window are provisional preferences, not authorization to spend.** No account, credential, or paid resource has been created. Prices below are estimates (§4.2 gives their sources and dates). Verify them with the provider at selection time.
Revision date: 2026-10-18. Supersedes the 0.2 version of this file.

## 1. What is live, what is prepared

| Port | Implementation in the codebase | Live? |
| --- | --- | --- |
| Identity | Cognito OIDC adapter (`oidc.ts`), operators and sessions (`identity.ts`), routes `/flight-deck/auth/*`; local demo test identities | **Prepared.** Pool not created |
| Operations store | `PostgresOperationsStore`, migrations, admin script; local file store for the demo | **Prepared.** Database not provisioned |
| Protective event log | `S3ProtectiveSink` (`s3Sink.ts`: conditional writes, SHA-256 checksums) and the Object Lock bucket in the template; local file sink for the demo | **Prepared.** Bucket not created |
| Restore ledger (checkpoint) | The worker writes `checkpoints/{seq}.json` to the protective sink | Prepared |
| Launch gates | Approved in the console by a freshly re-authenticated founder, signed and journaled (`gates.ts`, `/flight-deck/gates`) | Prepared. No gate approved |
| Rate limiter | `PostgresRateLimiter` (shared); in-memory for the file demo | Prepared |
| Scheduler | `/flight-deck/internal/worker` + EventBridge rule in the template (state DISABLED) | **Prepared.** Not deployed |
| Monitoring | `/flight-deck/internal/status`, Health alerts, CloudWatch alarm in the template | Prepared |
| Email | Disabled in production by decision; dry-run outbox in the demo | **Off** |
| Social | Manual by decision (copy, post, record with link) | **Off** |
| AI drafting | Not built | Off |
| CRM sync | Not built; Flight Deck is the source of truth | Off |

## 2. Decisions recorded

Founder, 2026-10-17:

- **Identity**: a separate AWS Cognito user pool, with MFA and named operators. It never reuses the synthetic backend's authentication.
- **Database**: managed PostgreSQL in a TIRO-controlled account, separate from the archive.
- **Social**: approved posts are published manually.
- **Email**: disabled pending provider, DNS, privacy, and legal approvals. When approved, the first outbound integration is transactional acknowledgements.
- **Public form**: opening it is a separate, written founder decision. It stays closed.

Founder review of 0.2, 2026-10-18:

- **Database**: RDS provisionally, with the region chosen after a legal residency review. "The choice of a Nigerian pilot does not, by itself, establish that the data must be hosted in Africa." Before spending, compare RDS's total operating burden with Neon's (§4).
- **Operators**: the founder only at launch. A named backup operator is needed before unattended collection, and an independent reviewer before dual control.
- **Data controller**: unresolved pending counsel.
- **Backups**: 14-day point-in-time recovery as a planning target.
- **Protective log bucket**: approved in principle (a separate, versioned S3 bucket with narrowly scoped access). Not created.

## 3. Identity: what to create

`deploy/flight-deck/flight-deck.template.json` (CloudFormation, **not deployed**) creates a user pool with:

- `MfaConfiguration: ON` (TOTP);
- admin-created users only;
- email sign-in and 14-character passwords;
- deletion protection.

It also creates:

- a `flight-deck` group;
- a managed-login domain;
- a confidential app client.

The client allows only the authorization-code flow, with exact callback and sign-out URLs, token revocation, and user-existence errors suppressed. A test checks these properties (`deployTemplate.test.ts`).

`cfn-lint` 1.57.1 validates the template with zero findings, including informational ones, in eu-west-2, af-south-1, eu-central-1, and us-east-1 (`acceptance.md`). `aws cloudformation validate-template` and a staging deploy need credentials and have **not** been run.

To set up operators:

1. Create each person in the pool, using the console or the CLI. They enrol MFA on first sign-in.
2. Add them to the `flight-deck` group.
3. Add them to Flight Deck with `npm run flight-deck:admin -- add-operator --email … --name … --role founder`.

Their first sign-in binds the two accounts. Approving a launch gate requires a sign-in within the last 10 minutes. The gates page sends the founder back through Cognito with `prompt=login` and `max_age=0` for this. Confirm on staging that the managed login honours both (`staging-acceptance.md`).

## 4. Operations database: final comparison

The founder's criteria are cost, backup capability, network design, operating effort, and data residency. Every option is PostgreSQL, so the adapter, the migrations, and the recovery gate work unchanged. Only `FLIGHT_DECK_DATABASE_URL` changes.

### 4.1 What the workload is

The pilot holds a few hundred relationships and their history: well under 1 GB. The scheduled worker calls the app every five minutes, and each call opens a short database transaction. **On a scale-to-zero database, that cadence keeps compute awake almost all the time.** Neon suspends after five idle minutes by default. The estimates below therefore treat both providers as running continuously at minimum size.

### 4.2 Estimated monthly cost (USD, on demand, before tax)

Sources:

- **AWS figures** come from the public AWS Price List bulk files, downloaded on 2026-10-18 for each region: AmazonRDS, AmazonVPC, AmazonS3, AWSSecretsManager, and AmazonEC2 (for NAT).
- **Neon figures** come from secondary sources, because Neon's own pricing page could not be fetched: [Neon's Launch plan guide](https://neon.com/guides/neon-launch-plan-vs-supabase-pro-plan), [selfhost.dev](https://selfhost.dev/blog/neon-pricing-cost-of-serverless-postgres/), [vela.run](https://vela.run/articles/neon-serverless-postgres-pricing-2026/), and [SaaS Price Pulse](https://www.saaspricepulse.com/tools/neon). **Confirm Neon's prices, plan limits, and region list on neon.com before deciding.**

All figures use 730 hours a month, and exclude the AWS free tier and any reserved-instance commitment.

Unit prices, London (eu-west-2):

| Item | Price |
| --- | --- |
| RDS PostgreSQL db.t4g.micro, single-AZ | $0.018/h ($13.14/mo) |
| RDS PostgreSQL db.t4g.small, single-AZ | $0.036/h ($26.28/mo) |
| RDS gp3 storage | $0.133/GB-month (20 GB minimum: $2.66) |
| RDS backup storage | $0.10/GB-month **beyond** a free allowance equal to provisioned storage (20 GB). A sub-1 GB database with 14 days of change history stays inside it: $0 |
| Public IPv4 address | $0.005/h ($3.65/mo) |
| NAT gateway | $0.05/h ($36.50/mo) + $0.05/GB processed |
| Secrets Manager | $0.40 per secret-month + $0.05 per 10,000 calls (6 secrets: about $2.40) |
| S3 Standard (protective log) | $0.024/GB-month; the log is kilobytes |
| CloudWatch alarm | about $0.10 |
| Neon Launch compute | $0.106 per CU-hour; minimum 0.25 CU (always awake: about $19.35/mo) |
| Neon Scale compute | $0.222 per CU-hour (always awake at 0.25 CU: about $40.50/mo) |
| Neon storage / history | $0.35/GB-month storage; $0.20/GB-month point-in-time history |

Totals for London. The "fixed AWS" lines (secrets, alarm, S3 log, Cognito) apply to every option, because Cognito and the protective log are on AWS in all of them.

| Option | Point-in-time window | Network | Estimate per month |
| --- | --- | --- | --- |
| **A. RDS micro, public endpoint** (app hosted outside AWS) | up to 35 days; set 14 | TLS `verify-full`, password plus security group | **about $22** |
| A′. Same on db.t4g.small | same | same | about $35 |
| **B. RDS micro, private subnet, app inside AWS with a NAT gateway** | same | no public database endpoint | **about $55**, plus app hosting |
| C. RDS micro, private subnet, app on one small EC2 host in a public subnet (no NAT) | same | no public database endpoint | about $22 plus the host (about $10 to $16 with its IPv4 address) |
| **D. Neon Launch** | **at most 7 days**: below the 14-day target | public endpoint, TLS, password | **about $23** (about $20.20 Neon + $2.60 AWS) |
| **E. Neon Scale** | up to 30 days; set 14 | adds IP allow-lists and private networking (verify) | **about $44** (check for a plan minimum) |

Other regions, for option A (micro): Frankfurt (eu-central-1) about $23, Cape Town (af-south-1) about $25, N. Virginia (us-east-1) about $20. Option B adds about $33 in each.

Cognito: the founder plus at most two operators is far inside Cognito's free monthly-active-user allowance. **Verify the current Cognito plan tiers**, because MFA and managed login were repackaged in 2024. It is not counted above.

### 4.3 Comparison on the founder's criteria

| | **RDS for PostgreSQL** | **Neon** |
| --- | --- | --- |
| Monthly cost at pilot size | about $22 (option A) to $55 (option B) | about $23 (Launch, 7 days) or about $44 (Scale, 14 days) |
| Backup and restore | Automated daily snapshots plus point-in-time restore to any second in a 1 to 35-day window TIRO sets. A restore creates a **new instance**, and the app's URL is switched to it. Manual snapshots kept on request | Point-in-time restore by branching within the plan's history window. Fast, and in place or to a branch. **Launch caps history at 7 days** |
| Meeting the 14-day target | Yes, on any instance | Only on Scale |
| Network design | Choice of a public endpoint (option A) or private subnets (B or C). Private needs the app inside AWS; a NAT gateway is the expensive part | Public endpoint by default; allow-lists and private networking on higher plans |
| Operating effort | Moderate. Choose a maintenance window, apply minor upgrades (can be automatic), and watch storage. Option B or C adds a VPC to look after | Low. No instance, VPC, or maintenance window |
| Data residency | Any AWS region, including London, Frankfurt, Ireland, and Cape Town | A fixed list of AWS and Azure regions. **No African region at last check.** Verify London |
| Vendors and agreements | One (AWS): the database, Cognito, and the protective log are under one data processing agreement and one bill | Two (Neon plus AWS); a second DPA and sub-processor list for counsel to review |
| Deletion and backup expiry | Erased rows persist in backups until they age out of the window TIRO sets | Same, for the history window |
| Recovery gate fit | Restore to a new instance, run `migrate`, switch the URL, and the gate locks and replays (`operations.md` §6) | Restore a branch, switch the URL, same gate |

### 4.4 Recommendation (superseded on 2026-10-19)

The database-only comparison below is superseded by `staging-decision-packet.md`. That document compares two complete topologies, Vercel + Neon Scale and AWS Fargate + private RDS, including network exposure, maintenance, deployment work, failure modes, and total cost. It recommends Vercel + Neon Scale for synthetic staging and leaves production open. The text below is kept for the record.


**RDS remains the right provisional choice, but the network design must be decided first, because it moves the cost from about $22 to about $55.**

At pilot size the two providers cost about the same (about $22 against $23). Neon reaches the 14-day target only on Scale, at about twice the cost of the smallest RDS. RDS also keeps the database, identity, and protective log with one vendor and one agreement, and keeps every residency option counsel might want.

What decides the network design is **where the app runs**. That is not yet decided (founder decision 1 in `staging-acceptance.md` §1):

- **The app hosted outside AWS** (for example Vercel, which has no fixed outbound addresses on standard plans): use option A. The database endpoint is reachable from the internet but protected by TLS `verify-full`, a long generated password, and no superuser access for the app. The same is true of Neon.
- **The app hosted on AWS**: use option C (no NAT) if the founder accepts patching one small server. Use option B if a managed app runtime matters more than about $33 a month.

Start on db.t4g.micro and move to small only if the worker's runs slow down. Resizing takes a short restart.

## 5. Scheduler and monitoring

The template's EventBridge rule calls `POST /flight-deck/internal/worker` every five minutes, through an API destination that carries the worker token from Secrets Manager. It is created **DISABLED**. Enable it only after the console gate is approved.

Each worker run does three things:

1. It checks the protective log against the database, and replays the log automatically after a restore.
2. It dispatches nothing while recovery is unverified.
3. It writes a checkpoint.

A CloudWatch alarm fires on repeated failed invocations and notifies an SNS topic; an email subscription is optional.

For an independent check, point any uptime monitor at `GET /flight-deck/internal/status` with the monitor token. It returns 200 when nothing needs a person and 503 when something does, with counts and codes only. That includes `recovery-locked` and `protective-log-missing`.

## 6. Secrets

The template generates four secrets in Secrets Manager:

- **Email-hash pepper.** It is retained even if the stack is deleted, because losing it breaks suppression matching.
- **Session secret.** It also derives the gate-signing key, so rotating it invalidates approved gates; re-approve them after rotation.
- **Worker token.**
- **Monitor token.**

The Cognito client secret is read from the app client, and the database URL comes from the chosen provider. The host must inject all of these as environment variables. They are never committed, never sent to the browser, and never printed (`check-config` names missing settings only). Rotation: `operations.md` §7.

## 7. Protective event log (prepared, not provisioned)

The log uses a separate S3 bucket, `ProtectiveLogBucket` in the template. The bucket has:

- versioning;
- Object Lock in GOVERNANCE mode with a default retention (`ProtectiveRetentionDays`, default 35);
- all public access blocked and owner-enforced object ownership;
- TLS-only access;
- a bucket policy that denies `s3:BypassGovernanceRetention` to everyone.

The app's policy (`FlightDeckAppPolicy`) allows only `PutObject`, `GetObject`, and `ListBucket` under `flight-deck/`. It cannot delete objects, change retention, or change the bucket.

Event objects are never expired automatically; only superseded checkpoint versions expire. The retention must stay longer than the database backup window (`recovery-guarantees.md` §3).

Configure the log with `FLIGHT_DECK_PROTECTIVE_BUCKET`, `FLIGHT_DECK_PROTECTIVE_REGION`, and optionally `FLIGHT_DECK_PROTECTIVE_PREFIX`. Without them, production refuses to start (`check-config`).

Cost: well under $1 a month.

## 8. Email, when approved

Start with transactional acknowledgements. Amazon SES keeps them in the same AWS account; Postmark or Resend are simpler alternatives. Requirements:

- SPF, DKIM, and DMARC for tiro.foundation (a DNS change);
- the provider's idempotency key mapped from `DispatchJob.idempotencyKey`;
- bounce and complaint events that create suppressions;
- a dry run to a test inbox;
- approved templates.

The `EmailProvider` port is ready; no implementation exists.
