# Flight Deck: acceptance evidence (0.2.1 recovery hardening and staging readiness)

Status: **Historical local evidence dated 2026-10-19, not current cloud status.** The original statement that nothing had been deployed applied on that date. Dedicated synthetic cloud staging was subsequently provisioned and tested; see the [2026-10-23 limited staging checkpoint](staging-checkpoint-2026-10-23.md) and §7. No real contact data or public intake has been approved. The 0.2.1 review corrections are in §0. The original 0.2.1 evidence (2026-10-18, commit `6976b6a`, CI green on that commit per the founder's review) follows from §1. The 0.2 evidence is in §8.

## −1. Staging preparation, Architecture A (2026-10-19)

Prepared, not provisioned: no account, resource, charge, or deployment exists. Setup: `staging-setup.md`. Tests: `staging-acceptance.md`. Checklist: `staging-activation-checklist.md`.

| Change | Evidence |
| --- | --- |
| Vercel OIDC: the template's `VercelAppRole` is assumable only by the exact team, project, and environment (exact match, never `development`), with one-hour sessions and log put/get/list only. The app uses `@vercel/oidc-aws-credentials-provider` 3.3.11 (pinned) when `FLIGHT_DECK_AWS_ROLE_ARN` is set | Template tests (7/7); `cfn-lint` 1.57.1, all rules, 4 regions: 0 findings |
| `FLIGHT_DECK_DEPLOYMENT=staging`: opens only a synthetic-marked database; the public form can never open; `noindex` on every page. Neon `-pooler` URLs refused | Config tests |
| Worker on Vercel: EventBridge's 5-second limit → 202 at once, tick after the response (`after()`, `maxDuration` 120 s); lock released by `idle_session_timeout` if an instance dies | Rehearsal: 202 in 3 ms, run then completed |
| Status monitor (EventBridge every 15 minutes, no retries) → alarm on any non-200; alarms and budget alerts to the operations mailbox and the founder's escalation address; AWS budget $15 | Template tests |
| Approval-gated deploy pipeline (`.github/workflows/deploy-flight-deck-staging.yml`): manual start with typed confirmation; GitHub environment reviewer; refuses the public site's project and any non-staging configuration; post-deploy smoke check | Not run (needs the accounts) |

Results: `npm test` **458/458**, `npm run test:flight-deck-pg` **27/27**, typecheck clean, lint baseline (2 `backend/` warnings), build and disclosure check pass, client-bundle scan 0 matches, `npm run rehearse:flight-deck` **43/43**, browser E2E on PostgreSQL **53/53**. `npm audit --omit=dev` unchanged (1 high, inside `aws-cdk-lib` in `infra/`).

## 0. Review corrections (2026-10-19)

### 0.1 What changed

| Review finding | Correction | Where |
| --- | --- | --- |
| Role changes and gate approvals were re-applied from the log, even when their transaction never committed | Recovery re-applies only events that cannot increase access: opt-outs, erasures, deactivations, and role changes to a capability **subset** of the current role (by compare-and-set). Promotions, lateral role changes, lifts, and **every** gate approval become founder tasks, opened in the same transaction that moves the head past them | `recovery.ts`, `access.ts` (`roleChangeReducesAccess`), `identity.ts` (`replay` narrowed; gate replay removed) |
| Identity replay was not coordinated with head advancement | Applied first and idempotently, then the head advances. Every crash point was tested | `recovery.ts`, `postgres/recovery.test.ts` |
| A restored database could serve private data before reconciliation | Every console page, action, and export checks recovery on each request. While unverified (locked, behind the log, behind the fence, or the log unreachable), only `/flight-deck/recovery` is served, with no records. Verification ends every session | `guard.ts`, `recovery/page.tsx`, `export/[id]/route.ts` |
| Cut-over relied on someone running `mark-restored` | **Restore fence.** Each healthy worker run raises a counter in the database, then copies it to the log bucket. A copy behind it is locked automatically, even with nothing to replay. The old database locks itself after a cut-over. `mark-restored` is optional (drills) | `recovery.ts` (`advanceFence`, `checkRecovery`), `worker.ts`, migration `0005_restore_fence`, sinks |
| Hosting compared as database prices only | Two complete topologies, with architecture, security, recovery, cost, network, maintenance, deployment, and failure modes | `staging-decision-packet.md` |

No feature was added beyond these. The public form, outbound providers, `backend/`, `infra/`, and the doctrine are untouched.

### 0.2 Results

| Command | Result |
| --- | --- |
| `npm test` | **455 / 455** (3 new: role-reduction rule, in-process restore fence, S3 fence object) |
| `npm run test:flight-deck-pg` | **27 / 27**, three consecutive runs: 22 existing (one rewritten to the corrected semantics) + 5 new (failed role elevation; failed console and public-form approvals; identity replay interrupted twice; crash inside the skip transaction; restore fence with cut-over) |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors; the 2 pre-existing `backend/` warnings |
| `npm run build`, `npm run verify:disclosure` | Succeed; "disclosure boundary holds in the production build" |
| Client-bundle scan (store, journal, signing key, session secret, new fence and session functions) | 0 matches |
| `npm run rehearse:flight-deck` (production build, TLS-only PostgreSQL, real S3 adapter on a local test server) | **42 / 42**. The 8 new checks: <ul><li>a signed-in founder sees a test record while verified;</li><li>with the database's fence behind the bucket's and nobody running `mark-restored`, every console page including the record's own page redirects to the recovery page;</li><li>export returns 503;</li><li>the recovery page shows no record;</li><li>the monitor reports `restore-in-progress`;</li><li>the worker verifies by itself;</li><li>the copied session no longer works;</li><li>the status is verified again.</li></ul> |
| `npm run e2e:flight-deck`, file store / PostgreSQL | **53 / 53** each (founder verification lands on the recovery page; axe on it: no serious or critical violations) |
| `npm audit --omit=dev` | Unchanged: 1 high, inside `aws-cdk-lib` in `infra/` |

### 0.3 Not performed

- Anything on AWS, Neon, or Vercel.
- Real Cognito re-authentication.
- Assistive-technology testing and the founder review (`manual-tests.md`).
- CI on these corrections: they are not committed.

## 1. Live / prepared / not built (0.2.1)

| Capability | State |
| --- | --- |
| Protective event log (opt-outs, lifts, erasures, deactivations, role changes, gate approvals) | **Prepared and tested**: local file log in the demo; S3 adapter tested through the AWS SDK against an S3-compatible test server; bucket in the template, **not created** |
| Recovery gate (no contact after a restore until verified) | **Built and tested** on in-process stores and real PostgreSQL clones |
| Gate approval by a verified, freshly authenticated founder | **Built**; exercised in the production rehearsal with the console's approval code (a real Cognito sign-in is a staging step) |
| Provider comparison with costs | **Done** (`integrations.md` §4) |
| CloudFormation template | **Linted, not deployed** |
| Staging acceptance plan | **Written** (`staging-acceptance.md`), not run |
| Manual accessibility and human-paced review | **Kits ready** (`manual-tests.md`), not run |

## 2. Commands and measured results (0.2.1)

Windows 11, Node 22.17.1, Next.js 16.3.8, PostgreSQL 17.10 (embedded, temporary).

| Command | Result |
| --- | --- |
| `npm test` | **452 / 452** |
| `npm run test:flight-deck-pg` | **22 / 22** against real PostgreSQL (15 from 0.2, 7 recovery tests on database clones) |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors; the 2 pre-existing `backend/` warnings only |
| `npm run build` | Succeeds |
| `npm run verify:disclosure` | "disclosure boundary holds in the production build" |
| Client-bundle scan for the new server-only code (S3 sink, journal, gate-signing key, session secret, PostgreSQL store) | **0 matches** |
| `npm run rehearse:flight-deck`: production build, TLS-only PostgreSQL, the real S3 adapter against a local test server | **34 / 34** (`screens/production-rehearsal.json`). Covers:<ul><li>script gate refused;</li><li>an unsigned gate row opens nothing;</li><li>bootstrap sign-in;</li><li>a signed approval journaled to S3 with a conditional write;</li><li>no address in the log;</li><li>a checkpoint written;</li><li>status `recovery: verified`;</li><li>a log outage gives 503 `sink-unavailable` and nothing dispatched.</li></ul> |
| `npm run e2e:flight-deck`: browser, **local file store** | **52 / 52**, including the Health recovery section (head advanced by the opt-out and erasure) and founder verification |
| Same browser run on **local PostgreSQL** | **52 / 52** |
| `cfn-lint` 1.57.1, all rules including informational, regions eu-west-2, us-east-1, af-south-1, eu-central-1 | **0 findings** (and confirmed to report errors on a deliberately broken copy) |
| `npm audit --omit=dev` | 1 high: `brace-expansion` inside `aws-cdk-lib`'s bundled dependencies (the `infra/` workspace, which this work may not change). The Flight Deck runtime packages (`next`, `react`, `pg`, `@aws-sdk/client-s3`) report none |

## 3. 0.2.1 requirements

| Requirement | Evidence | Result |
| --- | --- | --- |
| Append-only external sink; versioned S3 adapter; local test adapter | `protective.ts`, `s3Sink.ts`, template bucket (versioning, Object Lock, deny bypass, TLS-only, app may not delete); file sink created exclusively and read-only | Pass (locally) |
| Restoring older content cannot undo opt-outs, erasures, or later authorized changes | Restores from before and after each kind of decision, in memory and on PostgreSQL clones | Pass |
| A failure between DB write and log write is handled explicitly; nothing reported as done without durability | The log is written before commit and a failure rolls back. A crash after the log write is detected and replayed. S3 calls are bounded. Deactivation with the log down ends sessions and says it is not durable | Pass |
| Data minimization in events | Test over every kind; rehearsal checks the S3 bytes | Pass |
| Periodic ledger kept as a checkpoint | The worker writes `checkpoints/{seq}.json`; `replay-ledger` kept, lifts now never re-applied | Pass |
| Recovery gate blocks contact until replayed and verified | Dispatch, manual send and publication, queueing, and the public form all refuse while locked or while the log is unreachable | Pass |
| Interrupted recovery, missing, duplicate, failed writes, tampered and out-of-order history | `protective.test.ts`, `recovery.test.ts` | Pass |
| Guarantees and remaining windows documented | `recovery-guarantees.md` (G1 to G8, W1 to W10) | Done |
| Gate recording attributable to a verified, active, authorized founder | `gates.ts`, `/flight-deck/gates`; the script's `record-gate` now refuses and points to the console; the written approval for the public form still required | Pass (locally); Cognito re-authentication is a staging step |
| Provider comparison | `integrations.md` §4: official AWS price list (2026-10-18) for four regions; Neon from secondary sources (flagged) | Done |
| Template validated without deploying | `cfn-lint` clean; structural tests | Pass; `validate-template` needs credentials |
| Staged acceptance plan | `staging-acceptance.md` | Done |
| CI verification | The 0.2 commit's run (39112762127) passed every step, including the PostgreSQL integration tests. 0.2.1 is not committed, so it has not run in CI | Partly: rerun in CI after commit |
| Dependency triage without blanket upgrades | §2: the only runtime finding is outside Flight Deck and inside `infra/`. Development-only findings are DoS advisories in the lint toolchain. `npm audit fix --force` would downgrade `eslint-config-next` to 14, so it was not applied | Done; no upgrade applied |
| Manual acceptance kits, local vs real | `manual-tests.md` §1 to §3 | Done (not performed) |

## 4. Defects found and fixed during 0.2.1

1. **Reconciliation could loop forever on reordered log objects** (found by the tampering test as an out-of-memory crash). Paging now requires strictly increasing sequence numbers.
2. **A lifecycle rule could have expired the event at the database's head**, which would lock contact permanently. Events are never expired; only superseded checkpoint versions are.
3. **An unreachable log did not block manual sends** (the condition was not persisted). Manual send, publication, and queueing now check recovery directly.
4. **A hung S3 call could hold a database transaction until the server killed it** (found by the rehearsal). Every S3 call is now bounded at 5 seconds, retries included.
5. **The admin script bypassed the protective log on real data, and ledger replay re-applied lifts.** The script now journals through the same log (and refuses without it on real data). Ledger replay turns lifts into founder confirmation tasks.
6. **A restore-drill copy could have written events to the production log**, which production would then replay. Fixed with a read-only log policy in the template and the drill procedure.
7. **A provider restore with nothing to replay was never explicitly verified, and a session signed out after the backup could revive.** Fixed with `mark-restored` (lock plus end all sessions).

## 5. Not performed (0.2.1)

These need a real account, device, service, or reviewer (`manual-tests.md` §1):

- anything on AWS: Cognito MFA and re-authentication, a hosted database, S3 Object Lock and IAM in effect, a point-in-time restore, EventBridge and the alarm;
- `validate-template` and a staging deploy;
- screen-reader and phone testing;
- the human-paced founder review;
- CI on the 0.2.1 changes.

## 6. Screenshots

As in 0.2, plus `health-recovery-desktop.png` (Health with the protective log verified). All synthetic.

## 7. Staging records

See [the dated 2026-10-23 checkpoint](staging-checkpoint-2026-10-23.md) for evidence, provenance labels, control boundaries and open items. These are **limited private synthetic-console checks**; they do not satisfy the complete stages A–F of [the staging acceptance plan](staging-acceptance.md).

| Stage | Date (UTC) | Who / evidence | Outcome | Exceptions |
| --- | --- | --- | --- | --- |
| Console activation | 2026-10-21 23:08 | Founder authorization; signed protective-log event; later Neon gate check | Pass for **console only** | Public-form gate never approved |
| Identity, relationships and contact denial | 2026-10-21–23 | Founder-observed console tests, PR #7; independent database reconciliation | Limited pass | Full A-stage identity denial matrix not completed |
| Editorial approval and invalidation | 2026-10-23 | Founder-observed UI and independent Neon approval/version state | Limited pass | No live authenticated forced-request test |
| Backend stale-approval regression | 2026-10-23 | PR #11, GitHub CI run 39931656022 with real PostgreSQL | Pass in CI | CI test does not invoke staging HTTP endpoint |
| Health and outbound controls | 2026-10-23 | Founder-observed Health; independent Neon and Vercel read-only checks | Limited pass | Scheduled workers off; D–F exercises not run |
| Full staging acceptance A–F | Pending | — | **Not completed / not signed** | Restore, worker/alarm, incident and accessibility matrices still open |

## 8. 0.2 evidence (2026-10-17, unchanged)

### 8.1 Live / prepared / not built

| Capability | State |
| --- | --- |
| `/pilot` page, production build | Serves with the form **closed**; the form now has no free-text field |
| Public form accepting real submissions | **Not possible**: needs its flag, a recorded gate, and a non-draft notice; the admin script refuses the gate while the notice is a draft |
| Private console in production | **Prepared**: exists only with complete configuration and the founder's recorded console gate; Cognito sign-in required |
| PostgreSQL operations store | **Prepared and tested** against real PostgreSQL 17 locally; no database provisioned |
| Cognito pool, secrets, worker schedule, alarm | **Template only** (`deploy/flight-deck/`), not deployed, schedule disabled by default |
| Restore ledger sink | **Not provisioned** (warning shown) |
| Email, social, AI drafting, archive intake | **Off** by decision; no live implementation exists |

### 8.2 Commands and measured results

Windows 11, Node 22.17.1, Next.js 16.3.8, PostgreSQL 17.10 (embedded, temporary).

| Command | Result |
| --- | --- |
| `npm test` | **430 / 430** (368 pre-existing + 62 Flight Deck: 42 domain, 16 production-foundation, 4 deploy-template) |
| `npm run test:flight-deck-pg` | **15 / 15** against real PostgreSQL; repeated 4 times, all green |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors; the 2 pre-existing `backend/` warnings only |
| `npm run build` | Succeeds; all Flight Deck routes dynamic |
| `npm run verify:disclosure` | "disclosure boundary holds in the production build" |
| Client-bundle scan for server-only Flight Deck symbols (store, sessions, identity, seed, secrets) | **0 matches** |
| `npm run e2e:flight-deck`: browser run on the **local file store** | **50 / 50** (51 / 51 with `CLOSED_BASE_URL` pointing at a production server: the closed public form) |
| Same browser run with the UI on **local PostgreSQL** (`dev:flight-deck -- --pg`) | **50 / 50**; data confirmed in Postgres afterwards |
| axe-core scans (WCAG 2.0/2.1/2.2 A+AA rules), 11 page states incl. light theme | **0 violations** (after fixing one serious contrast defect it found) |
| `npm run rehearse:flight-deck`: production build against a TLS-only PostgreSQL with certificate verification | **27 / 27** (`screens/production-rehearsal.json`) |
| `npm run flight-deck:admin -- check-config` with no production settings | Lists the 11 missing settings by name only; exit 1 |

### 8.3 0.2 validation requirements

| Requirement | Evidence | Result |
| --- | --- | --- |
| Concurrent writes | PG: 12 people submitting at once all recorded; the same person 8 times at once → 1 record, 8 submissions, 1 acknowledgement, 1 task; 3 concurrent edits from the same version → exactly 1 succeeds, 2 get "changed since you opened it" | Pass |
| Duplicate requests | PG: 3 concurrent queue requests → 1 job; 2 concurrent runners → 1 provider call, 1 receipt. Unit: double queue, repeated runs, crash recovery without resend | Pass |
| Revocation and suppression races | PG, staged at the worst moment (between the domain's reads and its writes): an opt-out committed during dispatch preparation wins and nothing is sent; an edit committed during a manual-send record revokes it and the send is refused | Pass |
| Worker retries | PG: a failed send retries with the same idempotency key; one receipt; two concurrent ticks → one runs, one `skipped-locked`. Unit: idempotent housekeeping, paused and failed outcomes recorded | Pass |
| Data restoration | PG: logical backup restored into a fresh database; ledger replay re-erases a person erased after the backup and restores an opt-out; import refuses a non-empty database. Unit: replay cancels a message queued in the restored copy; replay is idempotent | Pass (provider PITR drill not performed) |
| Storage failure | PG: unreachable database → `StoreUnavailable`; connection killed between reads and writes → `StoreUnavailable`, nothing committed, pool recovers. Unit: the public form tells the person nothing was stored | Pass |
| Operator access | Unit: only named, active operators get sessions; a different provider account for the same email is refused; idle and absolute expiry. PG: only token hashes stored. Rehearsal: forged and demo cookies refused in production; console 404 before the gate | Pass |
| Permission changes | Unit and PG: role change and deactivation take effect on the next request; deactivation revokes every session | Pass |
| OIDC verification | Unit, with real RSA keys: genuine token accepted; wrong key, `alg:none`, HS256, tampered claims, wrong issuer (incl. a "staff" pool), audience, token use, expiry, future issue, nonce, unverified email, missing group, unknown key all refused; JWKS rotation without refresh storms; PKCE S256 | Pass |
| Production disabled until gates | Rehearsal: 404 before the console gate and on any other host; console gate refused without a founder; public-form gate refused while the notice is a draft; form closed with its flag on | Pass |
| Database-level guards | PG: direct SQL `UPDATE`, `DELETE`, `TRUNCATE` on the audit table rejected; foreign keys enforced; synthetic/real mismatch refused; wipe refused on real data | Pass |
| Form content | Unit: a `note` field, free-text topics, duplicate or excess topics refused; E2E: no textarea anywhere in the form | Pass |
| Exceptions | Unit: opt-out case suppresses at once; deletion case holds outreach and completes on erasure; redaction leaves no trace of content; founder-only resolution; incident pause. E2E: a deletion request worked end to end in the browser | Pass |
| Regression of 0.1 guarantees | All 0.1 tests (exact-version approvals, dispatch-time checks, pause, audit safety, separation from the archive) still pass | Pass |

### 8.4 Defects found and fixed during 0.2

1. **Process crash on a dropped database connection** (no `error` listener on pool clients). Found by the killed-connection test; fixed.
2. **A CA certificate silently ignored** when `sslmode` appears in the connection URL (a node-postgres precedence rule). Found while building the rehearsal; fixed and covered by the TLS-only rehearsal.
3. **Primary button contrast 2.04:1** on `/pilot` (light text on gold, from 0.1, caused by CSS layer order). Found by axe; fixed.

### 8.5 Not performed

Manual screen-reader and device testing; human-paced timing of the founder review; any test with a real Cognito pool, real database provider, or provider point-in-time restore; `validate-template` or a staging deploy of the CloudFormation template; the new CI step on GitHub's runners (added, not yet run there). Protocols: `manual-tests.md`.

### 8.6 Screenshots

`docs/flight-deck/screens/`: the public form with topic choices, a validation error with entries preserved, the confirmation, mobile and reduced-motion views; Now, a relationship, Approvals, an outreach item ready to send by hand, Health with the worker, the weekly review, a deletion-request case; light theme. All synthetic.
