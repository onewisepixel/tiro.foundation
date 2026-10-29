# TIRO Citation Standard v0.1

Status: **Provisional draft.** Not adopted. To be revisited when the record and provenance model is finalized.
Revision date: 2026-10-28.
Owner: TIRO founder / Steward.
Authority: Defers to `/community-rights` and `docs/ethos.txt` (§3.2–3.3 capacities and consent; §12 lifecycle). Where they speak, they govern.
Implementation: `src/lib/livingTrace/citation.ts` (tested in `citation.test.ts`); shown on `/preview/memory-v1/records/[id]`.

## Why TIRO needs its own standard

A conventional citation names an author and a publisher. Applied to TIRO, that pattern makes the custodian look like the author or the owner. TIRO holds records; it does not author them, and it holds no cultural authority over them. The citation has to say that every time.

## Fields

| Field | Required | Rule |
| --- | --- | --- |
| **Source attribution** | Yes, or an explicit statement of its absence | Credit the source exactly as the source and rights authority have authorized. Without an authorized attribution, write "Source not credited, as authorized." Never substitute TIRO, a collector, or a contributor who is not the authorized credit. |
| **Record title** | Where publication of the title is permitted | Otherwise write "Title not published." |
| **Record identifier** | Yes | The stable record ID, e.g. `DEMO-MP-0001`. |
| **Record version** | Yes | The version cited. A record the model does not yet version is cited as "unversioned", and the gap is reported. |
| **Custodian** | Yes | "The Memory Project; held by the Tiro Foundation (custodian)". Always after the work, never in the author position. |
| **Persistent URL** | Yes, once issued | TIRO does not issue persistent record URLs yet. Until it does, write "Persistent URL not yet issued." Never cite a preview or internal URL as persistent. |
| **Access date** | Yes | The date the reader consulted the record (ISO `YYYY-MM-DD`), from the reader's own clock. |
| **Demonstration marker** | For any synthetic record | "Synthetic demonstration; not archival evidence." |

## Formats

**A record**

> {Source attribution}. "{Title}." {Record ID}, version {n}. The Memory Project; held by the Tiro Foundation (custodian). {Persistent URL}. Accessed {YYYY-MM-DD}.

Example (fictional scenario):

> Synthetic contributor P-01, with the authority of Synthetic collective A-01. "An account given by one person, recorded by another, and governed by a third." DEMO-MP-0001, version 1. The Memory Project; held by the Tiro Foundation (custodian). Persistent URL not yet issued. Accessed 2026-10-28. Synthetic demonstration; not archival evidence.

**A translation.** It is its own work, credited to its translator, and points back to the record it translates.

> {Translator}, translator. "{Title}." Translation of {Record ID}, version {n}, from an account attributed to {Source attribution}. The Memory Project; held by the Tiro Foundation (custodian). {Persistent URL}. Accessed {date}.

**An interpretation.** It is its own work, credited to its interpreter (including TIRO's own curators), and it always states that it is not a source account.

> {Interpreter}, interpreter. "{Title}." Interpretation of {Record ID}, version {n}, from an account attributed to {Source attribution}. An interpretation, not a source account. The Memory Project; held by the Tiro Foundation (custodian). …

**A restricted record.** It is cited by its reference alone. A citation never discloses what the record's notice does not.

> Restricted record {Reference}. The Memory Project; held by the Tiro Foundation (custodian). No further details are published. Accessed {date}.

**An undiscoverable record cannot be cited.** It has no public reference.

## Rules

1. The citation is generated from the same projection the reader is entitled to see. It never carries a field the page does not show.
2. The custodian is never in the author position. Tested: no citation begins with "Tiro" or "The Tiro".
3. Gaps are stated, never faked. Missing version, URL, or attribution produce plain words in the citation and a warning beside it.
4. Derived works (translations, interpretations, AI-assisted outputs) are cited as their own works, with their own attribution, and never inherit the source's authority. This applies to any future AI-assisted feature: its output is an interpretation.
5. Withdrawal changes what may be cited. After publication is withdrawn, the record's persistent URL should resolve to a safe notice, not the content (to be specified with the lifecycle in `docs/ethos.txt` §12).

## Open questions before adoption

- **Versioning.** What constitutes a new version: any field change, or only changes to the account and its terms? Do corrections to provenance create versions?
- **Persistent identifiers.** Should TIRO mint its own resolvable identifiers or use an external scheme (for example ARK or DOI)? Either way, it must be able to resolve a withdrawn record to a notice.
- **Attribution variants.** Some sources may authorize different credit for different audiences or languages. Should the citation follow the reader's channel?
- **Collective authority.** How should shared or disputed authority be credited when the authorities do not agree on attribution?
- **Machine-readable form.** Is a structured export (for example CSL-JSON) needed alongside the human-readable text?
