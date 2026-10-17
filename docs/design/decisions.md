# The Living Trace — founder decisions

Status: Record of decisions on the design proposal. These decisions govern the Living Trace work; they are not institutional doctrine and do not amend `/community-rights`, the Manifesto, or `docs/ethos.txt`.
Owner: TIRO founder / Steward.

## 2026-10-16 — review of Living Trace 0.2

**Verdict.** Living Trace 0.2 is **provisionally approved as TIRO's design direction**: the visual foundation to build on. It is not adopted doctrine and not a production archival specification. Next: a 0.2.1 Consolidation pass, then Memory Project Experience 1.0.

| # | Question (from `living-trace.md` §8) | Decision | Status |
| --- | --- | --- | --- |
| 1 | Live-archive relationship schema | **Defer implementation.** A schema *proposal* may be designed. The backend is not modified until authority, provenance, access, and revocation semantics are formally reviewed. | 0.1 conceptually approved, not adopted. **0.2 Review Candidate** at `docs/proposals/memory-record-relationship-contract.md`, awaiting formal review (its §14). Backend unchanged. |
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

## 2026-10-16 — review of Memory Record & Relationship Contract 0.1

**Verdict.** The conceptual architecture is **approved for continued development**: records preserve material, claims preserve assertions, relationships organize claims, and disclosure is decided per audience. Contract 0.1 is **not adopted** as a normative specification. Next: **Contract 0.2 — Review Candidate** (no schema implementation). Memory Project Experience 1.0 may begin **in parallel, with synthetic data only**; the prototype's convenience must not determine the production permission model. Live archival integration remains deferred.

### Founder positions on the contract's open questions

These direct the next revision. Provisions on legal rights, collective authority, and formal stewardship procedure remain **subject to the designated reviewers** (below).

| # | Question (Contract 0.1 §9) | Decision | Formal review needed |
| --- | --- | --- | --- |
| 12 | Who may grant claim disclosure? | **All applicable authority must be established for the specific disclosure.** Claimant, source authority, legal rights holders, and affected subjects may hold distinct interests. No one gains authority over others' interests by submitting a record. **Collective authority:** do not assume one representative. An elder, council, family representative, or other body may hold authority only as established through the community's legitimate process and documented for the particular material and use. **Disputed authority:** hold the affected disclosure until adequately resolved. TIRO's review may evaluate evidence, facilitate resolution, and impose protective restrictions; it cannot manufacture consent or expand a mandate. Authority over entrusted material is **distinct from** a power to suppress independently sourced historical information. | Stewardship / community; legal |
| 13 | Rights of subjects | **Independent protection.** A source's consent cannot by itself authorize disclosing information that identifies someone else. Requires applicable consent or another documented lawful basis, plus privacy and sensitivity review. | Legal; stewardship |
| 14 | Who may record disagreement? | Authorized curators may document disagreement **internally**. **Public** disclosure requires additional review; dual control for sensitive disputes. Sources have a correction and challenge process. Publication never discloses claims or conflicts outside their authorized scope. | Stewardship; archivist |
| 15 | TIRO's own interpretation without source authorization | **No, not by default for entrusted material.** Interpretation is not necessarily a legal derivative work (annotation, translation, scholarship, and adaptation differ legally). TIRO's operational standard is stricter than copyright: source-linked interpretive enrichment needs explicit authorization for its purpose and publication scope, attribution, provenance, review, and a correction/challenge mechanism. Responsible scholarship stays possible; custody never becomes unrestricted interpretive authority. Interpretation stays explicitly separate from testimony. | Legal; stewardship |
| 16 | Machine-generated claims in v1 | **Defer.** No model-generated claim enters the entrusted archive before processing permissions, model/vendor review, and human accountability exist. Synthetic testing remains permissible. | Engineering/security; legal |
| 17 | May incomplete provenance explain itself? | **Not by default.** Show "Provenance incomplete" without the reason. A more specific explanation needs separate authorization for what it reveals. | — |
| 18 | Attribution withdrawn | **Protect against indirect identification.** Removing a name is not enough if remaining relationships, places, or dates still reveal the person. Reassess the whole projected context and restrict where necessary. | Stewardship; legal (privacy) |
| 19 | Public version history | **None by default.** Access only for authorized personnel with legitimate duties. Public corrections or version summaries need separate disclosure approval. | Archivist |
| 20 | Geographic precision | The applicable source or community authority sets the permitted disclosure scope, subject to legal and stewardship review. Sensitive associations and locations may be withheld **independently** of a record's general publication status. | Stewardship; legal |

### Structural corrections required for Contract 0.2

| # | Correction |
| --- | --- |
| 21 | **One authorization rule for every claim.** Remove the public-record exception (0.1 §5.3): a public record never automatically authorizes the claims within it. |
| 22 | **No silent downgrade of a contested relationship.** If visible claims no longer support the authorized characterization, suppress the relationship rather than reclassify it. An independently supportable assertion may be represented separately, with its own authorization. |
| 23 | **Protect the synthetic backend boundary.** `FixtureRecord` requires `isSynthetic: true`; adding an evidence class must not suggest converting fixture infrastructure into a real archive. A production domain and migration need their own reviewed design when readiness is established. |
| 24 | **Specify grant enforcement and revocation consistency.** The grant records authority, verified representative capacity, permission evidence, purpose, audience, channel, relationship scope, version, expiry, and revocation. Define how one consistent decision is reached across stores, and how a change to any source invalidates every dependent cached relationship. A single per-record version is insufficient unless every dependency is tracked. |
| 25 | **Clarify provenance.** Traverse by each relationship type's declared semantics, not by arrow direction. Distinguish the source of testimony from the author of a translation or interpretation. |
| 26 | **Response windows are proposed.** `ethos.txt` §12 windows are acceptance targets pending adoption, not service guarantees. |

