# Flight Deck: manual tests still to perform

Status: **Not performed.** Automated checks cannot replace these. Each must be run by a person and its result recorded here (date, who, device, outcome, issues) before launch.
Revision date: 2026-10-17.

## 1. Manual accessibility (not performed)

Automated coverage so far: axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on eleven page states, including light theme, with no violations of any severity after one contrast defect was fixed; keyboard reachability of the skip link; labels on every form control; announced errors and focus moved to outcomes; no horizontal overflow at 390 px. Automation does not show whether the pages are usable with real assistive technology.

Use the protocol in `docs/design/accessibility-manual-test.md`, applied to:

| Flow | Pages | What to confirm |
| --- | --- | --- |
| Public inquiry | `/pilot` | Form completes with keyboard only; with NVDA (Windows) or VoiceOver (macOS/iOS), every field, radio group, topic group and checkbox is announced with its label and hint; a validation error is announced and entries survive; the confirmation is announced; 200% zoom and 320 px reflow; reduced motion; both themes |
| Founder review | `/flight-deck`, a relationship, Approvals, an outreach draft | Navigation landmarks; the approval fingerprint and the "Approve this exact version" button are reachable and understandable; status badges read as words, not colours |
| Exceptions | Open a case, a case, the redaction tool | The case kinds and their deadlines are announced; checklist state is clear without colour; "Mark done" buttons have distinguishable context |
| Mobile | Now, Approvals, a case | iOS VoiceOver and Android TalkBack on a physical phone; touch targets; no trapped focus in the sub-navigation |

Record: date, tester, assistive technology and version, browser, outcome per flow, issues with severity.

## 2. Human-paced founder review (not performed)

The automated browser run completes the representative session in about 10 seconds; that says nothing about the four-hour weekly target. Measure it:

1. Reset the local demo (`npm run dev:flight-deck`, Health → Reset).
2. A person who has not seen the code, ideally the founder, starts a timer and works from the Now board only:
   - find the newest inquiry and read its context;
   - draft a reply from the template and fill the placeholders;
   - send it for review, approve the exact version, and record it as sent by hand;
   - confirm the follow-up reminder exists;
   - open and work a deletion-request case to completion;
   - open the weekly review, read the digest, and mark the review complete.
3. Record: total minutes, each step's minutes, every moment of hesitation or confusion, and anything they looked for and could not find.

Target: the representative session in **15 minutes or less** without help or a spreadsheet. Repeat on a phone.

## 3. Production rehearsal on real infrastructure (not performed)

The local rehearsal (`npm run rehearse:flight-deck`) proves the production build's gates against a TLS-only PostgreSQL, but with a fictitious Cognito pool. After the pool exists, on staging:

- sign in with a real operator account, including MFA enrolment, and sign out (the session must end on the server);
- deactivate a second test operator while they are signed in; their next click must fail;
- complete the restore drill in `operations.md` §6 against the chosen provider's point-in-time restore;
- enable the worker schedule for a day and confirm runs, the status endpoint, and the alarm (by deliberately breaking the worker token once).
