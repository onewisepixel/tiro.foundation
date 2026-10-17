# Flight Deck 0.1: privacy and launch gates

Status: **Proposal for founder and legal review. Nothing here is a finalized legal policy.** The public form must stay closed until every gate in §5 is met and recorded.
Revision date: 2026-10-16.

## 1. Data inventory (prospective contacts only)

| Data | Source | Why | Where in 0.1 | Retention (proposed) |
| --- | --- | --- | --- | --- |
| Name or form of address | Form, or manual entry | Address the person | Operations store | 12 months after last activity for inquiries without a conversation; reviewed while a relationship is active |
| Email address | Form, or a published business contact | Reply | Operations store; keyed hash in suppressions | Same; the hash in a suppression is kept while the opt-out must be honoured |
| Participation interest (self-described) | Form | Route the inquiry | Operations store | Same |
| Organization, broad region (optional) | Form, or manual | Context | Operations store | Same |
| Short note, ≤ 500 characters (optional) | Form | Understand the inquiry | Operations store | Same |
| Notice and form versions, timestamps, referral tag | System | Prove what was shown and agreed | Operations store | Same as the permission it supports |
| Contact permission (purpose, basis, exact wording, version, time, state) | Form, or founder review | Show the basis for every message | Operations store | Life of the relationship, plus a short evidential period to be set by counsel |
| Interaction summaries | Staff | Continuity | Operations store | Same as the prospect |
| Source evidence link and reason (researched contacts) | Staff | Legitimate-interest record | Operations store | Same |
| Audit events | System | Accountability | Operations store (insert-only) | Proposed 24 months; contains no personal text |
| Aggregate form counters | System | Abuse monitoring | Operations store | Proposed 24 months; no identifiers |
| Client network address | Request | Rate limiting | **In memory only, as a keyed hash; never stored** | Minutes |

Not collected, by design: recordings, stories, testimony, files, images, identity documents, cultural material, precise location, birth dates, ethnicity, or any special-category data. The form instructs people not to send these, and the server refuses files and links.

## 2. Proposed privacy notice (draft text, version `pilot-privacy-draft-0.1`)

The exact text is in `src/lib/flightDeck/pilotCopy.ts` and is shown on `/pilot` **only** while the form is open (local demo). It covers: what is collected; what it is used for; what submitting is *not* (not consent to collect, preserve, or publish; not public naming; not confirmation of authority); where it is kept and who sees it (provider and location to be named before launch); how long it is kept (proposed); and choices (access, correction, deletion, stop contact; updates unsubscribe does not block a reply). Each permission stores the exact checkbox wording and this version string, so a changed notice requires a new version.

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

All must be met, with dated evidence, before `FLIGHT_DECK_PUBLIC_FORM_ENABLED` can mean anything in production, or before a real contact is entered:

- [ ] Production identity provider selected, configured with MFA, and reviewed (`integrations.md` §Identity).
- [ ] Production operations store selected, provisioned in a TIRO-controlled account, with encryption, backups, a tested restore, and the email-hash pepper held in a secret manager.
- [ ] A production adapter for the store contract implemented and passing the same test suite.
- [ ] Durable rate limiting in place.
- [ ] Privacy notice reviewed by counsel, controller named, version bumped, and published.
- [ ] Retention periods approved; a deletion runbook tested end to end.
- [ ] Communications rules reviewed for introductions and follow-ups; message footers approved.
- [ ] Email provider chosen if acknowledgements are wanted, with SPF/DKIM/DMARC for tiro.foundation, a dry run, and a transactional-only template approved.
- [ ] Manual accessibility test of `/pilot` and `/flight-deck` performed and recorded (`docs/design/accessibility-manual-test.md` protocol).
- [ ] Founder launch approval recorded, naming the operators.

None of these is met today. **This is not collection readiness**: real testimony remains subject to the separate gates in `collection-readiness-future.md` and `docs/ethos.txt` §6.1.
