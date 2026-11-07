# PR 4.2: shell and navigation, verification record

**Branch:** `phase-4/shell-navigation-4-2`. **Implementation:** `752e2db` (shell and navigation) and `e6a68a6` (header offset at `--la-header`), on `main` at `c0ba7cb`.

**Depends on** `governance/boundary-selftest-anchor` (`6e5d27e`), which must be merged into `main` first.

**Visual review:** accepted by Veris at `752e2db`, conditional on the header offset and the footer-focus finding. Both are resolved below.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css` (new, console-scoped);
- `className` values, plus one stylesheet import, in `layout.tsx`, `client.tsx` and `ui.tsx`.

`globals.css` and every protected path are unchanged.

## Representative captures

"Before" is `main` at `c0ba7cb`; "after" is this branch. All come from the local synthetic demo, signed in as the founder.

| Files | Shows |
| --- | --- |
| `before/after.shell.390.dark.jpg` | Phone. Before, the navigation scrolls sideways and stops at Campaigns, with Approvals off-screen. After, all nine destinations show at once, Approvals and its count included |
| `before/after.shell.320.light.jpg` | The narrowest supported width: same register, no overflow |
| `before/after.shell.1440.light.jpg` | Desktop. Before, the signed-in name and Sign out wrap onto a second row. After, one hairline-ruled bar held exactly under the site header |
| `before/after.relationship-print.dark.pdf` | Printed from the dark theme (A4, backgrounds off). Before, pale text. After, dark ink, with the banner first and framed and the SYNTHETIC label unchanged |

The round "N" in the captures is the Next.js development indicator, not part of Flight Deck.

The complete set is kept outside the repository: 29 + 29 full-page captures, close-ups at six widths, print previews, logs and census files. It was made with `scripts/test/flight-deck-capture.mjs` and an inspection script built on `scripts/test/flight-deck-browser.mjs`.

## Results

| Check | Result |
| --- | --- |
| Boundary checker against `main` | PASS, enforce mode: 1 presentation and 3 mixed files; the stylesheet import is noted as permitted |
| Boundary self-tests | 124/124 with the anchor fix applied. Without it, this branch's own copy fails one case on its anchor (see above) |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
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
- **`test:flight-deck-pg`: the worker-lock case** ("retries a failed send … a second concurrent tick is locked out") is intermittent. It failed 1 of 20 runs of that test alone, and 2 of 6 runs of the full suite. It's a timing race: the two "concurrent" ticks sometimes don't overlap.
  - The code it exercises (`src/lib/flightDeck`) is identical to `main`.
  - It is recorded here for its own follow-up, not for change in Phase 4.

## Release order

1. Merge `governance/boundary-selftest-anchor` alone, under its own review.
2. Bring this branch onto the new `main`, then rerun the boundary check, the self-tests, the census and the E2E.
3. Release review of PR 4.2 on GitHub, with Linux CI.
