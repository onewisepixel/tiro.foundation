# Milestone 3.0, Phase 3b: completion report

Status: **every page in Phase 3b's scope is released** (plan §8 Phase 3b: restyle the inner pages, `/memories` and `/pilot`, one PR per study). **Accepted as complete by the founder, 2026-11-02 (decision 57).**
Owner: TIRO founder / Steward.
Evidence: `milestone-3.0-phase-3b-inner-pages.md` (one section per study, each with its verification, approval and production record) and `decisions.md` (decisions 50–56; acceptance, decision 57).

Completing Phase 3b resolves none of the outstanding items in §3: each stays open until it is resolved on its own terms. Nothing in this report authorizes Phase 4, enabling live records, or Phase 5 cleanup (§4).

## 1. Released pages

| Page | What it became | Decision | PR | Merge commit | Released | Production verification |
| --- | --- | --- | --- | --- | --- | --- |
| `/manifesto` | The long-form reference page | 50 | #17 | `3c997d4` | 2026-10-30 | Deployed and reviewed by the founder at release (decision 50); **no separate production-verification record was written at the time**. It has been covered since by every production run of the release suite (axe and console in both themes, desktop and mobile; overflow) and by the parity captures of `/manifesto`, most recently on 2026-11-02 (§2) |
| `/pilot`, P3B-1 (overflow fix, before the redesign) | The address breaks only before its "@" at 320 px | — (a defect fix) | #18 | `512bebe` | 2026-10-30 | **Verified** (`milestone-3.0-phase-3b-inner-pages.md` §3, P3B-1) |
| `/community-rights` | The policy page, with clause anchors | 51 | #19 | `acf6372` | 2026-10-30 | **Verified** (§1b.3): 171 of 171 |
| `/about` | A finding aid | 52 | #20 | `d9cfb00` | 2026-10-30 | **Verified** (§1c.3): 181 of 181 |
| `/nodes`, `/nodes/lagos`, `/nodes/nigerian-pidgin` | A gazetteer; the ring solid only for a collection record | 53 | #21 | `02e61b0` | 2026-10-30 | **Verified** (§1d.3): 201 of 201 |
| `/contact` | The entrance | 54 | #22 | `e3e07e4` | 2026-11-01 | **Verified** (§1e.3): 211 of 211 |
| `/pilot` | An invitation whose limits are established before participation (presentation only; the form stays closed) | 55 | #23 | `37c2b11` | 2026-11-01 | **Verified** (§1f.3): 213 of 213; captures byte-identical to those approved |
| `/memories`, `/memories/[id]` | An archival register, separate from the Memory Project demonstration (restyle only; live records stay disabled) | 56 | #24 | `b8781c3` | 2026-11-02 | **Verified** (§1g.3): 241 of 241; captures byte-identical to those approved |

Release-suite counts are the number of checks run against production at each release; the suite grew with each page (160 checks before the first study, 241 now).

**Phase 3b's scope is otherwise unchanged:** the homepage, the Memory Project and its records (decision 49), `/living-trace` and Flight Deck were not touched by any Phase 3b PR, and every study's parity run found their captures identical (apart from known `/living-trace` capture-timing noise).

## 2. The state of production after Phase 3b

Checked on 2026-11-02, after PR #24's deployment (`b8781c3`):

- **Release suite:** 241 of 241 checks pass against `https://www.tiro.foundation`. They cover every page listed in §1 plus the homepage, the Memory Project and its records: axe (no serious or critical violations) and console errors in light and dark at 1440 and 390 px, horizontal overflow at 320, 390 and 820 px, navigation and header tab order, the anchors and headings of each restyled page, the `/nodes` rings, the `/contact` address, the closed `/pilot` form, the `/memories` notices and its not-enabled state, `noindex` on synthetic records, and the redirects from the previews.
- **The two most recent releases:** `/pilot` and `/memories` captures in both themes, desktop and mobile, are byte-identical to those approved (`milestone-3.0-phase-3b-inner-pages.md` §1f.3, §1g.3).
- **Disclosure boundary:** every public Flight Deck route checked returns 404; the disclosure verifier passes in CI on `b8781c3`.
- **Live records:** not enabled; `/memories` says so, and restricted and unknown records return 404.
- **The public form:** closed; `/pilot` shows "Form not yet open" and has no form.

### 2.1 Limitations of this verification

- **Chrome only:** the automated visual and accessibility checks (captures, axe, overflow, keyboard) ran in Chrome; no other browser engine was tested.
- **No screen-reader session:** headings, landmarks and focus were checked by automation and keyboard, not with a screen reader.
- **Synthetic fixtures for live records:** the live-record states, which production cannot show, were rendered against a local mock with synthetic records, not the real backend.
- **Mailbox not verified:** the operational readiness of `custodians@tiro.foundation` is unverified (P3B-6).

## 3. Outstanding items, not resolved by completing Phase 3b

| ID | Item | Kind | Owner of the next step | Source |
| --- | --- | --- | --- | --- |
| **P3B-5** | On phones, the local bar (`/manifesto`, `/memory-project`) scrolls sideways without an obvious cue that more parts follow | Design observation; not blocking | Revisit if touch-device testing shows confusion | Decision 50 |
| **P3B-6** | **Mailbox operational readiness**: verify the delivery, ownership and monitoring of `custodians@tiro.foundation`, a procedure for rights-related requests, and that `/pilot`'s statement "every inquiry is read by a person" holds | Operational; **before TIRO accepts real records** | Founder / Steward | Decisions 54 and 55 |
| **P3B-7** | **Live-record notice precedence**: on a live record page the notice follows the title and summary; determine and enforce the required order | **Pre-activation requirement** for live records | A separate change, before enabling | Decision 56 |
| **P3B-8** | **Service-failure HTTP semantics**: a live-service failure on `/memories/[id]` is served with HTTP 200; resolve it while keeping unavailable, restricted and nonexistent records distinct | **Pre-activation requirement** for live records | A separate change, before enabling | Decision 56 |
| — | `trace/Movement` has no importer since `/pilot` moved (with `OriginHero`, which imports only its constant) | Phase 5 removal candidate | Phase 5, under G5 | Decision 55; plan §5 |
| — | The future of `/living-trace` (keep temporarily; retire only once its functionality and disclosure checks are accounted for) | Decision pending | Founder | Plan §2 and founder decision 3 |

Resolved within Phase 3b, for the record: **P3B-1** (the `/pilot` overflow), **P3B-2** (section labels that were not headings, fixed page by page), **P3B-3** (hard-coded header offsets) and **P3B-4** (`/memories` in the old visual language).

## 4. What is not authorized

- **Phase 4** (Flight Deck) has not begun and needs its own review and authorization.
- **Live records stay disabled** (decision 44). Enabling them is a separate founder decision, and P3B-7 and P3B-8 must be resolved first.
- **Phase 5** (removals, redirects, branch deletion) needs each deletion list approved under G5. Nothing has been removed.
- No hosting or Vercel settings were changed in Phase 3b, and no branch was deleted.
