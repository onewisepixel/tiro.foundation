# Milestone 3.0, Phase 2: the Living Archive design system

Status: **Prepared for review on `design/phase-2-living-archive-system`; not merged.**
Date: 2026-10-29. Base: `main` at `6a6eef5`.
Owner: TIRO founder / Steward.
Scope: plan §3 and §8 Phase 2 (`milestone-3.0-consolidation-plan.md`), building on the inventory in `living-archive-consolidation.md`.

A structural refactor, not a redesign. The homepage V5 (`/preview/home-v5`) and Memory Project v1 (`/preview/memory-v1`, its records) now draw on one shared system. No route moved, no production page changed, and no record data, projection, citation, or disclosure rule was touched.

## 1. What became shared

```
src/components/archive/        the Living Archive system
  archive.css                  --la-* tokens, text roles, actions, local bar, the exploded record, motion
  LayerStack.tsx  layers.ts    the exploded record and its layers (one drawing for V5 and v1)
  useLayerTabs.ts              the layer tablist's keyboard model (V5 record, v1 method)
  useScrollSpy.ts              orientation that follows reading (local bar, record map)
  LocalNav.tsx                 an inner page's local bar
src/components/record/         the record view (record-view-contract.md)
  record.css  RecordMap.tsx  CopyCitation.tsx  Concordance.tsx
src/lib/geometry.ts            r2() and cubic(): hydration-safe coordinates (+ test)
src/app/globals.css            --la-header (the site header's height)
```

| Concern | Before | Now |
| --- | --- | --- |
| Layout tokens | `--hv5-max/pad/hair/faint`, `--mv1-max/pad/hair/faint` | `--la-max`, `--la-pad`, `--la-hair`, `--la-faint`, defined by the `la` class on a page's root, so a scoped palette (`.tiro-register-paper`, `[data-palette]`) still applies |
| Header height | `--mv1-header: 63px` and `pt-[63px]` in v1; `61px` in Flight Deck | `--la-header: 63px` in `globals.css`, used by v1's pages, local bar, record map and anchor offsets (§3) |
| Frame | `.hv5-frame`, `.mv1-frame` | `.la-frame` |
| Text roles | `-eyebrow`, `-cite` under both prefixes; `.mv1-dt` | `.la-eyebrow`, `.la-cite`, `.la-term` |
| Actions | `.hv5-cta`, `.mv1-cta`, `.mv1-more`, `.mv1-button` | `.la-cta`, `.la-more`, `.la-button` |
| Motion | `rise`, `enter`, `separate` keyframes and rules, twice | `.la-rise`, `.la-enter`, `.la-sheet` with `la-*` keyframes; the same reduced-motion and print rules |
| Exploded record | `RecordLayers.tsx` drew its own five sheets; v1 had `LayerStack.tsx` | One `LayerStack`: `derived={false}` gives V5's five-sheet drawing, the default gives v1's six (Derived detached and dashed), `sealed` the restricted record. V5's tablist and record panel stay V5's |
| Layer definitions | inline in `RecordLayers.tsx`; `layers.ts` in v1 | `archive/layers.ts`. V5 keeps its own short glosses ("What it says") beside the shared names |
| Tablist keyboard | the same Arrow/Home/End code in two components | `useLayerTabs` |
| Reading position | the same scroll-spy loop in `LocalNav` and `RecordMap` | `useScrollSpy` |
| Geometry | `r2` and the Bézier point local to `HeroStrands` | `src/lib/geometry.ts`, unit-tested; `LayerStack`'s collapse offsets also pass through `r2` |
| Record view | `RecordMap`, `CopyCitation`, `Concordance` styled from the page stylesheet | `components/record/` with its own `record.css` |

`LocalNav` takes its title as a prop (it was fixed to "The Memory Project"), so another inner page can use it. The records route (`RECORDS_BASE`) moved out of `layers.ts` into `components/preview/memory-v1/routes.ts`: it is the preview's routing, not record vocabulary, and Phase 3 changes it.

## 2. What deliberately stayed separate

