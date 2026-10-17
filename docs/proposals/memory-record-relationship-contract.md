# Memory Record & Relationship Contract — 0.2 Review Candidate

Status: **Review candidate. Not adopted. Not implemented.** The conceptual architecture was approved for continued development on 2026-10-16. This revision is for formal review, not for implementation (`docs/design/decisions.md`, decisions 12–26). No backend schema, API, infrastructure, or site code is changed by this document.
Revision date: 2026-10-16. Supersedes proposal 0.1 (in git history).
Owner: TIRO founder / Steward. Formal reviewers: §14.
Authority: Subordinate to `/community-rights`, `docs/manifestov0-2.txt`, `docs/ethos.txt`, and `docs/501c3.txt`. Where this contract and those documents differ, they govern, and the difference is listed for review (§14), not silently changed.
Builds on: `docs/ethos.txt` §3.2–3.6, §4, §9, §12; the backend's permission and lifecycle **semantics** (`backend/src/services/permissions.ts`, `backend/src/domain/types.ts`); the Living Trace prototype's relationship semantics (`src/lib/livingTrace/`).

Markers used below: **[FR: …]** marks a provision that needs formal review by the named discipline before it can become normative.

---

## 0. Changes from 0.1

| Change | Where | Decision |
| --- | --- | --- |
| One authorization rule for every claim; a public record authorizes none of its claims automatically | §7.3 | 21 |
| A relationship is served only with its **authorized characterization**; it is never silently reclassified | §6 | 22 |
| The synthetic fixture backend stays synthetic-only; a separate, reviewed production domain is required | §3 | 23 |
| Full authorization record; one consistent decision across stores; dependency-tracked invalidation | §7.3, §8 | 24 |
| Provenance traversal by declared type semantics; testimony origin distinct from translator or interpreter | §4.8, §5 | 25 |
| `ethos.txt` §12 windows presented as proposed targets | §9 | 26 |
| Interest holders (claimant, source authority, rights holder, subject) and collective authority | §4.4, §7.1 | 12, 13 |
| Disagreement: internal documentation vs public disclosure; dual control | §6.3 | 14 |
| Interpretive enrichment as an explicitly authorized scope | §7.2 | 15 |
| No machine-generated claims in v1 | §2 P12 | 16 |
| "Provenance incomplete", without a reason | §5.4 | 17 |
| Indirect identification after attribution withdrawal | §7.5 | 18 |
| No public version history by default | §10 | 19 |
| Geographic precision as an authority-set disclosure scope | §7.6 | 20 |
| Decision matrix of six cases | §11 | review instruction |

## 1. Purpose

TIRO's backend can decide whether a record may be served, to whom, and for what purpose. What no system yet defines is how records **relate**: who says two records are connected, on what evidence, which of those statements a given visitor may know, and what happens to the connections when consent, authority, or sensitivity changes.

This contract proposes those rules so that Memory Project Experience 1.0, a future production backend, and the stewardship policy share one model before any of it is built against entrusted material. Its test is §11: the same records projected for different audiences and authorization states, before and after change.

## 2. Principles (normative once adopted)

| # | Principle | Source |
| --- | --- | --- |
| P1 | **Communities and sources remain the principals; TIRO is the custodian.** Recording, storing, linking, or interpreting transfers no authority to TIRO. | `/community-rights` |
| P2 | **Interests are separate.** Claimant, source authority, legal rights holder, collector, contributor, signer, and subject are distinct. One party holds several only with evidence. **No one gains authority over another's interest by submitting a record.** | `ethos.txt` §3.2–3.3; decision 12 |
| P3 | **Purpose does not transfer.** Each use, audience, and channel needs its own authorization. New capability creates no new permission. | `/community-rights`; `ethos.txt` §3.3 |
| P4 | **The disclosure unit is the authorized claim**, under **one rule for every claim** (§7.3). Publishing a record authorizes none of its claims by itself. | decisions 2, 21 |
| P5 | **A relationship is a set of attributed claims, not a fact,** served only under its authorized characterization. | Living Trace; decision 22 |
| P6 | **Provenance follows declared source semantics only.** Shared context connects records; it never corroborates them. Two descendants of one original are one source, not two. | decisions 25, preserve |
| P7 | **Withheld material never determines a visible statement**: not its characterization, its count, or its existence as a disagreement. | decision corollary |
| P8 | **Undiscoverable is indistinguishable from nonexistent.** | `publicView.ts` |
| P9 | **History without indefinite retention.** Nothing is silently overwritten; nothing sensitive is made permanent by logging; withdrawal and deletion reach history too. | `ethos.txt` §3.5, §12 |
| P10 | **Demonstration is never evidence.** A synthetic object never becomes evidence by editing its status. | decision 9, preserve |
| P11 | **The control register is authoritative, consulted last, and never restored from backup.** | backend `RestrictionRegisterEntry` |
| P12 | **Systems witness before they interpret.** No model-generated claim enters the entrusted archive in v1 (synthetic testing permitted). | Manifesto §V; decision 16 |
| P13 | **Subjects are protected independently.** A source's consent cannot authorize disclosing information that identifies someone else. | decision 13 |
| P14 | **Authority over entrusted material is not a power to suppress independently sourced information.** | decision 12 |

