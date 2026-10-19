# Flight Deck: staging decision packet

For: the founder, deciding how Flight Deck's synthetic staging environment is hosted.
Status: **For decision. Nothing has been provisioned or bought.** Region and vendors stay provisional until founder approval and counsel's residency review. London (eu-west-2) is used below only as a convenient staging comparison.
Revision date: 2026-10-19.

## 1. The two topologies

Both keep the same application code, the same Cognito pool, the same protective log bucket (S3, Object Lock), and the same EventBridge schedule and alarm, from `deploy/flight-deck/`. They differ in where the app runs and where PostgreSQL lives.

**A. Managed-first.** The existing Vercel project serves Flight Deck. Neon (Scale plan) provides PostgreSQL. AWS provides Cognito, S3, and monitoring.

```
browser ──► Vercel (Next.js functions, London region)
              ├──TLS verify-full──► Neon Postgres (London), public endpoint, password auth
              ├──OIDC-federated short-lived role──► S3 protective log
              └──OIDC──► Cognito (managed login, MFA)
EventBridge (5 min) ──► Vercel /flight-deck/internal/worker
```

**B. AWS-consolidated.** Flight Deck runs on AWS (ECS Fargate behind an Application Load Balancer), with RDS PostgreSQL in private subnets. The public site can stay on Vercel.

```
browser ──► ALB (ops host, ACM certificate) ──► Fargate task (public subnet, egress only)
                                                  ├──private subnet──► RDS Postgres (no public address)
                                                  ├──S3 gateway endpoint──► protective log
                                                  └──► Cognito
EventBridge (5 min) ──► ALB /flight-deck/internal/worker
```

Flight Deck lives in the same Next.js app as the public site. Under B the same build is deployed twice:

- Vercel serves the site, with Flight Deck disabled. Its routes are 404, which is the default.
- AWS serves the ops host, the only one in production mode. The Host check already enforces this.

Consequence: when the public form is one day opened, its submissions must reach the AWS deployment, because Vercel cannot reach a private database. That means a rewrite of `/pilot` to the AWS origin, or the form served from the ops host. The form is closed, so this is a later decision.

## 2. Comparison

| | **A. Vercel + Neon Scale** | **B. AWS Fargate + private RDS** |
| --- | --- | --- |
| Database network exposure | Endpoint reachable from the internet. Protected by TLS `verify-full`, a generated password, and a least-privilege app role (no superuser, no DDL; the audit trigger blocks edits). Neon's IP allow-list cannot help: Vercel's outbound addresses are not fixed except on its Enterprise "Secure Compute" | No public address; reachable only from the app's security group. This is AWS's recommended posture for sensitive data |
| AWS credentials for the log | Vercel OIDC federation to an IAM role: short-lived credentials, no stored keys. The template needs one role resource added | Task role: no stored keys |
| Secrets | Vercel environment variables (encrypted, marked sensitive), copied once from Secrets Manager | Secrets Manager, read by the task role |
| Vendors and agreements | Three (Vercel, Neon, AWS): three DPAs and sub-processor lists for counsel | One for Flight Deck (AWS). Vercel still hosts the public site |
| 14-day recovery | Neon history window set to 14 days (Scale allows up to 30). Instant restore in place, or to a new branch, in seconds to minutes | RDS automated backups, 14 days; point-in-time restore to a **new** instance, typically minutes to tens of minutes |
| Restore detection and isolation | Same code in both: journal head and restore fence, console shows nothing until verified, sessions ended (`recovery-guarantees.md` G7, G9). In-place restores are caught by the fence | Same |
| Drill copies | A Vercel **preview** deployment pointed at a Neon branch, with the read-only log role. Per-environment variables make this natural | A second ECS service pointed at a restored instance, with a read-only task role |
| Expected maintenance | Low. No servers, VPC, load balancer, or container images. Postgres minor upgrades are handled by Neon. Next.js upgrades are a normal deploy | Moderate. Dockerfile and image builds (ECR), ECS task definitions, ALB and certificate, VPC and security groups, the RDS maintenance window and minor upgrades, and a deploy pipeline from GitHub. No OS patching on Fargate |
| Deployment complexity | Low to moderate. Deploy the existing template, create a Neon project, add an OIDC role, set Vercel environment variables, point EventBridge at the Vercel URL | Moderate to high. A new network-and-compute stack (VPC, subnets, ALB, ECS, RDS, IAM), a container build, DNS for the ops host, and a deploy pipeline. None of this exists yet |
| Cold starts and latency | Serverless functions plus Neon compute; the 5-minute worker keeps both warm | Always-on task; consistent |

### Failure modes

