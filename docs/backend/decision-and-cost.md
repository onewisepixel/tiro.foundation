# Fixture-Preservation Backend — Architecture & Database Decision

Status: Engineering decision for the fixture-only preservation milestone authorized 2026-10-02.
Scope: Non-sensitive synthetic fixtures only. Real collection remains disabled pending separate
operator appointment and adopted (not proposed) consent/retention procedures per `docs/ethos.txt` §6.1.
Pricing verified: 2026-10-02, against AWS's own pricing pages where fetched directly, and
secondary-aggregated sources where noted. **Reverify at deploy time** — account eligibility,
region, and published rates can all change.

## 1. Access patterns (per `docs/ethos.txt` §4)

| Pattern | Shape | Consistency needed |
| --- | --- | --- |
| Record lookup | Get by `recordId` | Eventually consistent is fine for display; strongly consistent for permission decisions |
| Scoped permission lookup | Get consent grant(s) for (record, purpose, audience) | Strongly consistent at decision time |
| Lifecycle queue | List pending `LifecycleRequest` items by status | Eventually consistent acceptable (it's a work queue, not an access gate) |
| Copy inventory | List `CustodyCopy` items for a record | Eventually consistent |
| **Current restriction/deletion lookup** | Get by `recordId` from a **separate** control register | **Must be strongly consistent / transactional** — this is the access-control gate itself |

None of these require an ad-hoc join across unrelated entity types (e.g. no "every record where consent.purpose=X and authority.status=Y and era>Z" cross-cutting query). Every pattern above is a key lookup or a single status-index scan.

## 2. Decision: DynamoDB

Per the brief's own criterion — "Choose DynamoDB if those operations can be implemented cleanly with bounded queries and conditional/transactional updates" — they can:

- **Single-table design.** `PK = ENTITY#<recordId>`, `SK` discriminates sub-items: `RECORD`, `CONSENT#<purpose>`, `AUTHORITY#<claimId>`, `COPY#<copyId>`. One `GetItem`/`Query` per access pattern above except the lifecycle queue.
- **Lifecycle queue** needs one GSI: `GSI1PK = STATUS#<status>`, `GSI1SK = createdAt`. Classic DynamoDB status-index pattern.
- **Conditional writes / transactions**: DynamoDB's `ConditionExpression` and `TransactWriteItems` cover the idempotency and atomicity requirements in §5 directly (e.g. "only transition `published`→`withdrawn` if current version matches").
- **The restriction register is a second, separate table** (per the brief's explicit instruction to keep it "outside the data being rolled back"), queried with `GetItem` (strongly consistent — DynamoDB supports this on base-table reads, just not on GSIs, which matches the requirement exactly).

Rejected: Aurora Serverless v2 PostgreSQL. Nothing above needs relational joins or ad-hoc querying; adding a VPC/Data-API-fronted relational engine would be strictly more operational surface (connection/pause management, Data API vs. driver tradeoffs) for no access-pattern benefit. Documented here so the tradeoff isn't silently lost — if a future real-collection phase needs genuine cross-entity relational queries (e.g. ad-hoc research/export queries across many records' consent state), that's a real reason to revisit this, not a reason to pre-build it now.

## 3. Cost estimate

### DynamoDB (verified against AWS's pricing page, fetched 2026-10-02)

- **Always-free allowance** (not time-limited): 25 GB storage + 25 provisioned WCU + 25 provisioned RCU, per Region per payer account.
- **On-demand rates** (if the account's free allowance is already committed elsewhere, or provisioned capacity isn't used): writes $0.625/million, eventually-consistent reads $0.125/million (strongly consistent reads cost ~2×, so ≈$0.25/million — relevant because the restriction-register reads must be strongly consistent). Storage beyond free tier: $0.25/GB-month.
- **This milestone's actual load** (a handful of synthetic fixtures, exercised by a test suite, not public traffic): comfortably inside the always-free 25/25/25 allowance. **Provisioned mode at the free-tier minimum, not on-demand** — avoids any per-request bill entirely for this workload, at the cost of needing to watch the 25 WCU/RCU ceiling if load grows.

### Other services touched by §3's architecture table

| Service | Always-free allowance | This milestone's load |
| --- | --- | --- |
| Lambda | 1M requests + 400,000 GB-seconds/month | Trivial — a few dozen invocations per test run |
| API Gateway (HTTP API) | No confirmed perpetual free tier for HTTP APIs specifically (REST APIs historically had a 12-month allowance; HTTP API pricing is largely pay-per-call from day one) — **verify at deploy time**, do not assume free | At this volume, pay-per-call cost is still sub-cent; flagging because I could not verify an "always free" HTTP API allowance with confidence |
| Cognito | 50,000 MAU always free | A handful of invited test staff — effectively $0 |
| S3 | 5 GB + 20k GET/2k PUT for the account's **first 12 months only** (not always-free) — account age not yet confirmed | Small dummy media files; outside any free-tier window, Standard storage is ≈$0.023/GB-month — trivial at this scale either way |
| CloudWatch Logs | Modest always-free ingestion/storage allowance | Bounded retention (7–14 days) keeps this near-zero |

### Monthly estimate

| Scenario | Estimated cost |
| --- | --- |
| Tiny fixture workload (this milestone, within free tiers) | **$0–2/month** (API Gateway HTTP API calls are the one line item not confirmed free; everything else sits inside an always-free allowance at this volume) |
| Busier scenario (sustained staff testing, hundreds of requests/day, media exercised repeatedly) | **Still single-digit dollars/month** — DynamoDB provisioned capacity would need bumping past 25/25 before it costs anything meaningful, and Lambda/API Gateway charges stay in the cents range at this volume |

Explicitly **not** provisioned: idle NAT gateways, read replicas, DAX, OpenSearch, vector databases, or reserved Lambda concurrency — none are needed for a fixture exercise, all were on the brief's "avoid" list, and all would move this from near-zero to a real recurring bill.

### Alerting, not a cap

Billing alerts will be configured (CloudWatch billing alarm at a low threshold, e.g. $5 and $20) as a notification tripwire. Per the brief: this is a notification, not an enforced spending cap — nothing in this architecture auto-shuts-down on alarm.

## 4. What's still unverified

- Exact on-demand HTTP API Gateway pricing/free-tier status for this specific account.
- The account's free-tier eligibility window for S3 (new vs. existing account).
- Whether the target region has any eligibility differences from us-east-1 (where most of the above was priced).

These get confirmed once the AWS account/region is connected, per the brief's own instruction to ask only for information that can't be inferred — region/account identity is exactly that kind of material fact, not inferable from here.
