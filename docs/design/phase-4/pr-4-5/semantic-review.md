# PR 4.5: working forms, semantic review

**Status: accepted, in the Phase 4.5 implementation brief, with these decisions:**
1. **Outgoing-text frame:** A, ruled correspondence, on Outreach, Content, the case reply, Approvals and Digest. The doubled rules are removed, and the Digest `<pre>` is exempt from the 42rem measure. On Approvals and Digest, only the frame changes.
2. **Disclosures:** ruled, with 44px summary rows. The erase enclosure keeps its danger edge; the by-hand attestation panels are outlined.
3. **Forms:** the spacing rhythm and the case-kind choice cards, with selection and keyboard focus independently visible.
4. **Consequences and pending states:** `fd-consequence` and `fd-pending`, with all text and conditions kept.
5. **"Redact summary":** the default button form; tone and behaviour unchanged.
6. **Date-picker focus:** corrected, and verified in Chromium and Firefox.

No protected change (decision 8) was authorized or made. The implementation and its verification are recorded in [README.md](README.md). The rest of this document is the review as it was presented.

**Branch:** `phase-4/working-forms-4-5`, from `main` at `f1d9168` (Phase 4.4 merged).

This review covers the working forms, and the read-only previews that sit beside them, on these screens:
- Relationships: new, and the relationship page;
- Outreach: the draft page, and its edit form;
- Content: the draft page, and its edit form;
- Campaigns: scope, review and state forms;
- Cases: new, and the case page.

It proposes a frame for outgoing text and a presentation for the forms. Implementation starts only after the founder and Veris accept it. The decisions requested are at the end.

## How to read it

