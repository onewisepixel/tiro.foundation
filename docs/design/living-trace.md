# The Living Trace — design language 0.2 (implementation reference)

Status: **Proposal, implemented in code for founder review.** Not adopted brand, not doctrine, not an operational specification.
Revision date: 2026-10-16. Supersedes the 0.1 version of this file. 0.1 evidence is in `screens/0.1/`.
Sources: `docs/TIRO_Living_Trace_Claude_Execution_Brief.md`, `docs/TIRO_Living_Trace_Visual_Direction.pdf`, and the 0.2 implementation directive.
Authority: Display semantics only. Defers to `docs/manifestov0-2.txt`, `/community-rights`, `docs/ethos.txt`, and `docs/501c3.txt`. Nothing here changes the mark, the manifesto, the rights policy, the backend, or legal status.
Companion: `docs/design/art-direction.md`.

---

## 1. What 0.2 is

0.1 established the grammar. 0.2 makes it the structure of the experience. The homepage is the Manifesto's own sequence, **Origin. Transmission. Resonance.** (§IV), made literal:

- **Origin.** The approved mark opens the site at monumental scale, annotated with its three parts in its own words.
- **Transmission.** Its resonance line narrows into a single trace, the spine, that runs unbroken through every movement.
- **Resonance.** In Discover the trace hands over to a constellation of records, each still connected to its source. In Participate it branches to real actions and ends at an open origin: the next record has not been made yet.

The meaning of every primitive is unchanged from 0.1. What changed is that the page's composition now *argues* the philosophy instead of illustrating it.

## 2. Phase I — integrity corrections

### 2.1 Provenance of contested relationships

The 0.1 problem (`graph.ts` `sourceChain`): one breadth-first walk over **any** edge, returning one chain. A contested relationship was reduced to a single lineage, and the walk passed through an *inferred* curatorial edge, so connectivity stood in for provenance.

0.2 model (`src/lib/livingTrace/graph.ts`):
- A relationship holds **accounts**. Each account has a position, a claimant (`assertedBy`), a kind (`source` or `interpretation`), an evidence state, and an anchor (the record that holds it).
- **Who made a claim** (`assertedBy`, per account) is separate from **who recorded or interpreted the relationship** (`recordedBy`, per edge).
- Provenance is traced **only along source links** (`provenance: true`: "source of the account", "translated from"). Shared place, language, event, or an interpretation never counts as a path to a source.
- `edgeProvenance()` returns **one trace per account**: `traced` (with origin and chain), `incomplete`, `no-source`, `interpretation`, or `withheld`. It also reports whether the source accounts are **independent**, meaning they come from distinct origins.
- The inspector shows every account with its own chain. For multiple source accounts it states whether they are independent. For an open question it says "No one has made this claim."

### 2.2 Disclosure boundary

Retained: the allow-list projection (`src/lib/livingTrace/projection.ts`). Strengthened:

| Requirement | Enforcement | Evidence |
| --- | --- | --- |
| Archive cannot enter client bundles | `import "server-only"` in the archive and the projection (Next handles it natively; no dependency added). `graph.ts` and `layout.ts` are pure and data-free. | Seeded client import → **`next build` fails** (tested, then reverted) |
| …transitively | Source-graph walk from every `"use client"` file | `projection.test.ts` |
| No leak via metadata, relationships, serialized props, generated pages | Per-account authorization (below); restricted records never become graph nodes; orphaned context nodes are pruned | Canary strings planted in the archive. Checked in unit projections **and** in the build output |
| Production artifacts | `scripts/test/verify-disclosure.mjs` scans `.next/static` (client bundles) and every prerendered HTML/RSC payload; checks the prerender manifest | `npm run build && npm run verify:disclosure`: pass on 16 client files, 190 prerendered files, 19 routes. A seeded internal-field leak **fails** it (tested, then reverted) |
| Undiscoverable = nonexistent | `dynamicParams = false`; no page generated; same Next 404 | Manifest lists DEMO-LT-0001/0002/0004/0005 only |
| Counts reveal nothing | No totals of withheld records anywhere | Unit test |
| Notice contains only authorized fields | Notice has exactly `reference`, `notice`, `mayContact`. The new `acknowledgeAccountsInRelationships` flag decides behavior but is never projected | Unit test |
| New internal fields stay private | Field-by-field projection | Unit test adds a field and checks every projection |
| Public search structures | None exist (no sitemap or search index) | Verifier fails if one appears |

