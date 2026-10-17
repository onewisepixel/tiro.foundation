# Memory Record & Relationship Contract — proposal 0.1

Status: **Proposal for review. Not adopted. Not implemented.** No backend schema, API, or infrastructure has been changed by this document (`docs/design/decisions.md`, decisions 1 and 11).
Revision date: 2026-10-16.
Owner: TIRO founder / Steward. Reviewers needed: stewardship and ethics, archives, engineering, and legal (§9).
Authority: Subordinate to `/community-rights`, `docs/manifestov0-2.txt`, `docs/ethos.txt`, and `docs/501c3.txt`. Where this proposal and those documents differ, they govern, and the difference is an open question (§9), not a silent change.
Builds on: `docs/ethos.txt` §3.2–3.4, §4, §9, §12; `backend/src/domain/types.ts` and `backend/src/services/permissions.ts` (the working permission and lifecycle model); the Living Trace prototype (`src/lib/livingTrace/graph.ts`, `projection.ts`), which demonstrates the relationship semantics on synthetic data.

---

## 1. Purpose

TIRO's backend can already decide whether a record may be served, to whom, and for what purpose. What no system yet defines is how records **relate**: who says two records are connected, on what evidence, which of those statements a visitor may see, and what happens to the connections when a source withdraws.

Memory Project Experience 1.0 depends on those answers. This contract proposes them, so that the explorer, the backend, and the stewardship policy share one model before any of it is built against real material.

The contract answers six questions:
1. What is a record, and what is a claim about it?
2. What is a relationship, and what makes one evidenced?
3. How is provenance traced, and when are accounts independent?
4. What may a given visitor know: about a record, a claim, a relationship?
5. What happens to every dependent view, copy, and relationship when consent changes?
6. How does history stay intact without becoming a permanent exposure?

## 2. Principles (normative)

Each principle cites its source. A conforming implementation satisfies all of them.

| # | Principle | Source |
| --- | --- | --- |
| P1 | **Communities and sources remain the principals; TIRO is the custodian.** Nothing in this model transfers authority to TIRO by recording, storing, linking, or interpreting. | `/community-rights` "Custody, not ownership" |
| P2 | **Capacities are separate.** Source authority, legal rights holder, collector, contributor, subject, and signer are distinct roles. One party may hold several only with evidence. | `ethos.txt` §3.2–3.3 |
| P3 | **Purpose does not transfer.** Every use (§5.1) needs its own grant. A grant for one use, audience, or channel implies nothing about another. New capability creates no new permission. | `/community-rights`; `ethos.txt` §3.3 |
| P4 | **The disclosure unit is the authorized claim, not the record.** The right to preserve does not imply the right to disclose existence. Permission to acknowledge existence does not imply permission to reveal an association, a disagreement, or context. | `decisions.md` 2026-10-16 |
| P5 | **A relationship is a set of attributed claims, not a fact.** Every visible relationship carries a type, its claims, each claim's claimant, and a path back to its source, or says plainly that none exists. | Living Trace grammar; `ethos.txt` §3.4 |
| P6 | **Provenance follows source links only.** Shared context (a place, a language, an event, an interpretation) connects records; it never corroborates them. | Living Trace 0.2 §2.1 |
| P7 | **Withheld material never determines what a visible statement says.** A relationship's evidence state, count of accounts, or disagreement is computed only from claims the visitor may see. | `decisions.md` corollary |
| P8 | **Undiscoverable is indistinguishable from nonexistent.** No count, placeholder, timing, error, or ordering difference may reveal it. | `backend/src/services/publicView.ts` |
| P9 | **Nothing is silently overwritten; nothing sensitive is made permanent by logging.** Corrections and disputes are attributed and kept; restricted evidence lives in retention-controlled stores, never in permanent public history. | `ethos.txt` §3.5, §12; `backend` `Correction` |
| P10 | **Demonstration is never evidence.** Demonstration objects form a closed class: they never relate to evidenced objects, and no evidenced relationship is ever derived from demonstration or example metadata. | `decisions.md` decision 9 |
| P11 | **The control register is authoritative and consulted last.** Restoring any other store cannot resurrect access. | `backend` `RestrictionRegisterEntry` |
| P12 | **Systems witness before they interpret.** Machine-assisted output is at most an *inferred* claim by a named process, and only where its processing purpose is authorized; it never becomes attested by repetition. | Manifesto v0.2 §V; `ethos.txt` §3.4 |

