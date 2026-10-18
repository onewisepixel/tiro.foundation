# Flight Deck: operating model and runbook (0.2)

Status: **Proposed working practice for founder review.** Supersedes the 0.1 version of this file.
Revision date: 2026-10-17.

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

With the schedule enabled, every five minutes the worker runs due jobs (none are sent without a provider, so approved messages become "ready to send by hand"), opens retention and expired-approval tasks, raises overdue cases, and writes the restore ledger. It does not decide anything. Opt-outs take effect the moment they are recorded, by anyone. If the worker stops, the status endpoint and the CloudWatch alarm say so, and Now shows the alert next time anyone looks.

## 4. Everyday flows

As in 0.1 (inquiry → triage → reply from template, placeholders filled → review → approve exact version → send by hand and record; researched contact → basis reviewed → one approved first message; at most one follow-up), plus:

- **Anything unusual is a case** (Exceptions): material sent by mistake, opt-outs, deletion and access requests, complaints, mistaken submissions, lost messages, doubtful contacts, incidents. See `exception-procedures.md`. Most cases hold outreach to the person until resolved.
- **The public form asks only for short details and fixed topic choices**: there is nowhere to type an account. Anything sent another way is handled under exception procedure 1.

## 5. People and access (production)

- **Adding an operator**: create them in the Cognito pool (they enrol MFA on first sign-in), add them to the `flight-deck` group, then `npm run flight-deck:admin -- add-operator --email … --name … --role operator`.
- **Removing access**: Health → Operators → Deactivate. Every session ends immediately; also disable them in Cognito.
- **Changing a role**: Health → Operators. Takes effect on their next request.
- **Lost device / suspected compromise**: Deactivate (or *Sign out everywhere*), reset MFA in Cognito, open an incident case.

## 6. Restore drill and real restore

Quarterly, and before launch:

1. Restore the provider's latest backup (or a point in time) into a **new** database; never over the live one.
2. Point a staging copy of Flight Deck at it; confirm it opens (`fd_meta` must say real data).
3. Run `npm run flight-deck:admin -- replay-ledger <latest ledger> --operator <founder id>`: re-applies every erasure and opt-out recorded since the backup.
4. Check: erased people are absent; suppressed addresses are blocked (Relationships, Health); counts match expectations.
5. For a real restore, only then switch the application's database URL, and record the drill or restore as an incident case.

Anything erased or opted out within one worker interval of the failure may need re-entering by hand from the exception cases. `export-snapshot` / `import-snapshot` provide a provider-independent logical copy for drills (it contains personal data on a real database: store it encrypted and delete it afterwards).

## 7. Secrets rotation

Worker and monitor tokens: rotate in Secrets Manager, redeploy the app, and update the EventBridge connection or monitor. The session secret: rotating it signs everyone out of in-progress sign-ins and invalidates open form tokens (people reload the page). The **email-hash pepper must not be rotated** without a planned re-keying of suppressions; losing it means opted-out addresses are no longer recognized.

## 8. Pausing and incidents

Health → Pause all outbound activity (anyone; founder resumes). For anything that went wrong, open an incident case: it can pause at the same time, and walks through containment, assessment, a notification decision, and resumption.

## 9. When the founder is unavailable

Operators keep relationships current, prepare drafts, open and work cases, and record opt-outs (effective immediately). Nothing leaves without an approval, and approvals expire after 14 days unused (the worker turns expired ones into re-review tasks). Founder-only items wait and surface as alerts: resuming after a pause, erasure, resolving complaints, sensitive disclosures, and incidents. A named second reviewer, once appointed, can approve in the founder's absence.
