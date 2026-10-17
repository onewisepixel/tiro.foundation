# The Living Trace — founder decisions

Status: Record of decisions on the design proposal. These decisions govern the Living Trace work; they are not institutional doctrine and do not amend `/community-rights`, the Manifesto, or `docs/ethos.txt`.
Owner: TIRO founder / Steward.

## 2026-10-16 — review of Living Trace 0.2

**Verdict.** Living Trace 0.2 is **provisionally approved as TIRO's design direction**: the visual foundation to build on. It is not adopted doctrine and not a production archival specification. Next: a 0.2.1 Consolidation pass, then Memory Project Experience 1.0.

| # | Question (from `living-trace.md` §8) | Decision | Status |
| --- | --- | --- | --- |
| 1 | Live-archive relationship schema | **Defer implementation.** A schema *proposal* may be designed. The backend is not modified until authority, provenance, access, and revocation semantics are formally reviewed. | Proposal 0.1 drafted for review: `docs/proposals/memory-record-relationship-contract.md`. Backend unchanged. |
| 2 | Acknowledging restricted accounts | **Default deny.** Not enabled in production without explicit, separately scoped authorization covering both the fact of existence and which relationship metadata may be disclosed. | Implemented in 0.2.1: claim-level grants (existence + association), default deny; a withheld claim never decides a relationship's evidence state |
| 3 | Fictional first-person stories | **Replace them.** Keep the demonstration interfaces; remove invented documentary testimony and cultural practices attributed to real communities. | Implemented in 0.2.1: structural specimens; old slugs redirect (307); node pages' unfounded themes and related nodes removed. `docs/memory.txt` (historical brief) still lists the old slugs and was left unedited. |
| 4 | Old design explorations | **Archive with superseded banners.** Preserve the design history; make obsolete claims conspicuous when the HTML files are opened directly. | Implemented in 0.2.1 |
| 5 | Labels beside the mark | **Approved as explanatory artwork.** They do not alter the mark. They are not part of ordinary logo usage and must not become mandatory. | Recorded in `art-direction.md` |
| 6 | Unused fonts | **Remove after dependency verification**, in a separate performance/asset cleanup, together with the unused 3D code. | Implemented in 0.2.1, after verifying nothing referenced them |

### Principle retained for the eventual protocol

> **The disclosure unit is the authorized claim, not the record.**

A right to preserve material does not imply a right to disclose that it exists. Permission to acknowledge existence does not by itself authorize revealing a relationship, a disagreement, or a contextual association. Each of these is a separate disclosure, and each needs its own authorization.

Corollary, from the founder's review: if a visible relationship is labeled *contested* because of a withheld account, visitors learn something about that account's position even when its content is hidden. **A withheld account must never determine what a visible relationship says.**

### Performance note

Removing unused 3D dependencies reduces dependency complexity; it does not by itself shrink the browser download if they were never bundled. The first-load opportunity is in hydration and the initial page payload. Deferred loading of Discover is the next step.

### Out of scope until the contracts are settled

Real archival relationships are not integrated yet. First, settle the record and relationship contracts; then connect to the production system behind permission-aware APIs.

## 2026-10-16 — review of Living Trace 0.2.1

**Verdict.** 0.2.1 achieved its consolidation objective. Living Trace is **frozen at 0.2.1** as the provisional foundation and development baseline. Main design effort moves to **Memory Project Experience 1.0**.

| # | Matter | Decision |
| --- | --- | --- |
| 7 | Manual accessibility testing | **Release gate.** Run `accessibility-manual-test.md` (VoiceOver, TalkBack, NVDA, keyboard, reflow, reduced motion), record results, and fix defects. Automated results do not establish assistive-technology usability. It may run alongside planning. |
| 8 | Simulated LCP (2.81 s vs 2.5 s) | **Tracked technical debt, not a rewrite.** No Next.js architecture change to recover ~310 ms. Measure realistic network conditions and production user experience before investing. Idle loading of Discover stands, because it preserves keyboard access. |
| 9 | Example metadata in demonstration records | Acceptable as disclosed example metadata. **Requirement for Memory Project Experience 1.0:** a demonstrated relationship must be visually distinct from an evidenced one, and an evidenced relationship must never be inferred from shared example metadata. |
| 10 | `docs/memory.txt` old slugs | Preserve the historical brief unedited. The replacements are documented in `living-trace.md` §0. |
| 11 | Backend readiness | Keep the backend's unresolved live-drill evidence separate from the design project. A compelling frontend is **not** evidence that intake, permissions, and restoration are ready to receive entrusted material. |

### Next, in order

1. **Close the accessibility gate** (decision 7).
2. **Draft the Memory Record & Relationship Contract** as a proposal for review, not a backend migration. Scope: records, attributed claims, independent provenance, disputed accounts, permission scopes, disclosure boundaries, withdrawal propagation, and version history (extends decision 1).
3. **Memory Project Experience 1.0.** Design the explorer around moving from an authorized record into its context and relationships, always keeping the origin and authority of each claim. Prototype with synthetic data before production integration.

### Central design question for Memory Project Experience 1.0

> How does a visitor encounter a single memory and discover its relationship to the wider human record without losing sight of the individual who entrusted it?

### Principle carried forward

Every design element should communicate something true about the information it represents, including what the visitor is not entitled to know.
