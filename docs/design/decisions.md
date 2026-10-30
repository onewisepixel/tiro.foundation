# Founder design decisions

Status: **The authoritative record of TIRO's design decisions** (from 2026-10-28; previously the Living Trace decisions alone). Each entry records its date, rationale, and conditions or open questions, so later work need not reconstruct the reasoning. These decisions govern design and prototype work; they are not institutional doctrine and do not amend `/community-rights`, the Manifesto, or `docs/ethos.txt`.
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


## 2026-10-28 — The Living Archive: homepage, Memory Project, and record model (Milestones 1–2.1)

**Verdict.** The Living Archive is approved as the **design direction** for TIRO's public website, and the Memory Project's architecture is approved subject to the refinements below. These are design decisions, not production adoption. The previews remain previews.

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 30 | **V5 homepage** (`/preview/home-v5`) as the visual direction | **Approved for future integration** | Communicates why TIRO exists through the actual mark, restrained linework, and doctrine quoted with its sources; works in both themes. | Preview only. Production integration is not authorized (decision 37). On integration, production routes link to production routes only; no production page may point at `/preview/`. |
| 31 | **Two-view public record pattern**: a structured record as the authoritative view, with a coordinated layer map | **Approved** as the proposed standard for public Memory Project records | *Every record must be complete as information before it becomes an experience.* Structured information is authoritative; visualizations are navigational and explanatory; both read the same record; neither reveals anything the visitor is not entitled to. | Specified in `record-view-contract.md` (a draft for review). The detached **Derived** layer is to be preserved: an original account and an interpretation of it are not equivalent, and interpretation never acquires the source's authority. This applies to any future AI-assisted feature. |
| 32 | **TIRO Citation Standard v0.1** (`citation-standard-v0.1.md`) | **Provisional** | TIRO's custodianship must never be mistaken for authorship or cultural ownership. Translations and interpretations are separately attributable and citable. | Minimum fields: record title (where publication is permitted), record identifier, source attribution as authorized, custodian, record version, persistent URL, access date. Open: what constitutes a new version; persistent identifiers; attribution variants by audience or language; credit under shared or disputed authority; a machine-readable form. Remains provisional until the record and provenance model is finalized. |
| 33 | **Distinct contributor/authority fixture** (`DEMO-MP-0001`) | **Approved: synthetic only** | The contributor/authority distinction is fundamental and had to be demonstrated, not only explained. | Deliberately fictional; no real person, community, or institution. One example is sufficient. Kept in its own fixture and projection so the shared Living Trace fixtures, on which other demonstrations depend, are unchanged. It is not evidence of any real authority. |
| 34 | **Authority is distinct from its execution** (the signer clarification) | **Adopted as a clarification** of the proposed governance model, not a broadening of anyone's authority | The system must recognize collective authority and also represent how a collective exercises it. A signer possesses no independent cultural authority by being a signer, yet an authorized signer may execute a collective's decision within a valid mandate. | The model keeps five things apart: who **possesses** the authority; who **made or authorized** the decision; who **executed** and who **recorded** it; what **mandate** permitted it; and whether that mandate was **valid** for that holder, record, use, and date. A signature outside its mandate has no effect. Incomplete authorization fails closed. Visitors see only a safe consent summary: never a signer's or subject's identity, a mandate's identity or terms, or an attempt without effect (ethos §3.3; contract 0.2 §7.3). Open: what evidence establishes a real collective's mandate (decision 27; requires actual community participation); how dissent within a collective is recorded; revoking or amending a mandate mid-term; whether the source community may see execution detail that visitors may not (audience-dependent disclosure). |
| 35 | **Disclosure verification**: three protections | **Approved and implemented** (narrowly scoped) | Canary values alone are not enough. | (1) Explicit public-field allowlists for every record projection. (2) Recursive forbidden-field assertions over every public projection, for private keys and values, with the guards themselves tested. (3) Build-output scanning extended to serialized private keys (matched as `"key":`, so prose and documentation that name a field are not false positives) and to identifiers prohibited on the authority scenario's page only. |
| 36 | **Shared component consolidation** (`living-archive-consolidation.md`) | **Planned, not implemented** | V5 and Memory Project v1 already share tokens, type roles, motion, and layer geometry under two prefixes. | No refactor of approved previews until adoption. |
| 37 | **Production adoption** of V5, the Memory Project, or the record interface | **Not authorized** (superseded by decision 41, 2026-10-29) | Design approval is not operational readiness. | Requires a separate decision. The Memory Project is presented as in development, never as an operating collection. |
| 38 | **Global navigation changes** | **Deferred** (superseded by decision 42, 2026-10-29) | The information architecture is settled after the inner pages are evaluated. | The shared `TopNav` is unchanged. |
| 39 | **Publication of the working documents** (citation standard, record-view contract, consolidation inventory) | **Not yet** | Provisional specifications must not be presented as adopted institutional standards. | They remain internal working documents until their open questions are resolved. TIRO should eventually have a public technical documentation area on its stewardship and provenance architecture. A private review interface may be useful before then. |

