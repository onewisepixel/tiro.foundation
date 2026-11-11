# PR 4.5: working forms, verification record

**Branch:** `phase-4/working-forms-4-5`, from `main` at `f1d9168` (Phase 4.4 merged).
- **Semantic review:** `257b9b6`, accepted in the implementation brief. See [semantic-review.md](semantic-review.md).
- **Implementation:** `fa3cfd9`.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css`: a new, console-scoped section at the end;
- `className` values in nine pages:
  - Relationships: `new/page.tsx` and `[id]/page.tsx`;
  - `outreach/[id]/page.tsx` and `content/[id]/page.tsx`;
  - `campaigns/page.tsx`;
  - Cases: `new/page.tsx` and `[id]/page.tsx`;
  - `approvals/page.tsx` and `digest/page.tsx`. On these two, only the outgoing-text frame changed.

**What did not change:**
- every word, status tone, condition, action binding, permission, form field, name and validation rule;
- `globals.css`, the shared components and every protected path.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Outgoing text: outreach, content, case reply, Approvals, Digest | The public site's register paper. In the dark theme, a bright slab (16.82:1 against the page); in the light theme, barely distinct (1.1:1) | **Ruled correspondence (A):** on the page, with a strong rule below. A strong rule above it too, except where it sits directly under a section heading, whose rule is then the top rule. The address lines are set off by a hairline. Correspondence text has a 42rem measure; the Digest `<pre>` keeps its full width |
| Editing disclosures: "Edit details…", "Record an interaction", "Add a task…", "Edit scope…" | Filled panels; summary row 20px | A strong rule above, a 44px summary row, and the open form under a hairline at the margin. No panel |
| "Erase this person's record" | The same filled panel as ordinary editing | Enclosed: contested outline with the danger button's 3px left edge |
| "Send by hand", "Publish by hand" | Filled panel | Outlined, no fill: an attestation, so still enclosed |
| Form rhythm | Gaps of 24, 16, 12 or 8px, varying by page | Fields 20px apart (1.25rem). The case form's groups 32px apart (2rem) |
| "Open a case": kinds | Bordered labels using `/pilot` classes; the selected kind shown only by its radio | Choice cards. **Selected:** a 2px accent border inside the card. **Keyboard focus:** a separate 2px ring outside it, in the text colour, plus the radio's own ring. Each is visible without the other |
| Consequence hints (outreach, content, campaign scope) | Muted 0.75rem footnotes | `fd-consequence`: soft text at 0.8125rem, with a strong hairline at the margin. Not accent or contested, so not read as an error |
| "Awaiting a decision in Approvals." (outreach, content) | Plain body text | `fd-pending`: a state line in muted text with an accent hairline at the margin, no box |
| "Redact summary" (case) | Styled as a link, 16px tall | The default button form, 44px. No tone; same button, same form |
| Date and date-time fields | Chromium's calendar-picker stop showed no focus ring | The ring holds on every stop in the field (`:focus-within`, scoped to those two field types) |

## Representative captures

Matched before/after pairs, from the same inspection script on the local synthetic demo, signed in as the founder:
- **Before** is `main` at `f1d9168`; **after** is this branch.
- Each run builds the same states through ordinary demo actions:
  - a new outreach draft from a template;
  - an access-request case for a synthetic contact;
  - an interaction on that contact;
  - one content item approved, so it can be published by hand.

The captures use equivalent seeded scenarios and application states. Runtime-generated identifiers, audit events, timestamps and the reply's dates differ between captures. Comparisons assess presentation and structure, not byte-identical records.

All are crops of full-page captures. The round "N" is the Next.js development indicator, not part of Flight Deck.

| Files | Shows |
| --- | --- |
| `before/after.outreach-draft.1440.dark.jpg` | A new draft: the exact message, the consequence line above the edit form, "Send for review" |
| `before/after.outreach-pending.1440.light.jpg` | A message awaiting review: the pending line, and the frame under its heading |
| `before/after.content-hand.1440.light.jpg` | An approved post: the frame, and "Publish by hand" outlined |
| `before/after.relationship.1440.dark.jpg` | Disclosures open: ruled editing disclosures, and the erase enclosure with its danger edge |
| `before/after.campaigns.1440.dark.jpg` | "Edit scope and review status" open, with its consequence line |
| `before/after.case-new.1440.light.jpg` | The case kinds as choice cards, with grouped fields |
| `before/after.case.390.dark.jpg` | A phone: the reply to send by hand, "Redact field", "Redact summary" as a button, and "Resolve" |
| `before/after.approvals.1440.dark.jpg` | The exact version inside its decision panel. Only the frame changes |
| `before/after.digest.1440.light.jpg` | The digest preview at full width. Only the frame changes |
| `after.focus.date-and-choice.jpg` | Close-ups, after only:<br>• the date field on Chromium's picker stop, dark and light, and in Firefox;<br>• a case kind both focused and selected, in Chromium and Firefox;<br>• the selection kept when focus moves elsewhere |

Outside the repository, in `C:\tiro\dev\evidence\phase-4-5\`:
- `before/` and `after/`: the full set from `scripts/test/flight-deck-capture.mjs`, 29 + 29;
- `inspect-before/` and `inspect-after/`: the inspection reports and every capture behind the checks below. These are 14 screens at 1440, 390 and 320 px in both themes, closed and with every disclosure open;
- `verify/`: the logs, the E2E screenshots and the two-browser focus pass (`focus-browsers/`);
- `scripts/`: the review and inspection scripts.

## Results

Run locally on Windows on this branch. These are local results; GitHub CI has not run for this branch.

| Check | Result |
| --- | --- |
| Boundary checker, merge base `f1d9168` | PASS, enforce mode: 11 files, 2 presentation and 9 mixed |
| Boundary self-tests | 124/124 |
| Census self-tests | 8/8 |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
| `test:flight-deck-pg` | 28/28 |
| `npm test` | 555 pass; the 4 known Windows failures below |
| axe (WCAG 2.0–2.2 A/AA): 14 screens, both themes, 1440, 390 and 320 px | 0 serious or critical in 84 runs, before and after |
| Horizontal overflow: 14 screens, 6 widths from 1440 to 320 px, both themes, disclosures closed; and at 1440, 390 and 320 px with them open | 0 of 252, before and after |
| Keyboard focus, Chromium: 14 screens, both themes, 1440 and 390 px, disclosures open | 2,416 stops. Before: 44 console stops without a visible ring, every one a date-field picker stop, on 11 screens. **After: 0** |
| Keyboard focus, Chromium and Firefox through Playwright: 11 screens, both themes, 1440 and 390 px | Firefox 159: 8,064 stops, all console stops visible, including all 760 date-segment stops and all 77 summaries. Chromium 157: 1,712 stops, all visible |
| Choice cards, both browsers, both themes, 1440 and 390 px | Focused and selected: the radio's ring, the card's ring and the selection border all present. Focus elsewhere: the selection border stays and the card's ring is gone |
| Disclosure summary rows | Every editing disclosure 44px, at every width |
| Form gaps between fields | 20px in every stacked or grid form; 32px between the case form's groups. Inline row forms (change stage, opt-out, draft from template, task buttons) keep their row gap of 8–12px |

### Contrast

The lowest text ratio of each kind, measured on every screen above in both themes:

| Kind | Before, dark / light | After, dark / light |
| --- | --- | --- |
| Outgoing text (the lowest is the To/Subject/Schedule labels) | 6.69 / 6.69 | 7.49 / 6.08 |
| Consequence lines | 6.41 / 5.78 (as muted hints) | 11.38 / 9.39 |
| Pending line | Body text | 6.64 / 5.98 (muted, as reviewed) |
| Field labels | 6.29 / 5.68 | 6.64 / 5.98 |
| Hints | 6.41 / 5.78 | 6.64 / 5.98 |
| Controls, ordinary text | 6.29 / 5.68 and 6.41 / 5.68 | Unchanged |

Every text ratio is at least 4.5:1.

## Limitations

1. **The Firefox checks used Playwright's Firefox build (159), not a release Firefox.** Firefox isn't installed on this machine. The build was downloaded into the session's scratch directory, outside the repository, and nothing was installed system-wide.
2. **Firefox can't submit server actions on this app. This was found during verification and predates this PR.**
   - **What happens:** Firefox sends `Origin: null` on the action POST, because the console sends `Referrer-Policy: no-referrer` (`src/proxy.ts`). Next.js then refuses it as "Invalid Server Actions request". Sign-in failed this way in Playwright's Firefox.
   - **Not checked:** whether a release Firefox behaves the same. It is behaviour in protected code, outside this PR, and was not changed.
   - **How the focus pass worked around it:** Chromium signed in and opened the synthetic case, and Firefox reused the session cookie and only loaded pages.
   - **Recommended:** look at this separately; a Firefox user may be unable to sign in or act.
3. **One consequence hint was not converted:** the relationship email field's "Changing it voids every approval for this person." It is rendered by the shared `Field` component's hint. Styling that one hint would need a new prop (a component change) or a selector keyed to the field's id, which would encode meaning where the boundary checker can't see it. It keeps the hint style.
4. **The outreach version-history summary is unchanged** (20px, or 40px when it wraps on a phone). It isn't an editing disclosure, so it wasn't in the accepted scope.
5. **States not captured:**
   - content in draft, with "Send for review": the same treatment as the outreach draft, which is captured;
   - campaigns after scope approval: Activate and Pause, whose buttons are unchanged;
   - the pending outreach screen in the two-browser pass, because the E2E run had already changed the demo's state. The Chromium inspection covers it, and the content pending line was in the two-browser pass.
6. **Alerts, print and the public site** were not re-inspected. This PR touches none of them, and the capture script's print PDFs of the relationship summary are in `before/` and `after/`.

## Deviations

1. **The choice-card focus ring** (2px, in the text colour, 3px outside the card) is added to the radio's own ring. That makes keyboard focus visible on the card as a whole, independently of the selection border inside it. The review named the selection style but not this ring.
2. **The open editing forms start 0.5rem below their summary** (`mt-2`, was `mt-4`), because the 44px summary row now carries the space.
3. **The "Open a case" legend and choice hints** moved from the `/pilot` classes to the console's label and hint classes, as in the review (§3.2). The legend is 0.875rem, as before; the hints are 0.75rem, as before.
4. **The capture runs opened synthetic records in the local demo, the way an operator would:** an outreach draft, a case, an interaction, and one content approval. The demo was reset to the synthetic seed after each run, on both stores.

## Known failures outside this change

These failures are in protected code that this PR does not touch, and they reproduce without it.

- **`npm test` on Windows: 4 tests in `src/lib/flightDeck/managedLoginScript.test.ts`** (374, 375, 376, 379; "request file is not private"). They check file permissions in a way that can't pass on Windows. They fail the same way on unchanged `main`; Linux CI passes them.
- **`test:flight-deck-pg`, the worker-lock case,** is intermittent: a timing race recorded in PR 4.2. It passed in this run.

## Release order

1. **Done:** semantic review accepted; implementation and local verification (above).
2. **Pending:** independent acceptance.
3. **Pending:** GitHub publication and release review, with Linux CI. Phase 4.5 is not released.
