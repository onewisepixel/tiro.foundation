# Review packet 2 — Archivist / records specialist

Responsibility: provenance, archival description, source independence, corrections, retention, version history.
Read first: contract §4.5–4.8 (claims, relationships, derivatives, type vocabulary), §5 (provenance), §6 (characterization), §10 (history), §11 cases B, E, F and "consistency observations".
Respond using the format in [`README.md`](README.md).

## Issues for your answer

### RI-6 (High) — Source-distinct is not verified independence
**The contract today (§5.3).** Two source claims are independent when their chains reach disjoint sets of recorded testimony origins.

**The concern.** Disjoint recorded origins show different provenance. They do not prove independent testimony: two narrators may both repeat one unrecorded upstream account (a shared elder, a broadcast, a book).

**Proposed for your judgment.** Replace the boolean with three states:

| State | Meaning | Who may assert it |
| --- | --- | --- |
| `same-source` | Chains share a recorded origin | Computed |
| `source-distinct` | Chains reach disjoint recorded origins; **no claim about independence** | Computed (the default) |
| `independence-assessed` | A named archivist recorded an assessment of independence, with its basis and stated uncertainty | Curatorial claim, attributed and reviewable |

**We ask:**
1. Are these the right states? Should `independence-assessed` itself carry degrees ("likely", "unknown")?
2. How should a shared **unrecorded** upstream source be recorded when it is suspected but not documented?
3. Should the public interface ever say "independent", or only "from different recorded sources"?

### RI-5 (High) — Characterization pins claim versions
**The contract today (§6.1).** A characterization lists its supporting claim ids.

**Proposed.** It pins `claimId@version`. A new version of any pinned claim suspends the characterization until it is re-reviewed, matching §7.3's version-specific authorization.

**We ask:**
1. Is suspension the right behavior, or should minor corrections (for example, punctuation in a transcript) carry the characterization forward under a documented rule?
2. Who may re-confirm a characterization: the original curator, any curator, or a reviewer?

### RI-3 (Critical) — contribution requested
From an archival-description standpoint: when a place association is withheld for safety (packet 1), how should the archival description of an **independent** record represent that withholding internally, without disclosing it publicly?

## Founder position for you to confirm or challenge

### Position 29 — Explicit, curator-reviewed references
A field that names a place, person, language, or sensitive event carries structured references to those entities, with text spans where appropriate. A change to the entity's disclosure re-evaluates dependent fields without model inference. Unreviewed unstructured content is never assumed free of identifying information: it is reviewed before publication, or suppressed when safety cannot otherwise be established.

**We ask:**
1. Is this workable at the scale of an oral-history pilot (hours of transcript per record)?
2. Which existing descriptive standards or authority-control practices should the reference model follow?
3. What is the minimum review needed before a transcript may be published?

## Contract questions assigned to you (§14)

- The relationship type vocabulary (§4.8): are the types right, and are their end roles and provenance semantics right?
- Q9: Retention periods for authorizations, interests, and superseded versions (with legal).
- Q10: How field mentions are identified without automated inference (see position 29).

## Acceptance scenarios

| # | Scenario | Intended outcome (contract 0.2) | Question for you |
| --- | --- | --- | --- |
| A-1 | Two translations of one original are each linked to a place. | One testimony origin; not two sources; `same-source`. | Correct? |
| A-2 | A transcript correction changes one word in a claim that supports a published `contested` relationship. | The content authorization for the old version no longer applies; the claim falls to omitted; the characterization is suspended pending re-review. | Too strict for minor corrections? |
| A-3 | A `derived-from` relationship is stored with its ends reversed by mistake. | Traversal uses declared end roles, so the chain is unchanged; the error is detectable because the "derivative" end lacks `derivedFrom`. | Is role-based traversal enough, or should invalid orientation be rejected at write? |
| A-4 | A chain step is unavailable to the visitor. | "Provenance incomplete" with no reason (decision 17). | Does archival practice need more for researchers? |
| A-5 | A record is deleted at the source's request. | Active versions removed; backups expire on schedule; a tombstone only if it reveals nothing; no public history. | What minimal tombstone, if any, is archivally necessary? |
| A-6 | Two narrators with no shared recorded origin both tell a story learned from the same radio broadcast (unrecorded). | Contract 0.2 would call them independent. Under the RI-6 proposal: `source-distinct`, with an archivist's assessment recording the suspected shared upstream source. | Is that the right representation? |
