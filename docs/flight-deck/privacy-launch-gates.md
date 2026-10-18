# Flight Deck: privacy and launch gates

Status: **Proposal for founder and legal review. Nothing here is a finalized legal policy.** The public form must stay closed until every gate in §5 is met and recorded.
Revision date: 2026-10-18 (0.2: free-text note removed. 0.2.1: gates approved in the console by a verified founder; protective event log).

## 1. Data inventory (prospective contacts only)

| Data | Source | Why | Where in 0.1 | Retention (proposed) |
| --- | --- | --- | --- | --- |
| Name or form of address | Form, or manual entry | Address the person | Operations store | 12 months after last activity for inquiries without a conversation; reviewed while a relationship is active |
| Email address | Form, or a published business contact | Reply | Operations store; keyed hash in suppressions | Same; the hash in a suppression is kept while the opt-out must be honoured |
| Participation interest (self-described) | Form | Route the inquiry | Operations store | Same |
| Organization, broad region (optional) | Form, or manual | Context | Operations store | Same |
| Topics to talk about, chosen from a fixed list of six (optional). 0.2 removed the free-text note | Form | Prepare the conversation | Operations store | Same |
| Notice and form versions, timestamps, referral tag | System | Prove what was shown and agreed | Operations store | Same as the permission it supports |
| Contact permission (purpose, basis, exact wording, version, time, state) | Form, or founder review | Show the basis for every message | Operations store | Life of the relationship, plus a short evidential period to be set by counsel |
| Interaction summaries | Staff | Continuity | Operations store | Same as the prospect |
| Source evidence link and reason (researched contacts) | Staff | Legitimate-interest record | Operations store | Same |
| Audit events | System | Accountability | Operations store (insert-only) | Proposed 24 months; contains no personal text |
| Protective events (opt-outs, lifts, erasures, operator changes, gate approvals) | System | A restore must never undo them | Separate S3 bucket, Object Lock (not provisioned) | Kept while any backup could need them: at least the backup window plus margin (default 35 days of locked retention; objects are not deleted automatically). Opaque ids, keyed email hashes, codes, and times only: no name, address, or text |
| Aggregate form counters | System | Abuse monitoring | Operations store | Proposed 24 months; no identifiers |
| Client network address | Request | Rate limiting | **In memory only, as a keyed hash; never stored** | Minutes |

Not collected, by design: recordings, stories, testimony, files, images, identity documents, cultural material, precise location, birth dates, ethnicity, or any special-category data. The form instructs people not to send these, and the server refuses files and links.

## 2. Proposed privacy notice (draft text, version `pilot-privacy-draft-0.2`)

The exact text is in `src/lib/flightDeck/pilotCopy.ts` and is shown on `/pilot` **only** while the form is open (local demo). It covers: what is collected; what it is used for; what submitting is *not* (not consent to collect, preserve, or publish; not public naming; not confirmation of authority); where it is kept and who sees it (provider and location to be named before launch); how long it is kept (proposed); what happens to material sent anyway (deleted, not kept, and the person told); and choices (access, correction, deletion, stop contact; updates unsubscribe does not block a reply). Each permission stores the exact checkbox wording and this version string, so a changed notice requires a new version.

## 3. Questions for legal review

1. **Jurisdictions.** Which apply, given TIRO's location, the US-proposed charity structure (`docs/501c3.txt`, not yet incorporated), a Nigeria-focused pilot under consideration, and contacts who may be in the EU/UK? Candidates include the Nigeria Data Protection Act 2023, the GDPR/UK GDPR, and US state laws. Is a representative or registration needed anywhere?
2. **Lawful basis.** Is consent (the reply checkbox) or legitimate interest the right basis for replying to an inquiry? For researched institutional contacts, is legitimate interest available, and what balancing record is required? Is the one-follow-up rule sufficient?
3. **Electronic marketing.** Do one-to-one institutional introductions fall under unsolicited-communication rules (for example PECR in the UK, CAN-SPAM in the US) in the relevant jurisdictions? What identification and opt-out wording is required in every message?
4. **Notice wording.** Is the draft sufficient and plain enough? Must it name the controller entity? (No legal entity exists yet; who is the controller in the meantime?)
5. **Retention.** Are the proposed periods appropriate? How long must a suppression record and its evidence be kept?
6. **Processors and transfers.** Which processor terms (DPA) are required for the chosen database, email, and hosting providers, and are cross-border transfer mechanisms needed?
7. **Subject requests.** Response deadlines, identity verification for requests, and how to handle a request from someone who claims to act for a community.
8. **Children.** Should the form state a minimum age or require confirmation of adulthood?
9. **Separation of consents.** Confirm the wording keeps contact consent clearly distinct from any future cultural/archival consent.

