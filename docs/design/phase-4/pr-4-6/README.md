# PR 4.6: consequential and authorization screens, verification record

- **Branch:** `phase-4/authority-4-6`, from `main` at `d535e68` (Phase 4.5 merged).
- **Semantic review:** `bd8658d`, founder-approved for local presentation implementation. See [semantic-review.md](semantic-review.md).
- **Implementation:** the commit that adds this record.

Presentation only. The changed files are:
- `src/app/flight-deck/flight-deck.css`: a new, console-scoped section at the end;
- `className` values in four pages: `approvals/page.tsx`, `health/page.tsx`, `recovery/page.tsx` and `sign-in/page.tsx`. Recovery and sign-in are authorization screens; the boundary checker asks for founder review of any change to them.

**What did not change:**
- every word, status tone, glyph, condition, action binding, permission, form field, accessible name, live region and validation rule;
- the DOM order. No `order` or grid placement moves anything;
- `globals.css`, the shared components and every protected path, including `src/proxy.ts`, server actions, the seed and `scripts/`;
- **Gates.** No file or selector that reaches Gates changed. P9 is not implemented (§ Not implemented).

## What changed

| # | Where | Before | After |
| --- | --- | --- | --- |
| P1 | Approvals: each item's consequence and the page foot. Recovery: "When it succeeds, everyone is signed out…" | Muted 0.75rem footnotes | `fd-consequence` (PR 4.5): soft text at a strong hairline. Same text and position |
| P2 | Approvals: each item's form | Controls directly under the consequence | `fd-decide`: a separate band under a hairline inside the item's enclosure. The enclosure is kept |
| P3 | Approvals: warnings (▲) | Accent text | `fd-warning`: the same accent text and ▲, with the danger button's 3px edge at the margin |
| P4 | Approvals: "Your role can see this queue but cannot decide." Health: "Only the founder can resume." | Muted small text | `fd-withheld`: muted, at a faint hairline. Not accent or contested; no box |
| P5 | Health: the outbound state line (Running or Paused) and the recovery status value | Small text | `fd-state`: body size. The paused line keeps `role="status"` |
| P6 | Recovery: the status (a lock reason, or "Verified: the database matches the protective log") | A wrapped uppercase monospace badge | `fd-lock`: the same badge as one block, in sentence case and body type. Tone, edge, glyph and words unchanged |
| P7 | Health: lifts to confirm after a recovery; the local seed reset | Unenclosed | Lifts: `fd-attest` (PR 4.5, outlined). Reset: `fd-enclose-danger`, the erase enclosure's contested form |
| P8 | Health: "Lift (only if they asked)" | A button styled as a link, 16px tall | The default button form, 44px. No tone; same button, same form |
| P10 | Sign-in, local demo: the three test identities | Panels; the button beside or under the text depending on its length | `fd-identity`: ruled rows. Name, description, then the button, at every width. Button tones unchanged |
| P11 | Recovery: "Sign in" and "Go to the console" | Text links, 17px tall | The default button form, 44px |
| P12 | Every `.tiro-kv` in the console: Approvals, Health, and the PR 4.4 and 4.5 screens (Now, relationship, relationship print view, outreach, content, campaigns) | Dashed rules; keys in the accent | Solid hairlines; muted keys. Scoped to `.fd-shell`; `globals.css` unchanged |

## Not implemented

- **P9 (Gates).** It waits for production-mode visual evidence (R12). Gates still answers 404 in the local demo for every role (checked in both state runs).
- **R1–R12.** None. In particular:
  - **R2:** a failed recovery attempt still reads "Recovery did not complete…" with the ✓ glyph and the confirmation form. See `after.recovery.log-missing-attempt.founder.1440.light.jpg`.
  - **R1:** Health still says "Verified: contact allowed" while outbound activity is paused. P5 sets it at body size; the words are unchanged.
  - **R3–R5:** recovery wording, order and conditions are unchanged. The consequence still follows "Verify and replay now"; P1 changes its form only.
  - **R6:** readiness ("Off") and restriction still share the blocked form.
  - **R10:** no change to `src/proxy.ts`, the referrer policy or server actions.

No class makes any of these look resolved.

## Representative captures

