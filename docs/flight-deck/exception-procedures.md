# Flight Deck: exception procedures

Status: **Proposed procedures for founder review**, implemented as checklists in Flight Deck (Exceptions). Deadlines are proposals pending legal review (`privacy-launch-gates.md` §3), not legal commitments.
Revision date: 2026-10-17.

These are the situations that must never drift into ordinary outreach. Each is opened as a **case** (Exceptions → Open a case, or from the person's page). A case sets a deadline and a checklist, and for most kinds holds all outreach to the person until it is resolved. **A case records what was done, never what anything said.** Write "email with an attachment; not opened; deleted", not a description of the attachment.

## 1. Sensitive or unsolicited material (deadline: 2 days; holds outreach; founder resolves)

Someone sends a story, recording, photograph, document, sacred or restricted knowledge, identity documents, or anything else sensitive, by email, post, a social message, or by typing it into a field.

1. **Stop.** Do not open further, forward, download, transcribe, summarize, translate, upload, or describe it. Do not paste any of it into Flight Deck.
2. **Remove it.** Delete it from the mailbox, including deleted items and any copies, and from any device or system it reached. Do not keep a copy "just in case".
3. **Redact Flight Deck.** If any part reached a Flight Deck field (a name, organization, region, contact reason, or interaction summary), use the case's redaction tool. The audit trail records that a field was redacted, not what it held.
4. **Tell the person** with the case's template: it was removed and not kept, and nothing about their inquiry changes.
5. **Founder review**: anything else needed? For example, the material concerns other people, a minor, or a safety risk; escalate to counsel.

Never automatically process, classify, transcribe, or preserve such material, including with AI tools. Flight Deck has no upload or attachment field, and none may be added.

## 2. Opt-out or unsubscribe (deadline: 2 days)

Opening the case **applies suppression immediately**: queued messages are cancelled, approved drafts are held, open reply and follow-up tasks are cancelled. Choose the scope: all contact, outreach only, or updates only (an updates unsubscribe does not block a reply to the person's own inquiry). Then confirm to the person unless they asked for no reply, and decide whether to keep the record or erase it. The opt-out record (a keyed hash) is kept either way.

## 3. Deletion request (proposed deadline: 30 days; holds outreach)

1. **Verify** the request came from the address on record. Never ask for identity documents by email; if it came from elsewhere, reply to the address on record to confirm.
2. If they also asked for a copy, **send the export first** (relationship page → Export JSON).
3. **Erase** (founder, relationship page). This completes the case's erase step automatically and unlinks the case from the person. A keyed opt-out record remains so they are not contacted again, and an erasure tombstone goes to the restore ledger.
4. **Confirm** the deletion with the template, stating any backup expiry window once the provider's is known.

## 4. Request for a copy (proposed deadline: 30 days)

Verify as above, generate the export, check it contains only this person, and send it only to the address on record.

## 5. Complaint (deadline: 5 days to a substantive reply; holds outreach; founder resolves)

Acknowledge without arguing; read Activity for what happened; the founder decides the response and any change to practice; respond plainly with what happened and what changes.

## 6. Mistaken submission (7 days; holds outreach)

Filled in by mistake, for someone else, or with wrong details. Confirm with the person if it is safe to write to them; correct the record or erase it.

## 7. Lost or undelivered message (3 days)

Identify the message, recipient, and time from Activity; confirm the person has not opted out since; re-send through normal approval or record why not.

## 8. Doubtful researched contact (5 days; holds outreach)

Wrong person, a personal rather than business address, unclear relevance, or a contact who objects to having been researched. Re-check the source evidence and reason; accept or reject the basis on the relationship page; erase if rejected.

## 9. Operational incident (1 day; founder resolves)

A message sent in error, suspected exposure of data, a compromised account, or a system fault.

1. **Pause all outbound activity** (the case can do this when opened).
2. **Contain**: deactivate an operator (revokes every session at once), sign everyone out, disable the worker schedule, rotate a secret.
3. **Assess** which records and people could be affected (Activity, Health, database logs at the provider).
4. **Founder decides**, with counsel where needed, whether anyone must be notified and within what time limit.
5. **Resume** only when safe, and record what changes.

## When the founder is unavailable

Operators can open every kind of case and complete steps; opt-outs take effect immediately without the founder. Complaints, sensitive disclosures, and incidents wait for the founder to resolve, and their deadlines surface as alerts and overdue tasks. Anyone may pause outbound activity; only the founder resumes it.
