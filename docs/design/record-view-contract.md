# Record-view contract (proposed standard)

Status: **Proposed standard for public Memory Project records.** The two-view pattern is approved by the founder (2026-10-30); this contract is a draft for review.
Revision date: 2026-10-30.
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
4. **Authority.** Each capacity as its own field: collector, contributor, subject, source authority, legal rights holder, signer. The model never assumes two capacities belong to one party. Where they do, that is evidenced. A signer's mandate states whom they represent, for what, and for how long; the mandate document itself is never published.
5. **Terms of care.** Publication and custody as independent states. Each of the eight uses (ethos §3.3) has its own grant, never a blanket permission. Where the record carries authorization detail, each use states who decided, on what basis, in what scope, and until when. Withdrawal terms.
6. **Provenance.** The record's own history, every event attributed, with uncertainty shown as uncertainty.
7. **Derived (kept apart).** Translations, interpretations, and relationships to other records. Each keeps its own attribution and evidence state. An interpretation is never presented as the account. TIRO's readings are labeled as TIRO's. Accounts held in restricted sources appear only as "acknowledged", and only when the claim's own grant allows it.
8. **Citation.** In the current TIRO Citation Standard (`docs/design/citation-standard-v0.1.md`).

## 3. Evidence states

Every field that makes a claim shows its evidence state in words and line pattern, never colour alone: recorded, attested, inferred, contested, unknown (`src/lib/livingTrace/evidence.ts`). "Not granted", "unknown", "disputed", and "withdrawn" are each shown as themselves, never as permission.

## 4. Disclosure states

| State | What renders | What must not exist |
| --- | --- | --- |
| **Public** | The authorized fields | Internal notes, contact records, consent-receipt references, mandate documents, unauthorized fields |
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

A record view conforms when:

- the projection tests prove no internal-only string or field reaches it (`projection.test.ts`, `authorityProjection.test.ts`);
- `npm run verify:disclosure` passes on the production build;
- a browser check confirms the record is readable as text with the visualization hidden, focus moves with the map, and restricted and undiscoverable records behave as in §4.