## 3. Entities

Type sketches are illustrative TypeScript to make the semantics unambiguous. They are not a migration. Fields already present in `backend/src/domain/types.ts` keep their meaning and are marked *(existing)*.

### 3.1 Evidence class

Every record, claim, relationship, and context entity carries one:

```ts
type EvidenceClass = "demonstration" | "evidenced";
```

- `demonstration`: synthetic or illustrative. Visibly labeled wherever shown. It may relate only to other demonstration objects. It is excluded from counts, metrics, search over real records, exports to partners, and impact reporting (`ethos.txt` §3.9).
- `evidenced`: material held under real custody terms. Being evidenced says *what kind of object it is*, not that any claim in it is true or verified.

The class is set at creation and is immutable. A demonstration object is never promoted; an evidenced replacement is created instead.

### 3.2 Record

The custodial unit: one entrusted item (testimony, recording, document, performance) with its media and lifecycle. This extends `FixtureRecord` *(existing)*.

```ts
type Record = {
  recordId: string;                 // existing, UUIDv7
  version: number;                  // existing
  evidenceClass: EvidenceClass;     // new; replaces isSynthetic for real data
  recordKind: "demo" | "pilot" | "collection";   // ethos §4; demo implies evidenceClass "demonstration"
  title: string; summary: string;   // existing; public only if authorized
  provenanceRef: string;            // existing; safe pointer, never testimony
  publicationStatus: PublicationStatus;   // existing
  custodyStatus: CustodyStatus;           // existing
  mediaRefs: MediaRef[];            // existing, version-pinned
  sourceIds: string[];              // new: the Source(s) whose account this is (§3.3)
  derivedFrom: DerivationRef | null;     // new: set only for derivatives (§3.6)
  // Field-level disclosure: which fields may be shown to which audience.
  // Absent field = not disclosed (default deny), independent of the
  // record being published.
  fieldDisclosure: Partial<{ [F in RecordField]: AudienceScope[] }>;
};
```

Authority, rights, and consent stay as separate entities linked by `recordId`, exactly as today: `AuthorityClaim`, `LegalRight`, `ConsentGrant` *(existing)*.

### 3.3 Source (origin)

The person, community, or body whose account a record holds. This is the "origin" of the Living Trace grammar.

```ts
type Source = {
  sourceId: string;
  evidenceClass: EvidenceClass;
  kind: "person" | "community" | "body" | "unknown";
  // How the source chooses to be identified publicly, if at all. Never a
  // legal identity; identity evidence stays in the restricted store.
  publicAttribution: { text: string; audience: AudienceScope[] } | null;
  // Collective or shared authority is stated, not assumed (ethos §3.3).
  authorityNote: string | null;
};
```

A source is not a user account, not a subject, and not necessarily the signer. A record may have several sources (a group account), and each is listed.

### 3.4 Claim

The atomic unit of statement **and of disclosure**. Anything that asserts something (that a record was given by a source, refers to a place, is a translation of another, disagrees with another account, or is read a certain way) is a claim.

```ts
type Claim = {
  claimId: string;
  version: number;
  evidenceClass: EvidenceClass;
  kind: "source"          // grounded in a record's own account (testimony, its metadata as the source gave it)
      | "attestation"     // stated by an identified party with a reference (an archivist, a document)
      | "derivation"      // a derivative's statement of what it was made from
      | "interpretation"; // a reading by a named party (curator, researcher, process); never testimony
  // What the claim says, in neutral terms. Content disclosure is scoped separately (§5.3).
  position: string;
  // Who made the claim: a capacity summary, never a raw identity (existing pattern).
  claimant: { capacity: string; sourceId: string | null };
  // The record holding the claim, if any. Its custody and permissions govern the claim's content.
  anchorRecordId: string | null;
  evidenceRefs: string[];             // pointers into the restricted evidence store
  state: "recorded" | "attested" | "inferred" | "unknown";   // the claim's own standing
  status: "active" | "superseded" | "withdrawn";             // never deleted from history while retained (§7)
  disclosure: ClaimDisclosureGrant | null;   // §5.3; null = default deny
  createdAt: string;
};
```

