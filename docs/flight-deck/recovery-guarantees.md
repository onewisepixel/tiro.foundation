# Flight Deck: recovery guarantees and remaining failure windows (0.2.1)

Status: **Describes the code as built and tested locally.** Nothing here has run against AWS. The guarantees that depend on S3 Object Lock, IAM, or a provider's point-in-time restore are design guarantees until the staging drills in `staging-acceptance.md` have passed.
Revision date: 2026-10-18.

## 1. What is protected

Six kinds of decision are **protective events**:

- an opt-out (suppression added);
- a lift of an opt-out;
- an erasure;
- an operator deactivation;
- an operator role change;
- a launch-gate approval.

Each is written to an append-only log outside the database (`protective.ts`; production: `s3Sink.ts` and the Object Lock bucket in `deploy/flight-deck/`).

Each event carries only opaque ids, keyed email hashes, codes, and timestamps: never a name, an address, a note, or a message body. A test checks this on every kind. The production rehearsal checks the bytes written to S3.

## 2. Guarantees

**G1. The log is written before the decision commits.** The event is appended inside the database transaction, after the change is computed and before `COMMIT` (`store.ts`, `postgres/store.ts`, `identity.ts`). The log's head row is locked (`FOR UPDATE`), so appends are serialized.

- If the append fails, the transaction rolls back and the person sees "not done". The UI never says an opt-out, erasure, or deactivation succeeded unless its event is in the log.
- Each S3 call is bounded at 5 seconds, retries included, inside the database's 15-second transaction limit. A hung log ends as "unavailable", not as a transaction killed by the server.
- One exception is deliberate. If deactivating an operator cannot be journaled, their sessions are still ended at once, and the founder is told the deactivation itself is **not durable** and must be repeated.

**G2. A restore never yields less protection than the log records.** After any restore:

- if the database is behind the log, every contact path refuses until the missing events are replayed and verified. Contact paths are dispatch, manual sends, manual publications, queueing, and the public form;
- opt-outs, erasures, deactivations, role changes, and gate approvals made after the backup are re-applied;
- tests cover restores from backups taken before and after each kind of decision (`protective.test.ts`; `postgres/recovery.test.ts` on real PostgreSQL clones; `s3Sink.test.ts` through the AWS SDK).

**G3. Lifts are never re-applied automatically.** A lift reduces protection. After a restore, the opt-out stays in force and the founder gets a confirmation task (Health → Recovery). Confirming it journals a new lift. The checkpoint ledger replay follows the same rule (`ledger.ts`).

**G4. Broken history is never applied.** Reconciliation verifies the whole chain before applying anything: contiguous sequence numbers, each event linked to the previous hash, and each hash recomputed from content. A gap, an altered event, an inserted or reordered event, a re-chained rewrite, or an unknown kind locks contact as `journal-integrity`. Only a founder can clear that lock, and the worker never can. Duplicates are applied once.

**G5. Recovery is resumable and exact.** Each event is applied in its own transaction, which advances the database's head by exactly one. An interrupted recovery stays locked and resumes where it stopped. Two concurrent reconcilers cannot apply the same event twice (`ReplayOutOfOrder`).

**G6. A crash between the log write and the commit is caught.** The log then holds an event the database lacks. Three things detect it, and contact stays blocked until the event is replayed:

- the next protective write, whose append collides, is refused;
- the worker's next run, which also replays it automatically;
- any contact path.

The person's request is therefore honoured even though they saw an error. That is the safe direction.

**G7. Every provider restore is verified explicitly.** `flight-deck:admin -- mark-restored` locks contact as `restore-in-progress` and ends every session. It is run once against a database restored by the provider, before it serves traffic. This covers a restore with nothing to replay, and sessions signed out after the backup. `import-snapshot` sets the same lock. The worker verifies and clears it on its next run; a founder can do it at once from Health.

**G8. Launch gates are attributable.** A gate opens nothing unless all of these hold:

- its record carries an approval signed by the server;
- the approver signed in through Cognito within the last 10 minutes;
- the approver is still an active founder;
- the approver's provider subject is unchanged;
- for the public form, the notice version is unchanged.

All of this is checked on every use (`gates.ts`). A row typed into the database, or the 0.2 script's free-text `--by`, opens nothing. The production rehearsal checks this.

## 3. Remaining failure windows and conditions