## 4. Vendor and territory questions (for each provider chosen)

Data location and transfer path; sub-processors; encryption at rest and in transit; access controls and audit logs; backup frequency, retention, and restore testing; deletion on request (including from backups, with stated expiry); breach notification terms; DPA availability; cost at expected volumes; account ownership (TIRO-controlled, not personal); exit and export path.

## 5. Gates before real forms or real contacts

All must be met, with dated evidence, before a real contact is entered or the public form is opened. Software enforces the last two lines. Both gates are approved only at `/flight-deck/gates`, by an active founder who signed in through Cognito with MFA within the last 10 minutes; each approval is signed by the server, written to the protective log, and re-checked every time it is used. The public-form approval is additionally refused while the notice version contains "draft", before the console gate, and without a reference to the founder's separate written authorization. That written authorization stays outside Flight Deck and is still required.

Built in 0.2 (prepared, tested locally, not provisioned):
- [x] A production adapter for the store contract (PostgreSQL), passing the integration suite against real PostgreSQL.
- [x] Durable, shared rate limiting (PostgreSQL).
- [x] Identity adapter for a dedicated Cognito pool with named operators, server-side sessions, and revocation.
- [x] Exception procedures (sensitive material, opt-out, deletion, access, complaints, incidents) as tracked cases.
- [x] Restore ledger and replay procedure.

Built in 0.2.1 (prepared, tested locally, not provisioned):
- [x] Protective event log written before every opt-out, lift, erasure, deactivation, role change, and gate approval commits; S3 adapter tested through the AWS SDK.
- [x] Recovery gate: no contact after a restore until the log is replayed and verified; lifts reconfirmed by a founder; tampered history locks for a founder (`recovery-guarantees.md`).
- [x] Gate approvals attributable to a verified, freshly authenticated founder.

Requiring decisions, accounts, or spending:
- [ ] Database provider and region chosen (`integrations.md` §4); provisioned in a TIRO-controlled account with TLS, encryption, backups with a stated retention window, and a successful restore drill.
- [ ] Cognito pool deployed from the template, MFA enrolment tested, founder operator added and signed in once.
- [ ] Secrets in Secrets Manager and injected by the host; `check-config` reports complete.
- [ ] Protective log bucket deployed from the template (versioned, Object Lock); app policy attached; read-only policy used for drills; restore drills passed (`staging-acceptance.md` C, D).
- [ ] Worker schedule enabled and the alarm subscribed; status endpoint monitored.
- [ ] Privacy notice reviewed by counsel, controller named, version bumped without "draft", and published.
- [ ] Retention periods approved; a deletion request run end to end on staging.
- [ ] Communications rules reviewed for introductions and follow-ups; message footers approved.
- [ ] Manual accessibility test of `/pilot` and `/flight-deck` performed and recorded (`manual-tests.md`).
- [ ] Human-paced founder review timed and recorded (`manual-tests.md`).
- [ ] A named backup operator appointed before any unattended collection; an independent reviewer before relying on dual control.
- [ ] Founder approves the console gate at `/flight-deck/gates` after a fresh MFA sign-in.
- [ ] Separately, in writing: the founder authorizes opening the public form, then approves the public-form gate at `/flight-deck/gates`, citing that authorization.

None of these is met today. **This is not collection readiness**: real testimony remains subject to the separate gates in `collection-readiness-future.md` and `docs/ethos.txt` §6.1.