Notes:
- `state` belongs to the **claim**. `contested` is never a claim state; it is derived for a relationship (§4.3).
- An `interpretation` is always attributed to a named party, including TIRO. A machine process is named as a process and is `inferred` at most (P12).
- A claim about a person who is not its source (a subject) carries that subject's privacy and dignity interests (`ethos.txt` §3.2); disclosing it needs the applicable authorization, not only the claimant's.

### 3.5 Relationship

A typed connection between two entities, made of the claims that assert it.

```ts
type Relationship = {
  relationshipId: string;
  version: number;
  evidenceClass: EvidenceClass;            // must equal both endpoints' class (P10)
  type: RelationshipType;                  // controlled vocabulary (§3.8)
  from: EntityRef; to: EntityRef;          // record, source, context entity, or derivative
  isSourceLink: boolean;                   // true only for "source of" and derivation types (§4.1)
  claimIds: string[];                      // the accounts; at least one, except for an open question
  openQuestion: boolean;                   // true = recorded as unknown; claimIds must be empty
  // Who recorded, noted, or curated this relationship. This is an act, not a claim:
  // noting that two accounts disagree decides nothing.
  recordedBy: { capacity: string; act: "recorded" | "noted-disagreement" | "noted-open-question"; at: string };
  createdAt: string;
};
```

A relationship has no evidence state of its own in storage. Its state is **computed per projection** from the claims that projection may see (§4.3), so that P7 holds for every audience.

### 3.6 Derivative

A transcript, translation, edit, or adaptation. It is a record with `derivedFrom` set, connected to its source record by a derivation relationship (`isSourceLink: true`).

```ts
type DerivationRef = {
  sourceRecordId: string;
  sourceVersion: number;          // the exact version derived from
  kind: "transcript" | "translation" | "edit" | "adaptation" | "excerpt";
  permissionRef: string;          // the consent grant that authorized "derivatives" (ethos §3.3)
  maker: { capacity: string };    // the translator or editor, attributed
};
```

A derivative can never be more available than its source: its effective permissions are the intersection of its own grants and its source's (§5.1), and source withdrawal propagates to it (§6).

### 3.7 Context entity

Places, languages, events, themes, institutions: what records share. This is the `Node` of `ethos.txt` §4. Its rule is unchanged: "A link implies no stewardship appointment or permission."

```ts
type ContextEntity = {
  entityId: string;
  evidenceClass: EvidenceClass;
  kind: "place" | "language" | "event" | "theme" | "institution";
  label: string;
  // Precision is a disclosure decision: a sensitive place may be public only
  // at region level (ethos §3.6, art-direction maps rule).
  precision: { public: "exact" | "locality" | "region" | "withheld" };
};
```

Context entities never carry authority, never assert anything, and are never visible without at least one visible relationship (the orphan rule, §5.4).

### 3.8 Relationship types (initial controlled vocabulary)

| Type | Source link? | Typical claim kinds | Notes |
| --- | --- | --- | --- |
| `source-of` | yes | source | Source → record. The root of every provenance chain. |
| `derived-from` | yes | derivation | Derivative → source record, pinned to a version. |
| `refers-to` | no | source, attestation | Record → place, event, person-as-subject, theme. |
| `given-in` | no | source | Record → language (as the source identifies it). |
| `accounts-of` | no | source | Record → event the account describes. |
| `variant-of` | no | source (≥ 2) | Record ↔ record: accounts of the same matter. Contested when the accounts conflict (§4.3). |
| `interpreted-in` | no | interpretation | Record → interpretation note. Never testimony. |
| `same-as?` | no | none (open question) | Two entities that may be the same. Recorded as unknown until claimed. |

New types are added by review, never ad hoc. Each new type states whether it is a source link and which claim kinds may support it.

### 3.9 Permission and disclosure records

