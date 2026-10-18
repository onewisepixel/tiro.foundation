# Flight Deck: architecture and threat model (0.2.1 recovery hardening)

Status: **Production-foundation candidate for founder review.** Runs and is tested locally, including against a real PostgreSQL and the production build. Nothing is deployed, no AWS resource or account has been created, no real contact data exists, and no message has been sent.
Revision date: 2026-10-18. Supersedes the 0.2 version of this file.
Authority: the Flight Deck 0.1 directive and the 0.2 and 0.2.1 founder decisions. Defers to `/community-rights`, `docs/manifestov0-2.txt`, and `docs/ethos.txt` (proposed operational requirements). Implements nothing from Contract 0.2 (`docs/proposals/memory-record-relationship-contract.md`), which remains under formal review.

## 0. What changed in 0.2.1

| Area | 0.2 | 0.2.1 |
| --- | --- | --- |
| Restore safety | A ledger exported after each worker run (recovery point: one run) | **Protective event log**: every opt-out, lift, erasure, deactivation, role change and gate approval is appended to an external hash chain **before** it commits (`protective.ts`); production uses S3 with conditional writes, versioning and Object Lock (`s3Sink.ts`, template). The ledger remains as a checkpoint |
| Recovery | `replay-ledger` by hand after a restore | **Recovery gate** (`recovery.ts`): a database behind or inconsistent with the log locks all contact until events are verified and replayed; lifts are never re-applied automatically; broken history is never applied and needs a founder; `mark-restored` makes every provider restore explicit |
| Gates | Recorded by the admin script with a free-text `--by` | **Approved in the console** (`/flight-deck/gates`) by an active founder bound to a Cognito subject who signed in within 10 minutes; signed by the server, journaled, re-verified on every use (`gates.ts`). A bootstrap mode serves sign-in and the gates page before the console gate |
| Admin script | Wrote to the database directly | Journals through the same log as the app on a real database, and refuses without it |
| Template | Pool, secrets, schedule, alarm | + the protective log bucket and policies (app: put/get/list, no delete; read-only for drills) |

Guarantees and remaining windows: `recovery-guarantees.md`.

## 1. What changed in 0.2

| Area | 0.1 | 0.2 |
| --- | --- | --- |
| Storage | Local JSON file | Same contract, plus a **PostgreSQL adapter** (serializable, versioned, DB-enforced keys, append-only audit trigger), migrations, logical snapshot export/import |
| Identity | Local test identities | **Dedicated Cognito pool** (OIDC code + PKCE, MFA required by the pool), named operators table, hashed server-side sessions, revocation |
| Modes | disabled, local-demo | + **production**, which exists only with complete, valid configuration and opens nothing without the founder's recorded gates |
| Rate limiting | In-memory | + **PostgreSQL** shared limiter (multi-instance) |
| Background work | A person pressed "Run due jobs" | **Scheduled worker** (EventBridge, every 5 min, disabled by default), single-runner lock, heartbeat, housekeeping |
| Monitoring | Health page | + alerts, a token-protected status endpoint for an uptime monitor, a CloudWatch alarm on worker failures |
| Exceptions | Opt-out and erase only | **Cases** for sensitive material, opt-outs, deletion and access requests, complaints, mistaken submissions, lost messages, doubtful contacts, and incidents |
| Restore | Not addressed | **Restore ledger** of erasures and suppressions, replayed after any restore |
| Public form | Optional 500-character note | **Note removed**; fixed topic choices only |

Unchanged on purpose: exact-version approvals, dispatch-time checks, the global pause, the audit trail, manual social publishing, disabled email, and the separation between contact permission and archival consent.

## 2. Boundaries

```
 public                                      private (local demo, or production behind Cognito + gate)
 ──────                                      ──────────────────────────────────────────────────────────
 /pilot ── server action ── intake.ts ──┐    /flight-deck/* ── server actions ── domain services
                                        │                                        │
                                        ▼                                        ▼
                              OperationsStore contract (src/lib/flightDeck/store.ts)
                 ┌──────────────────────┼──────────────────────────────┐
     MemoryOperationsStore     LocalFileOperationsStore      PostgresOperationsStore (postgres/store.ts)
          (tests)                (local demo)               (local demo --pg; production candidate)

 EventBridge rule ──(API destination, worker token)──► /flight-deck/internal/worker ── worker.ts
 Uptime monitor ──(monitor token)──► /flight-deck/internal/status (counts and codes only)
 Cognito (dedicated pool) ◄── /flight-deck/auth/login, /auth/callback ──► identity.ts (operators, sessions)

 NO path to backend/, infra/, src/data/, the Living Trace, or any archival store.
```

