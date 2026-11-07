# PR 4.2: shell and navigation, verification record

**Branch:** `phase-4/shell-navigation-4-2`. **Integration base:** `main` at `5d42f9a`. **Implementation:** `96705c3` (shell and navigation) and `a29178a` (header offset at `--la-header`).

The branch was first built on `c0ba7cb` as `752e2db` and `e6a68a6`. It was rebased onto `5d42f9a` without conflicts, and each commit is patch-identical to its original.

**Self-test correction:** PR #27 (`governance/boundary-selftest-anchor`) is merged into `main` at `5d42f9a`. Its corrected "shell header offset via the token" self-test is included in this branch through that base.

**Visual review:** accepted by Veris at `752e2db` (now `96705c3`), conditional on the header offset and the footer-focus finding. Both are resolved below.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css` (new, console-scoped);
- `className` values, plus one stylesheet import, in `layout.tsx`, `client.tsx` and `ui.tsx`.

`globals.css` and every protected path are unchanged.

## Representative captures

"Before" is `main` at `c0ba7cb`; "after" is this branch. `5d42f9a` differs from `c0ba7cb` only in a test file, so the "before" captures still show `main`. All come from the local synthetic demo, signed in as the founder.

| Files | Shows |
| --- | --- |
| `before/after.shell.390.dark.jpg` | Phone. Before, the navigation scrolls sideways and stops at Campaigns, with Approvals off-screen. After, all nine destinations show at once, Approvals and its count included |
| `before/after.shell.320.light.jpg` | The narrowest supported width: same register, no overflow |
| `before/after.shell.1440.light.jpg` | Desktop. Before, the signed-in name and Sign out wrap onto a second row. After, one hairline-ruled bar held exactly under the site header |
| `before/after.relationship-print.dark.pdf` | Printed from the dark theme (A4, backgrounds off). Before, pale text. After, dark ink, with the banner first and framed and the SYNTHETIC label unchanged |

The round "N" in the captures is the Next.js development indicator, not part of Flight Deck.

The complete set is kept outside the repository: 29 + 29 full-page captures, close-ups at six widths, print previews, logs and census files. It was made with `scripts/test/flight-deck-capture.mjs` and an inspection script built on `scripts/test/flight-deck-browser.mjs`.

## Results

Integrated verification, run locally on Windows at `9fa47b4` (this branch on `5d42f9a`, before this record was updated). These are local results; GitHub CI has not yet run for this branch.

| Check | Result |
| --- | --- |
| Boundary checker, merge base `5d42f9a` | PASS, enforce mode: 13 files, 10 presentation and 3 mixed; the stylesheet import is noted as permitted |
| Boundary self-tests | 124/124, using the corrected self-test from PR #27 |
| Census self-tests | 8/8 |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
| `test:flight-deck-pg` | 28/28 in this run (see the intermittent case below) |
| `npm test` | 555 pass; the 4 known Windows failures below |
| Header alignment (console top minus header bottom) | 0 px at 1440, 1024, 768, 390, 360 and 320 px, both themes. The sticky bar is also at 0 px after scrolling. It was −2 px with the earlier 61 px offset |
| Horizontal overflow, 12 console screens × 6 widths × 2 themes | 0 of 144 |
| Approvals on screen and clickable | Yes at every width and theme. Before, not at 390, 360 or 320 px |
| Keyboard focus, 180 Tab stops | All visible. "Obscured" fell from 12 to 2, and those 2 are the development indicator (below) |
| Synthetic banner | Text byte-identical; first; 11 px in the accent; kept in print |

### Footer focus finding: a false positive

At 390 px, Tab stop 27 is the public footer's only About link (`footer > nav[Site] > … > a`, `/about`). Its focus outline is visible. After the Tab scroll it sits under the Next.js development indicator (`nextjs-portal`, bottom left), so a point probe hits the indicator.

With only the indicator hidden, the same probe hits the About link itself, in both themes. Nothing in the page covers it, and the indicator exists only in development. The "before" run's flagged footer stops at 320 px have the same cause.

### Known failures outside this change

These failures are in protected code that this PR does not touch, and they reproduce without it.

- **`npm test` on Windows: 4 tests in `src/lib/flightDeck/managedLoginScript.test.ts`** ("request file is not private"). They check file permissions in a way that can't pass on Windows. The same 4 fail on unchanged `main`; Linux CI passes them.
- **`test:flight-deck-pg`: the worker-lock case** ("retries a failed send … a second concurrent tick is locked out") is intermittent. It failed 1 of 20 runs of that test alone, and 2 of 7 runs of the full suite (the integrated run passed). It's a timing race: the two "concurrent" ticks sometimes don't overlap.
  - The code it exercises (`src/lib/flightDeck`) is identical to `main`.
  - It is recorded here for its own follow-up, not for change in Phase 4.

## Release order

1. **Done:** `governance/boundary-selftest-anchor` merged alone as PR #27, under its own review (`main` at `5d42f9a`).
2. **Done:** this branch rebased onto `5d42f9a`, and the boundary check, self-tests, census, E2E, build, disclosure check and lint rerun locally (Results, above).
3. **Pending:** GitHub publication of PR 4.2 and its release review, with Linux CI. Phase 4.2 is not yet released.