The comparison sheets are outside the repository, in `C:\tiro\dev\evidence\phase-4-5\compare\sheets\`:

| Sheet | Shows |
| --- | --- |
| `frame.1440.dark.jpg`, `frame.1440.light.jpg` | Every outgoing-text frame at 1440 px: Current, A and B side by side |
| `frame.390.dark.jpg`, `frame.390.light.jpg` | The same at 390 px |
| `context.outreach.{1440,390}.{dark,light}.jpg` | The outreach page in context: the frame above the edit form, under Current, A and B |

Each sheet has five rows: outreach (exact message), content (exact post), the case reply, Approvals (exact version) and the Digest preview. The last two are outside this PR's list, but they use the same frame today (see decision 2).

**How they were made**
- They're rendered in the test browser, on the real pages of the local synthetic demo, signed in as the founder, with the synthetic banner checked on every page.
- **Current** is `main` as it is.
- **A** and **B** change one thing: the frame element's `className`, in the browser only. `fd-panel tiro-register-paper` is replaced by `fd-out fd-out-a` or `fd-out fd-out-b`, under the rules in `scripts\proposed-4-5.css`.
- Words, markup, order and conditions are unchanged.

The forms were captured as they are on `main`:
- in `forms\shots\`: seven screens (new relationship, a relationship, an outreach draft queued for dispatch, a content draft, campaigns, new case, a case), both themes, 1440 and 390 px, with every `<details>` opened in the browser;
- in `extra\`: an error notice, shown by adding `?error=validation-failed` to the address.

The scripts that made all of this are in `scripts\`.

**Data.** The seed has no case with a reply template. So the capture runs opened one synthetic access-request case in the local demo, the way an operator would, and reset the demo to the synthetic seed afterwards. Nothing else was submitted. No form behaviour, data outside the local demo, or port 3000 was touched.

## 1. Inventory

### Outgoing-text previews

| Screen | Preview | Frame today |
| --- | --- | --- |
| Outreach draft | "Exact message (version N)": To, Subject and Schedule lines, then the body. The approval fingerprint is under it; the [bracketed] placeholder warning, when present | `fd-panel tiro-register-paper` |
| Content draft | "Exact post (version N)": the body. Origin, source, asset and route lines are under it, then the fingerprint | `fd-panel tiro-register-paper` |
| Case | "Reply to send by hand": the subject, then the body, with "Copy reply" beside the heading. Shown only for case kinds with a reply template | `fd-panel tiro-register-paper` |
| Approvals (outside this list) | The exact version being decided, inside its decision panel | `tiro-register-paper mt-4 p-4` |
| Digest (outside this list) | The digest preview, in code type | `fd-panel tiro-register-paper` on a `<pre>` |

`tiro-register-paper` is the public site's "Paper" register (`globals.css`). It redefines the colour tokens inside the frame to a light paper palette.
- **Dark theme:** the frame is a bright slab, 16.82:1 against the page.
- **Light theme:** it is barely distinct, 1.1:1.

### Forms, by what each action means

Every form posts to an existing server action; none of that is in question here. "Tone" is the `SubmitButton` tone, or the `data-tone`, as it is in the source.

| Screen | Ordinary editing | Submission for review | Pending approval (how it's shown) | Consequential | Unavailable |
| --- | --- | --- | --- | --- | --- |
| Relationships · new | — | "Add contact for review" (primary). 11 fields; a basis must be accepted before any first message | — | — | — |
| Relationship | "Save details", "Record" (an interaction), "Add task", task "Done / Escalate / Cancel", "Create draft" (all default). The three editing forms sit in `<details>` panels | — | A basis awaiting review is shown by its "Basis awaiting review" badge. Approvers see "Accept basis for one-to-one contact" (primary) and "Reject" (default) | "Change stage" (default; it can move to Withdrawn or Suppressed, which can't be reopened here), "Record opt-out" (danger), "Erase permanently" (danger, typed ERASE, in a `<details>` with a contested summary) | Not rendered without the permission |
| Outreach draft | "Save new version" (default). The muted hint says saving voids any approval and queued dispatch | "Send for review" (primary): draft, held or failed | The sentence "Awaiting a decision in Approvals." | "Queue for dispatch" (default, with a hint). "Send by hand": three copy buttons, an attestation checkbox and "Record as sent by hand" (primary), in a filled panel. "Archive draft" (danger) | Not rendered: by status (locked when sent or archived) and by permission |
| Content draft | "Save new version" (default), 8 fields in two columns | "Send for review" (primary) | The same sentence | "Queue for publication" (default). "Publish by hand": copy, link field, attestation, "Record as published by hand" (primary). "Archive" (danger) | As above |
| Campaigns | "Save" in the "Edit scope and review status" disclosure. It holds **consent review** and **legal review** as ordinary selects beside name and purpose | "Send scope for approval" (**default**) | Only the status badge; no sentence | "Activate" (primary), "Pause campaign" (danger), "Close campaign" (**default**) | As above |
| Cases · new | — | — | — | "Open case" (primary). It may apply an opt-out at once ("Applied the moment the case is opened"), and it has a checkbox "For an incident: pause all outbound activity now" | — |
| Case | "Mark done" per checklist step (default) | — | — | "Redact field" (danger). "Redact summary" per interaction, a `<button>` **styled as a link** (`tiro-link`). "Resolve case" (primary) | As above; the resolve hint states the step rule |

How the five kinds of action are presented today:
- **Unavailable actions are never shown disabled. They are not rendered.** `SubmitButton`'s `disabled` prop is passed nowhere. The only disabled state is "Working…" while a form submits. Where an action is withheld, a sentence sometimes says why: "Awaiting a decision in Approvals.", or the case resolve hint. This review keeps it that way.
- **Errors are page-level.** The `Notice` sits under the page title (as set in PR 4.3). No field carries `aria-invalid` or a field-level message.

## 2. The outgoing-text frame

### Proposed candidates

Neither uses register paper, a fill, the accent, mineral, or any new colour. Both use `--tiro-border-strong` and `--tiro-border` only. Words, glyphs, order and the fingerprint are unchanged.

| | A: minimal ruled correspondence (recommended) | B: neutral outlined document |
| --- | --- | --- |
| Form | The text sits on the page between a strong rule above and below. The To/Subject/Schedule lines are set off from the body by a hairline. Measure capped at 42rem | A 1px strong outline, no fill, inner margin 1.1–1.75rem. The address lines are set off by a hairline |
| Reads as | A letter set out on the record: text to read, not a control | A document in a box |

### What each one looks like (measured)

| | Current | A | B |
| --- | --- | --- | --- |
| Frame against the page, dark | 16.82:1 (a bright slab) | 1:1 (on the page) | 1:1 |
| Frame against the page, light | 1.1:1 | 1:1 | 1:1 |
| Lowest text ratio in the frame, dark | 6.69 | 7.49 | 7.49 |
| Lowest text ratio in the frame, light | 6.69 | 6.08 | 6.08 |
| Body text, dark / light | 15.73 / 15.73 | 15.28 / 14.29 | 15.28 / 14.29 |
| Rule or outline against the page, dark / light | — | 1.9 / 1.82 | 1.9 / 1.82 |
| **Outline identical to the text inputs' outline** | No | No (rules only) | **Yes, on every page** |
| Horizontal overflow, 1440 and 390 px, both themes | 0 | 0 | 0 |

The lowest text ratio is the To/Subject/Schedule labels on the outreach page. Approvals sits inside its decision panel, so its frame is on the panel's surface: 14.17 dark and 13.35 light, under both A and B.

### Why A

1. **B looks like the edit form under it.** The `context.outreach.*` sheets show it: under B, the approved exact text and the editable "Body" textarea below it are the same shape: the same 1px outline, in the same colour. B makes the record of what will be sent look like a field you can type into. That blurs the line this page exists to draw: between the version that was approved and an edit that would void the approval. A has no box, so it can't be mistaken for a field.
2. **It keeps PR 4.4's vocabulary.** In 4.4, an enclosure means "this restricts or decides" (the paused notice, alerts, decision panels). Outgoing text does neither. It's the thing being decided about, so it should not be enclosed.
3. **It removes the false finality of the paper slab.** In the dark theme, today's frame makes a draft that "Needs review" look like a finished, printed document. It looks the same as an approved one. The status is carried by the badges above, and should stay there. Neither candidate encodes status in the frame.
4. **It's quieter on a phone.** At 390 px, A gives the text the full width; B loses about 2.3rem to its inner margin and outline.

### Adjustments to A, if accepted

- **The doubled rule.** Where the frame sits straight under a section heading (outreach, content, the case reply, the digest), the heading's rule and A's top rule are about 1rem apart. A sibling rule (`.fd-section-head + .fd-out-a`) would drop the frame's top rule there. Approvals keeps it, since its frame follows the address lines.
- **The 42rem measure.** The cap suits correspondence, but it rewraps the digest's code-type lines (visible in the Digest row). It should not apply to the digest `<pre>`.

### What implementation would change

- The `className` of the frame element: four or five elements, depending on decision 2.
- One new console-scoped block in `flight-deck.css`.

`globals.css` and `tiro-register-paper`, which the public pages use, stay as they are.

## 3. Forms: review and proposals

These proposals are CSS and `className` only, unless marked otherwise.

### 3.1 Density and grouping

**Today**
- **Field spacing:** forms use four spacings: `space-y-3`, `space-y-4`, `gap-4` and `gap-6`. Related fields and unrelated fields get the same gap, and the gap changes from page to page.
- **Disclosures:** the three editing disclosures on a relationship, the campaign scope editor and the erase disclosure are all the same filled `fd-panel`. Ordinary editing and permanent erasure have the same weight.

**Proposed**
- **Field spacing:** one form rhythm. Fields 1.25rem apart. Groups separated by 2rem, where a page already groups them in a `div` or `fieldset`.
- **Ordinary editing disclosures** ("Edit details…", "Record an interaction", "Add a task…", "Edit scope…"):
  - no panel: a strong rule above;
  - the summary as a 44px row (it is 20px tall today);
  - the open form indented under a hairline at the margin.
- **The erase disclosure** keeps an enclosure, with the danger button's 3px contested left edge. It's the one disclosure on these pages that leads to an irreversible act.
- **"Send by hand" and "Publish by hand"** keep an enclosure, because each holds an attestation. It becomes an outline with no fill, so it stops matching the panels around it.
- **The case kinds on "Open a case"** become choice cards from a `className` (`fd-choice`). The selected card is outlined in the accent, through `:has(input:checked)`; that's interface state, not meaning.

### 3.2 Labels and hints

**Today**
- Labels are already console-scoped (PR 4.3).
- The legend on "Open a case" still uses the `/pilot` classes with an `!important` override.
- **Consequence hints are muted 0.75rem text**, the same as an ordinary hint:
  - "Saving any change creates a new version and voids any approval and queued dispatch for this message." (outreach);
  - "Any change … voids the approval." (content);
  - "Changing purpose, audience, limits, or metrics returns the campaign to draft and voids its approval." (campaigns);
  - "Changing it voids every approval for this person." (email).

**Proposed**
- The legend moves to the console label class.
- The consequence hints become an `fd-consequence` class: text in `--tiro-text-soft` at 0.8125rem, with a hairline at the margin. That reads as a condition of the form, not as a footnote. It doesn't use the accent or contested colours, so it isn't mistaken for an error or a warning. The wording is unchanged.

### 3.3 Error notices

The error notice (PR 4.3: an enclosed contested outline with a 3px left edge) appears under the page title, and focus is not moved to it. See `extra\error-notice.*`.
- On a short form, it sits directly above the form.
- On the relationship page, it sits above a long page with eleven forms, so an error from the erase form is reported far from it.

Moving a notice beside its form, or adding field-level errors, changes markup and behaviour. That is outside this PR, and it is recorded, not proposed.

### 3.4 Button hierarchy

The PR 4.3 forms stay: primary filled; default outlined; danger outlined with a 3px contested edge; every button 44px.

Inside those forms, these inconsistencies are tones written in the pages, so they're protected:

| Control | Today | Reading |
| --- | --- | --- |
| "Send scope for approval" (campaigns) | default | The same act on outreach and content ("Send for review") is primary |
| "Close campaign" | default | A campaign can't be reopened from closed, yet "Pause campaign" is danger |
| "Change stage" | default | One control both moves a relationship forward and withdraws or suppresses it, which can't be undone here. A tone can't follow the chosen option without new logic |
| "Redact summary" (case) | a link | It changes a record and can't be undone, but it looks like navigation |

**Proposed without a protected change:** "Redact summary" takes the default button form (`fd-button` instead of `tiro-link`). That's a `className` change. It stops it reading as navigation. Its danger tone would need `data-tone`, which is protected.

### 3.5 Keyboard focus

Measured on the seven form screens, in both themes, at 1440 and 390 px, with every disclosure open: 1,196 stops.

- **Inputs, selects, textareas, checkboxes, radios, buttons, links and summaries** show the 2px accent outline. The development indicator accounts for 28 stops, and none of the console's stops is obscured.
- **Date and date-time fields:** one stop in each shows no ring (5 fields × 4 runs = 20 stops). This is Chromium's calendar-picker stop, inside the field. Tabbing onto it leaves the field without `:focus` or `:focus-visible`, so `.tiro-input:focus-visible` doesn't apply.
  - The fields: "Observed on", "Due" twice, and "Schedule (UTC, optional)" on outreach and content.
  - **Proposed:** a console-scoped ring for those fields, from `:focus-within` or the picker's `::-webkit-calendar-picker-indicator:focus-visible`. It would be verified in Chromium and Firefox before it's relied on.

axe (WCAG 2.0–2.2 A/AA), on the same screens: 0 serious or critical issues in 28 runs. Horizontal overflow: 0 of 42, down to 320 px.

## 4. Appearances that could misrepresent approval, permission or readiness

| # | Element | Risk | Proposal |
| --- | --- | --- | --- |
| 1 | The paper frame, dark theme | A draft looks like a finished, official document, the same as an approved one | Frame A (§2) |
| 2 | Frame B, if chosen | The exact approved text looks like an editable field | Choose A, or B with a hairline instead of the strong outline (it would then look like a panel; see §2) |
| 3 | Consequence hints in muted footnote type | Editing looks costless, though it voids an approval or a queued dispatch | `fd-consequence` (§3.2) |
| 4 | "Awaiting a decision in Approvals." as plain body text | A pending state reads like any other sentence. It is easy to miss that nothing will happen until someone decides | A state line in `className` only (`fd-pending`): muted, with an accent hairline at the margin and no box, so it isn't read as a badge or a button. The words and the link are unchanged |
| 5 | Consent and legal review statuses as ordinary selects in "Edit scope" | Clearing a governance review looks like editing a name. The badges then show "Consent review: cleared" in the done tone | **Recorded, not proposed.** Setting them apart needs markup (a fieldset or wrapper). Styling them by their `name` through CSS would encode meaning where the checker can't see it, so this review rejects that, as PR 4.3 did for glyph-based classes |
| 6 | "Close campaign" default; "Send scope for approval" default | A consequential act looks ordinary; a submission for review looks lighter than the same act elsewhere | **Needs separate authorization** (protected tones) |
| 7 | "Change stage" default | Withdrawal and suppression look like routine editing. The hint under it states the consequence | Recorded. A per-option tone would be new logic |
| 8 | "Redact summary" as a link | An irreversible change looks like navigation | Default button form (`className`); danger needs authorization |
| 9 | "For an incident: pause all outbound activity now" | An organisation-wide stop looks like an ordinary checkbox, beside the opt-out scope | **Recorded.** Setting it apart needs a wrapper, so it's markup. The existing label states the consequence |
| 10 | "Permitted to write: …" (done tone) next to the exact message | It could be read as permission to send. It is permission to write, and it is distinct from approval | Recorded in PR 4.3 as vocabulary; unchanged |
| 11 | The erase disclosure in the same panel as ordinary editing | Same weight as "Edit details" | §3.1: it keeps the enclosure, with the danger edge |

None of these proposals changes a word, a condition, an action, a binding, a role or a link.

## 5. Limitations

1. **States the seed doesn't render were reviewed from source, not captured:**
   - outreach and content in **draft**, so "Send for review" appears;
   - **content ready to publish by hand**;
   - campaigns other than **draft**: Activate, Pause;
   - a relationship basis **pending review**, with Accept and Reject;
   - "Redact summary", which needs an interaction on the case's person.
2. **A and B were checked at 1440 and 390 px.** Overflow at 320 px, axe, and focus with the frame swapped were not run. The swap changes no focusable element, and the text contrast is measured above. Implementation would run the full set.
3. **The date-field focus finding is Chromium's.** Other browsers draw their picker differently. The fix would be checked in more than one browser before it's relied on.
4. **The capture runs opened synthetic cases in the local demo:** one in each of the two capture runs and one in a setup check. The demo was reset to the synthetic seed after each.

## 6. Decisions requested

1. **Outgoing-text frame:**
   - **A, minimal ruled correspondence (recommended)**, with the two adjustments in §2; or
   - B, neutral outlined document; or
   - B with a hairline outline.
2. **The frame's reach.** Apply the chosen frame to the Approvals exact-version preview and the Digest preview as well (recommended), so that all outgoing text has one form. Or limit it to outreach, content and the case reply.
3. **Disclosures and panels:** ordinary editing disclosures become ruled, with 44px summaries. Enclosure is kept only for the erase disclosure (with the danger edge) and the by-hand attestation panels (outlined, no fill). See §3.1.
4. **Form rhythm and the case-kind choice cards,** as in §3.1.
5. **Consequence hints** as `fd-consequence`, and the **pending-approval sentence** as `fd-pending`. See §3.2 and §4, item 4.
6. **"Redact summary"** takes the default button form (`className` only).
7. **Date-field focus:** fix the ring for the picker stop, verified in Chromium and Firefox.
8. **Protected changes, not part of this proposal unless separately authorized:**
   - tones for "Send scope for approval" (primary) and "Close campaign" (danger);
   - a danger tone for "Redact summary";
   - markup to group the consent and legal review selects, and to set apart the incident pause checkbox;
   - errors placed beside their form, or at field level.

   The recommendation is to authorize none of these for PR 4.5, and to revisit them separately.

No CSS or TSX has been changed. Implementation waits for these decisions.