Per-account authorization (`projectGraph`):
- An account from a **public** source is attributed.
- An account from a **restricted** source appears only as `withheld`, with an opaque positional id and no position, claimant, anchor, or reference, and only if that source's rights authority has authorized acknowledgement.
- Any other account is **omitted without a trace**.
- An edge whose remaining accounts no longer support its evidence state is withheld whole rather than shown misstated. A contested relationship needs at least two accounts; an attested one needs one attributed account.
- A source, place, or other non-record node exists only while a visible relationship touches it. The tests caught this case: an origin whose only record became restricted still named its source.

**Not a production authorization system.** The specimen projection runs once over a fixed, synthetic, build-time dataset, and its output is baked into static pages. Integrating with the live archive (`backend/src/services/publicView.ts`) requires:
1. per-request permission checks against current state, never a build-time snapshot;
2. relationship and account authorization in the backend's public view: no backend schema carries relationships or accounts yet (see §8);
3. cache and CDN invalidation on any restriction, withdrawal, or correction, including RSC payloads and prefetch caches;
4. rendering those routes dynamically, as `/memories` already does.

### 2.3 Misleading demonstration content

`src/data/memories.ts` (three records) and their rendering:

| Before | After |
| --- | --- |
| `archiveStatus: "Verified"`; `lastReviewed: "2026-06-04"` | "Not verified (demonstration record)"; "Not reviewed (demonstration record)" |
| `consentStatus: "Explicitly granted …"` | "None. No consent was sought or given; this is not a real record." |
| Named fictional people ("Elder Chidinma N.", "A. Okafor", "Nkem O.", "Elder Fatai A.") | Removed. "No real contributor. A real record names …" |
| Invented TIRO activity ("TIRO Memory Workshop", "community memory circle", "TIRO oral archive session") and real neighborhoods named as session sites | Removed. Remaining process descriptions read "Example wording only; nothing described here took place: “…”" |
| Confidence, versions, disputes, annotations stated as findings | The same text, framed as example wording |
| IDs `TIR-MEM-000n` (look like accessions) | `DEMO-MEM-000n` (`docs/memory.txt`: keep demo IDs distinct) |
| Notice shown after the title and summary | Notice first, before the title |
| "Transcript" heading over invented first-person testimony | "Illustrative Text", with a notice that it is not a transcript or anyone's testimony |
| Empty `<audio>`/`<video>` players; "Audio capture preserved in record metadata"; "Video documentation is cataloged"; durations for files that don't exist | No player for a missing file; "No audio recording attached"; no duration |

Design explorations: `design-explorations/README.md` lists each contradictory claim with file, approximate line, the conflicting authority, and a recommendation. The HTML files themselves are unchanged pending your decision.

### 2.4 Repository boundaries

At start the tree was clean at `e3407c4`, which already included the backend work. 0.2 touches **no file under `backend/` or `infra/`** and no doctrine file. Nothing is committed, staged, pushed, or deployed. The 0.1 screenshots were moved, not deleted, into `screens/0.1/`.

## 3. Phase II — experience

### 3.1 The Origin (`trace/OriginHero.tsx`)

