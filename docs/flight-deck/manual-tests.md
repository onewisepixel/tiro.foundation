# Flight Deck: manual acceptance still to perform (0.2.1)

Status: **Not performed.** Automated checks cannot replace these. Each must be run by a person, and its result recorded here (date, who, device, outcome, issues) before launch.
Revision date: 2026-10-18. Supersedes the 0.2 version of this file.

## 1. What can be done locally, and what needs something real

| Check | Local, now | Needs a real account, device, service, or reviewer |
| --- | --- | --- |
| Domain rules, recovery gate, restore from earlier backups, tampered history | **Done**: 452 unit, 22 PostgreSQL tests | — |
| S3 log adapter (conditional writes, checksums, outage, timeout) | **Done** against an S3-compatible test server | Real S3 with Object Lock and IAM: **AWS account** (`staging-acceptance.md` C) |
| Production build, TLS-only database, gates, status, worker | **Done**: rehearsal 34 / 34 | Hosted PostgreSQL, real Cognito: **AWS account, spending** (A, B) |
| Provider point-in-time restore + recovery | Simulated with PostgreSQL clones | **Provider + AWS** (D) |
| Scheduled worker, alarm, uptime monitor | Worker endpoint tested | **EventBridge, SNS, a monitor service** (E) |
| MFA sign-in and re-authentication for gates | Token verification tested with real RSA keys | **Cognito + a phone authenticator** (A3 to A6) |
| CloudFormation template | `cfn-lint` clean; structural tests | `validate-template` and a deploy: **AWS credentials** (A1) |
| Automated accessibility (axe, keyboard reachability, reflow) | **Done** on 11 page states | — |
| Screen readers and phones | — | **Real devices and a tester**, ideally one who uses assistive technology daily (§2) |
| Founder weekly review at human pace | Kit ready (§3) | **The founder's time** (or a colleague who has not seen the code) |
| Privacy notice, lawful basis, retention | Draft and questions (`privacy-launch-gates.md`) | **Counsel** |
| Dual control | Reviewer role built | **An independent reviewer**, once appointed |

## 2. Assistive-technology test (not performed)

**Who.** Preferably someone who uses a screen reader daily. Otherwise the founder, following the protocol exactly. Note which it was: findings from a daily user count for more.

**Setup.** Use the local demo (`npm run dev:flight-deck`, then Health → Reset) or staging. Devices and assistive technology are as in `docs/design/accessibility-manual-test.md`:

- iPhone with VoiceOver;
- Android with TalkBack;
- Mac with VoiceOver;
- Windows with NVDA;
- keyboard only;
- 200% and 400% zoom;
- reduced motion;
- forced colours.

Cover at least **one phone and one desktop screen reader**.

**Tasks.** Each is a task, not a page tour. Write down what was announced, where you got stuck, and how long it took.

| # | Task | Pages | Pass when |
| --- | --- | --- | --- |
| 1 | Send an inquiry as a member of the public (demo only: the form is closed in production) | `/pilot` | Every field, radio group, topic choice, and checkbox is announced with its label and hint. A deliberate error is announced and entries survive. The confirmation is announced. Works at 320 px and at 200% zoom |
| 2 | Find this week's most urgent item and open it | Now | Landmarks and headings let you jump; status badges read as words, not colours |
| 3 | Review and approve an outreach draft | Approvals, an outreach item | The fingerprint and "Approve this exact version" are reachable and understandable; the outcome is announced |
| 4 | Record an opt-out and confirm it took effect | A relationship, Exceptions | The outcome message is announced; you can tell the person is now blocked |
| 5 | Work a deletion request to the end | A case | Deadlines and checklist state are clear without colour; "Mark done" buttons say which step they complete |
| 6 | Check whether contact is safe after a restore (new in 0.2.1) | Health → Recovery | The status ("Verified: contact allowed" / "Contact blocked: …") is read as text, and "Verify and replay now" is reachable. Any lift-confirmation rows are understandable |
| 7 | Approve a launch gate (staging only, needs Cognito) | `/flight-deck/gates` | The statement, the checkbox, the freshness notice and "Sign in again" link, and the result are all announced |

**Record.**

| Task | Device / OS | Browser | Assistive technology and version | Pass / fail | Time | What was announced; what went wrong | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

**Severity:**

- **Blocker**: the task cannot be completed.
- **Serious**: completed only with workarounds.
- **Minor**: friction.

Blockers and serious issues are fixed before launch.

## 3. Founder-run weekly review at human pace (not performed)

The whole automated browser run, which includes the representative session, takes about 40 seconds. That says nothing about the target of **four hours of founder attention a week**. This kit measures both the session and a simulated week.

### 3.1 Preparation (5 minutes)

1. Start the demo with `npm run dev:flight-deck` and open `http://localhost:3100/flight-deck`. Choose "Continue as founder", then Health → Reset to synthetic seed.
2. Have this page open on another screen, a timer, and the timing sheet below. Do **not** read the code or the docs during the run. If you need something you cannot find, note it: that is a finding.
3. Optional: an observer who stays silent and writes down hesitations. The observer must not help.

### 3.2 The session (target: 15 minutes or less)

Work only from **Now** unless a step says otherwise.

| # | Step | Start | End | Minutes | Hesitations, or what you looked for and could not find |
| --- | --- | --- | --- | --- | --- |
| 1 | Find the newest inquiry and read its context | | | | |
| 2 | Draft a reply from the template; fill every placeholder | | | | |
| 3 | Send it for review, approve the exact version, record it as sent by hand | | | | |
| 4 | Confirm the follow-up reminder exists | | | | |
| 5 | A person asks to stop being contacted: record it | | | | |
| 6 | Open a deletion request and work it to completion | | | | |
| 7 | Check on Health that contact is verified safe after those changes | | | | |
| 8 | Open the weekly review, read the digest, mark the review complete | | | | |
| | **Total** | | | | |

### 3.3 The simulated week (four sittings, four hours in all)

Use the weekly review's four blocks as sittings, on different days if possible:

- approvals, 30 minutes;
- conversations, 90 minutes;
- exceptions and permissions, 60 minutes;
- progress and strategy, 60 minutes.

For each sitting, note the minutes actually needed, what you postponed, and anything you had to keep in your head or in a spreadsheet because Flight Deck did not hold it. Sum the minutes. Pass: under four hours, with nothing kept outside Flight Deck.

### 3.4 Afterwards

Rate how confident you are, from 1 to 5, that nothing was missed. List the three biggest frictions. Then repeat steps 1, 2, and 5 on a phone.

**Record:**

| Date | Who | Device | Session minutes | Week minutes | Confidence (1 to 5) | Top frictions |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## 4. Staging

The staging stages (real Cognito MFA, hosted PostgreSQL, the log bucket, restore drills, worker monitoring, and incident recovery) are in `staging-acceptance.md`. Record them in `acceptance.md` §7.