| Failure | A | B |
| --- | --- | --- |
| App host outage | Vercel down: console and worker down; data safe | Fargate or ALB down: the same. Single task; ECS restarts it |
| Database outage | Neon down: every action reports "not stored"; the worker records failures; the alarm fires | RDS down: the same. Single-AZ: failover is a restore |
| Log (S3) outage | Console and contact paused (fail-closed, W7); opt-outs refused until it returns | Same |
| Cognito outage | No new sign-ins; existing sessions continue | Same |
| Cross-provider credential misconfiguration | A broken OIDC trust or an expired Neon password breaks the app until fixed; extra moving parts | Fewer cross-provider links |
| Leaked database password | Usable from anywhere on the internet until rotated | Useless without network access into the VPC |
| Cost surprise | Neon compute scales with use. Set a spending limit | NAT is avoided by design; ALB and IP charges are fixed |

## 3. Estimated monthly cost (USD, London, on demand, before tax)

AWS figures are from the public AWS Price List files for eu-west-2, downloaded on 2026-10-18 and 2026-10-19 (RDS, VPC, EC2/NAT, S3, Secrets Manager, ECS/Fargate, ELB, App Runner, Cognito, CloudWatch). Neon figures are from secondary sources and must be confirmed on neon.com. Vercel figures are its published plan price and must be confirmed. All use 730 hours a month.

| Line | A | B |
| --- | --- | --- |
| App compute | Vercel functions: within plan allowances at pilot volume | Fargate 0.25 vCPU + 1 GB: $0.04656/vCPU-h, $0.00511/GB-h → **$12.23** |
| Load balancer | — | ALB $0.02646/h → $19.32, plus ~$1 of capacity units → **~$20.30** |
| Public IPv4 addresses | — | 2 for the ALB + 1 for the task, at $0.005/h → **$10.95** (this avoids a $36.50 NAT gateway) |
| Database | Neon Scale, 0.25 CU kept awake by the 5-minute worker: $0.222/CU-h → **$40.52**; storage and 14 days of history under 1 GB → ~$0.55 | RDS db.t4g.micro single-AZ $13.14 + 20 GB gp3 $2.66; backups within the free allowance → **$15.80** |
| Secrets | 4 in Secrets Manager (source of truth) → $1.60 | 6 → $2.40 |
| Logs, image registry | Vercel (in plan) | CloudWatch Logs and ECR under 1 GB → ~$1.10 |
| Cognito, S3 log, alarm, schedule | ~$0.25 | ~$0.25 |
| **Total for Flight Deck** | **~$43** | **~$63** |
| Vercel plan | The existing site's plan. If it is on Hobby (non-commercial use only), an organization's operations console needs **Pro, $20 per member per month**. Confirm | Unchanged. The site stays where it is |

Variants:

- **B with App Runner instead of Fargate + ALB.** App Runner's VPC connector sends all outbound traffic through the VPC, so it needs a NAT gateway ($36.50 + $0.05/GB). That comes to about $58, with less to manage than ECS. Confirm App Runner's current availability before choosing it.
- **B with tasks in private subnets behind a NAT** comes to about $96.
- **A with a 15-minute worker** would let Neon suspend between runs, roughly halving its compute. The cost is a coarser restore fence (W10) and a slower stale-worker alert.

**Proposed budget ceiling for staging: $75 a month, all in, excluding the Vercel plan.** Set AWS Budgets alerts at $50 and $75 (AWS states the first two budgets are free; confirm) and a Neon spending limit, before provisioning anything.

## 4. Recommendation

**Use A (Vercel + Neon Scale) for the synthetic staging environment.** Treat the production choice as open until staging results and counsel's review are in.

- It best serves the stated priority: the least infrastructure for you to maintain personally, with every recovery and gate safeguard unchanged. The safeguards are in the application and the log, not the network.
- It costs about $20 a month less than B, and much less to build. B needs a network-and-compute stack and a deploy pipeline that do not exist yet.
- Staging holds synthetic records only, so the public database endpoint is an acceptable exposure there. That is the trade-off to settle for production.

**Choose B for production if** either of these holds:

- counsel or a security reviewer requires private database connectivity for real contact data, consistent with AWS's guidance;
- a single-vendor data-processing arrangement matters more than the extra maintenance.

Moving from A to B later costs a database migration (a logical export and import, then verification) and the new AWS stack. The application code does not change.

## 5. Decisions needed

1. **Topology for staging**: A (recommended) or B.
2. **Vercel plan**: confirm the current plan, and whether Pro is needed.
3. **Budget ceiling**: $75 a month for staging (proposed), with alerts.
4. **Staging account**: a separate AWS account, as recommended in your review, rather than separate names in one account.
5. **Alarm recipient**: a monitored TIRO operations inbox, with founder escalation.
6. **Retention**: 14-day point-in-time window as the staging target; protective-log retention at least 35 days. Any manual snapshot kept longer needs longer log retention (`recovery-guarantees.md` W1).

After these, before provisioning:

- For A: add the Vercel OIDC role to the template.
- For B: write the network-and-compute stack.

Both are small, reviewable changes, and neither has been made yet.