- **Mark:** the approved mark, unaltered and never animated: 160px wide on desktop, 72px on tablet, 48px on mobile. It is placed so that its resonance line (x=47 of 90) sits exactly on the spine, via `--lt-spine-dx = mark width / 45`. All annotation geometry is computed in mark units from `--lt-mark-w`, so the composition recomposes at each breakpoint instead of shrinking.
- **Annotations:** Origin, Transmission and Resonance, with hairline leaders to the parts they name, cited to "Manifesto v0.2, IV". The founding premise remains the h1. No new slogan, logo, or claim.
- **Taper:** the mark's 2-unit stroke narrows to the 1px trace over 3rem (`.lt-hero-taper`), the visible moment where a symbol becomes a path.
- **Motion:** annotations arrive in order, then the trace grows down from the mark. With reduced motion the composition is identical, already drawn.

### 3.2 Narrative choreography (`trace/Movement.tsx`, `src/app/page.tsx`)

| Movement | Register | What changes | What stays |
| --- | --- | --- | --- |
| 00 Encounter | Origin, quiet | Full-height field; monumental mark; the only gold line on the page | — |
| 01 Witness | Intimacy | Faint warmth (5% accent in the field); larger serif; one attributed Manifesto quotation; narrow measure | Spine, origin point |
| 02 Preserve | Materiality, trust | The whole movement turns to the **Paper register**, the one bright surface on the page | Spine (mineral on paper) |
| 03 Discover | Expansion | Full-bleed (90rem) composition; the spine **stops at the header and hands over** to the constellation's own origins, then resumes | The same evidence lines |
| 04 Respect | Restraint | No motion, wide margins, nothing to unlock | Boundary rule |
| 05 Participate | Openness | The spine **branches** to each real action and ends at an open origin (hollow, dotted) | Same trace, same stroke |

The 0.1 spine faded to transparent at the bottom of each movement, so the "continuous" trace was actually broken. In 0.2 it is one unbroken mineral line; gold appears only at the mark.

### 3.3 Discover (`trace/Constellation.tsx`, `src/lib/livingTrace/layout.ts`)

- **Composition:** a deterministic layered layout that reads as the argument: **Origins → Records → Derived and interpreted → Places, languages, events**. Order within each column is barycentric, so each source sits level with its record. There are no hand-placed coordinates; a 30-record synthetic collection lays out without overlap (tested). Wide and narrow screens each get a composed orientation (left→right and top→bottom).
- **Glyphs carry meaning:**
  - origin: circumpunct with a faint resonance ring (the only node with one);
  - record: solid point;
  - derivative: small circumpunct;
  - interpretation: hollow square-cornered diamond (not a source);
  - shared context: small hollow ring.
- **Evidence** is told apart by line pattern plus words: solid, dashed, two-strand dash-dot, dotted. Colour is never the only cue (unchanged from 0.1).
- **Interaction:**
  - selecting a relationship redraws each account's chain from its origin and names the relationship on the drawing;
  - selecting a point shows its sources and relationships;
  - an evidence filter (toggle buttons with counts) scales to larger collections;
  - "Clear selection" shows the whole constellation lit;
  - on `/living-trace` the selection is kept in `?edge=` for deep links; ids not in the projected graph are ignored.
- **Text alternative:** the SVG is `aria-hidden`. The relationship list (buttons with `aria-pressed`), the inspector (`aria-live`), and the inspector's endpoint and relationship buttons give a complete keyboard path: list → relationship → endpoint → its relationships.
- **Honesty:** every edge in the demo exists to show one behavior: source link, derivative, attested (with an undiscoverable account omitted, and another with a restricted account acknowledged), interpretation, independent contested accounts, open question. Nothing was added for density.

### 3.4 Motion vocabulary (`globals.css`, `trace/Reveal.tsx`)

| Pattern | Meaning | Implementation |
| --- | --- | --- |
| Emerge | A trace grows out of its origin | `.lt-grow-down`, `.lt-grow-right`, `.lt-draw` |
| Arrive | A label or context appears beside it | `.lt-fade-in` |
| Reveal | Relationships appear once their context is on screen: source links first, then attested, then interpretation, disagreement and open questions | `Reveal` + `.lt-on-reveal-*` |
| Emphasize | A selected provenance path redraws hop by hop from its origin | Keyed `.lt-draw` in Constellation |
| Settle | Register change between movements | Background only, never position |