### Where the work stands

| Milestone | Status |
| --- | --- |
| Public homepage (V5) | Design approved |
| Memory Project overview | Design approved |
| Two-view record interface | Pattern approved |
| Synthetic authority model | Implemented; revised for decision 34 |
| Citation standard | Provisional v0.1 |
| Record contract | Documented (draft) |
| Design-system consolidation | Pending |
| Production integration | Pending; not authorized |

These statuses reflect the founder's design decisions and the reported implementation and test results, not an independent code audit.

### Principle carried forward

> **TIRO's philosophy is translated into enforceable system behavior.** A distinction drawn in the Manifesto or in Community Rights should, wherever the system depends on it, have a data model, a demonstration, and an automated test.

## 2026-10-29 — Milestone 3.0: repository consolidation and integration

**Verdict.** Milestone 3.0 (`milestone-3.0-consolidation-plan.md`) is approved, and production adoption of the Living Archive is authorized for implementation with release held behind tests and founder sign-off. Confirmed by the founder on 2026-10-29 from the drafts in `milestone-3.0-founder-decisions.md`, with decision 44 amended. Gate 0 (a working release path) was independently verified the same day (`docs/deployment/public-site-hosting-readiness.md`).

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 40 | **Milestone 3.0** (`milestone-3.0-consolidation-plan.md`) | **Approved, conditionally** | The repository returns to one authoritative branch without losing design history: a no-fast-forward merge preserves the original commits. | Integration through a review branch and PR (#13). Nothing merges into `main` without a passing `build-lint-test` run and founder approval. |
| 41 | **Production adoption** of V5, Memory Project v1, and the two-view record interface. **Supersedes decision 37** | **Authorized for planning and implementation; release conditional** | Design approval had to be separated from operational readiness (decision 37). Building and previewing is now authorized; publication still waits on evidence. | Release only after Phase 3 tests (disclosure, accessibility, performance, synthetic labelling) and founder sign-off on a preview deployment. The Memory Project is presented as in development, never as an operating collection. Making the design public does not authorize accepting or publishing real entrusted records. |
| 42 | **Global navigation**: Purpose / Memory Project / Principles / Get involved. **Supersedes decision 38** | **Approved as the target structure** | A visitor's questions (why, what, on what terms, how to help) rather than the site's page list. | Every existing destination keeps a place. The mapping of Manifesto, About, Community Rights, Nodes, Contact, and Pilot into the four groups is reviewed before release. |
| 43 | **`/living-trace` retained** during Milestone 3.0 | **Kept, temporarily** | It remains a useful reference, especially for relationship exploration. | Retire only after its valuable functionality and its disclosure checks are accounted for elsewhere (a written mapping, then a separate approval). Its Constellation components stay until then. |
| 44 | **`/memories` kept separate** from the Memory Project demonstration | **Approved, as amended** | `/memories` is backend-connected; the new record pages demonstrate a proposed experience. Combining them would blur the distinction between a demonstration and an operating system. | Restyle only during 3.0. **Its backend-connected records are not enabled for public display without an explicit decision. When disabled, the interface must describe that state accurately, rather than presenting it as a temporary outage.** (Today the public project sets no variables, so the page says "temporarily unavailable"; to be corrected in the planned `/memories` work.) |
| 45 | **Synthetic records are `noindex`** in production | **Approved** | The project and its principles may be discoverable; fictional records must not be mistaken for historical evidence. | Applies to every synthetic record page, wherever it lives. Enforced by a build-output check. `noindex` discourages indexing; it is not access control. |

## 2026-10-30 — Milestone 3.0 Phase 3a: G3 release approval

**Verdict.** The founder personally inspected the final previews of PR #16 and approved all four decisions in the G3 release-gate report (`milestone-3.0-phase-3a-release-gate.md` §8), including the production release. This meets decision 41's release condition for Phase 3a: Phase 3 tests (disclosure, accessibility, performance, synthetic labelling) and founder sign-off on a preview deployment.

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 46 | **Global navigation mapping** (completes decision 42): **Purpose** (Manifesto, About) · **Memory Project** (the Memory Project) · **Principles** (Community Rights) · **Get involved** (the pilot, Nodes, Contact) | **Approved, as implemented** | Every destination of the previous navigation keeps a place; the header asks a visitor's four questions, while the menu and footer list every page. | `/living-trace` stays outside the navigation (decision 43). Defined once in `src/lib/navigation.ts` and tested. |
| 47 | **Homepage record links** open the Memory Project's two-view record pages (`/memory-project/records/…`), not `/living-trace/records/…` | **Approved** | The adopted record interface is where a visitor reads a record; `/living-trace` remains linked as the full synthetic map. | — |
| 48 | **`/memories`**: kept separate from the Memory Project demonstration, listed in the **footer only**, and described accurately when its live records are not enabled | **Approved** (applies decisions 42 and 44) | It keeps a place without appearing beside the demonstration. "Not enabled" is a deliberate state, not an outage. | No backend record is enabled; enabling public display remains a separate founder decision (decision 44). Restyle in Phase 3b. |
| 49 | **Production release of Phase 3a**: V5 at `/`, Memory Project v1 at `/memory-project`, synthetic records at `/memory-project/records/[id]`, temporary redirects from the previews, and the new navigation | **Approved for release (G3)** | Evidence in `milestone-3.0-phase-3a-release-gate.md`: disclosure verifier with checks that fail closed, visual parity with the approved previews, accessibility, performance, and passing Linux CI. | The Memory Project is presented as in development; its records are synthetic and `noindex`. No branch or asset deletion (Phase 5); Phase 3b not begun. |

## 2026-10-30 — Milestone 3.0 Phase 3b: the Manifesto as the long-form reference

**Verdict.** The founder reviewed PR #17 (screenshots, the team preview and the evidence in `milestone-3.0-phase-3b-inner-pages.md` §1.1) and passed both the visual and the technical review, with no corrective iteration. PR #17 was merged (`3c997d4`) and deployed to production.

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 50 | **`/manifesto` redesigned as the long-form reference page**: an opening with a contents list, the shared local bar, one reading measure, margin numerals, ledes, anchored parts, and no motion or imagery | **Approved and released** | A text meant to be read, studied and returned to. The pattern carries to Community Rights, About and the other institutional pages; their layouts are not meant to be identical. | Text unchanged (proved in §1.1). Observation, not blocking: on mobile, the local bar scrolls sideways without an obvious cue; revisit if touch-device testing shows confusion (P3B-5). Next: the `/pilot` overflow (P3B-1) as its own PR, then `/community-rights`. |

## 2026-10-30 — Milestone 3.0 Phase 3b: Community Rights as the policy page

**Verdict.** The founder approved the visual design of PR #19 (layout, typography, navigation, clause hierarchy and request procedure) and, once the two release-gate items in `milestone-3.0-phase-3b-inner-pages.md` §1b.2 were closed, judged G3 satisfied. PR #19 was merged (`acf6372`) and deployed to production, where it was verified (§1b.3).

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 51 | **`/community-rights` redesigned as the policy page**: a contents list of the numbered principles; each principle a numbered, anchored clause (`#custody` … `#exclusivity`); the correction, restriction and withdrawal procedure as a heading (`#requests`) in its own panel, with "Contact TIRO" as its primary action; the Manifesto's type and local bar; no motion or imagery | **Approved and released** | A policy is consulted and cited, so it is laid out by clause, with stable anchors written into the page. The procedure a community may need urgently can be found from the first screen. | Wording unchanged (proved in §1b). The clause numbers are presentation only and do not amend the policy. Next: `/about`. |

## 2026-10-30 — Milestone 3.0 Phase 3b: About as a finding aid

**Verdict.** The founder reviewed PR #20 (the desktop and mobile comparisons in both themes, the full-resolution screenshots and the diff) and approved the visual design with no revisions. The founder independently confirmed the head (`472e014`), the branch's currency with `main`, the eleven changed files and the passing Linux CI, including the disclosure verifier and the Flight Deck integration tests. The protected team preview was not opened; the approval rests on the committed screenshots and CI. Release authorized: record this decision, pass CI, merge with a merge commit, and verify in production.

| # | Decision | Status | Rationale | Conditions and open questions |
| --- | --- | --- | --- | --- |
| 52 | **`/about` redesigned as a finding aid**: the headline and a lede introduction; "Custodial Paradigm" and "Governance" as headings with stable anchors (`#custodial-paradigm`, `#governance`), each beside its text on wide screens; the custodial paradigm as a statement with the accent rule, without the card; the governance entries as `h3`s under the note that governance is still forming; no local bar, summary, motion or imagery | **Approved and released** | The page explains the institution: short, read once, and given a clear hierarchy without new wording. Two short sections do not need a local bar, and a summary would add text the page does not have. The Manifesto declares, Community Rights establishes commitments, and About explains the institution: distinct functions within one visual identity, a direction to keep for the remaining pages. | Wording unchanged (proved in `milestone-3.0-phase-3b-inner-pages.md` §1c). PR #20 merged (`d9cfb00`) and verified in production (§1c.3). Next: `/nodes` and the node profiles. |
