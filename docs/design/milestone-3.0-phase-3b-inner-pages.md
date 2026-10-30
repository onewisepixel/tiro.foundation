# Milestone 3.0, Phase 3b: inner pages — the Manifesto study and the inventory

Status: **First study for founder visual approval; not merged.** Branch `design/phase-3b-manifesto`, from `main` at `6cd0920` (Phase 3a released).
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
| **P3B-1** | **Horizontal overflow at 320 px**: `custodians@tiro.foundation`, set as an `inline-block` display-size link, is 349 px wide and cannot wrap. The page scrolls sideways on the smallest phones | `/pilot` (the "Start a conversation" section) | Before Phase 3a (identical on `main` at `5715821`) | **Its own small repair**, separate from the `/pilot` restyle: let the address wrap at its `@` or scale its type down at narrow widths. The release checks list it as a known exception that must be removed when fixed. Presentation only; the form is untouched |
| P3B-2 | Section labels are not headings | `/about`, `/community-rights`, `/nodes/*` | Before 3.0 | Fixed page by page as each is restyled |
| P3B-3 | Hard-coded `pt-28` header offsets | every page in §2 except `/pilot` | Before 3.0 | Each page adopts `--la-header` when restyled |
| P3B-4 | `/memories` still in the old visual language | `/memories`, `/memories/[id]` | — | Restyle only, under decisions 44 and 48 |

## 4. Proposed order after the Manifesto

1. **P3B-1**, the `/pilot` overflow, as its own small PR.
2. `/community-rights`: the policy page, cited from the homepage, the Memory Project and every record; it most needs anchors.
3. `/about`.
4. `/nodes` and the two node profiles.
5. `/contact`.
6. `/pilot` (presentation only).
7. `/memories` (restyle only).

Each is one PR, with the Manifesto's evidence: content preserved, screenshots, accessibility, and the release checks.