These stay in the existing stores and are extended by §5:
- `ConsentGrant` *(existing)* gains a **channel** dimension (§5.1).
- `ClaimDisclosureGrant` (new, §5.3).
- `RestrictionRegisterEntry` *(existing)* gains claim- and relationship-level controls (§5.5).

## 4. Provenance and evidence (normative)

### 4.1 Source links
Provenance chains follow only relationships with `isSourceLink: true` (`source-of`, `derived-from`). No other type, however strong, extends a chain (P6).

### 4.2 Chains and independence
- A claim's **chain** runs from its anchor record back along source links to a source. A record may have several sources and therefore several chains; each is shown.
- Chain outcomes per claim: `traced`, `incomplete` (a link is missing, or not visible to this audience), `no-source` (the claim has no anchor), `interpretation` (never traced to testimony), or `withheld` (§5.3).
- Two source claims are **independent** only when their chains reach disjoint sets of sources. Claims sharing a source are reported as not independent, however many there are.
- `incomplete` never names a hidden link. "A step in this chain is not available to you" is shown only when the hidden record's existence is itself disclosed to that audience; otherwise the chain simply stops.

### 4.3 Computed relationship state
Computed **after** disclosure filtering, from visible attributed claims only (P7):

| Visible attributed claims | Computed state |
| --- | --- |
| none, and `openQuestion` | `unknown` (no claimant shown) |
| ≥ 1, all `recorded` | `recorded` |
| ≥ 1, at least one `attested`, none conflicting | `attested` |
| only `interpretation` or `inferred` claims | `inferred` |
| ≥ 2 that conflict, where the conflict is recorded by a `noted-disagreement` act | `contested` |
| anything else, or none without `openQuestion` | **not projected** (the relationship is withheld whole) |

Conflict is never inferred from text. It is recorded as an attributed act, which decides nothing between the accounts. A disagreement whose second account is not visible is not shown as contested; under the table above it is not shown at all.

### 4.4 Demonstration closure
A relationship is valid only when its class equals both endpoints' class and every claim's class (P10). Sharing a demonstration's example metadata (a place label, a language) creates **no** relationship between records of any class.

## 5. Permissions and disclosure (normative)

### 5.1 Use permissions
Uses are the eight categories in `ethos.txt` §3.3 (`collection`, `preservation`, `publication`, `research`, `derivatives`, `model-training`, `synthetic-reproduction`, `commercial-use`), as in the existing `Purpose` type. A grant is scoped by:
- **purpose**: one of the eight;
- **audience**: `public` | `staff` | `research-partner` *(existing)*;
- **channel** (new): `explorer` | `api` | `export` | `embed`. `ethos.txt` §3.3 "named channels".

Effective permission for a derivative is the intersection of its own grants and its source's.

### 5.2 Record-level disclosure
Unchanged from `evaluatePermission`: quarantined, deleted, deletion-pending, withdrawn, purpose-restricted, unpublished-for-public, missing or disputed authority, disputed rights, and an unverified signer **all deny**. A record that is published still discloses only the fields in its `fieldDisclosure` for that audience.

### 5.3 Claim-level disclosure

```ts
type ClaimDisclosureGrant = {
  grantId: string;
  claimId: string;
  grantedBy: { capacity: string; verified: boolean };   // must be the claim's applicable authority (§9 Q1)
  audience: AudienceScope[];
  scopes: {
    existence: boolean;     // that the claim exists
    association: boolean;   // that it bears on a named relationship (type and endpoints)
    content: boolean;       // its position and claimant
  };
  relationshipIds: string[];      // association is per relationship, never blanket
  expiresAt: string | null;
  revokedAt: string | null;
};
```

Rules:
- **Default deny.** No grant means the claim is omitted without a trace.
- `content` requires `association`, which requires `existence`. Each must be granted explicitly; none implies another.
- A claim whose anchor record is public and whose fields are disclosed is **attributed**. A restricted claim with `existence` and `association` for this relationship and audience is **withheld**: it is shown only as "an account exists, from a restricted source" with an opaque id. Anything else is **omitted**.
- A withheld claim never contributes to a relationship's computed state, never contributes a count beyond its own existence, and never appears on an open question (P7).
- A record's public restricted-access notice authorizes nothing about the record's claims.
- Grants live in the restricted store. Their ids, grantors, and references never appear in a projection.