- **A separate operations domain.** `src/lib/flightDeck/` has its own types, store, migrations (`fd_*` tables), and identity. A test fails if any Flight Deck file imports from `backend`, `infra`, `@/data`, `publicMemoryApi`, or `livingTrace`. The production database must be separate from any archival system; the deploy template provisions nothing shared with the synthetic backend's stack (`infra/` is untouched).
- **Synthetic and real never mix.** Every store has a `synthetic` flag; a database records its own (`fd_meta`), a store refuses to open a database whose flag differs, and every row is checked against it on write. Wiping is possible only for a synthetic database.

## 3. Modes and gates (outermost first)

1. **Mode** (`config.ts`): `disabled` (default), `local-demo` (explicit, non-production build, no platform marker, loopback Host), or `production` (production build, every required setting present and well-formed, secrets ≥ 32 characters, all different, no placeholders, TLS required on the database URL). Values are never echoed, only setting names.
2. **Host**: production requests must carry the configured public host; anything else is 404.
3. **Proxy** (`src/proxy.ts`): outside those modes every `/flight-deck` path, including actions, auth callbacks, and machine endpoints, is 404 before page code runs.
4. **Console gate** (`runtime.ts`, `gates.ts`): in production the console exists only with a `console` gate whose signed approval verifies against the server key and whose approver is still an active founder with the same provider subject. Before that, only sign-in and `/flight-deck/gates` are served (bootstrap), so the founder can approve after a fresh MFA sign-in.
5. **Identity** (`oidc.ts`, `identity.ts`): Cognito proves who someone is (state, PKCE, RS256 signature against the pool JWKS, issuer, audience, `token_use`, expiry, nonce, verified email, group). Flight Deck then requires a **named, active operator** and takes the role from its own table. The provider subject binds to the operator once; a different subject for the same email is refused. Sessions are random tokens in a `__Host-` HttpOnly Secure cookie; only their SHA-256 is stored; 1-hour idle and 8-hour absolute limits; deactivation and role changes apply on the next request.
6. **Capabilities** (`access.ts`): enforced in the domain. Founder: everything. Operator: prepares and records, never approves, resumes, or deletes. Reviewer: reads and decides, never edits.
7. **Approval binding**, **dispatch-time checks**, and **truthful receipts**: as in 0.1. 0.2 adds two dispatch-time holds: an **open exception case** for the person, and a **campaign** that is not active or is over its weekly limit.
8. **Public form gate**: in production the form needs its flag, a recorded `public-form` gate naming the current notice version, and a notice whose version does not contain "draft". The gates page refuses that approval while the notice is a draft, before the console gate, without a fresh sign-in, or without a reference to the founder's separate written authorization. 0.2.1 ships a draft notice, so the production form cannot open.

## 4. PostgreSQL adapter

- **Transactions**: `BEGIN ISOLATION LEVEL SERIALIZABLE`. The domain function runs against an empty working state; touching an unloaded table throws `NeedCollection`, the adapter loads that table **inside the same transaction**, and the function runs again from the start (domain functions are pure over the transaction). Writes are the difference: inserts, `UPDATE … WHERE id AND version`, version-checked deletes, audit appends without reading the audit table, and atomic counter upserts. Serialization failures, deadlocks, and lost version checks retry the whole transaction (8 attempts, jittered). A connection or server failure is `StoreUnavailable`: nothing from that transaction was committed.
- **Schema** (`postgres/migrations.ts`): one table per collection, each a validated JSON document plus real columns for every declared foreign key (deferrable, so writes can land in any order) and unique key. The audit table has triggers that reject `UPDATE`, `DELETE`, and `TRUNCATE`. Migrations are ordered, checksummed, advisory-locked, and a changed migration is refused.
- **Reads**: `REPEATABLE READ READ ONLY` snapshots; the audit trail is read in pages (`auditPage`, `auditSince`), never loaded whole.
- **Scale**: each transaction loads the tables it touches in full. Right for hundreds to a few thousand records; revisit (repository-style queries) past roughly 5,000 prospects or 200 ms transactions.
- **TLS**: production requires `sslmode=verify-full`; the pool sets certificate and hostname verification explicitly (node-postgres would otherwise let URL parameters silently drop a configured CA).

## 5. Worker

