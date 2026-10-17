# Flight Deck 0.1: operating model

Status: **Proposed working practice for founder review.** Describes how the software is meant to be used; it is not adopted policy.
Revision date: 2026-10-16.

The design target is about four hours of founder attention a week. The software prepares, reminds, and records; people decide.

## 1. Running the local demo

```
npm run dev:flight-deck            # http://localhost:3100/flight-deck  and  /pilot
npm run dev:flight-deck -- --outbox   # also write dry-run messages to .flight-deck/outbox/
```

Choose a test identity (founder, operator, reviewer). The first visit loads synthetic fixtures; **Health → Reset to synthetic seed** restores them. Everything shown is invented and labeled; addresses use the reserved `.invalid` domain. The launcher runs beside an ordinary `npm run dev`.

## 2. The weekly cycle

Open **Now** first. Within a minute and a half it answers: what progressed since the last review, the five most pressing actions (by lateness, then the priority you set, then due date; never by any judgment about a person), what awaits approval, which replies are waiting, which commitments are due within two days, what is blocked by a gate, and what continues without you.

Then open **Weekly review** (`/flight-deck/digest`) and work through four blocks:

| Block | About | Where |
| --- | --- | --- |
| Approve or revise content and outreach | 30 min | Approvals |
| Conversations with interested people and prospective partners | 90 min | Relationships (conversation scheduled / consultation) |
| Resolve permission, consultation, and operational exceptions | 60 min | Blocked list, Health, permission-review and retention tasks |
| Progress review and strategic choices | 60 min | Now, Campaigns, digest |

Copy the digest if you want a record, then **Mark this week's review complete** so the next briefing starts from that moment. Digest delivery by email is off until a provider and a schedule are approved.

## 3. Everyday flows

**A new inquiry.** It appears on Now with a triage task. Read the note on the relationship page, move it to *Ready for triage* or *Needs review* (naming the gate), and draft a reply from the template. Fill every `[placeholder]`: drafts with placeholders cannot go to review. Send for review, approve the exact version, then either queue it (held, because no provider exists) or copy it, send it from custodians@tiro.foundation, and **record as sent by hand**. A single follow-up reminder is created automatically.

**A researched institution.** Add it under Relationships with the https page where the public business contact was found, the date, and why contact is legitimate. A founder or reviewer must accept that basis (including any communications-law review) before a first message can go to review. One message, individually approved. No lists, no scraping, no automated DMs.

**A reply arrives.** Record it as an inbound interaction. Mark the sender verified only if it plainly comes from the address on record; otherwise a task asks you to confirm before acting. A reply never commits TIRO to collecting or partnering.

**No reply.** One follow-up at most (the software refuses a second). Then close.

**Content.** Drafts carry their origin (evidence, demonstration, abstraction) and source. Evidence needs a recorded asset permission. Campaign-linked posts publish only while the campaign is active and within its weekly limit. Without a connected platform, copy the approved text, post it by hand, and record it with the post's link.

## 4. Consent, opt-out, deletion

- **Permission to write is not consent to collect.** Every screen that shows a permission says so.
- **Opt-out takes effect immediately** (relationship page → *They asked us to stop*): queued jobs are cancelled, drafts are held even if approved, and open reply/follow-up tasks are cancelled. Scope choices: all contact, outreach only, or updates only. An updates unsubscribe does not block a reply to the person's own inquiry.
- **Deletion is a separate, deliberate step** (founder only; type ERASE). It removes the person's details, submissions, notes, interactions, tasks, and drafts. Keeping the opt-out record stores only a keyed hash so they are not contacted again. Audit events keep only opaque ids.
- **Subject access**: *Export JSON* or *Printable summary* on the relationship page. Both are audited.
- **Someone who opted out writes again**: they get the same public response, no acknowledgement is queued, and a high-priority review task appears. Lift a suppression only if they ask.

## 5. Pausing

**Health → Pause all outbound activity** stops every dispatch and manual attestation at once. Anyone may pause; only the founder may resume. Individual campaigns can also be paused.

## 6. Escalation and founder unavailability

- An operator can prepare everything, keep relationships current, and pause, but cannot approve, resume, or delete. With the founder away, prepared work waits in Approvals; nothing leaves.
- A named reviewer can approve in the founder's absence, if the founder decides to appoint one (a decision in `acceptance.md` §7). The approval records a second reviewer when one is chosen.
- Escalate a task to mark it high priority on the founder's Now board.
- If anything looks wrong (a message sent in error, a suspected breach, a complaint), pause all outbound first, then investigate from Activity and Health.

## 7. Recovery

- **Held or failed job**: Health shows the code. Fix the cause (approval, permission, campaign), then *Retry*; the same idempotency key is reused, so a retry cannot duplicate a message.
- **"Changed since you opened it"**: reload and redo the step; nothing was saved.
- **Local store damaged**: the store refuses to load a file it does not recognize. Reset to the synthetic seed. (A production store needs backups and restore tests; see `integrations.md`.)