- **Homepage narrative** (`components/preview/home-v5/`): `HeroStrands`, `Thread`, `TwoAccounts`, and `RecordLayers`' tablist and specimen panel. Phase 3 moves them to `/` with the page.
- **Memory Project specifics** (`components/preview/memory-v1/`, `memory-v1.css`): the finding aid, `ConsentLifecycle`, `MethodLayers`' panel, catalogue, readiness gates, section rhythm.
- **Headline scales.** `.hv5-h1/-h2` and `.mv1-h1/-h2` share a face but not a scale: the homepage's are larger by intent, and v1 balances its line breaks. Merging them would change both pages.
- **The homepage's restricted sheet.** V5 draws its sealed record inline at a different aspect (`200 × 120`) from `LayerStack sealed` (`400 × 210`). Using `LayerStack` would visibly change the homepage (decision 1 in §8).
- **`.hv5-secondary` and `.la-more`.** The same underline behaviour, but the homepage's is a larger display-face link beside the hero action. Kept apart rather than parameterised.
- **Flight Deck.** Untouched, as plan §4 reserves its presentation for Phase 4 (§3).
- **`trace/` primitives** (`Reveal`, `EvidenceTag`, `SyntheticNotice`, `Boundary`, …): already shared, unchanged.

The inventory called several rules "identical" that were not quite. Measured, the homepage differs in three: its CTA is `1.6rem` wide (v1 `1.5rem`), its quotation sources sit `0.85rem` below the quote (v1 `0.75rem`), and its eyebrow has an `18px` line height so the label sits on the thread's node. The shared classes take v1's values; `home-v5.css` keeps the homepage's three, scoped `.hv5 .la-*` and commented. Unifying them is decision 2 in §8.

## 3. Header height

The site header measures **63 px** at every tested width (1440, 820, 390 px) and in both themes: a 1 px rule, 2 × 1 rem padding, and 30 px content (the mark and the buttons). v1's value was right.

- `--la-header: 63px` is a constant in `globals.css`, not a measurement written by `TopNav`. A measured value would follow the narrow-screen menu when it opens and push every sticky bar down with it. The parity script checks the rendered header against it on every capture.
- `TopNav` is unchanged.
- **Flight Deck is unchanged.** Its layout uses `61px` (`pt-[61px]`, `top-[61px]`), so its sticky bar sits 2 px under the header's bottom edge. Correcting it to the token would move Flight Deck by 2 px, which this phase must not do, and its presentation is Phase 4's (plan §4). Recorded for Phase 4 (decision 3).

## 4. Intentional differences

None is visible. Every Living Archive capture is pixel-identical (§5). The comparison found these differences, all expected:

| Difference | Where | Effect |
| --- | --- | --- |
| V5's sheets begin separating at **400 ms** plus their stagger, not 420 ms (`LayerStack`'s 100 ms base; V5's own drawing used 120 ms) | `/preview/home-v5`, full motion only | 20 ms earlier; the final state is identical. Accepted so the exploded record has one timing |
| Keyframes renamed `hv5-rise` / `mv1-rise` → `la-rise`, likewise `separate` and `enter` | both pages, full motion only | Same keyframes, durations and easing |
| `aria-hidden="true"` now also on the `<svg>` of V5's drawing | `/preview/home-v5` | Its wrapper was already `aria-hidden`; the accessibility tree is unchanged |
| `data-derived="false"` on V5's five sheets | `/preview/home-v5` | An attribute no style or script reads |

## 5. Verification

**Method.** `scripts/test/living-archive-parity.mjs` ran against two production builds served side by side: `main` at `6a6eef5` (baseline) and this branch. It drove headless Chrome at device scale 1, for each page × {light, dark} × {desktop 1440, tablet 820, mobile 390} × {reduced motion, full motion}. For each capture it recorded:

- a **full-page screenshot**, compared pixel by pixel;
- a **style fingerprint** of every rendered element in `<main>`:
  - its box, to 0.01 px;
  - its attributes and its own text;
  - 42 computed properties: type, colour, borders, spacing, grid, transform, opacity, SVG fill and stroke, transitions and animations.

  Class names and SVG presentation attributes are left out, so a renamed class, or an attribute moved into CSS, compares equal when it renders the same;
