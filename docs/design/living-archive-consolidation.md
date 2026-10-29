# The Living Archive: shared components and tokens (V5 ↔ Memory Project v1)

Status: **Inventory and proposal; consolidated in Milestone 3.0 Phase 2.** What was built, what differs from this proposal, and the evidence are in `milestone-3.0-phase-2-design-system.md`. In short: the tokens, text roles, actions, motion, `LayerStack` and `layers.ts` are shared under `src/components/archive/`, and the record view under `src/components/record/`. Three rules this inventory calls identical differ slightly on the homepage (CTA width, quotation-source spacing, eyebrow line height); the homepage keeps its values. `--la-header` is a constant, not a measurement (Phase 2 record, §3). `FindingAid` was not extracted: it has one consumer.
Revision date: 2026-10-28 (status updated 2026-10-29).
Owner: TIRO founder / Steward.
Purpose: Record what the homepage (V5) and the Memory Project (v1) already share, where they diverge, and how to consolidate them when they are adopted for production.

## 1. Already shared (no action needed)

Both previews import these existing modules directly. They are the de facto shared system today.

| Module | Role |
| --- | --- |
| `src/components/TiroMark.tsx` | The canonical mark (V5 hero; site header everywhere) |
| `src/components/trace/SyntheticNotice.tsx` | Demonstration labeling (`SyntheticPill`, `SyntheticNotice`) |
| `src/components/trace/EvidenceTag.tsx` | Evidence states in words and line pattern |
| `src/components/trace/OriginPoint.tsx` | Origin / node glyph |
| `src/components/trace/Reveal.tsx` | One-time reveal, reduced-motion safe |
| `src/lib/livingTrace/evidence.ts` | Evidence states, use categories, grant labels |
| `src/lib/livingTrace/projection.ts` | The disclosure boundary |
| `src/app/globals.css` | All colour tokens (`--tiro-*`), light/dark themes, `--lt-ease`, durations |

Memory Project v1 also reuses `Boundary.tsx`, `PermissionGrid.tsx`, `TemporalRail.tsx`, and `VoiceSource.tsx` unchanged.

## 2. Duplicated under two prefixes (consolidate on adoption)

These are the same design decisions, written twice as `hv5-*` and `mv1-*`.

### Tokens

| V5 | Memory v1 | Value | Proposed shared token |
| --- | --- | --- | --- |
| `--hv5-max` | `--mv1-max` | `78rem` | `--la-max` |
| `--hv5-pad` | `--mv1-pad` | `1.5rem`, `1rem` ≤ 480 px | `--la-pad` |
| `--hv5-hair` | `--mv1-hair` | mineral line at 50% | `--la-hair` |
| `--hv5-faint` | `--mv1-faint` | mineral line at 30% | `--la-faint` |
| n/a | `--mv1-header` | `63px` (site header) | `--la-header`, ideally measured from the header itself |
| `--hv5-gutter` | n/a | thread gutter | stays homepage-specific |

### Type and text roles

| Role | V5 class | v1 class | Notes |
| --- | --- | --- | --- |
| Eyebrow label | `.hv5-eyebrow` | `.mv1-eyebrow` | Identical (code face, 0.6875rem, 0.24em, accent) |
| Section heading | `.hv5-h2` | `.mv1-h2` | v1 adds `text-wrap: balance`; adopt it everywhere |
| Display headline | `.hv5-h1` | `.mv1-h1` | Different scales by intent (homepage larger); keep two sizes of one role |
| Lede | `.hv5-lede` | `.mv1-lede` | Same face; v1 slightly smaller |
| Quote source | `.hv5-cite` | `.mv1-cite` | Identical |
| Primary action | `.hv5-cta` | `.mv1-cta` | Identical |
| Secondary link | `.hv5-secondary` | `.mv1-more` | Same underline treatment; merge |

### Motion

`.hv5-rise` / `.mv1-rise`, `.hv5-enter` / `.mv1-enter`, and the sheet separation (`hv5-separate` / `mv1-separate`) are identical keyframes and rules. Consolidate to one set under the existing Living Trace motion vocabulary in `globals.css`.

### Components

| Concern | V5 | Memory v1 | Proposal |
| --- | --- | --- | --- |
| Exploded record drawing | `RecordLayers.tsx` (drawing + tablist + panel, five layers) | `LayerStack.tsx` (drawing only, six layers incl. Derived; sealed variant) | **One `LayerStack`** (v1's: it separates drawing from interface and supports Derived and sealed). Same geometry already: `CX 200`, `RX 170`, `RY 58`, `Y0 66`, `GAP 86`. V5's homepage use becomes `LayerStack` + a tablist, i.e. v1's `MethodLayers`. |
| Layer definitions | inline in `RecordLayers.tsx` | `layers.ts` | **One `layers.ts`** (v1's). |
| Two accounts | `TwoAccounts.tsx` (forked through v3 → v3.1 → v4 → v5) | `Concordance.tsx` | Keep **both**, as different roles: `TwoAccounts` explains one contested relationship to a newcomer; `Concordance` lists all of a record's relationships for a reader. Retire the earlier forks. |

## 3. Specific to each page (do not generalize)

| Page | Element | Why it stays local |
| --- | --- | --- |
| Homepage | `HeroStrands`, `Thread` (the page-long line) | The homepage's narrative devices. An inner page needs its own rhythm. |
| Memory Project | Finding aid, `LocalNav`, `ConsentLifecycle`, readiness gates | Specific to describing a collection and its governance, though the finding aid and local bar are candidates for other institutional pages. |
| Record page | `RecordMap`, `CopyCitation` | Part of the record-view contract (`record-view-contract.md`). They belong with the record system, not the page. |

## 4. Proposed structure on adoption

```
src/components/archive/        shared Living Archive system
  tokens.css                   --la-* tokens, type roles, motion (or folded into globals.css)
  LayerStack.tsx  layers.ts    the exploded record
  Concordance.tsx              a record's relationships
  CopyCitation.tsx             citation display (uses src/lib/livingTrace/citation.ts)
  LocalNav.tsx  FindingAid.tsx inner-page orientation
src/components/record/         the record-view contract
  RecordView.tsx  RecordMap.tsx
src/components/home/           homepage-only
  HeroStrands.tsx  Thread.tsx  TwoAccounts.tsx
```

The `trace/` primitives stay where they are; the archive system builds on them.

## 5. Known divergences to resolve

- **Server/client determinism.** V4's canopy and any future geometry must avoid `**` / `Math.pow` in rendered coordinates (engine-dependent last digits broke hydration in V5 before it was fixed by rounding). Adopt a shared `r2()` rounding helper.
- **Header height.** v1 hard-codes the site header (63 px) for sticky offsets. On adoption, derive it from the header (a CSS variable set by `TopNav`) so a header change cannot misalign sticky elements.
- **Ref read during render.** V3.1's `TimeScale` reads a ref during render (works; the React lint rule only flags it in V4's version, which was fixed). Not carried forward.
- **Navigation.** Neither preview changes the shared `TopNav`. The reference design's navigation (Purpose / The Memory Project / Principles / Get involved) is an open information-architecture decision.
- **Links between previews.** Previews link to each other (`/preview/home-v5` ↔ `/preview/memory-v1`). On adoption, production routes must link to production routes only; no production page may point at `/preview/`.
