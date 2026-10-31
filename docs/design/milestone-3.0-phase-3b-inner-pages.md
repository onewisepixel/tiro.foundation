# Milestone 3.0, Phase 3b: inner pages — the Manifesto, Community Rights, About and Nodes studies, and the inventory

Status: **`/manifesto` approved and released, 2026-10-30** (decision 50; PR #17 merged as `3c997d4`). The study was built on branch `design/phase-3b-manifesto`, from `main` at `6cd0920` (Phase 3a released).
P3B-1, the `/pilot` overflow: **repaired and released, 2026-10-30** (PR #18 merged as `512bebe` after independent review; verified in production).
`/community-rights`: **approved and released, 2026-10-30** (decision 51; PR #19 merged as `acf6372`; verified in production, §1b.3). The study was built on branch `design/phase-3b-community-rights`, from `main` at `512bebe`.
`/about`: **approved and released, 2026-10-30** (decision 52; PR #20 merged as `d9cfb00`; verified in production, §1c.3). The study was built on branch `design/phase-3b-about`, from `main` at `acf6372`.
`/nodes` and the node profiles: **approved for release, 2026-10-30** (decision 53; PR #21; the ring's semantics corrected before release, §1d.2). The study was built on branch `design/phase-3b-nodes`, from `main` at `d9cfb00`.
Date: 2026-10-30.
Owner: TIRO founder / Steward.
Scope: plan §8 Phase 3b, restyling the inner pages with their substance unchanged. Four studies change pages: `/manifesto` (§1), `/community-rights` (§1b) and `/about` (§1c), all released, and `/nodes` with its two profiles (§1d, approved for release), with one fix to `/pilot` (P3B-1, a line break in the email address; released). The other pages are inventoried here and not touched.

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
- `community-rights.desktop.light.png`, `community-rights.desktop.dark.png`, `community-rights.mobile.light.png` and `community-rights.mobile.dark.png`: the whole page at full resolution, each **captured in one render** (the viewport set to the page's height), so nothing is joined.
- `community-rights.viewports.desktop.jpg` and `community-rights.viewports.mobile.jpg`: screenshots of the browser viewport, taken as the page is scrolled, at principle 2, the closing statement and the procedure, in both themes. Each tile is one capture; the white gutters and red outlines belong to the sheet, not the page.

**Limitations:** tested in Chrome only, with no screen-reader session.

### 1b.2 Release-gate resolutions

The founder approved the visual design on 2026-10-30, with two items to close before merging.

**1. Gray bands and repeated fragments in the tall screenshots: a screenshot artifact, not a rendering defect.**

- **Cause.** The first versions of the three full-resolution PNGs were three or four separate 900 px captures stacked into one image by a scratch tool. That tool fills the gaps between captures with a 24 px `#888` band. The captures overlapped, so the content where they met appears twice. In the mobile image, for example, the end of the contents list and the opening of the procedure panel are repeated.
- **Proof.** Scanned row by row, the old images contain only full-width rows of exactly `#888`, in runs of 24: two bands in each desktop image (3 × 900 + 2 × 24 = 2,748 px) and three in the mobile image (4 × 900 + 3 × 24 = 3,672 px). These are the gaps of the stacking tool.
- **The page itself.** Checked in a production build of this branch's commit (`0278967`, the code the team preview is built from), at 1440 and 390 px in light and dark:
  - The blocks follow one another without overlapping, in order: the opening, the seven clauses, the procedure, the status note, then the footer.
  - The procedure's text and the closing statement of principle 7 each appear once. The procedure's title appears twice, by design: in the contents and as the heading.
  - The new single-render captures contain no full-width row of uniform gray: neither `#888` nor any mid-gray.
  - The viewport screenshots show no bands, duplication or overlap.
- **Team preview.** The team preview built successfully (Vercel status: "Deployment has completed"). It is behind Vercel's login, which an automated browser cannot pass without a change to Vercel settings, so it was not opened in this check.
- **Outcome.** No page change. The stitched images are replaced by the single-render captures and viewport sheets listed above. Because the page did not change, the visual and accessibility results in §1b.1 still apply.

**2. Scope statement.** The header said this study changes `/manifesto` only, which was written before Community Rights. It now names both studies and the `/pilot` fix.

The founder judged G3 satisfied on the final commit, `507d66e` (Linux CI 41134762438 passed, including the disclosure verifier; the team preview deployed).

### 1b.3 Release and production verification

PR #19 was marked ready and merged with a merge commit as **`acf6372`** on 2026-10-30. Linux CI on the merge commit (run 41136641591) passed, including the disclosure verifier, and the team production deployment completed. The page was then checked at `https://www.tiro.foundation/community-rights`:

| Check | Result |
| --- | --- |
| Release suite (`public-site-checks.mjs`, against production) | **171 of 171 pass**. Among them: the eight clause anchors exist; the procedure is a heading; axe finds no serious or critical violations and the console no errors, at 1440 and 390 px in light and dark; no overflow at 320, 390 or 820 px; `/flight-deck`, `/flight-deck/sign-in` and `/flight-deck/internal/status` are 404 |
| Both themes, rendering | At 1440 and 390 px in light and dark: the blocks in order without overlap, each text block once (the procedure's title twice, by design), no uniform gray rows in a single-render capture. Viewport screenshots of the contents, the clauses, the closing statement and the request panel are clean |
| Clause anchors | `#custody` through `#exclusivity`, `#requests` and `#principles` land below the header and local bar, and the bar marks the right stop. `#status` comes into view |
| Request panel | Heading, the procedure's text and "Contact TIRO" (to `/contact`) in its panel, in both themes, on desktop and mobile |
| Mobile layout | No overflow at 320 or 390 px. The contents list, the procedure link and the panel are legible in both themes |
| Keyboard | The same tab order as in §1b.1. Every stop shows its focus ring |
| Links | The same destinations as before: `/contact`, `/manifesto`, `/memory-project` |
| Disclosure boundary | `/flight-deck`, `/flight-deck/cases`, `/flight-deck/outreach`, `/flight-deck/login` and `/api/flight-deck/health` return 404 |

## 1c. `/about`: who TIRO is

About is short and read once: who TIRO is, the principle it works by, and how it will be governed. It takes the family's type, rules and accent. It does not take the Manifesto's contents and local bar, or Community Rights' numbered clauses: it has two sections, and neither is cited by number.

| Element | Treatment | Why |
| --- | --- | --- |
| Opening | "About" as the eyebrow, the headline in display italic, and the introduction set larger as a lede | As the Manifesto and Community Rights. The introduction was small sans text; it is the page's first statement |
| Sections | **"Custodial Paradigm" and "Governance" are now headings** (`h2`, previously styled `<p>` labels), each a section with a stable anchor: `#custodial-paradigm`, `#governance`. On wide screens they are set as a finding aid, the heading beside its text; on narrow ones, above it | Fixes P3B-2 for this page: the outline now has both sections. The finding aid suits a short page of two labelled entries, and differs from the Community Rights schedule, which is numbered |
| Custodial Paradigm | The paragraph as a statement in the display serif, with the accent rule; the card is gone | It is the page's one statement of principle. The card held small sans text |
| Governance | The note that governance "is still forming" first, in muted text; then the three entries ("Ethics oversight", "Regional stewards", "Transparency and appeals") as `h3`s with their text, divided by rules | The entries are intentions, not appointed roles, and the note that says so comes before them, as before. They were `h2`s; under "Governance" they are now `h3`s |
| Onward | The sentence about the Manifesto and the Memory Project, then the four links ("Read Manifesto v0.2", "Enter the Memory Project", "Community Rights & Stewardship", "Contact TIRO") in the text column | As before, in the family's link style (`la-more`) |
| No local bar | — | Two short sections fit in about two screens, so a bar would add orientation the page does not need. The anchors make each section citable |

**Kept out on purpose:** motion, imagery, and the inventory's suggested "finding-aid summary (who, what, status)". A summary would add wording that the page does not have, so the structure gives the page a finding aid's shape, with no new text.

**Content preservation:**

- The metadata and the `governance` array are byte-identical to `main`, and every paragraph's text is unchanged.
- The whole text of `<main>`, compared in the rendered page, is **identical** before and after. The only moves: the two section labels become headings, and the three governance labels move from `h2` to `h3`.
- The four links are unchanged: `/manifesto`, `/memory-project`, `/community-rights`, `/contact`. Nothing new is linked.

### 1c.1 Verification

All checks compare production builds of `main` (`acf6372`) and this branch, served side by side.

| Check | Result |
| --- | --- |
| Text preserved | As above |
| Headings | One h1, two h2s (Custodial Paradigm, Governance), three h3s. Previously one h1 and three h2s, with the two section labels missing from the outline |
| Anchors | `#custodial-paradigm` and `#governance` land below the site header at 1440 and 390 px |
| Overflow | None at 320, 390 or 820 px |
| axe-core (WCAG 2.0, 2.1 and 2.2, A and AA) | **No violations** of any severity, in light and dark, at 1440 and 390 px |
| Release suite (`public-site-checks.mjs`) | **181 of 181 pass**. New checks: the two anchors exist, and both sections are headings. `/about` joins the axe and console sweep |
| The approved interfaces unchanged | `/`, `/memory-project`, the records, `/living-trace` and `/pilot`: **0 differing pixels and identical keyboard behaviour** (96 captures). The only differences are in `/living-trace` motion captures (7–47 px) with identical style fingerprints: capture timing, as before |
| Disclosure verifier | The boundary holds (37 client files, one more than before for the page's stylesheet; 399 prerendered files; 29 routes) |
| Unit tests, lint, build | 550 of 554 tests pass; the 4 failures are the known Windows-only `managedLoginScript` tests, as on `main`. Lint: 0 errors. Build passes |

**Screenshots** (`docs/design/phase-3b/`), each page captured in one render with nothing joined:

- `about.desktop.jpg`: before and after at 1440 px, light and dark.
- `about.mobile.jpg`: before and after at 390 px, light and dark.
- `about.desktop.light.png`, `about.desktop.dark.png` and `about.mobile.dark.png`: the new page at full resolution.

**Limitations:** tested in Chrome only, with no screen-reader session.

### 1c.2 Founder approval

The founder approved the visual design of PR #20 with no revisions (decision 52), having inspected the desktop and mobile comparisons in both themes and reviewed the diff. The founder independently confirmed the head `472e014`, the branch 2 commits ahead of `main` and 0 behind, the 11 changed files, and Linux CI run 41140397240 (the disclosure verifier and the Flight Deck integration tests passing). The protected team preview was not opened; the approval rests on the committed screenshots and CI. The local bar and the suggested summary stay out, as proposed.

### 1c.3 Release and production verification

The approval was recorded in `28e2b57` (Linux CI 41147112001 passed, every step including the disclosure verifier and the Flight Deck integration tests). PR #20 was then marked ready and merged with a merge commit as **`d9cfb00`**. Linux CI 41147327593 passed on the merge commit, and the team production deployment completed. Checked at `https://www.tiro.foundation/about`:

| Check | Result |
| --- | --- |
| Release suite against production | **181 of 181 pass**, including the `/about` anchor and heading checks, axe (no serious or critical violations) and console checks in both themes at 1440 and 390 px, and no overflow at 320, 390 or 820 px |
| Both themes | Full-page captures in one render at 1440 and 390 px, light and dark, match the approved screenshots |
| Anchors | `#custodial-paradigm` and `#governance` land below the 63 px header (title at 144 px at 1440, 128 px at 390) |
| Disclosure boundary | `/flight-deck`, `/flight-deck/cases`, `/flight-deck/outreach`, `/flight-deck/login` and `/api/flight-deck/health` return 404 |

## 1d. `/nodes` and the node profiles: a gazetteer

The founder's principle for this study: the Nodes pages should show the difference between **established relationships, proposed initiatives and future ambitions**, and should not invent partnerships, operational activity or community endorsements to look more complete.

On these pages today **nothing is established**: no collected record refers to any node, and every link is to a demonstration record. Nor do the pages name a proposed initiative. So the study shows each node's real standing, from data the page already has, and adds no status words of its own.

The directory and the profiles take the family's type, rules and accent, with an identity of their own: a **gazetteer**, the reference form for places and languages. Places and languages are entries, not cards, and each entry is a destination that can be cited.

| Element | Treatment | Why |
| --- | --- | --- |
| Opening (all three) | The eyebrow, the headline in display italic and the introduction as a lede, as in the family; under `--la-header` | Fixes P3B-3 on these pages |
| The demonstration notice | Set as a notice with the accent rule, before anything it qualifies (the directory's page notice; each profile's connections notice) | What the links refer to is said before it is seen |
| `/nodes`: the directory | One entry per seed, in the existing order. On wide screens: the kind ("Place", "Language") in the margin, the name, the linked records and "Open node profile", and the record count at the right. On phones: kind and count above the name. Each entry has an anchor (`/nodes#port-harcourt`) | A directory is scanned by name and cited by entry. The four seeds without a profile are still listed and citable, set a shade quieter |
| Standing | Before every record count, a **ring**: dashed until a **collection** record refers to the node, solid once one does. Demonstration and pilot records leave it dashed. Every ring is dashed today. The count is the page's existing label ("2 Demonstration Records") | The ring is computed from the records (`hasCollectionRecord`), so it cannot claim more than they establish. It marks archival evidence only: a collection record does not by itself establish a community relationship, verification or permission to publish. It is the Memory Project's mark for a readiness gate not yet met, so it means the same thing on both pages. It is computed from the static record dataset (`src/data/memories.ts`), not the live Memory service, which is not enabled (decision 44) |
| Profiles: sections | "Memory Connections", "Themes", "Languages" (Lagos) and "Related Nodes" are now **headings** (`h2`, previously styled `<p>` labels), each a section with an anchor (`#memory-connections`, `#themes`, `#languages`, `#related-nodes`), the heading beside its text on wide screens | Fixes P3B-2 for these pages: the profiles had no section headings at all |
| Profiles: connections | Rows in the Memory Project catalogue's style: the title with its "Demo" label, then the summary; each row links to its `/memories` record, as before | The links into `/memories` must stay (decision 48) |
| Profiles: empty lists | "None recorded…" with the dashed ring, in a shorter section | An empty relationship list is a stated fact about the record, not a gap in the design |
| Not added | Maps, imagery, motion, partner or community names, status words ("proposed", "planned"), a local bar, and a link back to the directory | A map would picture a presence TIRO does not have, and status words would be new claims. Three short sections do not need a local bar. The directory stays one step away in the footer ("Nodes") |

**Content preservation:**

- The metadata, the seed list, the record helpers and the notices are unchanged. Every list is still computed from the records.
- On all three pages, the whole text of `<main>`, compared in the rendered page, is **identical** before and after. Only the markup moves: the profiles' section labels become headings, and the directory's kind and count move from `<span>`s to paragraphs.
- The links are unchanged, in the same order, on all three pages: the `/memories` records and the two profiles.

**For a founder decision, later:** when a real relationship exists, the pages will need words for its standing (for example, *established*, *in discussion*, *intended*). The ring gives that vocabulary a place, but choosing the words is a content decision, not a design one, so the study leaves them out.

### 1d.1 Verification

All checks compare production (`main` at `d9cfb00`) with a production build of this branch.

| Check | Result |
| --- | --- |
| Text preserved | As above, on all three pages |
| Ring semantics | Unit tests: demonstration and pilot records leave the ring dashed, and a collection record makes it solid. The release suite checks that every ring on `/nodes` renders dashed today (six entries, all demonstration records) |
| Headings | `/nodes`: one h1 and six h2s, as before. `/nodes/lagos`: one h1 and four h2s; `/nodes/nigerian-pidgin`: one h1 and three h2s. Before, each profile had only its h1 |
| Anchors | Directory entries and profile sections land below the site header at 1440 and 390 px. Sections near the end of a page land as high as the page can scroll |
| Overflow | None at 320, 390 or 820 px, on all three pages |
| axe-core (WCAG 2.0, 2.1 and 2.2, A and AA) | **No violations** of any severity on all three pages, in light and dark, at 1440 and 390 px |
| Release suite (`public-site-checks.mjs`) | **201 of 201 pass**. New checks: every directory entry has an anchor, every ring renders dashed, and each profile's sections are headings with anchors. Both profiles join the axe and console sweep |
| The approved interfaces unchanged | `/`, `/memory-project`, the records, `/living-trace` and `/pilot`: **0 differing pixels and identical keyboard behaviour** (120 captures). The only differences are in four `/living-trace` motion captures (11–42 px) with identical style fingerprints: capture timing, as before |
| Disclosure verifier | The boundary holds (38 client files, one more than before for the Nodes stylesheet; 399 prerendered files; 29 routes) |
| Unit tests, lint, build | 555 of 559 tests pass (five are new, for the ring); the 4 failures are the known Windows-only `managedLoginScript` tests, as on `main`. Lint: 0 errors (2 warnings in unchanged backend files). Build passes |

**Screenshots** (`docs/design/phase-3b/`), each page captured in one render with nothing joined:

- `nodes.desktop.jpg` and `nodes.mobile.jpg`: the directory before and after, at 1440 and 390 px, light and dark.
- `nodes-profiles.desktop.jpg` and `nodes-profiles.mobile.jpg`: both profiles before and after, at 1440 and 390 px, light and dark.
- `nodes.desktop.light.png`, `nodes.mobile.dark.png` and `nodes-lagos.desktop.dark.png`: the new pages at full resolution.

**Limitations:** tested in Chrome only, with no screen-reader session.

### 1d.2 Founder approval and the ring correction

The founder approved the visual design of PR #21 (the directory and both profiles, desktop and mobile, light and dark), with content preservation, accessibility, the disclosure boundary and Linux CI 41153059436 passing. The founder held the merge for one correction to the relationship-status semantics.

**The defect:** at `4e622af`, the ring turned solid for any record that was not a demonstration (`recordKind !== "demo"`). The record model has three categories (`"demo" | "pilot" | "collection"`), so a future pilot record would also have turned it solid. A record's category alone does not establish verification or permission to publish (`src/data/memories.ts`).

**The correction:**

- The rule is now `hasCollectionRecord` in `src/lib/recordKind.ts`: solid only for a `collection` record. Demonstration and pilot records leave the ring dashed.
- The variable and attribute are renamed from `established` / `data-established` to `hasCollection` / `data-has-collection`. The ring marks archival evidence, not an established community relationship.
- Regression checks: unit tests for demonstration, pilot, mixed and empty sets, and a release check that every ring on `/nodes` renders dashed today.
- The ring is computed from the static record dataset (`src/data/memories.ts`), not the live Memory service, which is not enabled (decision 44). This is noted in the code and in §1d.

No visible change today: every node's records are demonstrations, so every ring was dashed before and after the correction. All twelve full-page captures of the three pages (1440 and 390 px, light and dark) are byte-identical to those approved. No further visual review was requested.

The founder independently confirmed the correction at `afbd413` (Linux CI 41155122288, the disclosure verifier and the Flight Deck integration tests passing) and approved the release (decision 53). Collecting a record does not by itself establish a partnership with the community it concerns: an established community relationship remains a separate question, requiring its own evidence and a future governance decision.

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
| P3B-2 | Section labels are not headings | `/about`, `/community-rights`, `/nodes/*` | Before 3.0 | Fixed page by page as each is restyled: `/community-rights` and `/about` (released), `/nodes` and its profiles (§1d, approved) |
| P3B-3 | Hard-coded `pt-28` header offsets | every page in §2 except `/pilot` | Before 3.0 | Each page adopts `--la-header` when restyled: `/community-rights` and `/about` (released), `/nodes` and its profiles (§1d, approved) |
| P3B-4 | `/memories` still in the old visual language | `/memories`, `/memories/[id]` | — | Restyle only, under decisions 44 and 48 |
| P3B-5 | On phones, the local bar scrolls sideways without an obvious cue that more parts follow | `LocalNav` (`/manifesto`, `/memory-project`) | Founder review, 2026-10-30 | Not blocking. Revisit (for example, a subtle fade at the right edge) if touch-device testing shows confusion |

## 4. Proposed order after the Manifesto

1. **P3B-1**, the `/pilot` overflow, as its own small PR (released; §3).
2. `/community-rights`: the policy page, cited from the homepage, the Memory Project and every record; it most needs anchors (released; decision 51, §1b).
3. `/about`: the institution explained (released; decision 52, §1c).
4. `/nodes` and the two node profiles: the gazetteer (approved; decision 53, §1d).
5. `/contact`.
6. `/pilot` (presentation only).
7. `/memories` (restyle only).

Each is one PR, with the Manifesto's evidence: content preserved, screenshots, accessibility, and the release checks.
