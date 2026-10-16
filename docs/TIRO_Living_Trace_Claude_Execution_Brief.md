# TIRO — The Living Trace
## Claude execution brief · Design direction 0.1 · October 2026

> **Execution request:** Audit the existing TIRO Foundation website and governing documents, then implement an original visual and experiential design system that makes TIRO's mission tangible. Do not reproduce Canopii's layouts, botanical imagery, or interactions. Use the attached **TIRO_Living_Trace_Visual_Direction.pdf** as conceptual art direction, not a pixel-perfect production spec.

You are acting as a senior creative director, interaction designer, visual systems designer, and frontend engineer. Your objective is **a working, reviewed implementation in the existing TIRO codebase**, not merely a moodboard or a rewrite of the copy. Make the experience beautiful, but make the philosophy legible and operational.

## 0. Source of truth and project context

Repository: `onewisepixel/tiro.foundation` (if not checked out or connected, request access to the existing repository before proposing a replacement scaffold). Inspect the actual application framework, routing, design tokens, existing marks, components, content, accessibility, build process, and tests. In particular, review these files **if present**:

- `docs/manifesto.txt`
- `docs/manifestov0-2.txt`
- `docs/ethos.txt`
- `docs/memory.txt`
- `docs/5013c.txt`
- Any current document describing Community Rights & Cultural Data Stewardship.

Use actual repo findings to decide what should be retained, corrected, or proposed for approval. **Do not silently reconcile contradictions across governance documents.** Flag them, cite filenames/sections, and leave authoritative doctrine unchanged without approval.

TIRO's established premise: **“There is enlightenment in exploration, but empathy is essential.”** The Memory Project is its first institutional spine, not an ornamental section. TIRO aspires to steward oral memory, languages, cultural practices and context over many generations. Its five long-range institutional layers are the Memory Project, TIRO Protocol, TIRO Nodes, TIRO Institute, and La Fond. These represent a roadmap, **not claims that each institution or product exists today**.

Constitutional stewardship principle: **“Communities remain the principals. TIRO is the custodian.”** Community authority is not a feature toggle; the visual and technical architecture should preserve provenance, meaningful consent, withdrawal, restriction, and interpretive plurality. Respect the difference between what is recorded, attested, inferred, contested, and unknown.

Existing TIRO brand symbols, especially the circumpunct and accepted marks, are assets to understand and protect, not disposable placeholders. Do not change logos, manifesto doctrine, legal status claims, or rights policy as a collateral side-effect of redesign.

## 1. North star — what is missing

TIRO's current design opportunity is not “more visuals.” It is **coherence between mission, design language and user experience**. Every major visual should perform at least two of these functions: express meaning, orient the visitor, clarify an archival relationship, communicate authority/permissions, or invite exploration. Avoid decorative spectacle disconnected from purpose.

### Central design thesis

**THE LIVING TRACE — From one human testimony to a constellation of cultural memory.**

The originating unit is a *trace* of human life: a voice, recollection, place, date, notation or artifact. A point represents origin. A line represents a relationship with a known basis. Multiple traces produce a navigable constellation. A boundary represents consent and community authority. A timeline conveys continuity and change. A trace must remain connected to its source; synthesis must never masquerade as testimony.

This is a **working visual metaphor**, not a new official TIRO slogan and not a claim that all cultures share a single visual worldview.

### Desired emotional cadence

**Encounter → Witness → Preserve → Discover → Respect → Participate.**

The visitor should move from curiosity, to human empathy, to confidence in custodial rigor, to wonder at connection, to respect for cultural authority, to a grounded opportunity to act. The sequence is a starting concept, not a demand to break effective existing navigation or make users scroll through six mandatory fullscreen scenes.

## 2. Visual grammar — implementable primitives

| Primitive | Semantic purpose | Visual/interaction behavior |
|---|---|---|
| **Origin point** | A source, person, record or place | Small circumpunct-compatible marker; distinctive, never ubiquitous decoration. |
| **Trace** | A documented or clearly identified link | Fine continuous line; never visually imply verified causality when a relationship is speculative. |
| **Constellation** | Discoverable, plural memory relationships | Spatial links with readable labels, source paths, user control and alternatives to spatial navigation. |
| **Boundary** | Consent, restricted access, revocation | Quiet, unmistakable access semantics. Do not imply restricted records can be unlocked by browsing or curiosity. |
| **Temporal layer** | Continuity, change, revision | Subtle chronology, version state, and historical anchoring. Avoid implying cultural linearity. |
| **Voice / source** | Personhood and testimony | Authentic, consent-cleared media or explicit synthetic demonstrations, never invented documentary quotations. |

