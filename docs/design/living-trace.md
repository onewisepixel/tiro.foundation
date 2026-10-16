# The Living Trace — design language 0.1 (implementation reference)

Status: Proposal implemented in code for founder review. Not adopted brand, not doctrine.
Revision date: 2026-10-16.
Sources: `docs/TIRO_Living_Trace_Claude_Execution_Brief.md` (requirements), `docs/TIRO_Living_Trace_Visual_Direction.pdf` (direction).
Authority: Display semantics only. Defers to `docs/manifestov0-2.txt`, `/community-rights`, `docs/ethos.txt`, and `docs/501c3.txt`. Nothing here changes the mark, manifesto, rights policy, or legal status.

## 1. What was built

| Surface | Path | Notes |
| --- | --- | --- |
| Homepage, six movements on one spine | `src/app/page.tsx` | Proof A as the hero; Witness → Participate below. "On this page" index skips any movement. |
| Design proof and reference | `/living-trace` (`src/app/living-trace/page.tsx`) | Grammar, the three proofs with annotations, Discover, tokens. Scoped palette toggle (current vs candidate). `noindex`. |
| Specimen record routes | `/living-trace/records/[id]` | Proof B (public record) and Proof C (restricted notice) as real pages. `noindex`. |
| Mobile navigation | `src/components/TopNav.tsx` | Fixes the pre-existing overlap at ≤1023px (logo collided with links; theme toggle clipped). Adds "Community Rights" to the primary nav. |
| Skip link | `src/app/layout.tsx` | "Skip to content" → `#content`. |

## 2. Semantics (the grammar)

| Primitive | Meaning | Rendering | Component |
| --- | --- | --- | --- |
| Origin | A source, person, record, or place | Circumpunct from the mark's own geometry (ring r=8, dot 2.6). Hollow and dotted = origin expected but not on record. | `trace/OriginPoint.tsx` |
| Trace | A typed, evidence-linked relationship | Line pattern set by evidence state (below). Always paired with relation type + basis + asserter. | `trace/EvidenceTag.tsx` |
| Constellation | Plural records, navigable, not merged | SVG composed separately for wide and narrow screens, plus a complete text list. Selecting either drives one inspector showing the source chain. | `trace/Constellation.tsx` |
| Boundary | Consent and community authority, including absence | Quiet double rule. No padlock, blur, or unlock control. Enforced by the projection layer. | `trace/Boundary.tsx` |
| Time | Versions, continuity, change | Ordered rail of the record's own history. Unknown entries drawn hollow. | `trace/TemporalRail.tsx` |
| Voice | Personhood and testimony | Without consented audio: a silent waveform and "No audio attached". Never autoplay; always a text path. | `trace/VoiceSource.tsx` |

Evidence states (`src/lib/livingTrace/evidence.ts`, single source of truth). Each state uses stroke pattern, glyph, and words, never color alone:

| State | Line | Tone | Meaning |
| --- | --- | --- | --- |
| Recorded | solid | accent (gold) | Present in the source material itself |
| Attested | solid | mineral | Stated by an identified source, with a reference |
| Inferred | dashed `5 5` | mineral | An interpretation; the interpreter is named |
| Contested | two strands, dash-dot | contested | Accounts disagree; each is kept and attributed |
| Unknown | dotted `1 5` | muted | No evidence; absence shown, not filled in |

Use permissions follow the eight categories in `docs/ethos.txt` §3.3, each with its own state (`granted`, `limited`, `not-granted`, `unknown`, `disputed`, `withdrawn`, `not-applicable`). Only `granted` draws a solid glyph.

Rule: a visible connection needs a relation type, an evidence state, a basis, and a path back to an origin. `projection.test.ts` enforces this for every edge.

## 3. The Boundary is enforced in data

`src/lib/livingTrace/projection.ts` is the only path from `src/data/livingTrace/syntheticArchive.ts` to a page. It mirrors the backend's public-view doctrine (`backend/src/services/publicView.ts`):

- Allow-list projection. Output objects are built field by field; a field added to the archive later is withheld by default (tested).
- Undiscoverable = nonexistent. `resolveRecord()` returns `null` for both. The route uses `generateStaticParams` + `dynamicParams = false`, so no page is built for an undiscoverable record. `next build` lists only DEMO-LT-0001, -0002, -0004. Over HTTP the two 404 responses were byte-identical apart from Next's per-request nonce.
- Restricted with notice renders only `authorizedDisclosure` (reference, notice text, may-contact). The document title is generic. A restricted record without an authorized notice is treated as undiscoverable.
- No counts of withheld records anywhere; a count is a disclosure.
- Restricted records never appear in the relationship graph, even with a notice, because a relationship is metadata about the record.
- Client components may not import the archive or `projection.ts` (which would bundle the archive into browser JS). Pure graph code lives in `graph.ts`. Tested by a source scan.
- Canary strings are planted in restricted/undiscoverable fixtures. Verified absent from every projection (unit test), every served HTML page, and all 17 client JS chunks (HTTP scan).