### Preserve explicitly

The demonstration/evidenced separation (a synthetic object never becomes evidence by editing its status); provenance independence (shared place ≠ corroboration; two descendants of one original ≠ two sources); history without indefinite retention.

### Review responsibilities

| Reviewer | Principal responsibility |
| --- | --- |
| Stewardship / community representatives | Authority, collective consent, contested cultural claims, subject dignity, withdrawal |
| Archivist / records specialist | Provenance, archival description, source independence, corrections, retention, version history |
| Engineering / security | Authorization boundaries, dependency tracking, revocation races, storage isolation, information leakage |
| Qualified legal counsel | Copyright, privacy, data protection, collective rights where applicable, retention obligations, international transfers |

For the proposed Nigerian pilot, **community review is not postponed** until the technical model is final. The model must accommodate participating communities' decision-making practices rather than presuppose them.

## 2026-10-16 — disposition of Memory Record & Relationship Contract 0.2

| Item | Status |
| --- | --- |
| Conceptual architecture | **Accepted for formal multidisciplinary review** |
| Founder positions 12–26 | Recorded; specialist review pending |
| Contract consistency | **Clarifications required** (review issues RI-1 to RI-7 below) |
| Institutional adoption | **Not authorized** |
| Production implementation | **Deferred** |

No Contract 0.3 until reviewers have responded. Their findings are consolidated into 0.3; the review packet is `docs/proposals/contract-0.2-review/`. Memory Project Experience 1.0 may proceed in parallel with strictly synthetic material and the established Living Trace grammar.

Recognized as improvements from the worked cases: version-specific authorization; time-bounded cache validity; context-dependent disclosure.

### Review issues

| ID | Priority | Section | Issue |
| --- | --- | --- | --- |
| RI-1 | Critical | §7.3 | **Restricted-record gates.** The rule requires the anchor record to pass publication checks before any disclosure, yet acknowledges claims in restricted records. Define distinct gates for existence, association, and content without a route around record restrictions. |
| RI-2 | Critical | §7.3, §13 | **Level ambiguity.** "No level implies another", yet the tests imply content alone yields attribution. Specify whether content requires explicit authorization of all three levels. One document may carry several affirmative scopes; none may be inferred. |
| RI-3 | Critical | §7.6, case F | **Collective authority vs independent records.** One community's restriction on Place V suppresses R9, an independently sourced record, which may contradict P14. Distinguish restrictions on TIRO-held associations from a narrowly justified, independently reviewed **safety** restriction on a location itself. |
| RI-4 | High | §7.1, cases B–E | **Staff access.** Cases show staff seeing everything while the rule requires every interest. Define a separate, minimal, audited **administrative-review basis** for legitimate custody duties; staff status alone grants nothing. |
| RI-5 | High | §6.1, §8 | **Characterization versions and concurrent reads.** An approved characterization must pin the exact versions of its supporting claims. Engineering must show whether register-last yields a consistent snapshot when content, authorizations, and register are separate stores. |
| RI-6 | High | §5.3 | **Source independence.** Disjoint recorded origins show different provenance, not independent testimony (two narrators may repeat one unrecorded upstream account). Distinguish *source-distinct* from *verified independent*, and preserve uncertainty. |
| RI-7 | High | §8 | **Negative dependencies.** A cached decision can depend on objects that did not exist when it was built (a new dispute, a newly established subject interest, a new claim on a relationship). Account for changes to collection membership, relationship indexes, authority sets, and authorization scopes, and show by controlled concurrency tests that a register read does not make separate content reads atomic. |

RI-3 principle: TIRO protects community authority without building a system in which one party can unilaterally suppress an independent historical account held under another party's authority. Sensitive locations need not always be disclosed, but a broader safety restriction needs its own documented justification and review, never an automatic extension of ownership or cultural authority.

### Provisional founder positions on pilot-shaping questions (for reviewers to confirm or challenge)

| # | Question | Provisional position |
| --- | --- | --- |
| 27 | Evidence of community authority (contract §14 Q1) | For the Nigerian pilot: documented consultation with the relevant community, recording how representatives are selected, the boundaries of their mandates, how dissent is handled, and who may withdraw or challenge an authorization. No agreement is permanently irrevocable because its initial representatives were recognized. No single governance form (council, elder, association, family) is presumed. **Requires actual community participation, not simulated review.** |
| 28 | Interpretation as a ninth use category (§14 Q6) | **Not yet.** Model `interpretive-enrichment` as a separately authorized scope within `derivatives` for the first production proposal. A generic derivatives grant does **not** authorize it. `ethos.txt` is not amended until legal and stewardship review, including whether annotation, commentary, translation, and adaptation need different treatment. |
| 29 | Context references without inference (§14 Q10) | **Explicit, curator-reviewed references.** A field naming a place, person, language, or sensitive event carries structured references to those entities (and text spans where appropriate), so a disclosure change re-evaluates dependent fields without model inference. Unreviewed unstructured content is never assumed free of identifying information: it needs review before publication, or the field is suppressed when safety cannot otherwise be established. |

### Standing caution

The contract's coherence does not establish real-world authority or operational readiness. Those require engagement with people, evidence, institutional decisions, and specialist review.

