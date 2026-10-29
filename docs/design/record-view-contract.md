# Record-view contract (proposed standard)

Status: **Proposed standard for public Memory Project records.** The two-view pattern is approved by the founder (2026-10-28); this contract is a draft for review.
Revision date: 2026-10-28.
Owner: TIRO founder / Steward.
Authority: Defers to `/community-rights` and `docs/ethos.txt` (§3.2–3.3, §6.1, §12). The disclosure rules restate `src/lib/livingTrace/projection.ts` and `docs/design/decisions.md`; where they differ, the code's tests and the decisions log govern.
Reference implementation: `/preview/memory-v1/records/[id]` (`src/app/preview/memory-v1/records/[id]/page.tsx`).

## The principle

> **Every record must be complete as information before it becomes an experience.**

- Structured information is authoritative.
- Visualizations are navigational and explanatory.
- Both read the same underlying record.
- Neither reveals anything the visitor is not entitled to see.

## 1. One record, two views

| | Structured record | Layer map |
| --- | --- | --- |
| Role | Authoritative content | Navigation and explanation |
| Must contain | Every permitted field, as text | Nothing the structured record lacks |
| Accessibility | Headings, landmarks, definition lists, evidence in words | `aria-hidden` drawing, beside a list of real in-page links |
| Without JavaScript | Complete | May be absent |
| Without the visualization | Complete | n/a |

The structured record is the main column. The map sits beside it on wide screens and becomes a sticky bar of the same links on narrow ones. Choosing a layer moves to its section and focuses its heading; reading a section marks its layer current. The map never owns state the record does not.

## 2. Required sections, in order

The order puts provenance and permission before consumption (`docs/memory.txt` §2).

1. **Header.** The demonstration notice, when synthetic, before any claim-like detail (ethos §6.1). Then record ID, title, summary, publication status, custody status, and version.
2. **Account.** What was shared: media (never autoplayed; honest absence when there is none), transcript, translations beside the source, context fields with evidence states.
3. **Source.** Who shared it, identified as they choose.
4. **Authority.** Each capacity as its own field: collector, contributor, subject, source authority, legal rights holder, signer. The model never assumes two capacities belong to one party. Where they do, that is evidenced. Identities a visitor is not entitled to see (a signer's, a subject's) are replaced by a capacity-level description before the page receives them. A collective's means of exercising authority is described in principle; the mandate itself is never published.
5. **Terms of care.** Publication and custody as independent states. Each of the eight uses (ethos §3.3) has its own grant, never a blanket permission. Where the record carries authorization detail, each use publishes a **safe consent summary**: whether it is in effect, whose authority it rests on (by capacity), how that authority was exercised ("in their own right" or "through an authorized representative, under a verified mandate"), who recorded it, the basis, the scope, and its review. Withdrawal terms.
6. **Provenance.** The record's own history, every event attributed, with uncertainty shown as uncertainty.
7. **Derived (kept apart).** Translations, interpretations, and relationships to other records. Each keeps its own attribution and evidence state. An interpretation is never presented as the account. TIRO's readings are labeled as TIRO's. Accounts held in restricted sources appear only as "acknowledged", and only when the claim's own grant allows it.
8. **Citation.** In the current TIRO Citation Standard (`docs/design/citation-standard-v0.1.md`).

### Authority, decision, execution, mandate, validity

The record model keeps five things apart (founder clarification, `decisions.md`, 2026-10-28):

| | Question | In the model | Public |
| --- | --- | --- | --- |
| 1 | Who **possesses** the authority a use requires? | the interest holders the use requires | yes, by capacity (identity only where public) |
| 2 | Who **made or authorized** the decision? | the holder whose authority is exercised | yes, by capacity |
| 3 | Who **executed** and who **recorded** it? | the holder in their own right, or a signer; the recording steward | how it was executed (own right / representative); who recorded it (by role). Never the signer's identity. |
| 4 | What **mandate** permitted the execution? | a mandate naming signer, represented holder, record, uses, and period | never (restricted, ethos §3.3; contract 0.2 §7.3) |
| 5 | Was the mandate **valid** for that holder, record, use, and date? | evaluated, not asserted | only its consequence: whether the use is in effect |

A signer possesses no authority of their own by being a signer. An authorized signer may execute a holder's decision within a valid mandate. A signature outside the mandate has no effect and leaves no public trace. A use is in effect only when every required holder has an effective decision; otherwise it **fails closed** and is never shown as permission. This clarifies how collective authority is exercised; it broadens no one's authority.

## 3. Evidence states

Every field that makes a claim shows its evidence state in words and line pattern, never colour alone: recorded, attested, inferred, contested, unknown (`src/lib/livingTrace/evidence.ts`). "Not granted", "unknown", "disputed", and "withdrawn" are each shown as themselves, never as permission.

## 4. Disclosure states

| State | What renders | What must not exist |
| --- | --- | --- |
| **Public** | The allowlisted fields, and the safe consent summary | Internal notes, contact records, consent-receipt references, mandates (identity, terms, documents), signer and subject identities, attempts without effect, unauthorized fields |
| **Restricted, with notice** | The authorized notice and its reference, a single sealed sheet, a generic page title, and a reference-only citation | Title, summary, people, places, dates, media, relationships, layers, or any count of withheld fields |
| **Undiscoverable** | Nothing: the same 404 as an ID that never existed | A route, listing entry, count, graph node, relationship, or "hidden item" marker |

These states are enforced in the data a page receives (the projection), not drawn over it. Pages are generated only for discoverable IDs, with `dynamicParams = false`.

## 5. Interaction requirements

- Keyboard: every control is reachable and operable. Tablists and radio groups use arrow keys. Moving to a layer moves focus to its heading.
- Touch targets are at least 44 px.
- Reduced motion: nothing animates, and nothing is hidden waiting for an animation.
- Server and client render identical markup. Date-dependent text (such as an access date) is filled in by the browser.
- No horizontal page overflow at 320 px and wider.
- Anchors: each layer has a stable fragment (`#layer-account` … `#layer-derived`) so researchers can link to a section.

## 6. AI-assisted features (forward-looking)

Any future AI-assisted output (summary, translation, transcription, linkage) is a **derived** item. It sits in the Derived layer, is attributed to the system and the human who reviewed it, carries an evidence state no stronger than "inferred" until a human verifies it, and never acquires the authority of the source. It is permitted only where the record's terms allow that processing (ethos §3.3–3.4).

## 7. Verification

A record view conforms when three independent protections hold (approved 2026-10-28):

1. **Explicit public-field allowlists.** Each record projection declares exactly which fields may reach a page (`AUTHORITY_PUBLIC_FIELDS`; `SPECIMEN_PUBLIC_FIELDS` and `RESTRICTED_NOTICE_FIELDS` in `disclosureGuards.ts`), and tests report any field outside them, at any depth.
2. **Forbidden-field assertions.** Tests walk every public projection recursively for private keys and canary values (`disclosureGuards.test.ts`, `projection.test.ts`, `authorityProjection.test.ts`). The guards are themselves tested, so they cannot pass vacuously.
3. **Build-output scanning.** `npm run verify:disclosure` scans client bundles and prerendered HTML and RSC payloads for canaries, serialized private keys, and identifiers prohibited on specific pages.

And when a browser check confirms the record is readable as text with the visualization hidden, focus moves with the map, and restricted and undiscoverable records behave as in §4.
