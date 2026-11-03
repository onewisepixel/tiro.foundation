# Milestone 3.0, Phase 4: Flight Deck presentation

Status: **Direction accepted in principle; only PR 4.1 (boundary and baseline) is authorized (decision 58).** PRs 4.2–4.7 each need separate review and authorization. No staging deployment, live-record activation or Phase 5 work is authorized.
Date: 2026-11-03. Base: `main` at `bec57d2` (PR #25, decision 57).
Owner: TIRO founder / Steward.
Scope: plan §4 and §8 Phase 4 (`milestone-3.0-consolidation-plan.md`), as refined by the founder-reviewed Phase 4 assessment (2026-11-02).

Phase 4 brings Flight Deck's **presentation** into the Living Archive family: institutional continuity, not identical page layouts. Its operational behaviour, authority boundaries and security model do not change. PR 4.1 changes no Flight Deck file. It adds the means to prove that later PRs change nothing else: an enforced boundary, a runtime census of what each role is given, and a recorded visual baseline.

## 1. Authorization (decision 58)

- The presentation direction (§2) is **accepted in principle**.
- **Only PR 4.1 is authorized for implementation.** PRs 4.2–4.7 (§6) each require separate review and authorization.
- Protected operational code (§3) remains **out of scope**.
- One narrow exception: PR 4.1 may change `.github/workflows/ci.yml` solely to run the boundary checker and its tests.
- **No staging deployment and no live-record activation** is authorized.
- The **no-op Save** defect (staging checkpoint 2026-10-23 §3.6) stays outside this work. Fixing it is a behaviour change.
- The public-site manual accessibility and performance verification stays a **separate, open track** (§8).

## 2. Presentation direction (accepted in principle)

Flight Deck keeps the public site's typography, restraint, hairline rules and `--la-header`, at an operational density.

- **Grouping:** rules replace filled panels, except where a decision is made (an approval, a gate, erase, withdraw, redact). There an enclosure stays, because it means "this is a decision".
- **Status:** word, then glyph, then tone. In the light theme, tones are told apart by **form** (solid, outline, mineral, hairline), because "attention" and "blocked" share one colour there (§5.4). No new colours are added.
- **Not used in the console:**
  - the public site's evidence line patterns (dashed, double strand);
  - archival "register paper" for outgoing messages.
- **The single affirmative action** keeps its current weight. Nothing implies an approval, permission or verification that has not been granted.
- **Unchanged:**
  - the synthetic banner stays first, at least as prominent, with its text unchanged, and in print;
  - no motion is added;
  - the TIRO mark is untouched;
  - no new terminology, promises or workflows are introduced.
- **Stylesheet:** a console-scoped stylesheet. `globals.css` is not edited, because `/pilot` shares its `fd-*` and `tiro-*` form rules.

## 3. The protected boundary

Enforced by `scripts/test/flight-deck-boundary.mjs` on every pull request (CI job `flight-deck-boundary`).

### 3.1 Paths (layer A)

First match wins. Anything not listed is not an approved Phase 4 path.

| Path | Class | Why |
| --- | --- | --- |
| `docs/flight-deck/screens/**` | Protected | Committed Flight Deck evidence; never overwritten |
| `docs/design/phase-4/baseline/**` | Protected | This baseline, recorded once in PR 4.1 |
| `docs/**` | Presentation | Documentation and evidence |
| `src/lib/flightDeck/**` | Protected | The operations domain: config, runtime, gates, store, worker, providers, Postgres, identity |
| `src/proxy.ts` | Protected | The outer gate |
| `src/app/flight-deck/**/actions.ts` | Protected | Server actions |
| `src/app/flight-deck/guard.ts` | Protected | Page authorization and recovery isolation |
| `src/app/flight-deck/auth/**`, `internal/**`, `export/**`, `**/route.ts` | Protected | Authentication, machine routes, exports, route handlers |
| `src/app/flight-deck/layout.tsx` | **Mixed** | Shell markup, with the runtime gate, the approvals count and sign-out |
| `src/app/flight-deck/**/page.tsx` | **Mixed** | Page markup, with data reads, conditions and forms. `gates/`, `recovery/` and `sign-in/` are authorization screens: the report asks for founder review of any change |
| `src/app/flight-deck/**/*.css`, `src/components/flight-deck/**/*.css` | Presentation | Console-scoped styles |
| `src/components/flight-deck/ui.tsx`, `client.tsx` | **Mixed** | Shared components with the status vocabulary, the `returnTo` token, the formatting, the navigation and the submit controls |
| `src/components/flight-deck/*.tsx` (new) | Component | Must be presentation-only: no forms, inputs, buttons, `action=` or `name=`, no "use server", and no imports other than React, `next/link`, stylesheets and sibling files |
| `src/app/globals.css` | Protected | Shared with `/pilot` and the public site |
| `src/app/pilot/**`, `src/components/pilot/**` | Protected | The public-form boundary |
| `src/**` (everything else, including the root layout, `TopNav` and `Footer`) | Protected | The public site and shared code |
| `backend/**`, `infra/**`, `deploy/**`, `.github/**`, `scripts/**`, `package.json`, `package-lock.json` | Protected | Backend, infrastructure, deployment, workflows, tooling (including the checker), dependencies |

New `page.tsx` or `layout.tsx` files are rejected, because they add routes. Deleting a Flight Deck file is also rejected.

### 3.2 Structure of mixed files (layer B)

Each changed mixed file, before and after, is parsed with the TypeScript compiler and reduced to a canonical tree from which presentation is erased. The two trees must be identical.

**Intentionally permitted** (erased before comparison):

- the `className` and `style` attributes, whatever their values;
- side-effect stylesheet imports (`import "./x.css"`);
- **generic wrappers**: a `div`, `span` or `p` with no attribute other than `className` or `style` is replaced by its children. The three tags are otherwise treated as one, so `p` → `div` with the same attributes is permitted;
- empty decorative elements whose only attribute is `aria-hidden="true"`;
- fragments, comments, formatting, JSX whitespace, and the order of attributes and of import declarations.

**Protected** (anything else that differs fails):

- imports, other than stylesheets;
- data reads and runtime calls;
- every condition: permission, role, approval, gate, recovery and pause;
- label maps and the status vocabulary (`STATUS`, `STAGE_TONE`, `TONE_LABEL`, `REASON`, `INTEREST`, `BASIS`, `ELIGIBILITY` and the rest);
- visible and screen-reader-only text;
- element types and their order;
- server-action bindings;
- form field names, values, types and hidden tokens (including `returnTo`);
- validation and state attributes (`required`, `minLength`, `disabled` and the rest);
- ids and their references (`htmlFor`, `aria-*`), roles and live regions;
- `href`s.

The two `SyntheticBanner` strings in `ui.tsx` must also be present verbatim.

A finding gives the file, the line and a category (for example "permission, approval or gate condition" or "server-action binding"). That makes a failure readable.

### 3.3 Exceptions, modes and CI

- **Exceptions** are listed in `scripts/test/flight-deck-boundary.exceptions.json`. Each names a branch, the authorizing decision and a reason.
- They are read from the **merge base**, so a branch cannot grant itself one: an exception takes effect only after it has been merged. PR 4.1 introduces the file, so its own exception (decision 58: `ci.yml`, `scripts/flight-deck/e2e.mjs`, `scripts/test/flight-deck-*`, `docs/design/phase-4/baseline/**`) is read from the branch once, and the report says so.
- **The checker itself** also runs from the merge base in CI once the base has one, so a branch cannot weaken the check that judges it.
- **Modes:**
  - `phase-4/*` branches: layers A and B enforced.
  - Other branches that change a Flight Deck mixed or presentation file: layer B enforced; path findings reported only.
  - Other branches: report only.
  - Pushes to `main`: report only.
- **CI** runs it as the separate `flight-deck-boundary` job, so `build-lint-test` is unchanged. **It is not yet a required check.** Branch protection requires only `build-lint-test`. Making the new job required is a repository-settings change for the founder (§9).

### 3.4 Limitations

The checker is a regression safeguard, not a proof of behavioural equivalence.

- **It cannot see CSS.** An erased class can do any of these:
  - hide or clip content (a warning, a consequence, a banner);
  - reorder it visually (`order`, grid placement) while the DOM order stays protected;
  - lower its contrast;
  - make a control look granted, approved or verified when it is not.

  Those are for the founder's review of before-and-after captures and the runtime checks.
- Generic-wrapper flattening permits a new `div` or `span`, which can change layout and, through CSS, perceived grouping.
- Only the first structural difference in each file is reported. Fixing it may reveal the next.
- Server-action identity is checked by the bound name in the source, and by export name at runtime (the census). Behaviour inside an action is out of the checker's view; it is protected by path.
- A presentational React component (other than a CSS class) cannot replace markup without an exception. That is deliberate: such a component could drop or reorder its children.

## 4. Verification tooling (PR 4.1)

| Tool | What it does | Run |
| --- | --- | --- |
| `scripts/test/flight-deck-boundary.mjs` | Layers A and B (§3) | `node scripts/test/flight-deck-boundary.mjs [--base origin/main] [--working-tree]` |
| `scripts/test/flight-deck-boundary.test.mjs` | Plants controlled violations and permitted changes in the real sources, and runs the CLI against throwaway git repositories (§5.2) | `node --test scripts/test/flight-deck-boundary.test.mjs` |
| `scripts/test/flight-deck-census.mjs` | The runtime control census (§5.3); `--compare` fails on any difference | `node scripts/test/flight-deck-census.mjs --out FILE [--summary FILE.md] [--compare BASELINE]` |
| `scripts/test/flight-deck-census.test.mjs` | Normalization is stable; a withheld, added or altered control is reported | `node --test scripts/test/flight-deck-census.test.mjs` |
| `scripts/test/flight-deck-capture.mjs` | One-pass, full-page captures, the vocabulary sheet and print PDFs (§5.1) | `node scripts/test/flight-deck-capture.mjs --out DIR` |
| `scripts/test/flight-deck-browser.mjs` | The shared headless-Chrome helper. **It refuses a non-loopback base URL, refuses to continue without the local-demo synthetic banner, and refuses to write into `docs/flight-deck/screens/`.** It submits only sign-in and the synthetic seed reset | — |
| `E2E_OUT` in `scripts/flight-deck/e2e.mjs` | Sends the E2E screenshots and results to another directory. Without it, behaviour is unchanged. No assertion changed | `E2E_OUT=<dir> npm run e2e:flight-deck` |

The census and captures run against `npm run dev:flight-deck`, the local synthetic demo on port 3100 with its own build directory (`.next-flight-deck`). It never touches a development server on port 3000.

## 5. The baseline (PR 4.1)

Recorded on 2026-11-03 from the unchanged Flight Deck code at `bec57d2`, against the local synthetic demo. It is in `docs/design/phase-4/baseline/`, which is protected once merged.

### 5.1 Visual baseline (`screens/`, 29 files, 5.7 MB)

- **Screens:** Now, Approvals, Relationship detail (Synthetic Prospect B-02: a first-contact draft awaiting approval), Activity, Health and the relationship print view.
- **Coverage:** each screen as the founder, in dark and light, at 1440 and 390 px: `<screen>.<desktop|mobile>.<theme>.jpg`. Each is **one full-page capture** (`captureBeyondViewport`), never stitched.
- `approvals.desktop.dark.operator.jpg`: Approvals as the operator, with the approval controls withheld.
- `status-vocabulary.desktop.{dark,light}.jpg`:
  - Every `StatusBadge`, `StageBadge` and Health state, rendered in the test browser from the `Badge` markup and the `STATUS`, `STAGE_TONE` and `STAGE_LABELS` definitions read from source.
  - It is not a Flight Deck screen. Nothing in the app was changed to draw it.
- `relationship-print.{dark,light}.pdf`: the print view as a browser prints it (A4, backgrounds off).

Dates in the seed move with the day, so these images are for review, not for pixel identity across days. Later PRs capture "before" from `main` and "after" from the branch with the same script, side by side.

### 5.2 Checker self-tests (98 tests, all pass)

90 boundary tests and 8 census tests:
- each mixed file, unchanged, compares equal;
- 34 path classifications;
- two new-component checks;
- the cases below.

| Case | Expected | Result |
| --- | --- | --- |
| permission condition changed (approve -> dispatch) | Reject | rejected (permission, approval or gate condition) |
| permission condition inverted | Reject | rejected (permission, approval or gate condition) |
| role check changed (founder -> any non-reviewer) | Reject | rejected (permission, approval or gate condition) |
| gate condition changed (fresh sign-in no longer required) | Reject | rejected (permission, approval or gate condition) |
| server-action binding swapped (withdraw -> erase) | Reject | rejected (server-action binding) |
| hidden token value changed (hash -> id) | Reject | rejected (form field, value or hidden token) |
| form field name changed | Reject | rejected (form field, value or hidden token) |
| submit control value changed | Reject | rejected (form field, value or hidden token) |
| hidden returnTo token changed in the shared component | Reject | rejected (form field, value or hidden token) |
| validation attribute changed (minLength) | Reject | rejected (validation or state attribute) |
| submit button no longer disabled while pending | Reject | rejected (validation or state attribute) |
| operational status label changed | Reject | rejected (status vocabulary or label map) |
| status tone changed (failed shown as done) | Reject | rejected (status vocabulary or label map) |
| integration-state label changed (Off -> Disabled) | Reject | rejected (status vocabulary or label map) |
| referenced accessibility attribute changed (aria-labelledby) | Reject | rejected (referenced id or accessible name) |
| label association broken (htmlFor) | Reject | rejected (referenced id or accessible name) |
| live region downgraded (alert -> status) | Reject | rejected (live-region or role semantics) |
| screen-reader-only text removed | Reject | rejected (visible text) |
| SyntheticBanner text changed | Reject | rejected (SyntheticBanner text) |
| data read changed (needs-review -> draft) | Reject | rejected (data read or runtime call) |
| operational import added | Reject | rejected (operational import) |
| navigation target changed | Reject | rejected (navigation target) |
| consequence text moved after the decision buttons | Reject | rejected (behaviour code or element order) |
| visible copy changed | Reject | rejected (visible text) |
| shell: approvals count read changed | Reject | rejected (data read or runtime call) |
| navigation item removed | Reject | rejected (status vocabulary or label map) |
| CSS class change | Permit | permitted |
| shell header offset via the token | Permit | permitted |
| approved style-only import (page stylesheet) | Permit | permitted |
| approved style-only import (console stylesheet in the shell) | Permit | permitted |
| harmless presentation wrapper | Permit | permitted |
| wrapper inside a shared component | Permit | permitted |
| generic tag swap with the same semantics (p -> div) | Permit | permitted |
| inline style removed | Permit | permitted |
| decorative empty element added | Permit | permitted |
| comments and formatting | Permit | permitted |
| attribute order changed | Permit | permitted |
| CLI: phase-4 branch with a class change passes | Permit | exit 0 |
| CLI: phase-4 branch touching src/lib/flightDeck fails | Reject | exit 1 |
| CLI: phase-4 branch changing a hidden token fails | Reject | exit 1 |
| CLI: phase-4 branch adding a new route fails | Reject | exit 1 |
| CLI: non-Phase-4 branch touching only operational code is reported, not failed | Permit | exit 0 |
| CLI: non-Phase-4 branch changing Flight Deck copy fails on structure | Reject | exit 1 |
| CLI: an exception merged into the base is honoured | Permit | exit 0 |
| CLI: an exception a branch grants itself is ignored once the base has an exceptions file | Reject | exit 1 |
| CLI: the merge base, not the base tip, is the comparison point | Permit | exit 0 |

Protected paths tested include `src/lib/flightDeck/**`, `src/proxy.ts`, both `actions.ts` files, `guard.ts`, the auth, internal and export routes, `globals.css`, the root layout, `TopNav`, `/pilot` and its form, `backend/`, `infra/`, `deploy/`, `ci.yml`, `package.json`, the lockfile, the checker, `e2e.mjs`, `next.config.ts` and both evidence directories. All are classified protected.

### 5.3 Runtime control census (`census.json`, `census-summary.md`)

**Coverage:**
- Roles: anonymous (6 screens), founder, operator and reviewer (23 screens each).
- Screens:
  - Now;
  - Relationships, new, and three records (B-02, A-05, A-07 opted out);
  - B-02's print view;
  - Outreach, plus a draft awaiting review (B-02) and a queued follow-up (A-04);
  - Campaigns;
  - Content, plus two drafts;
  - Exceptions and a new case;
  - Approvals, Digest, Activity, Health, Recovery, Gates and Signed out.

**For each screen and role, the census records:**
- the HTTP status and final path;
- landmarks, headings and live regions with their text;
- every form, in DOM order: its server action **by export name** (from the build's server-reference manifest), then each field's tag, type, name, hidden and submit values, select options, validation and state attributes, and accessible name;
- buttons outside forms;
- links outside table bodies;
- table captions and column headers.

**Determinism.** Ids, dates, times and fingerprints become placeholders numbered per screen. Three runs on the file store, and one on the embedded PostgreSQL store, were **identical**.

**Permission-dependent controls,** as recorded (`census-summary.md` lists them all):
- Only the founder is given erase, reconciliation ("Verify and replay now"), lifting an opt-out, the seed reset, and a campaign's state change ("Close campaign" in the seed).
- The founder and operator can run a worker tick; the reviewer cannot.
- The founder and reviewer are given the approval decision; the operator is not.
- Operator management is not in the census, because the local demo has no identity provider; it appears only in production mode.
- The reviewer is given no editing form on a relationship, an outreach draft or a content draft.

**Limitations:**
- It covers seeded states only. The seed has **no exception case**, so case detail is not in the census. A recovery-locked, paused or log-missing console is not in it either; the E2E exercises some of those states, and PR 4.6 must add fixtures for the rest.
- "Gates" is a 404 in the local demo by design: it exists only in production mode, and is checked there by `rehearse:flight-deck`.
- Accessible names are computed approximately (`aria-label`, `aria-labelledby`, `<label>`, text). It is not an accessibility-tree dump.
- The print view writes an audit event each time it is opened; table bodies are excluded so this does not affect the comparison.

### 5.4 Observations recorded at the baseline (not changed)

These are facts about the current console, for the later PRs and the founder. PR 4.1 changes none of them.

1. **Light theme:** "attention" and "blocked" badges are the same red (`--tiro-accent` and `--tiro-contested` are both `#8b3a2b`). Only the glyph and word separate them. The primary "Approve this exact version" fill is the same colour as Reject's outline.
2. **Printing from the dark theme** carries dark-theme text colours onto white paper: the title and values print pale (`relationship-print.dark.pdf`).
3. **On a phone** the console navigation scrolls sideways and cuts off before Approvals and its count.
4. **The reviewer is shown** the "add a contact" (`createProspectAction`) and "open a case" (`openCaseAction`) forms. The second-reviewer list on Approvals includes the demo operator. Whether the domain accepts these is behaviour, outside Phase 4; it is recorded so that no restyle changes it unnoticed.
5. **The public site header and footer,** with their navigation, frame the private console (root layout; protected).
6. The round "N" in the captures is the Next.js development indicator of the local demo, not part of Flight Deck.

## 6. PR sequence

Each PR is merged with a merge commit and can be reverted alone. No data or migrations are involved.

| PR | Scope | Status |
| --- | --- | --- |
| **4.1 Boundary and baseline** | The checker, census, captures, the E2E output override, the CI job, this record and the baseline. **No Flight Deck file changes** | **Authorized (decision 58)**; in review |
| 4.2 Shell and navigation | Scoped stylesheet, `--la-header`, console bar, navigation (Approvals reachable on phones), banner styling, print rules | Needs authorization |
| 4.3 Shared components | Badge tones by form; Notice, PageTitle, Section, Field, Empty, button styling. Founder semantic review of the vocabulary sheet | Needs authorization |
| 4.4 Read-only screens | Now, the lists, Activity, Digest, signed out, print view | Needs authorization |
| 4.5 Working forms | Relationship, outreach, content, campaigns, cases; the "outgoing text" frame | Needs authorization |
| 4.6 Consequential and authorization screens | Approvals, Health, Recovery, Gates, sign-in; fixtures for paused, recovery-locked and log-missing states | Needs authorization |
| 4.7 Integration verification and G4 record | Evidence only | Needs authorization |

**Every PR from 4.2 on must:**
- run on a `phase-4/*` branch;
- pass the boundary job;
- show a census identical to the baseline (`--compare docs/design/phase-4/baseline/census.json`);
- pass the E2E on both stores with `E2E_OUT`;
- provide before and after captures from the same script.

## 7. Gate G4

Phase 4 is complete only with all of the following:

1. PRs 4.1–4.6 merged with merge commits.
2. `build-lint-test` and `flight-deck-boundary` green on each PR and on the final `main`.
3. The boundary checker reports no protected change, and the exceptions file holds nothing beyond what the founder approved.
4. The census is identical to the baseline for all four roles.
5. E2E passes on the file store and on PostgreSQL, with at least the baseline's 53 checks.
6. `test:flight-deck-pg`, `verify:disclosure` and the public-site release suite pass. The `/pilot` and approved public-page captures are unchanged.
7. axe reports no serious or critical violations on every console screen in both themes at 1440 and 390 px. There is no horizontal overflow from 320 px, and every focus stop is visible.
8. The `SyntheticBanner` text is byte-identical. The print view keeps its banner and its CONFIDENTIAL or SYNTHETIC label in both themes.
9. **A manual assistive-technology pass on representative consequential Flight Deck tasks,** on the local demo, with at least one desktop and one phone screen reader. It follows `docs/flight-deck/manual-tests.md` §2 tasks 2–7: find the most urgent item; review and approve an exact version; record an opt-out and confirm it holds; work a deletion request; check recovery status; approve a launch gate (staging only). Results are recorded with the device, assistive technology and versions. **Not done; not marked complete in PR 4.1.**
10. The founder's review of the local synthetic demo, recorded.
11. Then, and only under its own approval, a staging deployment through the existing approval-gated workflow (`deploy-flight-deck-staging.yml`). Staging was last recorded at `b632c24` (2026-10-23), so a separately approved baseline deployment of pre-Phase-4 `main` first would isolate Phase 4's own change. A successful build or preview does not authorize staging.
12. Every public `/flight-deck` route still answers 404 in production. No real data, real contact or outbound capability is introduced.

## 8. Separate open track: public-site accessibility and performance

Not part of Phase 4 and not complete. The earlier records are not changed.

- `docs/design/accessibility-manual-test.md` is still marked **"Not yet run"**, and it describes the Living Trace 0.2 homepage, which `/` no longer serves. A new revision should:
  - target `/`, `/memory-project`, a synthetic record, `/memories` and a record, `/nodes/lagos`, `/community-rights`, `/pilot` and `/contact`;
  - be run with real assistive technology (NVDA on Windows is available; VoiceOver and TalkBack where possible);
  - record its results.
- **Cross-browser:** Firefox and WebKit are not yet tested. Every automated check so far has run in Chrome.
- **Performance:** realistic checks are outstanding: throttled Lighthouse on production pages and a real mid-range phone, plus a larger synthetic Flight Deck dataset for list and table rendering.

## 9. Decisions still open for the founder

1. **Make `flight-deck-boundary` a required status check.** This is a branch-protection setting; it is not changed by this PR.
2. The public site chrome around the console (§5.4 item 5): keep it during Phase 4, or decide separately.
3. The "outgoing text" frame in place of register paper, and status tones by form (§2), at PR 4.3 and 4.5 review.
4. The staging approach for G4 item 11.
5. Behaviour observations in §5.4 item 4: whether any need their own decision outside Phase 4.
