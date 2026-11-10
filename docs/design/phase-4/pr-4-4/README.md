# PR 4.4: read-only screens, verification record

**Branch:** `phase-4/read-only-4-4`, from `main` at `3c531a8` (Phase 4.3 merged). **Implementation:** `e7e55b4`.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css`: a new, console-scoped section at the end;
- `className` values in five pages: Now (`page.tsx`), `relationships/page.tsx`, `activity/page.tsx`, `digest/page.tsx` and `relationships/[id]/print/page.tsx`.

`globals.css`, the shared components, every other page and every protected path are unchanged. No `style` value changed: the one inline style in scope (the Now alerts) is byte-identical to `main`.

## Inventory

Every route in scope was read before editing. Each one's read-only parts were separated from its forms and controls; the forms and controls were not touched.

| Route | Read-only parts | Forms and controls (unchanged) | This PR |
| --- | --- | --- | --- |
| Now | Alerts, paused notice, next actions, approvals count, replies, inquiries, blockers, at-risk, counts, weekly review | "Open weekly review" link | Changed |
| Relationships list | Rows, stage filter links | "Add a researched or referred contact" | Filter changed |
| Outreach, content, cases lists | Rows, badges | Content "New draft" form; "Open a case" | No change needed: built from the 4.3 components |
| Campaigns | Key/value sets, review badges | Scope, activate, pause and close forms; the new-campaign form | No change: the forms are PR 4.5 |
| Activity | The audit table, paging links | — | Changed |
| Digest | The four blocks, the digest preview | "Copy digest"; "Mark this week's review complete" | Blocks changed |
| Signed out | Title, "Sign in again" link | — | No change needed |
| Print view | Disclosure label, record fields, lists | "← Back" (screen only) | Changed |

## What changed

| Screen | Before | After |
| --- | --- | --- |
| Now: "All outbound activity is paused" | A 2px rule at the margin | Enclosed as a restriction: contested 1px outline, 5px left edge (the blocked badge's form), on the surface |
| Now: alerts | A 2px left rule, coloured by severity | Enclosed: 1px outline with a 3px left edge, coloured by severity as before (see Limitations) |
| Now: weekly review and digest | A filled panel | A rule above it: it's a way into the review, not a decision |
| Now: next actions | Row numbers in small code type | The same, in tabular figures with a fixed width |
| Relationships: stage filter | The status-badge class, so it read as neutral badges after PR 4.3 | Filter links: outlined, 32px tall; the current one (`aria-current`) in the accent, as in the navigation |
| Activity | Table with hairlines | A ledger: a stronger rule under the column labels, hairlines between events, a row highlight on hover, times in tabular code figures |
| Digest: the four blocks | Four filled panels | Four ruled entries in two columns. Each is a way into its work, not a decision |
| Print view | Section labels with no structure; label in muted text | Each section opens with a hairline, so an empty section still reads as one; the SYNTHETIC or CONFIDENTIAL label is in the accent, as the banner is |

What's kept:
- **Enclosures** stay where they mean "this restricts or decides": the paused notice, the alerts, and every decision panel elsewhere.
- **The digest preview** keeps its register-paper frame. The plan leaves the "outgoing text" frame to the PR 4.5 decision.

## Representative captures

Matched before/after pairs, taken by the same inspection script under the same conditions:
- the local synthetic demo, signed in as the founder;
- seed reset, so "before" and "after" show the same records.

Before is `main` at `3c531a8`; after is this branch. All are crops of full-page captures.

| Files | Shows |
| --- | --- |
| `before/after.now-paused.1440.light.jpg` | Now with outbound activity paused: the restriction, next actions, and the weekly review set off by a rule |
| `before/after.digest.1440.dark.jpg` | The four blocks, ruled rather than boxed |
| `before/after.activity.1440.light.jpg` | The activity ledger |
| `before/after.relationships.390.dark.jpg` | A phone: the stage filter, as filter links rather than status badges |
| `before/after.print.paper.light.jpg` | The print view in print media (as on paper): banner, accent label, ruled sections |

The paused state was produced the way an operator would produce it: "Pause all outbound activity" on Health, then the Now page captured. The seed was reset afterwards.

The round "N" is the Next.js development indicator, not part of Flight Deck.

Outside the repository, in `C:\tiro\dev\evidence\phase-4-4\`:
- `before/` and `after/`: the full set from `scripts/test/flight-deck-capture.mjs`, 29 + 29, with the relationship print PDFs in both themes;
- `inspect-before/` and `inspect-after/`: the inspection reports and every matched shot (10 screens at 1440 and 390 px in both themes, Now while paused, signed out, print media);
- `verify/` and `verify-final/`: the logs below (see "Deviations" for why there are two).

## Results

Run locally on Windows on this branch. These are local results; GitHub CI has not run for this branch.

| Check | Result |
| --- | --- |
| Boundary checker, merge base `3c531a8` | PASS, enforce mode: 6 files, 5 mixed and 1 presentation |
| Boundary self-tests | 124/124 |
| Census self-tests | 8/8 |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
| `test:flight-deck-pg` | 28/28 |
| `npm test` | 555 pass; the 4 known Windows failures below |
| axe (WCAG 2.0–2.2 A/AA): 12 screens, both themes, 1440 and 390 px | 0 serious or critical, before and after. The screens are Now, Now while paused, the five lists, a filtered list, Activity, Digest, signed out and the print view |
| Horizontal overflow, the same screens, 6 widths from 1440 to 320 px, both themes | 0 of 138, before and after |
| Keyboard focus: Now, Relationships, Activity, Digest, print view; both themes; 1440 and 390 px | 902 stops; every console stop visible. The 2 "obscured" are the footer's About link under the development indicator at 390 px, as before |
| Disclosures in print media, both themes | The banner is present and visible on Now, Activity, Digest and the print view. The print view's label reads "Flight Deck · relationship summary · SYNTHETIC DEMO DATA", visible, before and after |
| Contrast (the lowest text ratio of each kind, on screen and in print) | Unchanged, except the paused notice: 15.28 → 14.17 dark and 14.29 → 13.35 light, now on the surface tint. Every text ratio is at least 5.38:1 on screen and 7.67:1 in print |

The print view writes an audit event each time it is opened. Its data reads and audit call are unchanged. The captures opened it as before.

## Limitations

1. **The two alert severities share one form.** In the light themes, an "action" alert and a "warning" alert are the same colour, so they're told apart by the glyph (■ or ▲) and the hidden "Needs action" or "Warning" prefix, as before. I tried giving actions the heavy 5px edge through the alert's inline `style`. That broke the boundary self-test "permits: inline style removed", which anchors on that exact `style` string. The test file is protected tooling, so the change was reverted and the style is unchanged. Doing it would need a separate governance change to the self-test, as PR #27 was for the header offset. **Needs separate authorization if wanted.**
2. **Alerts aren't rendered in the seeded demo.** The local demo raises none, so the alert form was checked against the stylesheet and markup, not captured.
3. **Activity on a phone** still scrolls sideways inside its own container (the table is 40rem wide), as before. The page itself doesn't overflow. Restacking the table at narrow widths with CSS can remove its table semantics in some browsers, so it's left as it is.

## Deviations

1. **The verification was run twice.** The first full run (`verify/`) included the severity-based alert edge. When the boundary self-test failed on it (Limitation 1), the style was reverted. Everything that loads a page was then rerun on the final tree (`verify-final/`, `inspect-after/`, `after/`): captures, inspection, census and E2E on both stores, build, lint, disclosure and self-tests. `npm test` and `test:flight-deck-pg` are from the first run; they don't load pages, and no file they load changed.
2. **No change was needed** on the outreach, content and cases lists, campaigns, or signed out. They already use the PR 4.3 components, and their remaining structure is forms (PR 4.5) or already rule-based.

## Known failures outside this change

These failures are in protected code that this PR does not touch, and they reproduce without it.

- **`npm test` on Windows: 4 tests in `src/lib/flightDeck/managedLoginScript.test.ts`** (374, 375, 376, 379; "request file is not private"). They check file permissions in a way that can't pass on Windows. They fail the same way on unchanged `main`; Linux CI passes them.
- **`test:flight-deck-pg`, the worker-lock case,** is intermittent: a timing race recorded in PR 4.2. It passed in this run.

## Release order

1. **Done:** implementation and local verification (above).
2. **Pending:** independent review.
3. **Pending:** GitHub publication and release review, with Linux CI. Phase 4.4 is not released.