A recurring rule: **a visible connection needs an explicit relationship type and a path back to the source.** Uncertainty and contested relationships are visually and textually distinguished from attested ones. Restriction is meaningful and must be enforceable at the data/access level, not just CSS concealment.

## 3. Art direction and system

Start by auditing existing approved TIRO visual assets. Explore the following as a **candidate palette**, not an automatic rebrand:

- Obsidian `#101719` — immersive field
- Deep slate `#242B30` — secondary surfaces
- Warm ivory `#E4DED0` — content and archival reading surfaces
- Antique gold `#B79B68` — restrained meaning/connection accent
- Mineral `#6D8583` — secondary relationship/accent

Typography: clear contemporary sans-serif for navigation, labels, body and interfaces; literary but highly legible serif for selected editorial statements and attributed testimony. Prefer repo's existing typefaces if they fulfill these roles; document any proposed additions and their licenses. Use mono or letterspaced small labels sparingly for evidence, cataloging, or interface metadata. No overuse of wide tracking in paragraph copy.

Layout: generous negative space with a readable, accessible typographic measure; occasional monumental editorial statements; visually asymmetrical compositions without inaccessible or fragile positional dependence. Vary density deliberately: atmospheric sections contrast with bright, structured records and governance panels. The Memory Project is a working archive, not a cinema installation.

Imagery: original abstract vector diagrams; authentic people, places, and artifacts only where rights and context permit. Do not make generic African patterns, masks, sacred symbols, ethnographic tropes, faces, voices, or cultures into interchangeable decoration. A documentary record must never be aesthetically presented as if it came from a real contributor when it is fabricated.

Sound: opt-in only; never autoplay an elder's voice or place audio in the background as ambiance. Always offer captions/transcripts and a text-only path.

Motion: a trace reveals its source relationship, a link forms on explicit interaction, a waveform responds to playback, and provenance expands on demand. Use modest opacity, transform and SVG-path animations only when they improve comprehension. Support `prefers-reduced-motion`, keyboard use, and complete interaction without motion. Avoid forced scroll-jacking, scroll traps, mandatory WebGL, elaborate loading gates or fake progress.

## 4. Narrative architecture — six optional homepage movements

1. **00 / Encounter:** An origin point and a confident institutional invitation. Let the emblem breathe. Establish TIRO with honest, current language. A clear route to skip the immersive presentation.
2. **01 / Witness:** A human-scale shift: the importance of an individual memory. Use an approved record only if it exists and is consent-cleared; otherwise illustrate the experience with conspicuously **SYNTHETIC DEMONSTRATION** content, or use conceptual non-testimonial copy.
3. **02 / Preserve:** Show a memory record acquiring structure: source, language, date, place, translator/context, provenance, usage permissions, and revision/access state. These fields must align with the approved Memory Record Specification, if present; otherwise mark this as a schema proposal.
4. **03 / Discover:** Show multiple source-anchored relationships without collapsing difference. Every link has a reason, origin and navigable evidence chain; contested/inferred links must be labeled as such.
5. **04 / Respect:** Make community authority tangible. An example of restricted content can show a public-facing access notice when that notice itself is authorized; in other cases no record or metadata should be visible. Withdrawal must affect data and derivatives per actual policy; a visual state is never sufficient by itself.
6. **05 / Participate:** Transition into real, functional actions appropriate to present organizational readiness: understand the mission, explore the prototype, engage responsibly, or support TIRO through any existing legitimate route. Avoid invented live features, institutions, donors, partners, or legal status.

Do not replace navigation with the narrative. Add functional persistent navigation and deep links to relevant content. The story should make TIRO intelligible on first contact; returning visitors should be able to get straight to the site’s actual content.

## 5. Three proof scenes to build first

**Proof A — The Origin (narrative hero):** Sparse opening composition with the approved mark, a point, a gently developing trace, strong editorial type, one grounded proposition, and a clear navigation affordance. Must remain persuasive with motion turned off.

**Proof B — The Record (product/interface):** Light or high-contrast archival view with a synthetic example record; labeled fields for provenance, language, authority, consent/access, context, transcripts, and related records where schema permits. It must read as a credible product interface, not poster art. Include source-link affordances and explicit synthetic-data labeling.

**Proof C — The Boundary (ethics/interface):** A credible, non-sensational access-state interface showing what the visitor is permitted to know. Include differentiated cases: publicly described but restricted record, and fully undiscoverable record (which should not be rendered or indexed). Demonstrate that community authority is not a fake unlocked-state UI.