### 5.4 Projection contract
Every visitor-facing response is built by projection, with these properties (all demonstrated in the prototype):
1. **Allow-list.** Built field by field from authorized fields; a new internal field is withheld until projected deliberately.
2. **Per-request, same snapshot.** Evaluated against current state at request time, with the evidence reads first and the authoritative register read last, and with every masking and selection decision taken from that one snapshot (existing `evaluatePermissionSnapshot` pattern).
3. **Fail closed.** Any unreadable evidence, missing register entry, or unresolved state denies. A partial result says it is partial (existing `hadFailures`).
4. **Indistinguishable absence.** An undiscoverable record, claim, or relationship and a nonexistent one produce identical responses, status codes, and timing class.
5. **No counts of the withheld.** Totals cover only what is shown.
6. **Orphan pruning.** A source or context entity appears only while a visible relationship touches it.
7. **Whole-or-nothing relationships.** A relationship whose visible claims do not support a state under §4.3 is withheld whole.

### 5.5 Control register extensions
The register stays the single authoritative serve or deny answer (P11). It is extended with:
- `restrictedClaimIds` and `restrictedRelationshipIds`: hard overrides, checked last;
- `revokedDisclosureGrantIds`, with the same survive-restore purpose as `revokedConsentIds`;
- a `controlVersion` per record that also covers its claims and relationships, so a cached projection can be invalidated by version.

## 6. Change propagation (normative)

When consent, authority, or disclosure changes, every dependent view converges **within the adopted windows** of `ethos.txt` §12 (proposed: protective hold within 24 hours; cessation within 7 days of verified withdrawal).

| Event | Required effects |
| --- | --- |
| Record withdrawn or restricted | Its claims stop being attributed. Relationships recompute (§4.3); any that no longer qualify are withheld whole. Derivatives lose the affected uses. Chains through it become `incomplete` without naming it (§4.2). |
| Consent grant revoked | Register `revokedConsentIds` first; then as above for the affected purposes, audiences, and channels. |
| Disclosure grant revoked or expired | Register `revokedDisclosureGrantIds`; the claim drops from withheld to omitted everywhere. |
| Authority becomes disputed | The record denies (existing rule); its claims and relationships follow. |
| Claim corrected or superseded | A new claim version; the old one is kept as `superseded`, attributed (§7). Computed states update. |
| Source requests removal of attribution | `publicAttribution` cleared; the source becomes unnamed, while its relationships remain if otherwise authorized. |

Propagation covers the explorer, API responses, exports, embeds, search indexes, prefetch and RSC caches, CDN, and partner copies (with notice, `CustodyCopy` *(existing)*). A cached projection is valid only for the `controlVersion` it was built from. **No stale-while-revalidate** for any visitor-facing view of entrusted material (`ethos.txt` §14).

## 7. Version history (normative)

- Records, claims, relationships, and grants are versioned and append-only within retention.
- Corrections are attributed new versions; the prior value is kept (existing `Correction`). A dispute about a correction is recorded without reverting it.
- `superseded` and `withdrawn` claims remain in history for authorized staff and preservation export. They are never shown publicly unless separately authorized.
- **History is not exempt from withdrawal.** Deletion removes the affected versions from active stores and schedules backup expiry (`ethos.txt` §12). A public changelog is optional and redacted, and is omitted where disclosure itself would harm.
- Each version records who changed it (capacity) and why. Sensitive reasons stay in the restricted store.

## 8. Mapping to the current repository

