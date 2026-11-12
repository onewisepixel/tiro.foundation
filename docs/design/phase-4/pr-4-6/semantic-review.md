# PR 4.6: consequential and authorization screens, semantic review

**Status: proposed. Not accepted; implementation is not authorized.** This review changes no CSS or TSX. It returns to the founder and Veris for acceptance before any implementation.

- **Branch:** `phase-4/authority-4-6`, from `main` at `d535e68` (PR #31, Phase 4.5, merged; post-merge CI passed).
- **Plan:** `docs/design/milestone-3.0-phase-4-flight-deck.md`. The relevant parts are §2 (presentation direction), §3 (protected boundary), §6 (PR 4.6 scope) and §7 (Gate G4).
- **Date:** 2026-11-11.

The question for each screen is whether it shows the **actual** state and authority of each action, without adding an interpretation of its own. Presentation can make a true state easier to read. It must never make an action look granted, approved, verified or safe before the existing checks establish it (plan §3.4).

The comparison sheets, captures and scripts are outside the repository, in `C:\tiro\dev\evidence\phase-4-6\` (§3, §9).

## 1. Inventory

### 1.1 The five screens

| Screen | Who reaches it | Served when |
| --- | --- | --- |
| **Approvals** (`approvals/page.tsx`) | Every signed-in role | Console runtime present, signed in, recovery verified (`requirePage`) |
| **Health** (`health/page.tsx`) | Every signed-in role | As Approvals. While recovery is unverified, Health redirects to Recovery, so it only ever renders with recovery verified |
| **Recovery** (`recovery/page.tsx`) | Anyone, including signed out | Whenever a console runtime exists. While recovery is unverified, it is **the only console page served**: every other page and action redirects here (`guard.ts`) |
| **Gates** (`gates/page.tsx`) | Signed-in operators; only a founder can act | **Production mode only.** 404 in the local demo for every role (verified: §2.3). It works before the console gate exists (bootstrap runtime) |
| **Sign-in** (`sign-in/page.tsx`) | Signed out | Local demo: three synthetic test identities. Production: one link to the identity provider (Cognito, with MFA) |

### 1.2 The kinds of statement and control

These five screens use five different kinds of statement. Most of the findings in §4 come from two kinds sharing one visual form.

| Kind | Meaning | Where |
| --- | --- | --- |
| **Permission** | What this role may do here | "Your role can see this queue but cannot decide." · "Only the founder can resume." · "Only a founder can approve launch gates." · role descriptions on sign-in |
| **Approval** | A recorded decision on an exact version, or a gate approval | Approvals: "Approve this exact version", fingerprint. Gates: "Approved by … on …", "Not valid: …", "Not approved" |
| **Readiness** | Whether something is configured or available | Health "What is live": Live / Off / Local only. Gates: "Approve the console first", privacy notice still a draft |
| **Safety restriction** | Something that stops contact, whatever was approved | Health: recovery status, "Paused" (outbound). Recovery: every lock reason. Suppressions |
| **Completion** | Something that happened | Notices ("Recovery verified…", "Recovery did not complete…"), worker runs, jobs |

### 1.3 Consequential controls

Visibility is what each role is shown, from the census baseline and this review's runs (§2). The server checks every action again; these rows are presentation.

| Screen | Control | Tone | Shown to | Consequence statement on screen |
| --- | --- | --- | --- | --- |
| Approvals | Approve this exact version | primary | founder, reviewer (`can approve`) | Per item: "Approving permits this exact … once. Any edit voids it." (and content and campaign variants); page foot: "Approval never sends or publishes…" |
| Approvals | Request revision / Reject | default / danger | founder, reviewer | Same |
| Approvals | Second reviewer (optional) select | — | founder, reviewer | — |
| Health | Verify and replay now | default (primary when not verified; never on Health, which only renders verified) | founder | Section lede on the protective log |
| Health | Confirm lift again | default | founder (`settings`), only with lifts pending after a recovery | "a founder must confirm each lift again, only if the person asked" |
| Health | Pause all outbound activity | danger | **every role** (anyone may pause) | "Every dispatch is still checked…" |
| Health | Resume outbound activity | primary | founder; others see "Only the founder can resume." | "Nothing is dispatched or attested while paused." |
| Health | Run worker tick now | default | founder, operator (`dispatch`) | Section lede |
| Health | Retry (job) | default | founder, operator | — |
| Health | Lift (only if they asked) | **link style** | founder (`settings`) | In the label |
| Health | Change role / Sign out everywhere / Deactivate | default / default / danger | founder, **production only** (operators exist only with an identity store) | Section lede |
| Health | Reset to synthetic seed (type RESET) | danger | founder, **local demo only** | In the field label |
| Recovery | Verify and replay now | primary | founder, only while locked | "When it succeeds, everyone is signed out, you included, and signs in again." (after the button) |
| Recovery | Sign in / Go to the console | link | signed out / signed in and verified | — |
| Gates | Approve (or "Sign in again, then approve"), with a required attestation checkbox; for the public form also a written-authorization reference | primary | founder, when the gate is not valid and its dependencies are met | Page lede; the gate statement (`GATE_STATEMENTS`) |
| Gates | Sign in again to approve (required within 10 minutes) | link | founder, when the last authentication is not fresh | In the label |
| Sign-in | Continue as founder / operator / reviewer | primary / default / default | local demo | Role descriptions; page lede |
| Sign-in | Continue to sign in | link styled as a primary button | production | Page lede |

**Enclosures today:** Approvals' item `article.fd-panel` (a decision), the Gates approval `form.fd-panel` (a decision), and the sign-in identity cards `li.fd-panel` (**not** a decision). Health and Recovery have none, including for "Confirm lift again" and the seed reset.

## 2. States: covered and not covered

### 2.1 What existed before this review

| Source | What it covers |
| --- | --- |
| Visual baseline (`docs/design/phase-4/baseline/screens/`) | Approvals (founder; operator, dark, desktop) and Health (founder), both themes, desktop and phone. **Seeded states only** |
| Census baseline | Controls by role on approvals, health, recovery (verified), sign-in, gates (404) |
| E2E (`scripts/flight-deck/e2e.mjs`) | Approve an exact version; reviewer and operator permissions; Health shows the log and "Verified: contact allowed"; a founder's on-demand verify; recovery verified (screenshot). **No paused state and no locked recovery** |
| Production rehearsal (`rehearse:flight-deck`) | Over HTTP, no screenshots: sign-in offers Cognito only; console 404 before the gate; an unsigned gate row; the console gate approved through the console's own code; a restored copy redirects every page to Recovery and shows no record; the log unreachable (503); session revocation after verification |
| Domain tests (`src/lib/flightDeck/*.test.ts`) | Every lock reason except `sink-unavailable` by name; pause; gate signature and founder checks. None renders a screen |

### 2.2 What this review reproduced

The script ran its own local demo on :3100 from this worktree, with the **file store**. It used ordinary demo actions, plus the disposable git-ignored store and protective-log files under `.flight-deck/`. Every state below came from the application's **own** checks; no label, condition or check was changed or bypassed. At the end the store, log and ledger were deleted and the demo reseeded.

| State | How it was produced | Captured (both themes, 1440 and 390 px) |
| --- | --- | --- |
| Seed | Synthetic seed | Approvals, Health, Recovery (verified) for founder, operator and reviewer; Sign-in and Recovery signed out |
| **Outbound paused** | Founder: "Pause all outbound activity"; afterwards "Resume" | Health for all three roles; Approvals (founder) while paused |
| **Recovery locked: journal-ahead** (a restored copy behind the log) | Copy of the store taken; then a lift and an opt-out recorded; the demo restarted on the older copy | Recovery for every role; every other page redirects there (verified for Now, Approvals, Health, a relationship) |
| **Recovery verified after replay** | Founder: "Verify and replay now" | Recovery with the notice |
| **A lift to confirm after recovery** | The replay left the lift as a founder task | Health, founder and operator |
| **Recovery locked: restore-in-progress** (restore fence; nothing to replay) | Copy taken; a worker tick raised the fence; the demo restarted on the older copy | Recovery, founder and operator; then verified |
| **Protective log unavailable** (`sink-unavailable`) | The local log's `events` folder replaced by a file, so it cannot be listed; then put back | Recovery, founder and signed out |
| **Protective log missing** (`journal-mismatch`) | The local log folder moved aside | Recovery, founder and operator; a founder verify attempt ("Recovery did not complete") |
| Approvals available versus withheld by role | Seed | Founder and reviewer decide; the operator sees the queue without controls |

### 2.3 Not reproducible under the current boundary

| State | Why | Smallest future evidence mechanism |
| --- | --- | --- |
| **Gates: any state** (valid, invalid, absent, awaiting fresh authentication) | Production mode only; 404 in the demo for every role, as designed. Not weakened. | A capture step in the production rehearsal, which already reaches absent, unsigned (invalid) and approved gates over HTTP with a session. It needs an output directory outside the repository (an `E2E_OUT`-style override): as written, the rehearsal writes `docs/flight-deck/screens/production-rehearsal.json`, a protected path, so it was **not run** for this review. Freshness needs a session whose `authTime` is old, which the rehearsal's gate script can mint. **Requires a change to `scripts/` (protected): decision register R12** |
| **Sign-in, production** | Production mode only | The same rehearsal capture step |
| **Health: Operators and Launch gates sections** | Rendered only with a production identity store | The same |
| **Recovery locked: journal-integrity** | Needs a log whose chain fails verification, that is, altered log contents. Not done: altering the protective log goes beyond a disposable interaction | A domain-level render test, or a rehearsal step with a deliberately corrupted throwaway bucket |
| **Gate reasons other than unsigned** (bad signature, approver inactive or no longer founder, subject mismatch, privacy notice changed) | Production only | Rehearsal step, as above |
| **Approvals: "NOT PERMITTED" basis, the evidence-asset warning, a campaign awaiting review** | The seed's queue has one outreach and two content items. Producing these would mean editing records into states outside the seed's narrative | A seed variant, or a capture script that prepares them through ordinary actions (protected `scripts/` if committed) |
| **Worker auto-replay; session revocation on verify** | The local demo has no scheduled worker and no identity store | Production rehearsal (already covered there over HTTP) |

## 3. Before and proposed

The proposal was applied **in the browser only**: a proposed console-scoped stylesheet was injected and existing elements were given the proposed `className`. Text, elements, attributes, tones and controls were not changed. Comparison in every run (27 captures): the visible text has the **same words in the same order** (compared ignoring case and spacing). In 12 it is byte-identical. In the other 15, the first difference is letter case, because badge and button type are uppercase (§5, P6 and P8); the report keeps each first difference.

Sheets (current beside proposed; 1440 dark, 1440 light, 390 dark), in `compare\sheets\`:

| Sheet | Shows |
| --- | --- |
| `approvals.founder.*` | A decision enclosure: consequence, warning and fingerprint read before a separate control band |
| `approvals.operator.*` | The same queue with decision controls withheld by role |
| `health.founder.*` | Running, recovery verified; the lift control; the seed reset |
| `health.paused.operator.*` | Paused, seen by a role that cannot resume |
| `health.pending-lift.founder.*` | After recovery: a lift waiting for a founder's confirmation |
| `recovery.locked.founder.*`, `recovery.locked.operator.*` | A restored copy behind the log |
| `recovery.verified.founder.*` | After "Verify and replay now" |
| `sign-in.demo.*` | Local-demo identities |

There is no Gates sheet: the page cannot be rendered under the current boundary (§2.3). Its proposals (§5, P9) are made from the source.

## 4. Findings: accessibility and authority

### 4.1 Authority communication

1. **Health says "Verified: contact allowed" while outbound activity is paused.** Captured in the paused state for every role: a done ✓ "Verified: contact allowed" in the recovery block, then a blocked ‖ "Paused" below it. Both are true of different things (the database matches the log; nothing is dispatched), but "contact allowed" reads as a permission, and it contradicts the pause. Recovery says the same fact precisely: "Verified: the database matches the protective log". **Wording: protected (R1).**
2. **A failed recovery is announced as a confirmation.** After a founder's verify attempt with the log missing, the notice reads "Recovery did not complete. Contact stays paused…" with the **✓ glyph and the confirmation form** (mineral rule, `role="status"`). `Notice` gives every notice code the same treatment. The lock badge below is correct, but the first thing on the page looks like success. **Component markup and message metadata: protected (R2).**
3. **"Paused" means two different things.** Outbound pause is a founder-reversible operational switch ("‖ Paused", Health). A recovery lock is a safety lock cleared only by verification, but its title is "Paused until recovery is verified" and every lock reason begins "Paused:". **Vocabulary: protected (R3).**
4. **Readiness and safety restriction share one form on Health.** "Off" in "What is live" covers "Disabled by decision", "No provider", "Draft, not legally reviewed" and "Not built". It uses the blocked tone and ■ flag, the same form as "Contact blocked" and the outbound "Paused". A deliberate, permanent decision looks like a fault. Restyling one tone contextually would make the tone mean two things, so this review does **not** propose it. **Tone mapping (`TONE_LABEL`) and vocabulary: protected (R6).**
5. **Recovery: the consequence comes after the control.** "When it succeeds, everyone is signed out, you included…" follows "Verify and replay now", so it is read (and announced) after the decision point. Changing the order is markup (R5). Separately, in the local demo it is **not true**: the founder was still signed in after verification, because the demo has no identity store; production revokes sessions (rehearsal). The lock reasons also say "The scheduled worker replays them automatically", but the local demo has no scheduled worker. **Conditional wording: protected (R4, R5).**
6. **Locked recovery, operator and reviewer:** the page shows the lock and no action, but does not say who can resolve it (a founder, or the scheduled worker). **New wording: protected (R4).**
7. **A lift waiting for confirmation** (it increases access) is shown only as a suppression id with a default "Confirm lift again" button in an unenclosed row. A "Warning" alert above explains it. It is a decision, so the enclosure rule (plan §2) applies: P7 encloses it. Showing who or what scope it concerns would be new content (R9).
8. **Gates (from source):** authentication freshness "Fresh enough to approve" uses the done tone and ✓, the same form as "Approved by … on …". A precondition looks like a completed approval. "Approved by" shows the last six characters of an operator id. When authentication is stale, the submit button still has the primary fill, labelled "Sign in again, then approve". **Tone, glyph and text: protected (R8).**
9. **Approvals does not show outbound pause or recovery state.** That is correct behaviour (approval never sends; dispatch rechecks everything), and the page foot says so. A paused state line would still help a reviewer understand why approved items do not move. **New data read and condition: protected (R7).**
10. **Decision enclosures are right where they are:** the Approvals item and the Gates form. The sign-in identity cards are enclosures but not decisions, and on sign-in an enclosure can suggest an account. P10 replaces them with ruled rows.
11. **Key-value keys in the accent colour, on dashed rules.** The shared `.tiro-kv` (`globals.css`) colours keys in `--tiro-accent`; in the light theme that is the same red as the ▲ warning and Reject. Its row rules are dashed, a public-site evidence pattern the plan keeps out of the console (§2). A console-scoped override is possible but would also change the PR 4.4 and 4.5 screens that use `.tiro-kv` (D8).

### 4.2 Accessibility (all states in §2.2, Chromium)

| Check | Result |
| --- | --- |
| axe (WCAG 2.0–2.2 A/AA), 29 screen-states × 2 themes × 1440 and 390 px | **0 serious or critical** in 116 runs |
| Horizontal overflow at 1440, 390 and 320 px | **0** of 174 |
| Keyboard focus | 3,012 stops (388 inside the console; the rest are the public header and footer). **Every console stop has a visible ring; none is obscured** |
| Lowest text contrast by kind (dark / light) | Badges: blocked 6.78 / 6.08; attention 7.49 / 6.08; done 7.49 / 5.38; neutral 6.41 / 5.78. Controls 6.29 / 5.68. Fingerprint 6.41 / 5.78. Small text 6.41 / 5.78. Every text ratio is at least 4.5:1 |
| Target size | **"Lift (only if they asked)" is 16 px tall** (a button styled as a link). The standalone "Sign in" and "Go to the console" links on Recovery are 17 px tall. Every other console control is at least 44 px |

Reading order and names (from the DOM, which is the reading order):
- **Approvals.** Each item is an `article` labelled by its heading. The reading order is: heading, the addressed lines, the exact text, warnings, fingerprint, consequence, then the controls. That is correct: meaning before action. The three buttons have the same accessible names in every item ("Approve this exact version"); the article label gives the context. Adding the item to each name would be new text (R7 note).
- **Health.** The outbound state is `role="status"` only while paused. The recovery status is in a `dl`, so it is announced as a term and value.
- **Recovery.** The lock is in the "Status" section, after the title and lede. The consequence follows the button (finding 5).
- **The failure notice** (finding 2) is `role="status"`, so it is announced politely, not as an alert.
- **Glyphs** are `aria-hidden`; the word carries every state.

## 5. Proposed presentation-only changes

Console-scoped CSS in `flight-deck.css`, and permitted `className` changes in the mixed pages. No text, tone, glyph, condition, binding or element changes. Each was shown in §3, except P9 (Gates).

| # | Change | Where | Classes |
| --- | --- | --- | --- |
| P1 | **Consequence lines** use the PR 4.5 consequence form: soft text at a strong hairline, not a muted footnote | Approvals: each item's consequence and the page foot. Recovery: the sign-out consequence | `fd-consequence` (exists) |
| P2 | **Decision control band:** the controls sit under a hairline inside the enclosure, separate from what the decision means | Approvals item form | new `fd-decide` |
| P3 | **Warnings that bear on a decision:** existing accent text and ▲, with the danger button's 3px edge at the margin, so they are read before the controls | Approvals warnings | new `fd-warning` |
| P4 | **Withheld controls:** the reason in place of the control. Muted text at a faint hairline; not the accent or contested colour, and no box, so it reads as neither an error nor a control | Approvals "Your role can see this queue but cannot decide."; Health "Only the founder can resume."; Gates "Only a founder…", "Approve the console first.", the draft privacy notice line | new `fd-withheld` |
| P5 | **Safety states at body size**, so the governing state is not set as a footnote | Health: outbound state line, recovery status value | new `fd-state` |
| P6 | **Recovery lock as one statement:** the badge becomes a block at the margin, in sentence case and body type, instead of a wrapped uppercase monospace tag. Tone, glyph and words unchanged | Recovery status | new `fd-lock` |
| P7 | **Enclose the decisions that have none:** a lift to confirm after recovery (outlined, as an attestation) and the local seed reset (the erase enclosure's contested form) | Health | `fd-attest` (exists), new `fd-enclose-danger` |
| P8 | **"Lift (only if they asked)" in the default button form** (44 px), as "Redact summary" in PR 4.5. Same button, same form, no tone | Health suppressions | `fd-button` (exists) |
| P9 | **Gates, from source:** the approval form keeps its enclosure; the freshness line as a state line; the withheld lines as P4. To be verified when Gates can be captured (R12) | Gates | `fd-state`, `fd-withheld` |
| P10 | **Local-demo identities as ruled rows,** not enclosures: choosing a test identity is not a decision and not an account. Button tones unchanged | Sign-in (local demo only) | new `fd-identity` |
| P11 | **Standalone links on Recovery** ("Sign in", "Go to the console") in the default button form, 44 px | Recovery | `fd-button` (exists) |
| P12 | **Key-value lines** with solid hairlines and muted keys (finding 11). Console-wide: also changes PR 4.4 and 4.5 screens | Every `.tiro-kv` in the console | CSS only |

Not proposed:
- reordering anything visually (`order`, grid placement): the DOM order is the reading order, and the plan forbids it (§3.4);
- restyling a tone in one context (finding 4);
- any new colour, motion, glyph or wording.

The sign-in rows wrap the button beside or under the description depending on the name's length (visible in `sign-in.demo.1440.dark`); an implementation should give them one consistent layout.

## 6. Findings that need separate protected-change authorization

None of these is part of PR 4.6 unless separately authorized. Each changes visible text, a condition, a tone mapping, component markup or tooling.

| # | Finding | What it would change | Protected because |
| --- | --- | --- | --- |
| R1 | "Verified: contact allowed" while paused (4.1.1) | Health status wording, for example to Recovery's "Verified: the database matches the protective log" | Visible text in a mixed page |
| R2 | A failed recovery shown as a confirmation (4.1.2) | `Notice` to distinguish a non-success notice code (form and glyph), with the code list in `messages.ts` | `ui.tsx` structure; `src/lib/flightDeck/**` |
| R3 | "Paused" for both outbound pause and recovery lock (4.1.3) | Recovery title and `REASON` prefix (for example "Locked until recovery is verified") | Status vocabulary |
| R4 | Who resolves a lock; "the scheduled worker replays them automatically" in a demo without one (4.1.5, 4.1.6) | Role- and runtime-conditional wording on Recovery | New text and conditions |
| R5 | Recovery consequence after its button; not true in the local demo (4.1.5) | Move the sentence above the button; make it conditional on an identity store | Element order; condition |
| R6 | Readiness and restriction share the blocked form (4.1.4) | `TONE_LABEL` and the integration tones, for example "Off by decision" (neutral) vs "Not configured" | Tone mapping and vocabulary |
| R7 | Approvals silent about pause and recovery; identical decision names across items (4.1.9, 4.2) | A state line (data read and condition); item context in button names (`aria-label`) | Data reads, conditions, accessible names |
| R8 | Gates: freshness shown as done ✓; truncated approver id; primary fill while stale (4.1.8) | Badge tone and glyph; text; `SubmitButton` tone condition | Tones, glyphs, text, conditions on an authorization screen |
| R9 | A lift to confirm shows only an id (4.1.7) | Person or scope context | New data read and text |
| R10 | **Firefox server actions** (§8) | `src/proxy.ts` referrer policy or Next.js action origin handling | Protected path; security configuration |
| R11 | Seed without a NOT PERMITTED item, an evidence warning or a campaign in review (§2.3) | Seed or a capture script | `src/lib/flightDeck/seed.ts`; `scripts/` |
| R12 | Gates, production sign-in and Health's production sections cannot be captured (§2.3) | A rehearsal capture step with an output directory outside the repository | `scripts/` |

## 7. Decisions for the founder and Veris

1. **Accept the kinds of statement (§1.2)** as the basis for PR 4.6: permission, approval, readiness, safety restriction and completion are told apart by form, and two kinds never share a form when it can be avoided without changing tone or wording.
2. **Approvals:** accept P1–P3 (consequence lines, a separate control band, warnings with a heavy edge), with the item enclosure kept.
3. **Withheld controls:** accept P4 (`fd-withheld`) across Approvals, Health and Gates.
4. **Health:** accept P5, P7 and P8 (safety states at body size, enclosures for the lift confirmation and the seed reset, the lift control as a button).
5. **Recovery:** accept P6 and P11 (the lock as one statement in sentence case; the standalone links as buttons).
6. **Gates:** accept P9 in principle, to be verified with captures only once R12 exists. If R12 is not authorized, Gates' presentation changes are limited to `className`s that need no capture to verify, or are left out of PR 4.6.
7. **Sign-in:** accept P10 (ruled rows in the local demo). Production sign-in is unchanged.
8. **Key-value lines (P12):** accept the console-wide change, which also touches the PR 4.4 and 4.5 screens, or keep `.tiro-kv` as it is.
9. **Readiness versus restriction (finding 4):** confirm that PR 4.6 does **not** restyle a tone contextually, and that the distinction waits for R6.
10. **Protected findings R1–R12:** decide which, if any, to authorize separately, and in what order. This review recommends R2 and R1 first: a failure that looks like success, and a "contact allowed" beside a pause.
11. **Evidence for G4:** whether this review's state script (outside the repository) is enough evidence for the paused, locked and log-missing states, or whether the plan's §6 "fixtures for the rest" should become a committed, authorized capture script (R11, R12).

## 8. Known limitations

1. **Gates and production sign-in were not seen rendered.** Their findings come from the source and from the rehearsal's HTTP checks (§2.3). The same applies to Health's Operators and Launch-gates sections.
2. **States not reproduced:** `journal-integrity`, gate reasons other than unsigned, and the Approvals items missing from the seed (§2.3).
3. **Comparison by in-browser class swap.** The proposal was not implemented; layout details (for example the sign-in row wrap) may differ in an implementation.
4. **Chromium only.** The state run and comparison used the repository's Chrome helper. Firefox was not run, because of the finding below.
5. **The local demo differs from production in ways the screens mention:** there is no identity store (sessions are not revoked on verification), no scheduled worker, and no Operators or Launch-gates sections.
6. **File store only.** PostgreSQL shares the same pages and recovery code. Its demo database was not used, because the admin script route would need the local database password, which this review does not handle.
7. **Captures crop to the console's `main`.** The public header and footer, protected, are outside every crop.
8. **The round "N"** in captures is the Next.js development indicator, not part of Flight Deck.

### Firefox server actions (carried forward from PR 4.5)

- **The finding:** in Playwright's Firefox 159, a server-action POST carried `Origin: null`. Next.js refused it as "Invalid Server Actions request". The likely cause is `Referrer-Policy: no-referrer`, which `src/proxy.ts` sets on **every** `/flight-deck` path, in both modes.
- **Relevance to sign-in.** Local-demo sign-in ("Continue as …") is a server action, so it fails in that browser. Production sign-in is a plain link to the identity provider ("Continue to sign in"), **not** a server action, so that step should be unaffected. Signing out, however, is a server action.
- **Relevance to operational acceptance.** Every consequential control on these screens is a server action:
  - approve, request revision and reject;
  - pause and resume;
  - "Verify and replay now" and "Confirm lift again";
  - the worker tick;
  - operator changes;
  - launch-gate approval (`approveGateAction`).

  If a release Firefox behaves the same, a founder on Firefox could sign in to production but could not approve a launch gate, verify a recovery, or approve, pause or resume anything.
- **Not checked:** a release Firefox.
- **Read-only reproduction plan:**
  1. On the local demo, in a release Firefox, open the sign-in page and record the POST from "Continue as founder" in the network panel. Note its `Origin` and `Referer` headers and the response.
  2. Compare the same in Chrome.
  3. With the production rehearsal, record the same for one gate approval.

  No change to `src/proxy.ts`, the referrer policy, Next.js origin checks or authentication configuration is part of this review (R10).

## 9. Evidence (outside the repository)

`C:\tiro\dev\evidence\phase-4-6\`:

| Path | What |
| --- | --- |
| `scripts/states-4-6.mjs` | The state run (§2.2): its own demo on :3100, every state, axe, overflow, contrast, focus |
| `states/states-report.json`, `states/shots/` | The report (with what each screen says about authority, per state and role) and 116 full-page captures |
| `scripts/compare-4-6.mjs`, `scripts/proposed-4-6.css` | The comparison and the proposed stylesheet (§3) |
| `compare/crops/`, `compare/sheets/`, `compare/compare-report.json` | 54 crops, 27 sheets, and the word-and-order check |
| `scripts/sheets-4-6.cjs` | The sheet composer |
| `states.log`, `compare.log`, server logs | Run logs |

Port 3000 was not touched. At the end of each run, the local store, protective log and ledger under the worktree's `.flight-deck/` were deleted. The demo was stopped.