**Build these before scaling the aesthetic throughout the homepage.** If these three do not clearly belong to one language, improve the grammar rather than adding more decorative motifs.

## 6. Delivery sequence

### Phase A — Audit, document, establish constraints

Inspect the repo; identify current framework, components, brand assets, routes, performance baseline and authoritative content. Provide a concise audit with exact file paths, a list of uncertainties, and a recommendation for the smallest safe architecture. Do not spend this phase creating an entirely new website or rewriting doctrine.

### Phase B — Foundations

Implement non-invasive design tokens (with contrast-tested light/dark pairs), typography roles, spacing/container rules, grid, motion utilities, focus styles, reduced-motion alternatives, and **reusable trace/origin/boundary primitives**. Preserve old components where viable.

### Phase C — Working proof

Implement Proofs A/B/C in the actual stack with mobile layouts, keyboard/touch states, demo content clearly isolated from authentic records, and meaningful fallbacks. Present before/after comparisons and explain how each visual represents TIRO's principles.

### Phase D — Extend through the existing site

With proof established, carry the grammar through the relevant landing sections and UI surfaces without flattening the site's information architecture. Keep mission, Memory Project, stewardship, institutional governance, and actual project maturity distinct. Make sure that narrative vocabulary does not displace canonical legal/archival language.

### Phase E — Validate and hand off

Run available build/tests/lint checks, conduct responsive review, accessibility checks, and assess performance on representative mobile and desktop viewports. Document new components, tokens, content/data assumptions, deferred work, and any remaining decisions that need founder approval.

## 7. Engineering and ethical acceptance criteria

- **Authenticity:** No fabricated documentary person, quotation, language recording, partnership, archival holdings, incorporation/501(c)(3) status, or deployed AI capability represented as real.
- **Stewardship:** Publication, provenance, authority, restrictions, withdrawal and AI-use constraints defer to governing policy and real access controls. Do not expose private, culturally restricted or undiscoverable metadata to client components.
- **Lineage:** Every visible memory relationship discloses its type and allows source inspection or makes the absence of evidence explicit.
- **Accessibility:** WCAG 2.2 AA-oriented implementation; semantic markup; readable type; sufficient color contrast; logical focus order; keyboard operation; meaningful screen-reader descriptions; text alternatives to diagram-only navigation; captions/transcripts where applicable; reduced motion.
- **Performance:** Avoid heavyweight animation libraries unless already justified; optimize SVG and media; lazy-load noncritical content; measure before claiming performance improvements. Target strong mobile Lighthouse results, but report measured rather than invented scores.
- **Responsiveness:** Test narrow phones, larger phones, tablets, laptops and wide screens. Asymmetrical art must recompose, not merely shrink.
- **Maintainability:** Use the existing framework and design-system conventions. Reusable components, named tokens and documentation over one-off CSS choreography. No gratuitous rewrites.
- **Conversion:** Visitors can reach project information and real participation options quickly; nothing obscures legal and contact information.
- **Restraint:** The design remains distinctive when animation is disabled and beautiful when rendered in accessible static form.

## 8. What to return to the founder

1. Audit summary with repo paths and key content/governance ambiguities.
2. Concise implementation plan reflecting the actual stack.
3. Actual code changes and a working preview for the three proof scenes, then integrated site changes if within scope.
4. Side-by-side screenshots at desktop and mobile resolutions; include static and reduced-motion presentations.
5. Design-token and component reference, including semantics for point/trace/constellation/boundary.
6. Build/test/accessibility/performance results with genuine observations.
7. Outstanding decisions, plainly separated from what has been implemented.

## 9. Working protocol

**Begin by inspecting the repository.** If the repo is available, audit and proceed into implementation rather than asking me to restate TIRO's philosophy. Ask only when you encounter a material blocker (missing access, conflicting authoritative doctrine, inability to establish asset rights, destructive architecture choice, or an irreversible content/governance decision). Otherwise use defensible defaults, flag assumptions, and implement iteratively.

Your standard of success is not “it looks like Canopii.” It is:

> A visitor should feel as though they are entering a living record of humanity, without forgetting that the record belongs to people.

**One voice. Many connections. No loss of origin.**

---

### Attachments / visual references

- `TIRO_Living_Trace_Visual_Direction.pdf` — original vector concept boards illustrating visual vocabulary, cadence and the three proof scenes. All art is **exploratory**, not official TIRO branding or completed interface specifications.
- Optional inspiration supplied separately: user-provided Canopii site screenshots/pitch deck, **for an understanding of conceptual cohesion and pacing only**. Do not replicate distinctive assets, site structure, images, logos, or content.