| # | Window or condition | Effect | Mitigation / what keeps it safe |
| --- | --- | --- | --- |
| W1 | **The log's retention must outlast the oldest restorable backup.** Object Lock retention defaults to 35 days, and the bucket denies bypassing it. Event objects are never expired by lifecycle | If events below a restored database's head were deleted, recovery locks as `journal-mismatch` or `gap` and needs a founder; nothing is applied wrongly | Keep `ProtectiveRetentionDays` above the point-in-time window (14 days planned) plus margin. Raise it before raising the window. Never delete event objects; the app cannot |
| W2 | **The log's write credential is as powerful as database write access.** The chain is hashed, not signed. Whoever holds the app's S3 credential could append well-formed events (for example a role change), and they would replay at the next recovery | Privilege change via replay | The credential lives only in the app's role, beside the database credential that already allows the same changes. Drills use the read-only policy (W5). Future option: a MAC on events with a key held outside the app |
| W3 | **Gates depend on the session secret.** Someone holding both database write access and the session secret could forge an approval. Rotating the secret invalidates existing approvals | Forged or lost approval | The secret is in Secrets Manager only. After rotation, re-approve the console gate in the console |
| W4 | **Records an erasure removes are readable in a restored copy until replay runs.** A restored database holds a person erased after the backup until reconciliation replays the erasure | Exposure to signed-in operators for minutes; never contact (blocked) | Run `mark-restored`, which ends all sessions, then "Verify and replay now" **before** anyone signs in. The worker does it within five minutes regardless. Erased data also persists in provider backups until they age out of the window ("backups expire within N days") |
| W5 | **A drill copy must never write to the production log.** It would append events that production replays, for example a drill erasure of a real person | Wrong changes in production | Give drill copies the template's `ProtectiveLogReadOnlyPolicy`. Reconciliation needs only reads, and any protective change in the copy then fails closed. Never give a drill the app policy |
| W6 | **Non-protective data newer than the backup is lost.** Interactions, drafts, notes, tasks, and cases: the provider's ordinary restore point | Lost work, not lost protection | Re-enter from the exception cases and correspondence. This is what the point-in-time window is for |
| W7 | **Log outage blocks contact and protective changes.** While S3 is unreachable, contact paths and new opt-outs, erasures, and deactivations are refused | Availability, not safety. People asked to be removed must be honoured as soon as it returns | The status endpoint returns 503 with `sink-unavailable`. Record requests in an exception case and enter them when the log returns. Opt-out handling stays a priority in the runbook |
| W8 | **Re-authentication depends on Cognito honouring `prompt=login` and `max_age=0`.** If managed login reuses its session, `auth_time` stays old and approval is refused (fails closed) | Founder cannot approve until they sign out of the managed login | Verify on staging (`staging-acceptance.md` A4) |
| W9 | **The local demo's guarantees are weaker.** The demo uses a local file log, and its in-memory identity store does not journal | None for real data: the demo is synthetic only | Production configuration requires the S3 log; `check-config` refuses without it |
| W10 | **Stopping the old database during a cut-over.** If the old database keeps serving after a restore switches traffic, it may append events the new one has not seen | The new one detects them as "behind" and replays them | Stop or isolate the old instance first; the gate catches what slips through |

## 4. How it was tested

| Scenario | Where |
| --- | --- |
| Log write fails → nothing changes, error shown | `protective.test.ts`, `recovery.test.ts` (PG) |
| Crash after the log write, before the commit | `protective.test.ts` (`failNextCommitAfterLog`), `recovery.test.ts` (`afterLog` hook on real PG) |
| Restore from before an opt-out and an erasure; from after; with an operator deactivated or demoted after the backup | `protective.test.ts`, `recovery.test.ts` (PG `CREATE DATABASE … TEMPLATE` clones) |
| Lift after backup is not replayed (log and ledger) | `protective.test.ts` |
| Interrupted, concurrent, duplicate, missing, tampered, re-chained, reordered history | `protective.test.ts`, `recovery.test.ts` |
| Provider restore with nothing to replay is still verified; integrity lock not downgraded | `protective.test.ts` |
| Through the real AWS SDK: conditional create, checksum, 412 conflict, unreachable and hung endpoints | `s3Sink.test.ts` |
| Production build with the S3 adapter: gate signed and journaled to S3, checkpoint written, log outage → 503 and nothing dispatched | `npm run rehearse:flight-deck` |
| Browser: opt-out and erasure advance the head; founder verification | `npm run e2e:flight-deck` (file store and PostgreSQL) |

Not tested here: real S3 Object Lock, IAM policies in effect, a provider point-in-time restore, or Cognito re-authentication. Those are the staging drills.