## 3. Scope boundary: fixture backend, production domain, prototype

Three systems exist or will exist. This contract governs the third.

| System | Status | Relationship to this contract |
| --- | --- | --- |
| **Fixture backend** (`backend/`) | Working; **synthetic-only by construction** (`FixtureRecord.isSynthetic: true`, mandatory `fixtureSetId`) | Its permission **semantics** (register-last, fail-closed, revocation that survives restore, version-pinned media, attributed corrections) are adopted here as requirements. Its **types and stores are not extended** to hold entrusted material. Nothing in this contract weakens the synthetic-only constraint. |
| **Living Trace prototype** (`src/lib/livingTrace/`) | Static synthetic demonstration | Demonstrates relationship semantics. It is **not** the permission model: it evaluates nothing per request and bakes output into static pages. |
| **Production domain** (future) | Not designed | Implements this contract once adopted, through an **independently reviewed design and migration**, started only when readiness is established (`ethos.txt` §6.1) and the backend's live-drill evidence is resolved separately (decision 11). |

Type sketches below describe the **production domain** in illustrative TypeScript. They are not a migration and do not modify `backend/src/domain/types.ts`.

## 4. Entities

### 4.1 Evidence class

```ts
type EvidenceClass = "demonstration" | "evidenced";
```

Set at creation; immutable. Demonstration objects relate only to demonstration objects. They are labeled wherever shown and excluded from counts, real-record search, partner exports, and impact reporting. A demonstration object is never promoted; an evidenced object is created independently. Fixture-backend data is always `demonstration`.

### 4.2 Record

The custodial unit: one entrusted item with its media and lifecycle.

```ts
type Record = {
  recordId: string; version: number;
  evidenceClass: EvidenceClass;
  recordKind: "demo" | "pilot" | "collection";
  title: string; summary: string;          // disclosed only under §7.3
  provenanceRef: string;                   // safe pointer, never testimony
  publicationStatus: PublicationStatus; custodyStatus: CustodyStatus;   // as ethos §12
  mediaRefs: MediaRef[];                   // version-pinned
  derivedFrom: DerivationRef | null;       // §4.7
};
```

Record fields (title, summary, transcript segments, media) are **disclosure targets** under the same single rule as claims (§7.3). Publication status says whether a record may be served at all; it never says which fields or claims.

### 4.3 Source (testimony origin)

The person, community, or body whose account a record holds: the origin of every provenance chain.

```ts
type Source = {
  sourceId: string; evidenceClass: EvidenceClass;
  kind: "person" | "community" | "body" | "unknown";
  publicAttribution: { text: string; scope: DisclosureScope } | null;   // how the source chooses to be named, if at all
};
```

A source is not a user account, a signer, or a subject. A translator, editor, curator, or process is **never** a source (§5.2).

### 4.4 Interest and authority basis

Every disclosure touches one or more **interests**. Each interest has a holder and a basis that must be established for the specific material and use (decision 12).

```ts
type InterestKind = "claimant" | "source-authority" | "legal-rights" | "subject";

type Interest = {
  interestId: string;
  kind: InterestKind;
  holder: HolderRef;                       // a person, or a collective body (below)
  appliesTo: TargetRef;                    // record, field, claim, relationship, or context entity
  status: "established" | "shared" | "disputed" | "unknown" | "superseded";
};

type CollectiveAuthority = {
  holderId: string;
  description: string;                     // e.g. "council designated by the community's own process"
  // How authority was established through the community's legitimate process,
  // for THIS material and use. Evidence is restricted.
  establishment: { processRef: string; evidenceRef: string; scope: TargetRef[]; uses: Purpose[]; validUntil: string | null };
  representatives: { capacity: string; mandateRef: string; verified: boolean }[];
};
```

Rules:
- TIRO never assumes a single representative for a community. **[FR: stewardship/community]** what counts as adequate evidence of establishment, per participating community.
- `disputed` or `unknown` on any required interest **holds** the affected disclosures (§7.1). TIRO may evaluate evidence, facilitate resolution, and impose protective restrictions. It cannot manufacture consent or expand a mandate.
- A collective authority's scope covers **its entrusted material**. It does not extend to claims anchored in independently sourced records (P14). **[FR: legal; stewardship]** the boundary of P14 where a community asserts authority over knowledge published elsewhere.