Rules:
- Everything sits under `prefers-reduced-motion: no-preference` and only moves toward the static final state.
- Server markup is always complete. `Reveal` holds a region back only when it starts below the fold.
- A region is revealed on scroll as well as by IntersectionObserver, because an anchor jump can land past a region without any intersection being observed. This was found and fixed during review.
- Print never shows a pending region.
- No scroll-linked animation, scroll hijacking, loops, WebGL, or animation library.

## 4. Grammar and tokens (carried from 0.1, with 0.2 additions)

Primitives: Origin, Trace, Constellation, Boundary, Time, Voice. Meanings are unchanged; see `/living-trace#grammar`. The evidence states (`src/lib/livingTrace/evidence.ts`) are unchanged.

New tokens:

| Token | Value | Role |
| --- | --- | --- |
| `--lt-spine-dx` | 1.07px / 1.6px (≥768) / 3.56px (≥1024) | Mark width ÷ 45: keeps every spine segment on the mark's resonance line |
| `--lt-mark-w`, `--lt-mark-top`, `--lt-annotation-x` | per breakpoint, on `.lt-hero` | Origin geometry in mark units |
| `--lt-branch-reach` | per breakpoint | Content column → spine, for Participate branches |
| `--lt-graph-bg` | `--tiro-bg-deep` | Node fills inside the constellation |
| `[data-register]` | witness / preserve / discover / respect / participate | Movement registers |

The spine column is now 2rem / 6rem / **8rem (≥1024)**, to hold the monumental mark.

Retained as instructed: the approved mark and proportions; the founding premise; Spectral, Karla and Space Mono; square corners; the **current brand palette as default**; the mineral and contested roles; the Community Rights nav item. The candidate palette remains available on `/living-trace` only and is not adopted.

Contrast: all text pairs from 0.1 still hold (see the 0.1 table in git history: `git show e3407c4:docs/design/living-trace.md`). New surfaces, measured: on the Witness field, subtle text is 5.24:1 (dark) and 4.61:1 (light), and accent is 7.07:1 (dark) and 5.53:1 (light); on the Paper register, subtle text is 4.98:1. axe reports no violations (§6).

## 5. Files

New
- `src/lib/livingTrace/layout.ts` (+ `layout.test.ts`): deterministic constellation layout.
- `src/components/trace/Reveal.tsx`: below-the-fold reveal.
- `scripts/test/verify-disclosure.mjs`: production-artifact disclosure check (`npm run verify:disclosure`).
- `scripts/test/server-only-hook.mjs`, `server-only-empty.cjs`: lets `npm test` resolve `server-only`. Test-only; the build keeps Next's real check.
- `design-explorations/README.md`: deprecation notes.
- `docs/design/art-direction.md`.
- `docs/design/screens/0.2/` (36 captures).

Changed
- `src/lib/livingTrace/graph.ts`: accounts, per-account traces, independence, source-link-only traversal.
- `src/lib/livingTrace/projection.ts`: `server-only`; per-account authorization; orphan pruning; scope note.
- `src/data/livingTrace/syntheticArchive.ts`: `server-only`; accounts; record DEMO-LT-0005; acknowledgement flag; new canaries.
- `src/lib/livingTrace/projection.test.ts`: 24 tests (was 10).
- `src/components/trace/Constellation.tsx`: rebuilt.
- `src/components/trace/OriginHero.tsx`: rebuilt.
- `src/components/trace/Movement.tsx`: registers, wide and end modes.
- `src/components/trace/RecordSpecimen.tsx`: claimants and recorder per relationship.
- `src/components/trace/PaletteScope.tsx`: fixed-height bar (layout-shift fix).
- `src/app/page.tsx`: choreography.
- `src/app/living-trace/page.tsx`: static (was dynamic), 0.2 annotations, wider Discover.
- `src/app/globals.css`: motion vocabulary, registers, hero geometry, spine, print rule.
- `src/app/layout.tsx`: fonts (§6).
- `src/data/memories.ts`, `src/components/MemoryDetail.tsx`, `src/components/MemoryMediaViewer.tsx`: §2.3.
- `package.json`: test hook, layout tests, `verify:disclosure`.

