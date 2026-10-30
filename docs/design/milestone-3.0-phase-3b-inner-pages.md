# Milestone 3.0, Phase 3b: inner pages — the Manifesto study and the inventory

Status: **`/manifesto` approved and released, 2026-10-30** (decision 50; PR #17 merged as `3c997d4`). The study was built on branch `design/phase-3b-manifesto`, from `main` at `6cd0920` (Phase 3a released).
P3B-1, the `/pilot` overflow: **repaired and released, 2026-10-30** (PR #18 merged as `512bebe` after independent review; verified in production).
`/community-rights`: **second study, for founder visual approval; not merged** (§1b). Branch `design/phase-3b-community-rights`, from `main` at `512bebe`.
Date: 2026-10-30.
Owner: TIRO founder / Steward.
Scope: plan §8 Phase 3b, restyling the inner pages with their substance unchanged. This study changes `/manifesto` only. The other pages are inventoried here and not touched.

## 1. `/manifesto` as the reference for long-form institutional pages

The Manifesto is TIRO's longest and most foundational text: a prelude and seven parts, about 3,000 words, read rather than scanned. It takes the Living Archive's typography, palette, rules and shared components, with a rhythm of its own.

| Element | Treatment | Why |
| --- | --- | --- |
| Opening | The TIRO mark, "Manifesto v0.2", the founding statement as the headline (display italic), then a **contents list** of the seven parts | A long text should show its shape before it is read. The contents list is the long-form counterpart of the Memory Project's finding aid |
| Orientation | The shared **local bar** (`LocalNav`), naming the seven parts and marking the one being read | The same device as the Memory Project, so the pages feel like one family. Its "way on" link is now optional; the Manifesto has none |
| Reading measure | One column, 38 rem, centred, set in the archive's serif (Spectral) at 18–19 px with generous leading | Long reading: the measure and the face carry the text, and nothing competes with it |
| Parts | Each opens on its **numeral** (hanging in the left margin on wide screens, as marginalia; above the heading on narrow ones), its heading, and a rule | The structure is visible at a glance and every part is an anchor (`#memory` … `#obligation`) |
| First sentence | Each part's first sentence, and the prelude's, is set as a **lede** | Each part opens on its thesis ("Memory is not simply data about the past. It is continuity."). Typography marks it; the words do not change |
| The quotation | "Civilization is not merely…" as an inscription with an accent rule | As before, a set-apart quotation |
| Anchors | A quiet `#` beside each heading, visible on pointing or focus, for citing a part | A manifesto is quoted; a part should be linkable |
| Closing | The founding statement, "TIRO", "Memory. Intelligence. Stewardship." | As before |

**Kept out on purpose:**

- **Motion:** none. The page is read, not watched.
- **Imagery:** none. No decorative archival imagery, and nothing that could pass for historical evidence.
- **Content additions:** no summaries, pull quotes or headings beyond the text's own.

**Content preservation, proved two ways:**

- The two arrays holding the text (`preludeParagraphs`, `sections`) are byte-identical to `main`.
- In the rendered page, every text block of the previous page (66 of them, from the version label to the closing lines, including the quotation) appears in the same order, and nothing is added. The only moves: the seven numerals go from small labels into their headings, and each section heading now reads "I Memory" rather than "Memory".

**Pattern for the long-form pages that follow:**

1. The archive root (`la`), `archive.css`, and a page stylesheet scoped to its own prefix.
2. An opening (eyebrow, headline, and a contents list or finding aid).
3. `LocalNav` for orientation.
4. One reading measure.
5. Numbered or titled parts as `section`s with anchored `h2`s.
6. Ledes where the text has a thesis.
7. No decorative imagery.

`/about` and `/community-rights` fit this pattern directly (§2). The pattern is deliberately not a component: the Manifesto's margin numerals suit numbered parts, and a policy page needs a different opening and an action at its close.

### 1.1 Verification

All checks below compare production builds of `main` (`6cd0920`) and this branch, served side by side.

| Check | Result |
| --- | --- |
| Text preserved | The text arrays are byte-identical to `main`. In the rendered page, every text block of the previous page appears in order, and nothing is added (§1) |
| Headings | One h1 and seven h2s, with no gaps. Each h2 reads with its numeral ("I Memory"). Each part's `#` link sits beside its heading, so its label never becomes part of the heading's name |
| Anchors | `#memory`, `#intelligence`, `#stewardship`, `#node`, `#witness`, `#long-view` and `#obligation` all resolve. A part opened from the contents lands below the header and local bar, and the local bar marks it |
| Keyboard | Tab order: skip link, site header, local bar (title and the seven parts), contents (the seven parts, in order). A part's `#` link appears, with its focus ring, when focused |
| axe-core (WCAG 2.0, 2.1 and 2.2, A and AA) | **No violations**, in light and dark, at 1440 and 390 px |
| Overflow | None at 320, 390 or 820 px |
| Console and hydration | No errors |
| Release suite (`public-site-checks.mjs`) | **160 of 160 pass** on this branch. The `/pilot` overflow is reported as known (P3B-1) |
| The approved interfaces unchanged | `/`, `/memory-project` and the public, restricted and authority records, plus `/living-trace` and `/pilot`: **0 differing pixels** and identical keyboard behaviour (42 captures, both themes, three widths). `LocalNav`'s now-optional way-on link changes nothing where it is used |

**Screenshots** (`docs/design/phase-3b/`):

- `manifesto.opening.jpg` and `manifesto.part-ii.jpg`: before and after, desktop, tablet and mobile, in both themes.
- `manifesto.desktop.light.png` and `manifesto.desktop.dark.png`: the opening, prelude and part I at full resolution.

**Limitations:** tested in Chrome only, with no screen-reader session. The printed page was not reviewed beyond hiding the anchors and the local bar.

## 1b. `/community-rights`: the policy page

Community Rights is the standard every record follows, and other documents cite it. The Manifesto is read straight through; a policy is consulted and cited. The page therefore takes the Manifesto's type, rules, accent and local bar, but not its layout.

| Element | Treatment | Why |
| --- | --- | --- |
| Opening | The policy's name as the eyebrow, the founding statement as the headline (display italic), and the introduction set larger as a lede | As before, in the Manifesto's typography |
| Contents | The seven principles, **numbered 1–7**, then the request procedure, set apart as a bordered link with the accent rule | A policy should show its clauses before they are read. The procedure is listed with them so that someone looking for it finds it from the first screen |
| Orientation | The shared local bar: "Principles" and "Requests", with **"Contact TIRO"** as its way on (wide screens) | The same device as the Manifesto and the Memory Project. The status note keeps its anchor but is not a stop on the bar: it is short and last, so it never reaches the top of the view to be marked current |
| Clauses | Each principle is a numbered `section` with an `h2` ("3 Consent: explicit, traceable, revocable") and a stable anchor. On wide screens, number and principle sit beside the text, like a schedule; on narrow ones, above it. Text in the archive's serif at reading size, held to the same measure as the Manifesto | A policy is cited by clause. The schedule distinguishes it from the Manifesto's continuous reading |
| Anchors | `#custody`, `#source-authority`, `#consent`, `#access`, `#provenance`, `#purpose`, `#exclusivity`, `#requests` (and `#principles`, `#status`). A quiet `#` beside each heading, as on the Manifesto | **Written out in the page, not derived from the wording**, so a later change to a principle's label never breaks a link already made to it. A label with no anchor fails the build |
| The closing statement of principle 7 | "A community is a node in its own right — not a dependency of TIRO's." as an inscription with an accent rule | As before, set apart |
| Correction, restriction, withdrawal | **Now a heading** (`h2`, previously a styled `<p>`), in its own panel with a full border, the accent rule above, and a primary action, **"Contact TIRO"** (`la-cta`) | The one procedure a community may need urgently. It is listed in the contents and the local bar and reachable as `#requests`; its link was previously a small text link |
| Status and onward links | The note that the policy will be formalized, then "Read the Manifesto v0.2" and "The Memory Project" | As before |

**Kept out on purpose:** motion, imagery, and any summary, gloss or plain-language rewording of the policy. The clause numbers are presentation (like the Manifesto's numerals); they do not renumber or amend the policy.

**Content preservation:**

- The `principles` array (each label, description and emphasis) and the page metadata are byte-identical to `main`.
- In the rendered page, every text block of the previous page appears in the same order, and nothing is added. The one move: "Requesting a Correction, Restriction, or Withdrawal" changes from a paragraph to a heading.
- Every link of the previous page is kept (`/contact`, `/manifesto`, `/memory-project`), and no new destination is added. The local bar repeats `/contact`; everything else new is an in-page anchor.

### 1b.1 Verification

All checks below compare production builds of `main` (`512bebe`) and this branch, served side by side.

| Check | Result |
| --- | --- |
| Text preserved | As above |
| Headings | One h1 and eight h2s (the seven principles and the procedure), with no gaps. Previously the procedure was not a heading |
| Anchors | All ten resolve. Each principle and the procedure land below the header and local bar, and the bar marks the right stop |
| Keyboard | Tab order: skip link, site header, local bar (title, Principles, Requests, Contact TIRO), contents (the seven principles, then the procedure), each clause's `#` link, the procedure's `#` link and "Contact TIRO", the closing links, then the footer. Every stop shows its focus ring |
| Overflow | None at 320, 390, 820 or 1440 px |
| axe-core (WCAG 2.0, 2.1 and 2.2, A and AA) | **No violations** of any severity, in light and dark, at 1440 and 390 px |
| Release suite (`public-site-checks.mjs`) | **171 of 171 pass** on this branch. New checks: the clause anchors exist, and the procedure is a heading. `/community-rights` is now in the axe and console sweep |
| The approved interfaces unchanged | `/`, `/memory-project`, the public, restricted and authority records, `/living-trace` and `/pilot`: **0 differing pixels and identical keyboard behaviour** (96 captures). The only differences are in `/living-trace` motion captures (8–39 px), which differ by the same amount between two captures of the same build: capture timing |
| Unit tests, lint, build | 550 of 554 tests pass; the 4 failures are the known Windows-only `managedLoginScript` tests, as on `main`. Lint: 0 errors. Build passes |

**Screenshots** (`docs/design/phase-3b/`):

- `community-rights.opening.jpg`: the opening, before and after, at desktop, tablet and mobile widths, in both themes.
- `community-rights.clauses.jpg`: principle 3 (Consent), before and after.
- `community-rights.desktop.light.png`, `community-rights.desktop.dark.png` and `community-rights.mobile.dark.png`: the schedule, the closing statement and the procedure, at full resolution.

**Limitations:** tested in Chrome only, with no screen-reader session.

## 2. Inventory of the other Phase 3b pages

| Page | What it is | Structure today | Reusable from the Living Archive | Distinct needs | Defects found |
| --- | --- | --- | --- | --- | --- |
| `/about` | Who TIRO is: custodial paradigm, governance | An eyebrow and h1, then a card and two labelled sections; one h2 | The long-form pattern (§1) | Short; benefits from a finding-aid-like summary (who, what, status) | The section labels "Custodial Paradigm" and "Governance" are styled `<p>`s, not headings, so the outline skips them |
| `/community-rights` | Stewardship policy: the standard every record follows | An eyebrow and h1, a card, a list under one h2, and a request procedure | The long-form pattern; the `la-term` and `la-more` roles | A policy: clause numbering and **stable anchors** for citing clauses; a clear procedure for correction, restriction and withdrawal | "Requesting a Correction, Restriction, or Withdrawal" is a styled `<p>`, not a heading; no anchors (other pages cite this policy) |
| `/nodes` | Node index v0.1 | An eyebrow and h1, a key/value block, chips, cards; one h2 | Catalogue rows (like the Memory Project's catalogue); `la-term`; `LocalNav` if it grows | Distinguish *philosophical* nodes from *operational* nodes (Manifesto IV); no node is operational | none beyond the shared ones (last row) |
| `/nodes/lagos`, `/nodes/nigerian-pidgin` | Node profiles (place; language) | An h1, then five or four cards, each under a styled `<p>` label; **no h2** | Concordance-like lists for related nodes and memory connections; chips | Their links into `/memories` records must stay (decision 48) | **No section headings at all** ("Memory Connections", "Themes", "Languages", "Related Nodes" are `<p>`s) |
| `/pilot` | A pilot is forming, with the public interest form | Living Trace 0.2 `Movement` grammar, with anchored sections and the form | The `Movement` grammar is already structured; restyle toward the archive's type and rules | **The public-form submission boundary is fixed**: form logic, tokens, the privacy notice version and the gate stay in Flight Deck's boundary (plan §4). Presentation only | **P3B-1: horizontal overflow at 320 px** (below) |
| `/contact` | How to reach a steward | An eyebrow, h1, and one email link | `la-cta` / `la-more` for the address | Very short; a one-screen page | The same long-email risk as `/pilot` at large type (it passes at 320 px today) |
| `/memories`, `/memories/[id]` | Backend-connected public records (not enabled), and three static demonstration records | Its own index and detail layouts | Catalogue rows; record-kind notices | **Must stay separate from the Memory Project demonstration** (decisions 44, 48); service behaviour unchanged | Wording corrected in Phase 3a. Otherwise the restyle is outstanding |

**Shared across these pages:**

- **Hard-coded header offsets.** Every one sets `pt-28` (112 px) under a 63 px header, instead of `--la-header` plus its own rhythm.
- **Labels instead of headings.** Section labels are styled `<p>`s (`tiro-eyebrow`) rather than headings, so the heading outline has gaps; screen-reader users navigating by heading miss whole sections.
- **No in-page anchors.**
- **Old type and palette.** `tiro-card` and `tiro-eyebrow` from the earlier visual language.

axe-core reports **no violations** on these pages today (Phase 3a release checks), because a missing heading level is not a WCAG failure axe detects. The outline gaps are a real navigation defect nonetheless.

## 3. Tracked issues

| ID | Issue | Where | Since | Plan |
| --- | --- | --- | --- | --- |
| **P3B-1** | **Horizontal overflow at 320 px**: `custodians@tiro.foundation`, set as an `inline-block` display-size link, is 349 px wide and cannot wrap. The page scrolls sideways on the smallest phones | `/pilot` (the "Start a conversation" section) | Before Phase 3a (identical on `main` at `5715821`) | **Repaired and released** (PR #18, merged as `512bebe`; Linux CI 41104899979): a `<wbr />` lets the address break before its `@` only when it cannot fit. At 320 px the address breaks onto two lines and the page width drops from 349 to 320. At wider widths it stays on one line; the only pixel change is sub-pixel anti-aliasing on the address's last glyphs (about 55–86 pixels; its width moves by 0.01 px), because the text is now two runs. Its text, selection and copy are unchanged, as are the link and the form. Every other page is unchanged. The release checks no longer carry a known exception. Verified in production: 320 px wide at 320 px, the exact `mailto:` link, the form unchanged ("Form not yet open"), and every public `/flight-deck` route 404 |
| P3B-2 | Section labels are not headings | `/about`, `/community-rights`, `/nodes/*` | Before 3.0 | Fixed page by page as each is restyled |
| P3B-3 | Hard-coded `pt-28` header offsets | every page in §2 except `/pilot` | Before 3.0 | Each page adopts `--la-header` when restyled |
| P3B-4 | `/memories` still in the old visual language | `/memories`, `/memories/[id]` | — | Restyle only, under decisions 44 and 48 |
| P3B-5 | On phones, the local bar scrolls sideways without an obvious cue that more parts follow | `LocalNav` (`/manifesto`, `/memory-project`) | Founder review, 2026-10-30 | Not blocking. Revisit (for example, a subtle fade at the right edge) if touch-device testing shows confusion |

## 4. Proposed order after the Manifesto

1. **P3B-1**, the `/pilot` overflow, as its own small PR (released; §3).
2. `/community-rights`: the policy page, cited from the homepage, the Memory Project and every record; it most needs anchors (study in §1b).
3. `/about`.
4. `/nodes` and the two node profiles.
5. `/contact`.
6. `/pilot` (presentation only).
7. `/memories` (restyle only).

Each is one PR, with the Manifesto's evidence: content preserved, screenshots, accessibility, and the release checks.
