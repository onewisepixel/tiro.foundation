# Flight Deck 0.1: integrations

Status: **Options for founder decision.** No external account, credential, or paid service has been created. Prices change; confirm current pricing and terms before choosing.
Revision date: 2026-10-16.

## 1. What is live, what is a placeholder

| Port | 0.1 implementation | Live? | Flag |
| --- | --- | --- | --- |
| Identity | Local test identities, HMAC session cookie, loopback only | **No.** Demo only | `FLIGHT_DECK_MODE=local-demo` |
| OperationsStore | `LocalFileOperationsStore` (one JSON file), `MemoryOperationsStore` (tests) | **No.** Synthetic, single machine | — |
| EmailProvider | `DisabledEmailProvider` (default) or `LocalOutboxEmailProvider` (dry run, files) | **No.** Sends nothing | `FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED` |
| SocialPublisher | `DisabledSocialPublisher` or `LocalOutboxSocialPublisher` | **No.** Publishes nothing | `FLIGHT_DECK_SOCIAL_PUBLISHING_ENABLED` |
| Scheduler / JobRunner | `runDueJobs()` invoked by a person ("Run due jobs now") | **No** background execution | `FLIGHT_DECK_BACKGROUND_JOBS_ENABLED` (reserved; nothing reads it as permission to run) |
| CRMAdapter | None: Flight Deck is the operational source of truth | n/a | — |
| Analytics | Aggregate counters in the store (`FunnelCount`); `ref`/`utm_source` captured as a short tag | Local only | — |
| AI drafting | **Not built.** Templates are deterministic text | n/a | — |
| Rate limiter | `InMemoryRateLimiter` | One process only | — |

No code path in 0.1 calls a network service. Turning on a flag in local demo selects only the dry-run outbox.

## 2. Identity (required before any deployment of `/flight-deck`)

Requirements: MFA, server-side role (`founder` / `operator` / `reviewer`) mapping, secure HttpOnly cookies, session revocation, access logs without content, no tokens in the browser bundle.

| Option | Strengths | Concerns |
| --- | --- | --- |
| A managed OIDC provider (for example Auth0, Clerk, WorkOS, Okta) | Fast, MFA built in, good Next.js support | Monthly cost per active user; vendor lock-in; data location to review |
| AWS Cognito, in a **new, separate** user pool | Stays in AWS; low cost at this scale | The existing Cognito staff pool serves the synthetic fixture backend and does **not** make Flight Deck authorization valid; a separate pool and app client are needed; more configuration work |
| Google Workspace / Microsoft Entra SSO, if TIRO adopts one | Uses organization accounts and their MFA | Requires an organizational identity first |

Recommendation: a separate managed OIDC tenant or a separate Cognito pool, restricted to named TIRO operators. Integration point: replace `getActor()` in `runtime.ts` and the sign-in page; the domain already authorizes by role.

## 3. Operations store

| Option | Cost (indicative) | Reliability / backups | Access control | Deletion | Location | Complexity |
| --- | --- | --- | --- | --- | --- | --- |
| Managed PostgreSQL (e.g. Neon, Supabase, AWS RDS/Aurora Serverless) | Low monthly at this scale; RDS higher | Point-in-time recovery on most plans | DB roles + network rules | Row deletion; backup expiry must be documented | Region selectable | Moderate: schema migrations, connection pooling |
| DynamoDB in a separate TIRO account/table | Pay-per-request, very low at this scale | PITR available | IAM | Item deletion; PITR window | Region selectable | Moderate: transactions are limited, so the store contract needs care |
| SQLite on a single server (e.g. Litestream to object storage) | Lowest | Depends on replication setup | File and host access | Simple | Wherever hosted | Low code, more operations work |

Recommendation: **managed PostgreSQL** in a TIRO-controlled account: the store contract (serializable transactions, foreign keys, unique keys, insert-only audit via permissions) maps directly onto relational tables. It must be separate from the archival fixture system. The pepper for email hashes goes in a secret manager, not the database.

## 4. Email

Needed only for transactional acknowledgements and, later, opt-in updates. Approved one-to-one outreach can continue to be sent by hand from custodians@tiro.foundation indefinitely.

| Option | Notes |
| --- | --- |
| Amazon SES | Low cost; needs domain verification and production-access request; AWS account already in use for the fixture backend (use a separate configuration) |
| Postmark, Resend, or similar transactional providers | Simple APIs with idempotency support; monthly plans |
| Mailing-list services (for the monthly update only) | Provide hosted unsubscribe; keep them separate from transactional mail |

Requirements before activation: SPF, DKIM, and DMARC for tiro.foundation (a DNS change, founder decision); provider idempotency keys mapped from `DispatchJob.idempotencyKey`; bounce/complaint webhooks creating suppressions; a dry run against a test inbox; approved templates.

## 5. Social

Initial priorities: LinkedIn, Instagram, monthly update. Recommendation: **keep publication manual** (copy, post, record with link) through the first months. If automated later, use platform-native APIs with narrowly scoped tokens held server-side (LinkedIn's posting API requires an approved app; Instagram publishing requires a professional account connected to a Facebook Page). Never automate browser logins.

## 6. Job runner

Next.js request handlers are not a place for long-running work. Options when needed: a scheduled function (e.g. a cron-triggered serverless function) that calls `runDueJobs()` with a system actor; or a queue (e.g. SQS) with a worker. Either must be idempotent (it already is), monitored, and pause-aware (it already honours the global pause).

## 7. CRM sync

Not recommended for 0.1. If a CRM (e.g. HubSpot) is adopted later: one-way export first; suppression and permission state always flow from Flight Deck and take precedence; idempotent upserts keyed by prospect id; a reconciliation report; never blind dual writes.

## 8. AI-assisted drafting

Not built. Before any model sees prospect names, addresses, correspondence, or community information: a provider and privacy decision, a data-processing agreement, and an approved prompt library limited to TIRO's public documents. Generated drafts would enter as `unreviewed` and pass through the same approval gates.

## 9. Production deployment notes

- Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for multi-instance hosting.
- Configure `serverActions.allowedOrigins` if a CDN or proxy rewrites Host.
- Add a durable rate limiter (shared counter store or edge rate limiting).
- Keep `/flight-deck` behind the identity provider and, ideally, on a separate subdomain with its own access policy.