## 6. Validation (2026-10-16, measured on the production build)

- **Tests:** `npm test` passes 359/359 (24 projection, 4 layout, and all existing frontend and backend tests).
- **Typecheck and lint:** `tsc --noEmit` is clean. `eslint .` reports 0 errors; the 2 warnings are pre-existing in backend files.
- **Build and disclosure:** `next build` succeeds and all Living Trace routes are static. `verify:disclosure` passes, and its two negative probes fail as intended.
- **axe-core 4.10** (WCAG 2.0/2.1/2.2 A/AA + best practice): 0 violations, dark and light, on `/`, `/living-trace`, the three specimen routes, `/memories`, and a corrected memory record. The "incomplete" items are contrast that axe can't compute on `aria-hidden` arrow glyphs and on the `color-mix` Witness field.
- **Keyboard** (scripted, 13/13 pass):
  - skip link is the first Tab stop and moves focus to `#content`;
  - the relationship list is reached by Tab alone; Enter selects a relationship; the inspector updates, including the withheld account;
  - inspector endpoint buttons select nodes; the evidence filter toggles with Space and the list states the shown count;
  - focus outline is visible;
  - the mobile menu opens with Enter and closes with Escape;
  - `?edge=` deep links work, and a withheld edge id is ignored.
- **Responsive:** no horizontal overflow at 320, 390, 820, 1280, 1440 or 1920 px.

### Performance: LCP investigation

Lighthouse 12.6, mobile preset, median of 3 runs, `next start` on localhost.

| Step | `/` LCP | `/` perf | `/about` LCP | CLS `/` |
| --- | --- | --- | --- | --- |
| Baseline (0.2 code, 0.1 fonts) | 3.56 s | 91 | 3.26 s | 0 |
| Declare only used faces; preload only Spectral 400/400i + Karla | 2.82 s | 96 | 2.65 s | 0.021 |
| Fix the eyebrow wrap that shifted the h1 when Space Mono swapped in | **2.79 s** | **96** | **2.65 s** | **0.000** |
| Diagnostic: Spectral `font-display: optional` (reverted) | 2.80 s | 96 | 2.65 s | 0 |
| Applied DevTools throttling (not simulated), same build | **1.86–1.90 s** | 97 | **1.64 s** | 0.016 |

Findings:
1. Every face of every family was preloaded on every page: 10 files, ~227 KB. Spectral 500/600 and Space Mono 700 are not used anywhere in `src/`. Removing their declarations and preloading only first-paint faces cut LCP by ~0.75 s on `/` and ~0.6 s elsewhere. The font files remain in `src/fonts/`.
2. In every trace the **observed** LCP equals FCP (168 ms on `/`): the headline paints with the first frame. Switching to `font-display: optional` changed nothing, so the font swap is not the remaining cost.
3. The remaining 2.65–2.8 s is Lighthouse's **simulated** estimate, which charges all bytes requested before first paint to LCP. The main cost is the Next.js/React runtime (~145 KB JS); the homepage HTML is also larger (26 KB gzip) because it inlines the record and graph payload.
4. Under applied DevTools throttling, LCP is 1.6–1.9 s.

**Result: LCP ≤ 2.5 s is met under applied throttling and not met under Lighthouse's default simulated throttling (2.65–2.80 s).** Further gains would need less framework JS on first load, a decision beyond this design pass (§9).