Matched before/after pairs on the local synthetic demo (file store):
- **Before** is `d535e68` (this branch's `src` before the change). **After** is this branch.
- Both come from the same state script, which builds every state through the application's own checks:
  - ordinary demo actions;
  - an older copy of the disposable, git-ignored local store (the restored-copy cases);
  - the local protective log moved aside or made unreadable.
- No label, condition or check was changed or bypassed.

The captures use equivalent seeded scenarios and states. Generated identifiers, fingerprints and timestamps differ. Each is cropped to the console. The round "N" is the Next.js development indicator.

| Files (`before.` / `after.`) | Shows |
| --- | --- |
| `approvals.founder.1440.dark` | Decision enclosures: the warning edge, the consequence at its hairline, the separate control band; muted keys on solid rules |
| `approvals.operator.390.light` | The same queue, decision controls withheld by role (P4), on a phone |
| `health.paused.operator.1440.dark` | Outbound paused, seen by a role that cannot resume: the state at body size, "Only the founder can resume." withheld |
| `health.pending-lift.founder.1440.light` | After a recovery: the lift to confirm enclosed; the Lift buttons; the seed reset enclosed |
| `recovery.locked.founder.1440.dark` | A restored copy behind the log: the lock as one statement; the consequence line |
| `recovery.locked.operator.390.light` | The same lock, for a role with no action |
| `recovery.log-missing-attempt.founder.1440.light` | The log missing, after a verify attempt. **R2 is unchanged:** the failure notice keeps the confirmation form |
| `recovery.signed-out.320.dark` | Signed out, at 320px: "Sign in" as a 44px button |
| `sign-in.320.light` | Local-demo identities as ruled rows |
| `regression.relationship.1440.dark` | P12 on a PR 4.5 screen: only the key-value lines change. A full-page capture |

Outside the repository, in `C:\tiro\dev\evidence\phase-4-6\verify\`:
- `states-before/` and `states-after/`: 174 captures each, with their reports;
- `inspect-before/` and `inspect-after/`: the PR 4.4 and 4.5 regression, 124 captures each, with their reports;
- `sheets/`: 148 before/after sheets;
- the logs of every check below, and the E2E screenshots.

The scripts are in `C:\tiro\dev\evidence\phase-4-6\scripts\`.

## Results

Run locally on Windows on this branch. These are local results; GitHub CI has not run for this branch.

| Check | Result |
| --- | --- |
| Boundary checker, merge base `d535e68` | PASS, enforce mode. Recovery and sign-in noted for founder review |
| Boundary self-tests | **122/124.** The 2 failures are caused by this change; see below |
| Census self-tests | 8/8 |
| Census against `docs/design/phase-4/baseline/census.json` | **Identical**, on the file store and on PostgreSQL, for all four roles |
| Flight Deck E2E (`E2E_OUT` outside the repository) | 53/53 on the file store; 53/53 on PostgreSQL |
| Build, `verify:disclosure`, lint | Pass. Lint has 0 errors; its 2 warnings are in untouched backend files |
| `test:flight-deck-pg` | 28/28 |
| `npm test` | 555 pass; the 4 known Windows failures below |
| What each screen says, per state and role (29 screen-states) | **Identical before and after:** title, sections, badge tones, glyphs and text, notices, control names, tones and disabled states. The only difference is the pause timestamp |
| States reproduced | Seed (every role); outbound paused (every role); recovery locked: restored copy behind the log (every role, including signed out), restore in progress, log unavailable, log missing, and a failed verify attempt; verified after replay; a lift to confirm; decisions withheld by role |
| axe (WCAG 2.0–2.2 A/AA), the states above, both themes, 1440 and 390px | 0 serious or critical in 116 runs, before and after |
| Horizontal overflow, the same at 1440, 390 and 320px | 0 of 174, before and after |
| Keyboard focus, Chromium, both themes, 1440 and 390px | 3,012 stops before and after; every console stop has a visible ring; none obscured |
| Targets under 44px in the console | Before: "Lift (only if they asked)" 16px; "Sign in" and "Go to the console" 17px; the Approvals item headings (links) 30px. **After: only the item headings**, which are unchanged and outside the accepted scope |
| PR 4.4 and 4.5 regression (P12): 16 screens, including Now and the print view, 6 widths, both themes | axe 0 in 96 runs; overflow 0 of 288; 2,668 focus stops, all visible. The same before and after |

### Contrast

The lowest text ratio of each kind that changed (dark / light). Everything else is unchanged.

| Kind | Before | After |
| --- | --- | --- |
| Small text (the state run) | 6.41 / 5.78: the Approvals consequence | 6.64 / 5.98: the Health log lede. The consequence lines are now `fd-consequence` |
| Consequence lines (the regression run) | 11.38 / 9.39 | 10.69 / 8.93: the Approvals consequence, on its enclosure's surface |
| Key labels in outgoing text (the regression run) | 7.49 / 6.08, in the accent | 6.64 / 5.98, muted (P12) |

Every text ratio is at least 4.5:1.

## Boundary self-tests: two cases need re-anchoring

`scripts/test/flight-deck-boundary.test.mjs` plants changes in the live Approvals page. Two of its cases find their place by the **exact current `className`** of an element this PR restyles:
- "consequence text moved after the decision buttons": the item consequence (P1);
- "paragraph unwrapped": "Your role can see this queue but cannot decide." (P4).

With the approved classes, both report "mutation anchor not found", so the result is 122/124. The checker itself is unaffected: it passes, and the other 122 cases pass.

- **Founder direction:** implement P1 and P4 as approved. Re-anchor the two cases separately, by the element's position rather than its classes, as PR #27 did for the header-offset case.
- **Why it can't be done here:** `scripts/**` is protected, and the checker reads exceptions from the merge base.
- **Consequence:** the re-anchor must merge into `main` before PR 4.6, or the PR's CI self-test job fails.
- **Status:** not prepared. It needs separate authorization.

## Deviations

1. **The Approvals item consequence keeps its 0.5rem space below the fingerprint** (`fd-consequence mt-2`). The review's in-browser comparison set `fd-consequence` alone, which put the line flush under the fingerprint.
2. **Sign-in rows stack at every width:** the name and description, then the button below. The review asked for "one consistent layout" without choosing one. Stacking is the layout the founder and operator rows already had at 1440px, and it holds at 320px. The list's `space-y-3` is removed, so each row's rule meets the next.
3. **P11 was not in the review's comparison sheets,** although the review says every proposal except P9 was shown (§3). It is first rendered here (`recovery.signed-out.320.dark`).
4. **The verified Recovery status also takes the `fd-lock` form,** as in the review's comparison (`recovery.verified.founder`). Its done tone, ✓ and rule are unchanged.

## Limitations

1. **Not verified visually: Gates, production sign-in, and Health's Operators and Launch-gates sections.** They render only in production mode (R12). None of their files changed, and no new selector matches their elements. The local state for Gates is still 404 for every role.
2. **States not reproduced:**
   - `journal-integrity`;
   - gate reasons;
   - the Approvals "NOT PERMITTED" basis, the evidence-asset warning, and a campaign awaiting review (not in the seed; R11). The two warnings would take `fd-warning`, as the captured one does.
3. **Chromium only.** Firefox was not run: Firefox can't submit server actions on this app (R10, carried forward). Sign-in and every consequential action are server actions.
4. **The print view was checked on screen, not printed.** P12 applies there too. The console's print colours (PR 4.2) set muted text at the same strength as soft text, so muted keys print as dark ink.
5. **The state run used the file store.** PostgreSQL shares the same pages and recovery code. On PostgreSQL the census and E2E ran, but not the locked states (as in the review, §8).
6. **The local demo differs from production:** it has no identity store and no scheduled worker. The recovery wording that mentions them is unchanged (R4, R5).

## Known failures outside this change

- **`npm test` on Windows: 4 tests in `src/lib/flightDeck/managedLoginScript.test.ts`** (374, 375, 376, 379; "request file is not private"). They check file permissions in a way that can't pass on Windows, and fail the same way on unchanged `main`; Linux CI passes them.

## Disposable data

Each run deleted the local store, protective log, ledger and local database under the worktree's `.flight-deck/` (git-ignored) at the end; the folder is empty. Port 3000 was not touched. Ports 3100 and 55433 are closed.

## Release order

1. **Done:** semantic review approved; implementation and local verification (above).
2. **Pending:** founder and Veris review of this implementation.
3. **Pending:** the boundary self-test re-anchor (separate authorization), merged before this PR.
4. **Pending:** GitHub publication and release review, with Linux CI. Phase 4.6 is not released.
