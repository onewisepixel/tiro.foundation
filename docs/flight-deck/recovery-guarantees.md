# Flight Deck: recovery guarantees and remaining failure windows (0.2.1, with review corrections)

Status: **Describes the code as built and tested locally.** Nothing here has run against AWS. The guarantees that depend on S3 Object Lock, IAM, or a provider's point-in-time restore are design guarantees until the staging drills in `staging-acceptance.md` have passed.
Revision date: 2026-10-19. Supersedes the 2026-10-18 version: replay is now conservative about anything that increases access (§2 G3), restored copies are detected and isolated mechanically (G7, G9), and the corrections' test results are in §4.

## 1. What is protected

Six kinds of decision are **protective events**:

- an opt-out (suppression added);
- a lift of an opt-out;
- an erasure;
- an operator deactivation;
- an operator role change;
- a launch-gate approval.

Each is written to an append-only log outside the database (`protective.ts`; production: `s3Sink.ts` and the Object Lock bucket in `deploy/flight-deck/`).

Each event carries only opaque ids, keyed email hashes, codes, and timestamps: never a name, an address, a note, or a message body. A test checks this on every kind, and the production rehearsal checks the bytes written to S3.

## 2. Guarantees

**G1. The log is written before the decision commits.** The event is appended inside the database transaction, after the change is computed and before `COMMIT`. The log's head row is locked, so appends are serialized.

- If the append fails, the transaction rolls back and the person is told "not done".
- Each S3 call is bounded at 5 seconds, retries included, inside the database's 15-second transaction limit.
- One deliberate exception: if an operator's deactivation cannot be journaled, their sessions are still ended at once, and the founder is told the deactivation itself is not durable.

**G2. A restore never yields less protection than the log records.** After any restore, every contact path refuses until the missing events are replayed and verified. Opt-outs, erasures, and deactivations made after the backup are re-applied, as are role changes that only remove capabilities.

**G3. Nothing that would increase access is re-applied from the log.** An event beyond the database's head may belong to a transaction that **never committed**, because the log is written first. So recovery re-applies an event only if it cannot increase anyone's access:

| Event | Re-applied by recovery? |
| --- | --- |
| Opt-out, erasure, deactivation | Yes |
| Role change to a role whose capabilities are a **subset** of the operator's current role (for example founder → operator) | Yes, by compare-and-set against the current role |
| Role change that adds any capability, including promotion to founder and the lateral operator ↔ reviewer changes | **No.** A founder task is opened ("redo it in Health only if still intended") |
| Suppression lift | **No.** The opt-out stays in force; founder confirmation task |
| Launch-gate approval (console or public form) | **No, ever.** A founder task is opened; the founder approves again at `/flight-deck/gates`, with a fresh MFA sign-in |

The consequence is deliberate. A gate approval or promotion that *did* commit but was lost to a restore must be made again. A failed approval can never open the console or the public form. Tested on PostgreSQL with crash injection (§4).

**G4. Broken history is never applied.** Reconciliation verifies the whole chain before applying anything: contiguous sequence numbers, each event linked to the previous hash, and each hash recomputed from content. Any failure locks contact as `journal-integrity`. Only a founder can clear that lock, and the worker never can.

**G5. Recovery is safe to interrupt.**

- Database-side events (opt-outs, erasures) and every skipped event's founder task are applied in the same transaction that advances the head by exactly one.
- Identity changes that are re-applied (deactivation, demotion) are applied first and idempotently (compare-and-set), and the head advances only afterwards. An interruption between the two makes the next run re-apply a no-op and then advance.
- Two concurrent reconcilers cannot apply the same event twice.

All of this is tested by injecting crashes at each point (§4).

**G6. A crash between the log write and the commit is caught.** The next protective write, the worker's next run, or any page or contact path sees the log ahead of the database and stops until it is reconciled. Under G3, a protection-increasing event is then honoured, and an access-increasing one is not.

**G7. A restored copy is detected without anyone being told.** Two independent signals, checked on every console request, every contact path, the status endpoint, and every worker run:

1. **The journal head.** The copy is missing an event the log holds.
2. **The restore fence.** Each healthy worker run raises a counter in the database and then copies it to the log bucket. A copy restored from before the last healthy run has a lower fence than the bucket's, so it is locked as `restore-in-progress` even when no protective event was lost.

`mark-restored` remains available for drills but is no longer required. After a cut-over, the **old** database, if still running, falls behind the new one's fence and locks itself (tested).

**G8. Launch gates are attributable.** A gate opens nothing unless all of these hold:

- its record carries a server-signed approval;
- the approver signed in through Cognito within the last 10 minutes;
- the approver is still an active founder with the same provider subject;
- for the public form, the notice version is unchanged.

All of this is checked on every use. Under G3, an approval is also never re-created from the log.

**G9. An unverified database shows nothing.** While recovery is unverified, every console page and action, and the record export, redirect to `/flight-deck/recovery` (or return 503). Unverified means locked, behind the log, behind the fence, or unable to reach the log. The recovery page shows the status and a founder's "Verify and replay now", and no records, names, or counts.

Records erased after the backup therefore cannot be read from a restored copy before the replay has removed them. When verification succeeds, **every session is ended**, so none signed out after the backup survives. Tested in the production rehearsal against the production build (§4).

## 3. Remaining failure windows and conditions