- console errors and warnings, uncaught exceptions, and React hydration errors;
- horizontal overflow, and the measured height of the site header.

Once per page, it also ran **keyboard checks**:

- the first 40 Tab stops, each with its focus ring;
- both layer tablists through the Arrow keys, Home and End, with the panel each selects;
- the concordance's disclosure buttons, with Enter and Space;
- the record map's links;
- V5's `#record-terms` deep link.

Full-motion captures scroll the page from top to bottom so every reveal runs, then wait for the longest animation to settle. The baseline was first captured twice, to measure run-to-run noise.

**Pages**

- The four required: `/preview/home-v5`, `/preview/memory-v1`, the public specimen `DEMO-LT-0001` and the restricted specimen `DEMO-LT-0002`.
- The authority scenario record, `DEMO-MP-0001`.
- Five production routes that must not change: `/`, `/memory-project`, `/manifesto`, `/living-trace` and `/pilot`.

**Results** (120 captures on each side)

| Check | Result |
| --- | --- |
| Pixels, the five Living Archive pages | **Identical in all 60 captures** (0 differing pixels) |
| Style fingerprint, the five Living Archive pages | Identical apart from the differences listed in §4. No box, colour, type, spacing or transform differs |
| Production routes | Pixel- and fingerprint-identical in 52 of 60 captures. The other 8 are full-motion captures of `/` and `/living-trace`, which differ by 7 to 87 pixels in the animated constellation; the unchanged baseline differs from itself by 9 to 41 pixels in the same captures. One capture of `/` first differed by 14,440 pixels because a reveal had not yet run in the baseline. Recaptured three times on each build, its fingerprint is identical and its pixels are within the noise (9) |
| Console, exceptions, hydration | **None** in any capture, before or after |
| Horizontal overflow | **None** at any width |
| Header height | **63 px** in every capture, equal to `--la-header` |
| Keyboard and focus | **Identical** (224 observations on each side) |
| Reduced motion | Pixel-identical. The reduced-motion rules (no transitions on the sheets, the local bar, the tabs or the homepage's figure) carried over; the fingerprint's transition properties confirm it |
| Typecheck (`tsc --noEmit`) | Pass |
| Lint (`eslint .`) | 0 errors; the 2 warnings already on `main` (`backend/src/services/intake.test.ts`) |
| `npm test` (Windows) | 539 of 543 pass. The 4 failures are in `managedLoginScript.test.ts`, a Bash script that refuses a temporary file whose Unix permissions Windows cannot set. This branch does not touch it, and it passes on Linux CI |
| `npm run build` | Pass |
| `npm run verify:disclosure` | Pass: 35 client files, 421 prerendered files, 31 routes |

**Disclosure.** Nothing changed under `src/lib/livingTrace/` or `src/data/`, nor `scripts/test/verify-disclosure.mjs`. The record pages render the same values from the same projections; only class names and component locations changed.

**Untouched:** `TopNav`, `TiroMark`, `src/proxy.ts`, everything under `src/app/flight-deck/`, `src/components/flight-deck/` and `src/lib/flightDeck/`, and every production page. `globals.css` gains one custom property, which nothing outside the Living Archive pages reads.

**Evidence** (`docs/design/phase-2/`). For each of the five pages, a sheet of the first screen before and after, at three widths in both themes. Plus a close view of the exploded record on four of the pages (`layer-stack.jpg`). The sheets illustrate; the proof is the full-page pixel comparison above.

**Limitations**

- **One browser engine:** headless Chrome on Windows. Firefox and Safari were not run. No CSS value changed, so any engine difference would affect the before and after builds alike.
- **Flight Deck was not captured.** No Flight Deck file changed, and `globals.css` only adds `--la-header`. Its screenshots belong to Phase 4.
- **Linux CI has not run yet.** It runs on this branch when the PR into `main` is opened.
- **No assistive-technology session was run.** The accessibility tree is unchanged by construction, apart from the redundant `aria-hidden` noted in §4.

## 6. Files

**Created**

- `src/components/archive/archive.css`, `useLayerTabs.ts`, `useScrollSpy.ts`
- `src/components/record/record.css`
- `src/components/preview/memory-v1/routes.ts`
- `src/lib/geometry.ts`, `src/lib/geometry.test.ts`
- `scripts/test/living-archive-parity.mjs` (the parity harness; reusable for Phase 3's G3)
- `docs/design/milestone-3.0-phase-2-design-system.md` (this record) and `docs/design/phase-2/*.jpg` (evidence)

**Moved** (`git mv`), then edited

- `components/preview/memory-v1/LayerStack.tsx`, `layers.ts`, `LocalNav.tsx` → `components/archive/`
- `components/preview/memory-v1/RecordMap.tsx`, `CopyCitation.tsx`, `Concordance.tsx` → `components/record/`

Git records four of these as renames. `LayerStack.tsx` and `LocalNav.tsx` changed enough that Git records them as new files, so `git log --follow` does not cross their move. Their earlier history is under the old paths: `git log -- src/components/preview/memory-v1/LayerStack.tsx`.

**Modified**

- `src/app/globals.css` (adds `--la-header` only)
- `src/app/preview/home-v5/page.tsx`, `home-v5.css`
- `src/app/preview/memory-v1/page.tsx`, `memory-v1.css`, `records/[id]/page.tsx`
- `src/components/preview/home-v5/RecordLayers.tsx`, `HeroStrands.tsx`, `TwoAccounts.tsx`
- `src/components/preview/memory-v1/MethodLayers.tsx`, `ConsentLifecycle.tsx`
- `package.json` (adds `geometry.test.ts` to `npm test`)
- `docs/design/living-archive-consolidation.md` (status, and the corrections in §2)

**Made redundant, and removed in this change** (duplicates, not files)

- The two page stylesheets lose 648 lines and gain 33; `archive.css` and `record.css` (522 lines) replace them, a net reduction of 93 lines.
  - Removed: the `hv5-` and `mv1-` frame, eyebrow, cite, CTA, motion, keyframe, sheet and print rules, each written twice.
  - Moved with their components: v1's local-bar, record-map, citation and concordance rules.
- `RecordLayers.tsx`'s own sheet drawing and layer list; two copies of the tablist keyboard code and of the scroll-spy loop.

No file became unused. The earlier explorations (V2–V4) and every branch are untouched (Phase 5).

## 7. Gate G2

**Recommendation: G2 is met**, once the PR's Linux CI run passes. G2 asks for visual parity (plan §8). It was measured rather than judged:

- zero differing pixels on every Living Archive page, in both themes, at three widths, with and without motion;
- no change on the production routes beyond the noise of an unchanged build;
- no console or hydration errors, and no horizontal overflow;
- identical keyboard behaviour;
- the disclosure check passes.

The one timing difference (§4) is 20 ms, and appears only as motion.

## 8. Decisions for the founder

None blocks this phase. Three small choices are recorded for when they become relevant:

1. **The homepage's restricted sheet** (§2). Should the homepage draw it with `LayerStack sealed`, so a restricted record looks the same there as on its record page? That is a visible change to the sheet's size and proportions, so it belongs with Phase 3's review of the homepage, with before-and-after screenshots. Recommendation: yes, in Phase 3.
2. **Two homepage spacing values** (§2): the CTA's width (1.6 rem against v1's 1.5 rem) and the gap below a quotation (0.85 rem against 0.75 rem). Should they take v1's values? The difference is imperceptible either way. The eyebrow's line height is structural, because it aligns the label with the thread's node, and stays. Recommendation: unify in Phase 3, when V5 becomes `/` and its screenshots are reviewed anyway.
3. **Flight Deck's header offset** (§3): it uses `61px` against a 63 px header. Recommendation: adopt `--la-header` in Phase 4, which reviews Flight Deck's presentation with screenshots. The change moves Flight Deck's content down 2 px.