### 4.5 Claim

The atomic unit of statement and of disclosure.

```ts
type Claim = {
  claimId: string; version: number; evidenceClass: EvidenceClass;
  kind: "source" | "attestation" | "derivation" | "interpretation";
  position: string;                        // what it says, neutrally
  claimant: { capacity: string; sourceId: string | null };
  anchorRecordId: string | null;           // the record holding it
  subjects: SubjectRef[];                  // identifiable people it concerns, other than its source (P13)
  evidenceRefs: string[];                  // restricted store
  standing: "recorded" | "attested" | "inferred" | "unknown";
  status: "active" | "superseded" | "withdrawn";
};
```

- `contested` is never a claim standing; it is a relationship characterization (§6).
- `interpretation` is always attributed to a named party, including TIRO, and needs the interpretive-enrichment scope to be published (§7.2).
- No `kind` admits model output in v1 (P12).

### 4.6 Relationship

```ts
type Relationship = {
  relationshipId: string; version: number; evidenceClass: EvidenceClass;
  type: RelationshipTypeId;                // §4.8
  ends: { a: EntityRef; b: EntityRef };    // roles defined by the type, not by order
  claimIds: string[];
  // The characterization that has been AUTHORIZED for disclosure (§6), e.g.
  // "contested" once a disagreement passed public-disclosure review.
  characterization: Characterization;
  recordedBy: { capacity: string; act: "recorded" | "noted-disagreement" | "noted-open-question"; at: string };
};

type Characterization =
  | { kind: "recorded" | "attested" | "inferred"; supportedBy: string[] }   // claim ids
  | { kind: "contested"; parties: string[] }                                // the conflicting claim ids
  | { kind: "unknown" };                                                    // open question, no claims
```

### 4.7 Derivative

A record with `derivedFrom` set.

```ts
type DerivationRef = {
  sourceRecordId: string; sourceVersion: number;
  kind: "transcript" | "translation" | "edit" | "adaptation" | "excerpt" | "annotation";
  maker: { capacity: string };             // the translator or editor: a derivation author, never a source
  permissionRef: string;
};
```

Its effective permission is the **intersection** of its own authorizations and its source's, evaluated per request, including expiry (§11 case E).

### 4.8 Relationship types and provenance semantics

Each type declares its ends' roles. Traversal uses the declared roles, never the stored order of `a` and `b`.

| Type | End roles | Provenance semantics | Contributes to independence? |
| --- | --- | --- | --- |
| `source-of` | `origin` (Source) → `account` (Record) | **Testimony link.** `origin` is the provenance parent. | Yes: its origin is a testimony source |
| `derived-from` | `derivative` (Record) → `original` (Record) | **Derivation link.** `original` is the provenance parent; the derivative's `maker` is a derivation author. | No: inherits the original's sources |
| `annotates` | `note` (Record) → `subject-record` (Record) | **Interpretation link.** Chains do not pass through it; the note's author is an interpreter. | No |
| `refers-to` | `account` → `place / event / person-as-subject / theme` | none | — |
| `given-in` | `account` → `language` | none | — |
| `accounts-of` | `account` → `event` | none | — |
| `variant-of` | `account` ↔ `account` (symmetric) | none | — |
| `same-as?` | `entity` ↔ `entity` (symmetric) | none; open question | — |

New types are added by review. Each states its end roles and its provenance semantics. **[FR: archivist]** the vocabulary itself.

### 4.9 Context entity

```ts
type ContextEntity = {
  entityId: string; evidenceClass: EvidenceClass;
  kind: "place" | "language" | "event" | "theme" | "institution" | "person-as-subject";
  label: string;
  precision?: "exact" | "locality" | "region";   // places: the most precise form that exists
};
```

What may be shown, and at what precision, is a disclosure decision (§7.6). It is not a property of the entity.

## 5. Provenance (normative once adopted)

### 5.1 Chains
A claim's chain runs from its anchor record to testimony origins, following `derived-from` (to the original) and `source-of` (to the origin) by declared role. No other type extends a chain.

### 5.2 Roles in a chain
Each step is labeled with its role: **testimony origin** (Source), **original record**, or **derivation step** (with its maker). Interpreters and derivation makers are shown as such and never as origins.

### 5.3 Independence
Two source claims are independent only when their chains reach **disjoint sets of testimony origins**. Two translations of one original share its origin and are not independent. Two records referring to the same place are not corroboration.

