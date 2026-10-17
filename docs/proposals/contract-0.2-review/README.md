# Formal review packet — Memory Record & Relationship Contract 0.2

Prepared: 2026-10-16. Prepared for: the four formal reviewers of TIRO's proposed memory-record model.
Under review: [`../memory-record-relationship-contract.md`](../memory-record-relationship-contract.md) (0.2 Review Candidate). **This packet does not change the contract.** Reviewers' responses will be consolidated into Contract 0.3.
Decision record: [`../../design/decisions.md`](../../design/decisions.md) (decisions 1–29, review issues RI-1 to RI-7).

## What TIRO is asking

The Tiro Foundation proposes to act as custodian, never owner, of cultural and linguistic memory entrusted by individuals and communities. Its founding position is "Communities remain the principals. TIRO is the custodian." (`/community-rights`). Contract 0.2 proposes how records, the claims within them, and the relationships between them are stored, authorized, disclosed to different audiences, and withdrawn.

We ask each reviewer to tell us where the contract is wrong, incomplete, unworkable, or assumes authority it does not have. A response of "this cannot be decided by design" is useful and welcome.

## Current status

| Item | Status |
| --- | --- |
| Conceptual architecture | Accepted for formal review |
| Founder positions (decisions 12–29) | Recorded; **your review pending** |
| Contract consistency | Clarifications required (RI-1 to RI-7) |
| Institutional adoption | Not authorized |
| Production implementation | Deferred |

Nothing here is in operation. No entrusted material exists in any TIRO system. The working backend is synthetic-only by construction.

## Packets

| Packet | Reviewer | Primary issues |
| --- | --- | --- |
| [`1-stewardship-community.md`](1-stewardship-community.md) | Stewardship / community representatives | RI-3, RI-4; positions 27, 28 |
| [`2-archivist.md`](2-archivist.md) | Archivist / records specialist | RI-5 (characterization), RI-6; position 29 |
| [`3-engineering-security.md`](3-engineering-security.md) | Engineering / security | RI-1, RI-2, RI-5 (consistency), RI-7; 13 concurrency scenarios |
| [`4-legal.md`](4-legal.md) | Qualified legal counsel | RI-3, RI-4; positions 28, 29; lawful bases; transfers |

Every reviewer is welcome to comment on any issue. The assignments mark who we need an answer from.

## Review issue register

| ID | Priority | Contract section | Issue | Needs answer from |
| --- | --- | --- | --- | --- |
| RI-1 | Critical | §7.3 | Restricted-record gates: existence, association, and content need distinct gates, with no route around record restrictions. | Engineering; stewardship; legal |
| RI-2 | Critical | §7.3, §13 | Level ambiguity: must content require explicit authorization of all three levels? Nothing may be inferred. | Engineering; stewardship |
| RI-3 | Critical | §7.6, case F | One community's place restriction suppresses an independently sourced record (R9); this may contradict P14. Separate restrictions on TIRO-held associations from a reviewed **safety** restriction on a location. | Stewardship; legal; archivist |
| RI-4 | High | §7.1, cases B–E | Staff access: define a minimal, audited administrative-review basis. Staff status alone grants nothing. | Legal; stewardship; engineering |
| RI-5 | High | §6.1, §8 | Characterizations pin exact claim versions; does register-last give a consistent snapshot across separate stores? | Archivist; engineering |
| RI-6 | High | §5.3 | Source-distinct is not verified independence. Preserve uncertainty. | Archivist |
| RI-7 | High | §8 | Negative dependencies: decisions affected by objects that did not exist when cached. | Engineering |

## How to respond

For each issue, question, and scenario in your packet, please give:

```
ID:
Position:      accept | accept with changes | reject | cannot be decided by design
Rationale:
Required change to the contract (if any):
Blocking?      yes (must resolve before 0.3 is accepted) | no
Who else must be consulted:
```

Please also note any assumption in the contract that you believe presumes an authority, legal basis, or community practice that has not been established.

## What this packet cannot do

- **It is not community review.** Positions about community authority (decision 27) require consultation with the participating communities themselves. No document, and no AI-assisted drafting, substitutes for that.
- **It does not establish legal compliance** in any jurisdiction.
- **It does not establish operational readiness.** The backend's live-drill evidence is assessed separately (decision 11).