| Contract concept | `ethos.txt` §4 | Backend today | Living Trace prototype | Gap |
| --- | --- | --- | --- | --- |
| Record | `Memory` | `FixtureRecord` | `InternalRecord` | `evidenceClass`, `sourceIds`, `derivedFrom`, `fieldDisclosure` |
| Source | `Person` (capacities) | capacity summaries only | graph `origin` node | first-class entity |
| Claim | (none) | `AuthorityClaim` / `LegalRight` are claims about authority and rights | `InternalAccount` | general claim model |
| Relationship | `Node` links, `related[]` | (none) | `InternalGraphEdge` | everything |
| Derivative | `Translation` / `Derivative` | (none) | `der-t` node + `p-a-t` link | entity and permission intersection |
| Context entity | `Node` | (none) | place, language, event nodes | entity and precision |
| Use permission | `Consent` | `ConsentGrant`, `Purpose` | uses table (display) | `channel` |
| Claim disclosure | (none) | (none) | `ClaimDisclosureGrant` | store and grantor rules |
| Register | (n/a) | `RestrictionRegisterEntry` | (static) | claim and relationship overrides |
| Projection | §9 "every read must enforce" | `publicView.ts` | `projection.ts` | relationship projection |
| History | "all writes are versioned" | `version`, `Correction`, `Redaction` | (none) | claim and relationship versions |

## 9. Open questions for review

These are decisions, not engineering details. Each blocks the part of the contract named.

1. **Who may grant claim disclosure (§5.3)?** The record's source authority, the claimant, the signer, or all applicable parties? What happens with collective authority, or when they disagree?
2. **Subjects (§3.4).** When a claim concerns a person who is neither its source nor a signer, whose authorization is required to disclose its existence or association?
3. **Recording a disagreement (§4.3).** Who may record `noted-disagreement`: any curator, a dual-control review, or only with the sources' knowledge? Does recording it publicly need either source's consent?
4. **Public interpretation (§3.4).** May TIRO publish its own `interpretation` claims about a published record without the source's authorization? This proposal assumes **no**: interpretation is a derivative use.
5. **Machine-assisted claims (P12).** May any model output be stored as an `inferred` claim at all before a model and vendor review exists (`ethos.txt` §3.4, §15)? This proposal assumes **not in v1**.
6. **Chain disclosure (§4.2).** Should an `incomplete` chain ever say why, for example "a source withheld this step", where that source authorized existence disclosure?
7. **Attribution removal (§6).** If a source asks to be unnamed but not withdrawn, do relationships that identify them indirectly (for example, a unique place-and-event combination) need restriction too?
8. **History visibility (§7).** Is any version history public by default, or staff-only until a policy is adopted?
9. **Context precision (§3.7).** Who sets a place's public precision, and may a community require "withheld" for a place itself, independent of any record?

## 10. Conformance tests (for any future implementation)

A conforming implementation passes all of these against synthetic fixtures before touching entrusted material. Several already exist in the prototype (`projection.test.ts`) or the backend (`permissions.test.ts`, `publicView.test.ts`) and should be ported, not rewritten.

1. An undiscoverable record, claim, and relationship are each indistinguishable from nonexistent ones in body, status, headers, and ordering.
2. No projection contains any planted canary field (internal, restricted, or grant metadata), including in serialized props, generated pages, exports, and search documents.
3. A restricted claim with no grant, `existence` only, or `association` only is omitted; with both it is withheld, with an opaque id.
4. A relationship contested only via a withheld claim is not projected; one attested only via a withheld claim is not projected; an open question with any claim attached is not projected.
5. Two source claims that share a source are reported as not independent.
6. Provenance never extends through a non-source-link relationship.
7. A demonstration object cannot be related to an evidenced object (write rejected), and shared example metadata produces no relationship.
8. Revoking a consent grant or disclosure grant, then restoring an older backup of the claim and grant stores, does not restore visibility (register survives restore).
9. Withdrawing a record removes its claims' attribution and recomputes every dependent relationship before the next projection. A cached projection with an older `controlVersion` is not served.
10. A derivative is never available for a purpose, audience, or channel its source is not.
11. A correction keeps the prior value, attributed; a dispute about it does not revert it.
12. No count, total, or "N hidden" text appears anywhere for withheld material.

## 11. What this proposal does not do

- It does not adopt anything, appoint anyone, or change any policy.
- It does not change the backend, the API, the infrastructure, or the public site.
- It does not establish readiness to receive entrusted material. That remains governed by the readiness gates (`ethos.txt` §6.1) and the backend's own live-drill evidence, which is kept separate (`decisions.md`, decision 11).
- It does not define the explorer's design. Memory Project Experience 1.0 builds on this contract, prototyped with synthetic data only.
