# PR 4.3: shared components, verification record

**Branch:** `phase-4/shared-components-4-3`, from `main` at `35f119d` (Phase 4.2 merged).

**Design:** the semantic review in [semantic-review.md](semantic-review.md), accepted by the founder on 2026-11-07:
- blocked badges use candidate B, the flagged outline;
- glyphs, tones and wording are unchanged;
- page-title eyebrows use muted text;
- notices, sections, fields, empty states and buttons follow the proposal.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css`: a new, console-scoped section at the end of the file;
- `src/components/flight-deck/ui.tsx`: `className` values only, in `Notice`, `PageTitle`, `Section`, `Empty` and `Field`.

`globals.css`, `client.tsx`, the pages and every protected path are unchanged. `Badge`, `StatusBadge`, `StageBadge`, `STATUS` and `STAGE_TONE` are untouched: badges and buttons change through the stylesheet alone.

## What changed

| Component | Before | After |
| --- | --- | --- |
| Badge, blocked | 1px contested outline | Flagged outline: contested, with a 5px left edge, no fill |
| Badge, attention | 1px accent outline | Unchanged |
| Badge, done | 1px mineral outline | No box: a mineral rule beneath the word |
| Badge, neutral | Strong-border outline, soft text | Faint hairline box, muted text |
| Notice, error | 2px left rule on the surface | Enclosed: contested 1px outline with a 3px left edge, on the surface |
| Notice, confirmation | 2px left rule on the surface | A 1px mineral rule at the margin, no fill |
| PageTitle | Eyebrow in the accent | Eyebrow muted; the block is closed by a hairline |
| Section | Label over `--tiro-border` | Label over `--tiro-border-strong` |
| Field | Shared `/pilot` classes with `!important` resizing | Console classes, at the same sizes |
| Empty | Muted sentence | Muted sentence at a hairline margin rule |
| Button, primary | Filled accent | Unchanged on screen. In print, an ink outline (see Deviations) |
| Button, default | Outline on a faint fill | Outline, no fill |
| Button, danger | Contested outline | Contested outline with a 3px left edge |
| Button, pending | 50% opacity | Faint outline, subtle text |
| Button height | 40px | 44px |

## Representative captures

"Before" is `main` at `35f119d`; "after" is this branch. Both sides come from `scripts/test/flight-deck-capture.mjs`, run against the local synthetic demo, signed in as the founder. The close-ups are crops of its full-page captures.

| Files | Shows |
| --- | --- |
| `before/after.vocabulary.1440.light.jpg` | Every `StatusBadge`, `StageBadge` and Health state in the light theme, where attention and blocked share one colour. After, they are told apart by form |
| `before/after.health.1440.light.jpg` | Muted eyebrow and title rule, section rules, a done badge, default and danger buttons |
| `before/after.approvals.390.dark.jpg` | A phone: title, section, a neutral badge, and the decision row (primary, default, danger) |

The round "N" is the Next.js development indicator, not part of Flight Deck.

Outside the repository, in `C:\tiro\dev\evidence\phase-4-3\`:
- `before/` and `after/`: the full set from the capture script, 29 + 29, including the relationship print PDFs in both themes;
- `semantic-review/`: the corrected review sheets;
- `inspect-before/` and `inspect-after/`: the inspection reports and print-media captures;
- `verify/`: every log below.

## Results

Run locally on Windows on this branch. These are local results; GitHub CI has not run for this branch.

| Check | Result |
| --- | --- |
| Boundary checker, merge base `35f119d` | PASS, enforce mode: 2 presentation files and 1 mixed (`ui.tsx`) |
| Boundary self-tests | 124/124 |
| Census self-tests | 8/8 |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
| `test:flight-deck-pg` | 28/28 |
| `npm test` | 555 pass; the 4 known Windows failures below |
| axe (WCAG 2.0–2.2 A/AA): 14 console screens, both themes, 1440 and 390 px | 0 serious or critical, before and after |
| Horizontal overflow: 14 screens × 6 widths (1440 to 320 px) × 2 themes | 0 of 168, before and after |
| Keyboard focus: Approvals, a relationship and Health, both themes, 1440 and 390 px | 440 stops, all visible on the console. The 12 exceptions are the development indicator, the same before and after |
| Synthetic banner and the print view's SYNTHETIC label | Unchanged. The banner is shell markup, and the label is page markup, not `PageTitle` |

The 14 screens are the 12 of PR 4.2 plus Approvals with a confirmation and with an error notice.

### Contrast and form

Measured on every instance on the 14 screens, against the effective background. The lowest ratio of each kind:

| Kind | Dark | Light | Print |
| --- | --- | --- | --- |
| Badge text, blocked | 6.78 | 6.08 | 7.67 |
| Badge text, attention | 7.49 | 6.08 | 7.67 |
| Badge text, done | 7.49 | 5.38 | 6.79 |
| Badge text, neutral | 6.41 | 5.78 | 10.57 |
| Notice text, error / confirmation | 14.17 / 15.28 | 13.35 / 14.29 | 16.81 (error) |
| Button text, primary | 7.49 | 6.08 | 16.81 (was 2.51 from the dark theme) |
| Button text, danger | 6.29 | 5.68 | 7.15 |
| Page eyebrow (now muted) | 6.64 | 5.98 | 11.11 |

Every text ratio is at least 4.5:1. Each tone keeps its form in every theme and in print:
- every blocked badge has the 5px edge (18 per theme, 4 in print);
- every danger button has the 3px edge (26 per theme);
- every button is 44px tall.

Two outlines are below 3:1, but in neither case is the outline what identifies the component; the text is:
- the neutral badge's hairline, 1.38:1 (it was 1.81:1 light and 1.9:1 dark);
- the default button's outline, 1.81:1 light and 1.9:1 dark (it was 1.79:1 and 1.97:1).

## Deviations from the accepted proposal

1. **The primary button in print.** Browsers print without backgrounds, so the filled primary button printed its label in the background colour: 2.51:1 when printed from the dark theme, and pale on paper from either theme. A print-only rule now prints it as an ink outline (16.81:1). This was found in the baseline inspection. It is button styling within the approved scope, but it was not in the review.
2. **Done badges have no side padding,** so their rule spans exactly the word. Next to running text this leaves a narrower gap than the old box did (Health, "Outbound activity"). The spacing belongs to the page markup and is left to PR 4.4 and 4.6.

## Known failures outside this change

These failures are in protected code that this PR does not touch, and they reproduce without it.

- **`npm test` on Windows: 4 tests in `src/lib/flightDeck/managedLoginScript.test.ts`** (374, 375, 376, 379; "request file is not private"). They check file permissions in a way that can't pass on Windows. They fail the same way on unchanged `main`; Linux CI passes them.
- **`test:flight-deck-pg`, the worker-lock case** ("retries a failed send … a second concurrent tick is locked out"), is intermittent: a timing race recorded in PR 4.2. It passed in this run.

## Recorded, not changed

- **"Running"** is used in `STATUS` for a worker job (attention, ↻) and on Health for outbound activity (done, ●). It's vocabulary, so it's left as it is.
- **Health "What is live":** "Local only" badges wrap onto two lines beside two-word names at 1440 px. This was already the case before, and it's page layout (PR 4.6).

## Release order

1. **Done:** semantic review accepted; implementation and local verification (above).
2. **Pending:** independent acceptance of this implementation.
3. **Pending:** GitHub publication and release review, with Linux CI. Phase 4.3 is not released.