Other pages on the final build: `/living-trace` scores 96 (LCP 2.80 s, CLS 0.002; its palette-bar shift of 0.225 was found and fixed). The specimen record scores 96 (CLS 0.030); `/community-rights` 97 (LCP 2.65 s). Accessibility and best practices are 100 everywhere measured.

## 7. Screens (`docs/design/screens/`)

`0.1/` holds the 0.1 implementation; its `before-*` images are the original site. `0.2/` holds production captures with no dev overlays:

| Area | Files |
| --- | --- |
| The Origin | `origin-{desktop,wide-1920,tablet,mobile,narrow-320}` |
| Reduced motion | `origin-{desktop,mobile}-reduced-motion` |
| Light mode | `origin-{desktop,mobile}-light`, `home-six-movements-desktop-light`, `discover-1-contested-desktop-light`, `record-specimen-desktop-light` |
| Six movements | `home-six-movements-{desktop,mobile}` (full page, final state), `movement-0n-*` |
| The Record | `record-specimen-{desktop,mobile}`, `movement-02-preserve-*` |
| Discover, by state | `discover-1-contested-two-chains`, `-2-restricted-account-withheld`, `-3-derivative-chain`, `-4-interpretation`, `-5-unknown-open-question`, `-6-node-selected`, `-7-filtered-no-attested`, `-1-contested-mobile` |
| The Boundary | `movement-04-respect-boundary-*`, `boundary-restricted-route-mobile`, `boundary-undiscoverable-404-mobile` |
| Corrected demo record | `memory-demo-record-corrected-{desktop,mobile}` |

Full-page captures use reduced motion: the final state, identical to what motion arrives at, because a full-page capture cannot scroll regions into view.

## 8. Decisions for the founder

1. **Live-archive relationships (schema).** Accounts, claimants, the `recordedBy` field, source links, and the per-account acknowledgement flag have no backend schema. Bringing Discover to real records needs:
   - a relationship/account model in `backend/src/domain/types.ts`;
   - its authorization in `publicView.ts`;
   - a public endpoint.

   Not started, per instruction. **Proposed, needs approval.**
2. **Acknowledging withheld accounts.** The demo lets a rights authority permit "an account from a restricted source exists". Whether that state should exist at all, or default to off as implemented, is a stewardship-policy question, since it discloses existence.
3. **Demo records' invented first-person text.** The transcripts in `src/data/memories.ts` remain, now labeled. The brief forbids invented documentary quotations. My recommendation is to replace them with non-testimonial placeholder text, or retire the three records in favour of the specimens. Record 3 also describes a market-song practice attributed to a real community, which the art-direction standard would not permit for new content.
4. **Design explorations.** Add "superseded" banners, move them to an archive, or delete them (`design-explorations/README.md`).
5. **Demo ID change.** `TIR-MEM-*` became `DEMO-MEM-*`. URLs (`/memories/<slug>`) are unchanged.
6. **Unused font faces.** Spectral 500/600 and Space Mono 700 are no longer declared. Keep the files, or remove them.
7. **Hero annotations.** They name the mark's parts beside it, without changing the mark itself. Please confirm this sits within approved mark usage.
8. **Candidate palette.** Still not adopted.

## 9. Remaining improvements (prioritized)

1. **Simulated LCP.** Reduce first-load JS. Candidates: lazy-hydrate the Constellation (it is below the fold), drop the unused `three`/`@react-three/*` dependencies and `Hypersphere.tsx`, and audit the BfcacheRevalidator scope.
2. **Live integration** of relationships and accounts (decision 1), with per-request checks and cache invalidation (§2.2).
3. **Screen-reader and real-device passes** (VoiceOver, TalkBack). So far only automated axe and scripted keyboard checks have been run.
4. **Carry the grammar into `MemoryDetail`.** Its related nodes and memories carry no relation type, so they should read "relationship type not recorded". Deferred while decision 3 is open.
5. **Homepage CLS 0.016 under applied throttling,** from Spectral's fallback wrapping the h1 onto an extra line (well under 0.1).