| # | Window or condition | Effect | Mitigation / what keeps it safe |
| --- | --- | --- | --- |
| W1 | **The log's retention must outlast the oldest restorable backup.** Object Lock retention defaults to 35 days, and the bucket denies bypassing it. Events are never expired by lifecycle | Events below a restored head deleted → `journal-mismatch`/`gap` lock; nothing applied wrongly | Keep `ProtectiveRetentionDays` ≥ the point-in-time window + 21 days. Any long-lived **manual** snapshot needs protection history at least as old as the snapshot: delete such snapshots or raise retention |
| W2 | **The log's write credential.** Whoever holds the app's S3 credential could append well-formed events. Under G3 these can no longer raise privileges or open a gate, but they could still erase a record or opt someone out at the next recovery | Destructive but not access-expanding | The credential lives only in the app's role, beside the database credential that already allows the same. Drills use the read-only policy (W5). Future option: a MAC on events with a key held outside the app |
| W3 | **Gates depend on the session secret.** Database write access plus the session secret could forge an approval. Rotation invalidates existing approvals | Forged or lost approval | The secret is in a secret manager only. Re-approve after rotation |
| W4 | **Lost legitimate increases.** A promotion, lift, or gate approval that committed but was lost to a restore is not restored (G3) | Founder redoes it from the task | Intended: fail closed |
| W5 | **A drill copy must never write to the production log** | Production would replay drill events | Read-only log policy for drills (template `ProtectiveLogReadOnlyPolicy`); protective changes in the copy then fail closed |
| W6 | **Non-protective data newer than the backup is lost** (interactions, drafts, tasks, cases): the provider's ordinary restore point | Lost work, not lost protection | Re-enter from cases and correspondence |
| W7 | **A log outage takes the console offline**, not only contact: reads are refused because an unverified copy cannot be told apart from the live one | Availability. Opt-out and deletion requests must be recorded when the log returns | Status endpoint 503 `sink-unavailable`; record requests in the incident record and enter them afterwards. S3's availability makes this rare. This is the price of G9 |
| W8 | **Re-authentication depends on Cognito honouring `prompt=login` and `max_age=0`** | Fails closed (approval refused) | AWS documents `prompt` for managed login only, not the classic hosted UI. Moving the staging domain to managed login (`managed-login.md`) is what makes this work; verify on staging (`staging-acceptance.md` A4, `managed-login.md` §5 R) |
| W9 | **The local demo's guarantees are weaker**: a local file log; the in-memory identity store does not journal | None for real data | Production configuration requires the S3 log |
| W10 | **The fence's resolution is one healthy worker run.** A copy restored to a point after the last healthy run (at most five minutes old), which also lost no protective event, cannot be told apart from the live database. It holds no record erased since (an erasure would be in the log), so nothing is exposed beyond what the live database holds. A session signed out within those minutes would survive until its idle limit (60 minutes) | Small, bounded | Run `mark-restored` in drills, or for any restore to a very recent point. Restoring to a new instance or branch changes the connection string, so it needs a redeploy, which the runbook pairs with verification |
| W11 | **The fence needs the worker.** With the schedule disabled (before the console gate), only the journal head detects restores | Restores with nothing lost go undetected until the schedule runs | Enable the schedule with the console gate (activation checklist D). The status endpoint alarms if the worker is stale |

## 4. How it was tested

| Scenario | Where | Result |
| --- | --- | --- |
| Log write fails → nothing changes, error shown | `protective.test.ts`, `recovery.test.ts` (PG) | Pass |
| Crash after the log write, before commit: an opt-out is honoured | both | Pass |
| **Crash injection: a role elevation that failed to commit never takes effect;** founder task opened; head advances exactly once | `recovery.test.ts` (PG) | Pass |
| **Crash injection: failed console and public-form approvals never open anything;** a new protective write is refused until recovery runs; a proper re-approval works | `recovery.test.ts` (PG) | Pass |
| **Crash injection: identity replay interrupted after applying, twice;** the head does not move; the final state is correct; the head advances once per event; a re-run is a no-op | `recovery.test.ts` (PG) | Pass |
| **Crash injection inside the transaction that skips an access-increasing event:** neither task nor head move survives; the re-run produces exactly one task | `recovery.test.ts` (PG) | Pass |
| Restore from before an opt-out, an erasure, a deactivation, a demotion, a lateral role change and a gate approval: the first four re-applied, the last two left as founder tasks, every revived session ended | `recovery.test.ts` (PG clones) | Pass |
| **Restore fence:** a copy restored from before the last healthy run, with no event lost, is locked without `mark-restored`, refuses contact, is verified by the worker by itself, ends sessions; the old database then locks itself | `recovery.test.ts` (PG), `protective.test.ts` | Pass |
| Role-change rule: only capability subsets are reductions | `protective.test.ts` | Pass |
| **Recovery isolation on the production build:** with the restored copy's fence behind, every console page (including a relationship page) redirects to the recovery page; export returns 503; the recovery page shows no record; the monitor reports `restore-in-progress`; the worker verifies; the copied session no longer works | `npm run rehearse:flight-deck` | Pass |
| Interrupted, concurrent, duplicate, missing, tampered, re-chained, reordered history | `protective.test.ts`, `recovery.test.ts` | Pass |
| S3 adapter through the AWS SDK, including the fence object | `s3Sink.test.ts` | Pass |
| Browser: opt-out and erasure advance the head; founder verification lands on the recovery page | `npm run e2e:flight-deck` (file store and PostgreSQL) | Pass |

Not tested here: real S3 Object Lock, IAM policies in effect, a provider point-in-time restore, or Cognito re-authentication. Those are the staging drills.
