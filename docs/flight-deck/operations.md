# Flight Deck: operating model and runbook (0.2.1)

Status: **Proposed working practice for founder review.** Supersedes the 0.2 version of this file.
Revision date: 2026-10-18.

The design target is about four hours of founder attention a week. The software prepares, reminds, records, and keeps going on a schedule; people decide.

## 1. Local demo

```
npm run dev:flight-deck              # http://localhost:3100/flight-deck and /pilot (JSON file store)
npm run dev:flight-deck -- --pg      # the same, on a local PostgreSQL (the production adapter)
npm run dev:flight-deck -- --outbox  # also write dry-run messages to .flight-deck/outbox/
```

Choose a test identity. Health → Reset to synthetic seed restores the fixtures. Everything shown is invented; addresses use the reserved `.invalid` domain.

## 2. The weekly cycle

Open **Now** first: alerts (worker, failed jobs, overdue cases), the five most pressing actions (lateness, then your priority, then due date; never a judgment about a person; exceptions come before ordinary work at the same lateness), approvals waiting, replies, commitments due within two days, blockers, and what continues without you. Then **Weekly review**: the four blocks (approvals 30 min, conversations 90 min, exceptions and permissions 60 min, progress and strategy 60 min), the digest, and *Mark this week's review complete*.

## 3. What runs without you

With the schedule enabled, every five minutes the worker runs due jobs (none are sent without a provider, so approved messages become "ready to send by hand"), opens retention and expired-approval tasks, raises overdue cases, and writes a reconciliation checkpoint. Before any of that, it checks the database against the protective log and repairs a database that is behind (§6). It does not decide anything. Opt-outs take effect the moment they are recorded, by anyone. If the worker stops, the status endpoint and the CloudWatch alarm say so, and Now shows the alert next time anyone looks.

## 4. Everyday flows

As in 0.1 (inquiry → triage → reply from template, placeholders filled → review → approve exact version → send by hand and record; researched contact → basis reviewed → one approved first message; at most one follow-up), plus:

- **Anything unusual is a case** (Exceptions): material sent by mistake, opt-outs, deletion and access requests, complaints, mistaken submissions, lost messages, doubtful contacts, incidents. See `exception-procedures.md`. Most cases hold outreach to the person until resolved.
- **The public form asks only for short details and fixed topic choices**: there is nowhere to type an account. Anything sent another way is handled under exception procedure 1.

## 5. People and access (production)

- **Adding an operator**: create them in the Cognito pool (they enrol MFA on first sign-in), add them to the `flight-deck` group, then `npm run flight-deck:admin -- add-operator --email … --name … --role operator`.
- **Removing access**: Health → Operators → Deactivate. Every session ends immediately, and the deactivation is written to the protective log so a restore cannot undo it. If the log is unreachable, the sessions still end but Health says the deactivation is not durable: repeat it when the log returns. Also disable them in Cognito.
- **Changing a role**: Health → Operators. Takes effect on their next request.
- **Lost device / suspected compromise**: Deactivate (or *Sign out everywhere*), reset MFA in Cognito, open an incident case.

## 6. Recovery: restores, drills, and the protective log

Guarantees and their limits: `recovery-guarantees.md`. Staging drills: `staging-acceptance.md` stage D.

**What happens without you.** Before it does anything else, every worker run compares the database with the protective log:

- **Database behind the log** (after a restore, or a crash between a log write and its commit): contact stops. The worker replays the missing opt-outs, erasures, deactivations, role changes, and gate approvals, verifies the result, and carries on, usually within one run.
- **Log unreachable**: contact and new protective changes are refused until it returns. The status endpoint returns 503 with `sink-unavailable`.

**When Health says "Contact blocked".**

| Reason | Meaning | What to do |
| --- | --- | --- |
| `journal-ahead`, `restore-in-progress` | The database is missing events the log has | Nothing; the worker repairs it. Or press **Verify and replay now** (founder) |
| `sink-unavailable` (not stored) | The log cannot be reached | Check the AWS status, the app's role and policy, and the bucket. Record any opt-out or deletion request in an exception case meanwhile, and enter it when the log returns |
| `journal-mismatch` | The database's latest event does not match the log | Treat as an incident. Were events deleted, or was the app pointed at a different bucket or prefix? Correct the configuration, then Verify and replay |
| `journal-integrity` | The log failed verification (missing, altered, or reordered event) | **Incident.** Do not clear it until you know why. Compare the bucket's object versions (Object Lock keeps them), restore the original versions, then Verify and replay. Only a founder can clear it |

**Lifted opt-outs after a recovery.** Health lists any opt-out that had been lifted after the backup. It is back in force. Confirm the lift again only if the person asked; otherwise leave it.

**Planned restore (real or drill).**

1. Restore the provider's backup or point in time into a **new** database. Never restore over the live one.
2. For a **drill**, point a separate copy of Flight Deck at it with the **read-only** log policy and no worker schedule. A drill copy must never be able to write to the production log.
3. Run `npm run flight-deck:admin -- mark-restored` against the restored database. This locks contact until it is verified and ends every session.
4. Health → **Verify and replay now**, before anyone else signs in, so records erased after the backup are gone before anyone can read them. Then check:
   - erased people are absent;
   - suppressed addresses are blocked;
   - lifted opt-outs are awaiting confirmation;
   - the gates verify;
   - the status is 200.
5. For a real restore: stop the old instance, switch the database URL, and confirm verification once more. Record the restore as an incident case.

Work done after the backup that is not protective is lost to the restore and must be re-entered by hand from the cases and correspondence. Examples: notes, drafts, tasks.

**Checkpoints.** After each run the worker also writes `checkpoints/{seq}.json` to the log bucket: the restore ledger, with suppressions as keyed hashes and erasures as ids. It is a reconciliation checkpoint. `replay-ledger` can re-apply it if the event log itself were ever unusable, and like reconciliation it never re-applies a lift. `export-snapshot` / `import-snapshot` give a provider-independent logical copy for drills. On a real database the copy contains personal data, so store it encrypted and delete it afterwards. `import-snapshot` locks contact like `mark-restored`.

**Log housekeeping.** Event objects are never deleted. At pilot volume the log stays in the kilobytes to low megabytes. If it ever needs compacting, that is a designed change, not an operation: the database's head must always have its event in the log.

## 7. Secrets rotation

Worker and monitor tokens: rotate in Secrets Manager, redeploy the app, and update the EventBridge connection or monitor. The session secret: rotating it signs everyone out of in-progress sign-ins, invalidates open form tokens (people reload the page), and **invalidates launch-gate approvals**, which are signed with a key derived from it. Re-approve the console gate at `/flight-deck/gates` straight after rotating. The **email-hash pepper must not be rotated** without a planned re-keying of suppressions; losing it means opted-out addresses are no longer recognized.

## 8. Pausing and incidents

Health → Pause all outbound activity (anyone; founder resumes). For anything that went wrong, open an incident case: it can pause at the same time, and walks through containment, assessment, a notification decision, and resumption.

## 9. When the founder is unavailable

Operators keep relationships current, prepare drafts, open and work cases, and record opt-outs (effective immediately). Nothing leaves without an approval, and approvals expire after 14 days unused (the worker turns expired ones into re-review tasks). Founder-only items wait and surface as alerts: resuming after a pause, erasure, resolving complaints, sensitive disclosures, and incidents. A named second reviewer, once appointed, can approve in the founder's absence.