### 5.4 Incomplete provenance
When a chain step is unavailable to the audience, the chain shows **"Provenance incomplete"** and nothing else (decision 17). A more specific explanation needs its own disclosure authorization covering what it reveals.

## 6. Characterization and disagreement (normative once adopted)

### 6.1 No silent reclassification
A relationship is served **only under its authorized characterization**, and only when the claims visible to that audience support it:

| Authorized characterization | Served when | Otherwise |
| --- | --- | --- |
| `recorded` / `attested` / `inferred` | every claim in `supportedBy` is attributed to this audience | relationship **suppressed** |
| `contested` | every claim in `parties` is attributed to this audience | relationship **suppressed** (never shown as recorded or attested) |
| `unknown` | it has no claims at all | relationship **suppressed** |

If one side of a disagreement becomes unavailable, the disagreement disappears from view. It does not become an uncontested assertion. A claim that is independently supportable on its own is represented as a **separate relationship** with its own characterization and authorization (§11 case B).

### 6.2 Withheld claims
A withheld claim (existence and association authorized, content not) never satisfies `supportedBy` or `parties`. Under §6.1 it therefore never determines a characterization (P7).

### 6.3 Recording and disclosing disagreement (decision 14)
- Authorized curators may record `noted-disagreement` **internally**. That records a fact about the archive; it decides nothing between accounts.
- Disclosing `contested` to any audience needs a **characterization authorization** (§7.3) after additional review, with **dual control** where the dispute is sensitive. **[FR: stewardship]** what counts as sensitive.
- Each source in a dispute has a correction and challenge route, recorded as attributed claims or corrections, never as overwrites.
- Disclosure of a disagreement never reveals a claim, or the existence of a conflict, outside its authorized scope.

## 7. Authorization (normative once adopted)

### 7.1 Required interests
For any disclosure target (a record field, claim, relationship characterization, or context association), the **required interests** are:
- the claimant's (for a claim);
- the source authority's, individual or collective (§4.4), for the anchor record;
- each legal rights holder's, where an identified right subsists in the disclosed material **[FR: legal]**;
- each identifiable subject's (§7.5).

A disclosure is authorized only when **every** required interest has authorized it, or has a documented lawful basis that applies (subjects; **[FR: legal]**). If any required interest is `disputed` or `unknown`, the disclosure is **held**.

### 7.2 Uses, audiences, channels
- **Purposes:** the eight in `ethos.txt` §3.3 (`collection`, `preservation`, `publication`, `research`, `derivatives`, `model-training`, `synthetic-reproduction`, `commercial-use`).
- **Audiences:** `public`, `staff-with-duty`, `research-partner`. Staff access requires a legitimate duty, not a role alone.
- **Channels:** `explorer`, `api`, `export`, `embed`.
- **Interpretive enrichment** (decision 15): publishing source-linked interpretation (annotations, scholarly readings, curatorial notes) needs an explicit `interpretive-enrichment` scope for the intended purpose and publication scope, plus attribution, provenance, review, and a challenge route. This is an operational standard stricter than copyright and makes no claim about legal classification. **[FR: legal; stewardship]** whether this becomes a ninth use category in `ethos.txt` §3.3 (a governance-document change) or a scope within `derivatives`.

### 7.3 The single disclosure rule (decisions 21, 24)
For target **T**, audience **A**, channel **C**, purpose **U**, and (for claims) relationship **R**:

> **T is disclosed to A via C for U** if and only if
> 1. the anchor record passes the record-level checks (custody, publication for A, purpose not restricted, authority not disputed or unknown, signer capacity verified: the fixture backend's existing rules), **and**
> 2. for **every** required interest (§7.1) there is an **active `DisclosureAuthorization`** covering T at the requested level, A, C, U, R, and T's current version, **and**
> 3. the control register shows no override for T, its anchor, R, or any dependency (§8).

Levels are separately authorized; none implies another:

| Level | Reveals | Served as |
| --- | --- | --- |
| `existence` | that the target exists | — (needed for the next level) |
| `association` | that it bears on R (type and ends) | **withheld**: "an account exists, from a restricted source", with an opaque id |
| `content` | position, claimant, and evidence standing | **attributed** |

Nothing else is served. No authorization means **omitted without a trace**. The rule is identical for claims in public and in restricted records; a public record's publication grant authorizes nothing about its claims. Intake may collect many authorizations at once, but each enumerates its targets.

```ts
type DisclosureAuthorization = {
  authorizationId: string; version: number;
  target: TargetRef & { targetVersion: number };          // the exact version authorized
  level: "existence" | "association" | "content" | "characterization";
  interest: { interestId: string; kind: InterestKind };   // the interest this authorization speaks for
  grantedBy: { holderRef: HolderRef; capacity: string; mandateRef: string | null; capacityVerified: boolean };
  basis: "consent" | "documented-lawful-basis";           // the latter only where FR-approved (subjects, rights)
  evidenceRef: string;                                     // restricted store
  purposes: Purpose[]; audiences: Audience[]; channels: Channel[];
  relationshipScope: string[] | "not-applicable";         // association is per relationship, never blanket
  validFrom: string; expiresAt: string | null; revokedAt: string | null;
  reviewRef: string | null;                                // required for characterization, dual-control cases
};
```

Authorizations live in the restricted store. Their ids, grantors, evidence, and existence never appear in a projection.

### 7.4 Projection properties
Inherited from the prototype and backend, required of every visitor-facing response: allow-list construction; fail closed (partial results say so); indistinguishable absence; no counts of the withheld; orphan pruning (a source or context entity appears only while a served relationship touches it); whole-or-nothing relationships (§6.1).

### 7.5 Subjects and indirect identification (decisions 13, 18)
- A claim, field, or association that **identifies** a subject needs that subject's interest authorized, or a documented lawful basis **[FR: legal]**, plus privacy and sensitivity review.
- **Identifiability is assessed on the whole projection**, not field by field. A name, or a combination of place, date, role, and event that singles a person out, counts. **[FR: legal; stewardship]** the assessment method and threshold.
- When attribution is withdrawn, or a subject objects, the complete projected context is reassessed. Removing a name is insufficient if the remaining context still identifies the person; the identifying associations are restricted too.

### 7.6 Geographic precision (decision 20)
- The public precision of a place, and whether a record's association with a place may be disclosed at all, is a disclosure decision set by the applicable source or community authority, subject to legal and stewardship review.
- It is independent of the record's publication status: a published record may have its place association withheld.
- Precision is per audience. A change applies to every projection that includes the place (§8).

## 8. Consistency, revocation, and caching (normative once adopted; decision 24)

### 8.1 Controlled objects and the register
Every record, claim, relationship, authorization, context entity, and source has a **register entry** with a monotonic `controlVersion` and its current control state (restrictions, revocations, holds, precision). The register is the single authoritative serve/deny source. It is never restored from backup (P11), and revocation writes go to the register **first**.

### 8.2 Dependency set
Every projection is computed over an explicit **dependency set D**: every object it read or that could change its result. That includes the target record, every claim and relationship shown or considered, each claim's anchor record, every record and source on each provenance chain, every context entity, and every authorization consulted. Each projection records a **dependency vector** `{ objectId: controlVersion }` for all of D.

### 8.3 Decision protocol
1. Resolve D from current content stores.
2. Read content, interests, and authorizations.
3. Read the register entries for **all of D, last, in one consistent read** (a transactional or strongly consistent batch read).
4. Decide using only that snapshot (the existing `evaluatePermissionSnapshot` discipline, extended to D).
5. If D exceeds one consistent read's capacity, split the projection into independently consistent parts or **fail closed**. Never serve a partially checked result as whole.

**[FR: engineering/security]** consistent-read limits of the chosen store; behavior for very large D.

### 8.4 Caches and invalidation
- A cached projection is valid only while **every** entry in its dependency vector still has the recorded `controlVersion`, and only until the earliest `expiresAt` among its authorizations.
- A **reverse index** maps each object to the cached projections that depend on it. A register write to any object invalidates all of them: explorer caches, RSC and prefetch caches, API caches, embeds, search documents, and the CDN (by a surrogate key per dependency).
- **No stale-while-revalidate** for visitor-facing views of entrusted material (`ethos.txt` §14).
- A per-record version alone is insufficient: a change to a source, a chain member, a context entity, or an authorization must invalidate every relationship that depends on it.

### 8.5 Races and restore
- A revocation is **effective at register commit**. No response built after commit may use a pre-commit register read. In-flight responses are bounded by the request timeout. **[FR: engineering/security]** the acceptable bound.
- Caches are purged **before** a revocation is reported complete, and the receipt records purge confirmation.
- After any restore of a content or authorization store, all caches are flushed and every restored object is re-evaluated against the (unrestored) register before it is served.

## 9. Change propagation

Proposed windows are those of `ethos.txt` §12. They are **acceptance targets pending adoption, not service guarantees** (decision 26): acknowledge within 2 days; protective hold within 24 hours of credible urgent exposure; cease affected publication within 7 days of verified withdrawal.

| Event | Effects (via §8) |
| --- | --- |
| Record withdrawn or restricted | Its fields and claims stop being disclosed. Every relationship depending on it is re-evaluated under §6.1. Derivatives lose the affected uses. Chains through it show "Provenance incomplete". |
| Consent or authorization revoked or expired | Register first. Every dependent projection is invalidated. Targets fall to the next authorized level or to omitted. |
| Authority or interest becomes disputed | Affected disclosures held. Independently sourced claims anchored elsewhere are unaffected (P14). |
| Claim corrected or superseded | New version. Authorizations were for the prior version, so content falls to omitted until re-authorized for the new version. The prior version stays in staff history. |
| Attribution withdrawn | Name removed; whole-projection identifiability reassessed (§7.5). |
| Precision changed | Every projection including the place is invalidated and recomputed (§7.6). |
| Restore from backup | Caches flushed; restored objects re-evaluated against the register. |

Partner copies receive scoped notices (`CustodyCopy`). Independently held public copies cannot be guaranteed erased, and sources are told so before consent (`ethos.txt` §12).

## 10. Version history (decision 19)

- Records, claims, relationships, interests, and authorizations are versioned and append-only within retention.
- **No public history by default.** Access only for authorized personnel with legitimate duties. A public correction notice or version summary needs its own disclosure authorization.
- Corrections keep the prior value, attributed; a dispute about a correction does not revert it.
- Withdrawal and deletion reach history. Deleted versions leave active stores and expire from backups on the disclosed schedule. A safe tombstone is kept only where it reveals nothing (P9).

## 11. Decision matrix

All six cases use synthetic labels. Audiences: **Public** (explorer), **Staff** (with a legitimate duty), **Research partner**. "Omitted" means absent without a trace. "Withheld" means "an account exists, from a restricted source" with an opaque id.

### Case A — Public record with one restricted claim

**Stored.** Record R1, published, authority established, signer verified. Claims:
- c1: `source-of`, from Source S1.
- c2: `refers-to` Place P.
- c3: `refers-to` Site Q, which the source authority has restricted.

Relationships r1 (c1), r2 (c2), r3 (c3).

**Authorized.**
- c1, c2: content, public explorer, by S1 and the source authority.
- c3: content for staff-with-duty only; no public authorization at any level.
- R1 title and summary: public.

| | Public | Staff | Research partner |
| --- | --- | --- | --- |
| Served | R1 title and summary; r1 and r2 attributed; P | Everything, including r3 and c3, marked restricted | Nothing: no research authorization |
| Withheld | — | — | — |
| Omitted | r3, c3, Q (orphan). No count, no placeholder. | — | R1 entirely, indistinguishable from absent |

**After change.** S1 revokes c2's public content authorization. Register first, then every projection depending on c2 is invalidated. r2 is suppressed and P is pruned if no other served relationship touches it. R1 stays public.

**What it tests.** R1's publication authorizes neither c3 (decision 21) nor anything about c3's existence.

### Case B — Contested relationship with a withdrawn participant

**Stored.**
- R2 from S2 and R3 from S3, both published.
- Relationship v1 `variant-of` R2 ↔ R3, characterization `contested`, parties c4 (in R2) and c5 (in R3), recorded by a curator's `noted-disagreement`.
- Independently, r4 `accounts-of` from R2 to Event E, supported by c6, characterization `attested`.

**Authorized.**
- c4, c5, c6: content, public, by their claimants and source authorities.
- v1: `contested` characterization, public, after dual-control review.

| | Before withdrawal: Public | After S3 withdraws R3: Public | After: Staff |
| --- | --- | --- | --- |
| Served | v1 contested with two accounts and two independent chains (S2, S3); r4 | R2; r4 (its own characterization, still supported) | R2, R3 as withdrawn, v1 history with the withdrawal recorded |
| Withheld | — | — | — |
| Omitted | — | v1 entirely. Not downgraded to "attested by S2". R3, S3, c5 omitted. | c5 content beyond retention terms |

**What it tests.** No silent reclassification (decision 22). R2's own account stays visible only through r4, a separately authorized relationship. Nothing on R2's page reveals that a disagreement existed.

### Case C — Collectively governed source

**Stored.**
- R4: a recorded performance.
- Source S4: a community body, represented by a council whose `CollectiveAuthority.establishment` documents the community's own designation process, for this material and for preservation and publication. The evidence is restricted.
- Performer P4 holds a claimant interest and a performer's legal-rights interest. **[FR: legal]** which rights subsist.
- R5: a separately sourced, published document, holding claim c7 that also describes the performance.

**Authorized.**
- R4 fields: publication (public explorer) by the council **and** P4.
- R4 research: council only. P4 has not authorized research.
- c7: by R5's own authorities.

| | Public | Research partner | Staff |
| --- | --- | --- | --- |
| Served | R4 authorized fields; R5 and c7 | R5 and c7 only | All, with interests and their status |
| Omitted | — | R4 for research: P4's interest is not authorized (§7.1, every interest) | — |

**After change.** A family branch disputes the council's authority over R4. S4's interest becomes `disputed`, and R4's public disclosure is **held** (protective restriction). TIRO records the dispute and facilitates resolution; it does not decide consent. R5 and c7 remain public: authority over entrusted R4 does not extend to independently sourced R5 (P14). When resolved, a new establishment record and new authorization versions are created, and projections rebuild.

**What it tests.** No single representative is assumed; every interest is required; disputes hold rather than default; P14.

### Case D — Identifiable third-party subject

**Stored.** R6: testimony from S6, published. Claim c8 (`refers-to` Person N, as subject) and a transcript segment naming N. N is neither source nor signer.

**Authorized.**
- S6 authorizes R6 publication and its claims.
- N has given no consent. No documented lawful basis has been established.

| | Public | Staff |
| --- | --- | --- |
| Served | R6 fields; the transcript with N's identifying segment masked | All, including c8, flagged pending subject review |
| Omitted | c8; N; any association that, combined with R6's place, date, and event, would single N out (§7.5) | — |

**After change.**
- **N consents to named public disclosure.** A new authorization for N's interest is created; the masked segment and c8 become disclosable once S6's authorization also covers them.
- **S6 later withdraws their own attribution.** The whole projection is reassessed: if the remaining context identifies S6 indirectly, those associations are restricted too.

**What it tests.** S6's consent cannot authorize disclosure about N (decision 13); identifiability is assessed on the whole projection (decision 18).

### Case E — Derivative whose source permission expires

**Stored.**
- R7, from S7, with publication and derivatives authorized until 2027-06-30.
- D7: a translation of R7 v3 by translator T (`derived-from`, maker T), with its own publication authorization.

| | Public before expiry | Public after expiry | Staff after expiry |
| --- | --- | --- | --- |
| Served | R7; D7. Chain: D7 → (derivation by T) → R7 → S7. T shown as translator. Independence counts S7 only. | Neither | R7 and D7 under preservation |
| Omitted | — | R7 (authorization expired); D7 (intersection with R7 is empty); their relationship | — |

**Cache behavior.** Every cached projection containing R7 or D7 carries R7's `expiresAt` as its latest validity (§8.4), so nothing is served past expiry, even with no register write.

**After change.** S7 renews, creating a new authorization version. Both become disclosable again; D7 needs no new grant unless its own has also lapsed.

**What it tests.** Intersection; time-based invalidation; a translator is a derivation author, not a source (decision 25).

### Case F — Geographic precision changes after publication

**Stored.**
- R8, published, with c9 (`refers-to` Place V, a village). The community authority set V's public precision at `locality`.
- R9, from a different source, also refers to V.

| | Public before | Public after the community sets V to "withheld" | Staff after |
| --- | --- | --- | --- |
| Served | R8 and R9 with "refers to" a locality-level place label; map at locality | R8 and R9, minus their place associations | All, with the restriction and its reason |
| Omitted | — | c9; R9's equivalent claim; V; R8's title if it names V (field reassessed) | — |

**After change.** The register write on V invalidates every projection whose dependency set includes V, across both records, all caches, and the CDN surrogate key for V. Partners receive notice. Independently held public copies cannot be guaranteed erased, as disclosed at consent.

**What it tests.** Precision is authority-set and independent of publication (decision 20); dependency-tracked invalidation beyond one record (decision 24).

### Consistency observations from the matrix

Working the cases through exposed three rules the contract now states explicitly:
1. A **claim correction invalidates its content authorizations** (they were for the prior version, §7.3 `targetVersion`). Otherwise a correction could change what an earlier consent covered. (§9)
2. **Expiry must bound cache validity** (case E). Register-version checks alone miss time-based lapses. (§8.4)
3. **Field authorizations can depend on context entities**: a title that names a restricted place (case F). Fields therefore join the dependency set of any context entity they mention. **[FR: archivist; engineering]** how mention is detected without automated inference (P12).

## 12. Mapping to the repository

| Concept | `ethos.txt` §4 | Fixture backend (synthetic-only) | Prototype | Production domain |
| --- | --- | --- | --- | --- |
| Record | `Memory` | `FixtureRecord` (semantics only) | `InternalRecord` | new, reviewed design |
| Source | `Person` (capacities) | capacity summaries | origin node | new |
| Interest, collective authority | `AuthorityClaim`, `LegalRight` | `AuthorityClaim`, `LegalRight` (semantics) | — | new |
| Claim | — | — | `InternalAccount` | new |
| Relationship and characterization | `Node` links | — | `InternalGraphEdge` (no characterization authorization) | new |
| Derivative | `Translation` / `Derivative` | — | `der-t` / `p-a-t` | new |
| Use permission | `Consent` | `ConsentGrant`, `Purpose` | — | extended with channel and interpretive enrichment |
| Disclosure authorization | — | — | `ClaimDisclosureGrant` (simplified) | new |
| Register and dependency vector | — | `RestrictionRegisterEntry` (per record) | — | per object, dependency-tracked |

The prototype's claim-level grant is a simplified illustration of §7.3. It has no interests, versions, channels, or characterization authorization. It should be updated only for demonstration fidelity, never treated as the model.

## 13. Conformance tests (for any future implementation)

To be passed on synthetic fixtures before any entrusted material. Tests 1–8 exist in some form in the prototype or backend and should be ported.

1. Undiscoverable records, claims, and relationships are indistinguishable from nonexistent ones (body, status, headers, ordering).
2. No projection, export, search document, or serialized prop contains a planted canary.
3. Disclosure levels: none, existence only, or association only → omitted; existence + association → withheld; content → attributed. **For claims in public and restricted records alike.**
4. A public record's publication authorizes none of its claims or fields (case A).
5. Missing authorization from any one required interest denies the disclosure (cases C, D).
6. A disputed interest holds disclosure; an independently sourced claim elsewhere is unaffected (case C).
7. Accounts sharing a testimony origin are not independent; two translations of one original are one source (case E).
8. Revoking an authorization or consent, then restoring older content and authorization backups, does not restore visibility.
9. A contested relationship whose party becomes unavailable is suppressed, never reclassified (case B).
10. A claim correction drops content to omitted until re-authorized for the new version.
11. A change to any dependency (chain member, context entity, authorization) invalidates every cached projection that includes it, including CDN and RSC caches (case F).
12. Nothing is served past an authorization's `expiresAt`, with no register write (case E).
13. A derivative is never available beyond the intersection with its source (case E).
14. Withdrawing attribution triggers a whole-projection identifiability reassessment (case D).
15. A projection whose dependency set cannot be read consistently fails closed or splits; it never silently serves a partial check.
16. Traversal follows declared end roles: reversing the stored order of a `derived-from` relationship's ends does not change its chain.
17. A demonstration object cannot be related to an evidenced one, and shared example metadata creates no relationship.
18. No public version history is served without a separate disclosure authorization.

## 14. Formal review

### Responsibilities (from `decisions.md`)

| Reviewer | Reviews |
| --- | --- |
| **Stewardship / community representatives** | §4.4 collective authority and establishment evidence; §6.3 sensitive disputes; §7.1 interests; §7.5 identifiability; §7.6 precision; case C |
| **Archivist / records specialist** | §4.8 type vocabulary; §5 provenance; §6 characterization; §10 history and retention; §11 observation 3 |
| **Engineering / security** | §8 in full: consistent reads, dependency tracking, revocation races, cache invalidation, storage isolation, leakage; §3 boundary |
| **Qualified legal counsel** | §7.1 rights holders and lawful bases; §7.2 interpretive enrichment classification; §7.5 privacy and identifiability; retention; international transfers; P14 |

**Community review for the proposed Nigerian pilot is not deferred** until the technical model is final (`decisions.md`). The model must accommodate participating communities' decision-making practices. §4.4's `CollectiveAuthority` is deliberately a container for a community's own process, not a definition of one.

### Questions remaining for review

1. Adequate evidence of collective establishment, per community (§4.4).
2. The boundary of P14 where a community asserts authority over knowledge also published elsewhere.
3. Which legal rights create a required interest, by jurisdiction (§7.1).
4. Lawful bases other than consent for disclosures concerning subjects, and who documents them (§7.5).
5. The identifiability assessment method and threshold (§7.5).
6. Whether interpretive enrichment becomes a ninth `ethos.txt` §3.3 category or a scope within `derivatives` (§7.2).
7. What makes a dispute "sensitive" and requires dual control (§6.3).
8. Store consistency limits, the in-flight response bound, and the split-or-fail behavior (§8).
9. Retention periods for authorizations, interests, and superseded versions (§10).
10. How field mentions of context entities are identified without automated inference (§11, observation 3).

## 15. What this contract does not do

- It adopts nothing, appoints no one, and changes no policy, including `ethos.txt` §3.3's use categories or §12's windows.
- It does not change the fixture backend, its synthetic-only constraint, the API, the infrastructure, or the site.
- It does not establish readiness to receive entrusted material (`ethos.txt` §6.1; decision 11).
- It does not design the explorer. Memory Project Experience 1.0 may proceed in parallel, with synthetic data only, and must not let prototype convenience set this model.