For verification only: DEMO-LT-0003 is the undiscoverable fixture. Public pages deliberately never name it.

## 4. Tokens

Additive to `src/app/globals.css`. Existing tokens keep their meaning.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--tiro-mineral` | `#8fa6a3` (7.49:1) | `#46605d` (5.38:1) | Relationships between records (text-safe) |
| `--tiro-mineral-line` | `#6d8583` | `#5f7976` | Strokes only (non-text) |
| `--tiro-contested` | `#d08770` (6.78:1) | `#8b3a2b` (6.08:1) | Contested accounts |
| `--tiro-raised` | `#121621` | `#f6f1e6` | Panels, inspectors |
| `--lt-measure` | `38rem` | | Reading measure |
| `--lt-gutter` | `1.5rem` / `1rem` ≤480px | | Side gutter |
| `--lt-dur-*`, `--lt-ease` | 160 / 240 / 1400ms | | Motion |
| `--lt-spine-dx` | 0.6px / 1.6px ≥768px | | Aligns the spine with the mark's resonance line (x=47 of 90) |

Contrast fixes to existing tokens (measured, WCAG 2.x formula):
- Dark `--tiro-text-subtle` 0.40 → 0.56: 3.26:1 → 5.33:1.
- Light `--tiro-text-subtle` 0.40 → 0.63 (2.45:1 → ~4.8:1); light `--tiro-text-muted` 0.63 → 0.70 to keep muted above subtle.

Registers: `.tiro-register-paper` sets the existing Paper ("archival record voice") tokens on one surface inside a dark page. The Record uses it.

Candidate palette (not adopted): `[data-palette="living-trace"]` holds obsidian `#101719`, slate `#242B30`, ivory `#E4DED0`, gold `#B79B68`, mineral `#6D8583`, with a contrast-checked light pairing (ink `#172022` on `#EFEBE2`; gold-deep `#7B6436` 4.75:1; mineral-deep `#46605D` 5.71:1). Compare on `/living-trace` with the palette switch. Adopting it means adding `data-palette="living-trace"` to `<html>`.

Typography: existing self-hosted families fill every role, so no fonts were added. Spectral is editorial (statements, attributed quotation); Karla is interface; Space Mono is catalog labels only (`.lt-label`); Space Grotesk stays the logotype.

Motion (`.lt-draw`, `.lt-fade-in`, `.lt-grow-down`): every animation runs only under `prefers-reduced-motion: no-preference` and only moves toward the static final state. With reduced motion the composition is identical, already drawn. No scroll-jacking, no WebGL, no animation library.

## 5. Content and data assumptions

- All specimen content is synthetic, labeled before any archival-looking field, and isolated from `src/data/memories.ts`. It is not counted in any record total.
- No testimony, quotation, person, place, or consent is invented. Values are "Not specified", "None", or describe what a real record would hold.
- The only quotation used is attributed doctrine: Manifesto v0.2 §V.
- The record field set is a schema proposal from `docs/ethos.txt` §§3.2–3.3, §12 and `docs/memory.txt`. No approved Memory Record Specification exists.
- The Participate maturity statement paraphrases Manifesto v0.2 §IV (Node Zero; readiness gates).

## 6. Validation (2026-10-16, measured)

- `npm test`: 341/341 pass, including 10 new tests in `src/lib/livingTrace/projection.test.ts`.
- `eslint .`: 0 errors. 2 warnings, both pre-existing in backend files.
- `tsc --noEmit` clean; `next build` succeeds.
- axe-core 4.10 (WCAG 2.0/2.1/2.2 A/AA + best practice), dark and light, on `/`, `/living-trace`, both specimen routes, and `/community-rights`. The first run found one moderate issue (a nested complementary landmark in the record), now fixed. The re-run reports 0 violations on all pages in both themes. Each page has 1 "incomplete" item that needs manual review.
- Lighthouse 12.6 mobile on the production build: `/` performance 92, accessibility 100, best practices 100; CLS 0; TBT 20ms; FCP 0.9s; LCP 3.4s. The `/living-trace` pages are similar (91, LCP 3.5s). LCP misses the 2.5s target in `docs/ethos.txt` §0.5, but untouched pages show the same (`/community-rights` 3.4s, `/about` 3.2s). The LCP is web-font heading render delay site-wide, not a regression from this work.
- No horizontal overflow at 320, 390, 820, or 1440px. Screenshots are in `docs/design/screens/`. Full-page "after" images come from the dev server and show its "N" indicator.

## 7. Deferred

- Site-wide LCP: investigate font loading (preload, `font-display`, subsetting) for the Spectral display face.
- Real-device and screen-reader passes (VoiceOver and TalkBack) have not been done.
- Carry the grammar into `MemoryDetail` related nodes and memories. Those links have no relation type in `src/data/memories.ts`, so they should say "relationship type not recorded". This was not done, to avoid touching archive display while governance items below are open.
- `src/components/Hypersphere.tsx` and the `three` / `@react-three/*` dependencies are unused.
