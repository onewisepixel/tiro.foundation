# Flight Deck: integrations and provider decisions (0.2)

Status: **Founder decisions recorded where made; the database provider and region await a short review.** No account, credential, or paid resource has been created. Anything about pricing, regions, or plan features below must be verified with the provider at selection time; it is not quoted from a contract.
Revision date: 2026-10-17. Supersedes the 0.1 version of this file.

## 1. What is live, what is prepared

| Port | Implementation in the codebase | Live? |
| --- | --- | --- |
| Identity | Cognito OIDC adapter (`oidc.ts`), operators and sessions (`identity.ts`), routes `/flight-deck/auth/*`; local demo test identities | **Prepared.** Pool not created |
| Operations store | `PostgresOperationsStore`, migrations, admin script; local file store for the demo | **Prepared.** Database not provisioned |
| Rate limiter | `PostgresRateLimiter` (shared); in-memory for the file demo | Prepared |
| Scheduler | `/flight-deck/internal/worker` + EventBridge rule in the template (state DISABLED) | **Prepared.** Not deployed |
| Monitoring | `/flight-deck/internal/status`, Health alerts, CloudWatch alarm in the template | Prepared |
| Restore ledger | File sink (demo); production sink interface only | **Not provisioned** (needs an object store) |
| Email | Disabled in production by decision; dry-run outbox in the demo | **Off** |
| Social | Manual by decision (copy, post, record with link) | **Off** |
| AI drafting | Not built | Off |
| CRM sync | Not built; Flight Deck is the source of truth | Off |

## 2. Decisions recorded (founder, 2026-10-17)

- **Identity**: a separate AWS Cognito user pool, with MFA and named operators, never reusing the synthetic backend's authentication. Start with one founder account; add an independent reviewer before relying on dual approval.
- **Database**: managed PostgreSQL in a TIRO-controlled account, separate from the archive. Provider and region after the comparison below.
- **Social**: manual publication of approved posts.
- **Email**: disabled pending provider, DNS, privacy, and legal approvals. The first outbound integration, when approved, is transactional acknowledgements.
- **Public form**: opening it is a separate, written founder decision.

## 3. Identity: what to create

`deploy/flight-deck/flight-deck.template.json` (CloudFormation, **not deployed**) creates: a user pool with `MfaConfiguration: ON` (TOTP), admin-created users only, email sign-in, 14-character passwords, deletion protection; a `flight-deck` group; a managed-login domain; and a confidential app client allowing only the authorization-code flow, with exact callback and sign-out URLs, token revocation, and user-existence errors suppressed. A test checks these properties (`deployTemplate.test.ts`). `aws cloudformation validate-template` and a staging deploy have **not** been run (no credentials were used).

Operators: create each person in the pool (console or CLI, with MFA enrolment on first sign-in), add them to `flight-deck`, then add them to Flight Deck: `npm run flight-deck:admin -- add-operator --email … --name … --role founder`. Their first sign-in binds the two.

## 4. Operations database: comparison

Criteria from the founder: data residency, backup and restore, retention, deletion, access control, cost, and operating effort. All options are PostgreSQL, so the adapter and migrations work unchanged.

| | **Amazon RDS for PostgreSQL** (single-AZ to start) | **Amazon Aurora PostgreSQL Serverless v2** | **Neon** | **Supabase** (database only) |
| --- | --- | --- | --- | --- |
| Account model | TIRO's AWS account (same organization as Cognito; separate from the synthetic backend's resources) | Same | Separate vendor account | Separate vendor account |
| Residency | Any AWS region, including Africa (Cape Town) and EU/UK | Most AWS regions; verify availability in the chosen region | A list of AWS/Azure regions; verify current list; no African region at last check | A list of regions; verify; no African region at last check |
| Backup / restore | Automated snapshots + point-in-time restore within a retention window you set | Continuous backup + PITR | PITR via branching within a plan-dependent window | Daily backups; PITR on higher plans |
| Deletion and backup expiry | Snapshot retention you control; deleted rows persist in backups until they expire | Same | History window set by plan | Plan-dependent |
| Access control | IAM + DB roles, VPC/security groups, TLS required by parameter | Same | DB roles, IP allow-lists, TLS | DB roles, network restrictions, TLS; its auto-generated APIs must be switched off or locked down for this use |
| Cost shape | Smallest instance runs continuously (a fixed monthly floor) | Scales down; has a minimum capacity cost | Free/low tiers; scales to zero | Free/low tiers |
| Operating effort | Moderate (parameter groups, maintenance windows, minor upgrades) | Moderate | Low | Low, but a broader platform to keep locked down |
| DPA / compliance docs | AWS DPA | AWS DPA | Verify | Verify |

**Recommendation for the review:** Amazon RDS for PostgreSQL, single-AZ, smallest current-generation instance, in the same AWS organization as the Cognito pool, in the region counsel prefers for prospects' data (likely an EU/UK region given likely contacts, or Africa (Cape Town) if a Nigeria-focused pilot makes local residency preferable). Reasons: residency choice including Africa, mature PITR with a retention window TIRO sets, one vendor and DPA instead of two, IAM-governed access. The trade-off is a fixed monthly floor and more operating effort than Neon. If cost or effort dominates and EU residency is acceptable, Neon is the low-effort alternative. Supabase brings a wider platform than this needs.

Whichever is chosen: TLS `verify-full`; a dedicated database; an owner role for migrations and a separate application role (no `TRUNCATE`, no schema changes; the audit trigger blocks edits regardless); automated backups with a stated retention window (it becomes the "backups expire within N days" sentence in deletion confirmations); a quarterly restore drill (`operations.md` §6).

## 5. Scheduler and monitoring

The template's EventBridge rule calls `POST /flight-deck/internal/worker` every five minutes through an API destination that carries the worker token from Secrets Manager. It is created **DISABLED**; enable it only after the console gate is recorded. A CloudWatch alarm fires on repeated failed invocations to an SNS topic (an email subscription is optional). For an independent check, point any uptime monitor at `GET /flight-deck/internal/status` with the monitor token: it returns 200 when nothing needs a person and 503 when something does, with counts and codes only.

## 6. Secrets

Generated by the template in Secrets Manager: email-hash pepper (retained even if the stack is deleted: losing it breaks suppression matching), session secret, worker token, monitor token. The Cognito client secret is read from the app client. The database URL comes from the chosen provider. The host must inject all of these as environment variables. They are never committed, never sent to the browser, and never printed (`check-config` names missing settings only). Rotation: `operations.md` §7.

## 7. Restore ledger sink (not provisioned)

Needs a store **outside** the database: for example an S3 bucket in the same AWS account with versioning and Object Lock, writable only by the app role. Until it exists, Health and the status endpoint show a warning, and a restore could undo recent erasures or opt-outs.

## 8. Email, when approved

Transactional acknowledgements first (Amazon SES keeps it in the same AWS account; Postmark or Resend are simpler alternatives). Requirements: SPF, DKIM and DMARC for tiro.foundation (a DNS change), the provider's idempotency key mapped from `DispatchJob.idempotencyKey`, bounce and complaint events creating suppressions, a dry run to a test inbox, and approved templates. The `EmailProvider` port is ready; no implementation exists.