`worker.ts` runs one idempotent tick: takes a Postgres advisory lock (a concurrent tick exits as `skipped-locked`), records a `WorkerRun` heartbeat, runs due jobs (every gate re-checked, pause honoured; with no provider, jobs are held, never sent), opens a retention-review task for each record past its review date (never deletes on its own), expires unused approvals and opens a re-review task, raises overdue exception cases to the founder, purges old rate-limit windows and old runs, and writes a checkpoint to the protective log bucket. Each run first checks the database against the log (`checkRecovery`) and reconciles a database that is merely behind; it dispatches nothing while recovery is unverified (outcome `recovery-locked`). Alerts (`computeAlerts`) cover a stale or repeatedly failing worker, failed or long-held jobs, overdue cases, a long pause, a recovery lock, a missing log, and lifts awaiting confirmation.

## 6. Exceptions

`cases.ts`: nine kinds, each with a deadline, a checklist, whether it holds outreach, and immediate effects (an opt-out case suppresses at once; an incident case can pause everything). Automatic steps complete themselves (erasure completes a deletion case's erase step and unlinks the person). Complaints, sensitive disclosures, and incidents are resolved by the founder. A case records handling, never content; a redaction tool replaces a field that should never have held material, and the audit records only that a field was redacted. Procedures: `exception-procedures.md`.

## 7. Protective log and recovery

A backup cannot know about later decisions. In 0.2.1 each protective decision is in the external log before it commits, so the recovery point for those decisions is zero: a restore from any backup inside the log's retention is brought back up to date before anyone can be contacted. The 0.2 ledger survives as a checkpoint the worker writes to the same bucket. Design, guarantees, and remaining windows: `recovery-guarantees.md`; runbook: `operations.md` §6.

## 8. Threat model (additions and changes in 0.2)

| Threat | Control | Remaining risk / requirement |
| --- | --- | --- |
| Console reachable before launch | Production mode needs complete config; console needs the recorded gate; proxy and server both check | Verified in the production rehearsal (`acceptance.md`) |
| Stolen or replayed ID token | RS256 against JWKS; iss, aud, token_use, exp/iat, nonce bound to a signed, expiring login transaction; `alg:none` and HMAC refused | Cognito ID tokens do not reliably carry `amr`; MFA is enforced by pool configuration and checked by the template test, not per token |
| Account takeover by re-creating a Cognito user | Subject binds once; a different subject for the same email is refused | Recovery requires the founder to deactivate and re-add the operator |
| Former operator retains access | Server-side sessions; deactivation revokes all sessions at once; role re-read on every request | — |
| Session theft from the database | Only SHA-256 of tokens stored | — |
| Session fixation / CSRF | Session issued only after IdP verification; `__Host-` cookie; Server Actions reject cross-origin POSTs | Session cookie is `SameSite=Lax` so the IdP redirect carries it; mutations remain origin-checked POSTs |
| Machine endpoint abuse | Bearer tokens (≥ 32 chars) compared in constant time; endpoints 404 before the gate; responses carry counts and codes only | Local demo has no token (loopback only); a cross-site page could trigger a harmless, idempotent local tick |
| Concurrent writes and duplicate requests | Serializable transactions, version checks, unique keys in the database | Verified against real PostgreSQL (`acceptance.md`) |
| Opt-out racing a dispatch | Serializable conflict forces a retry that sees the opt-out | Verified; the one-request window between the last check and a provider call remains (no provider exists) |
| Storage outage | `StoreUnavailable`, nothing half-written; the public form says nothing was stored; the worker records the failure | Availability depends on the chosen provider |
| Restore undoing erasures/opt-outs/deactivations/approvals | Protective event log written before commit; recovery gate blocks contact until replayed and verified; lifts need reconfirmation | Log retention must outlast backups; the log's write credential equals database write access (`recovery-guarantees.md` W1, W2) |
| Gate approved by a typed name or a database row | Signed approval from a freshly authenticated founder, re-verified on every use | Database write access plus the session secret could forge one (W3) |
| Restore drill writing to the production log | Read-only log policy for drill copies; protective changes then fail closed | Procedure: never give a drill the app policy (W5) |
| Free-text testimony via the form | Note removed; topics from a fixed list; any other field refused | Name, organization and region remain short free text |
| Unsolicited material by email | Exception procedure: remove, do not copy, record handling only, redact fields | Depends on people following the procedure (`exception-procedures.md`) |
| Secrets exposure | Secrets only from the environment (secret manager); config errors name settings, never values; no secret in client bundles (verified) | Host must inject secrets; rotation runbook in `operations.md` |
