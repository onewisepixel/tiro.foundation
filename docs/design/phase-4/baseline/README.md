# Flight Deck: Phase 4 baseline (PR 4.1, decision 58)

The pre-redesign record of Flight Deck, taken on 2026-11-03 from the unchanged code at `bec57d2` against the local synthetic demo (`npm run dev:flight-deck`). Protected once merged: later Phase 4 PRs compare against it and may not change it. Record and limitations: `docs/design/milestone-3.0-phase-4-flight-deck.md` §5.

| File | What it is | Produced by |
| --- | --- | --- |
| `census.json` | What each role (anonymous, founder, operator, reviewer) is given on every console screen: status, landmarks, headings, live regions, forms with their server actions, fields, hidden and submit values, and links. Ids, dates and fingerprints are placeholders | `node scripts/test/flight-deck-census.mjs --out … --summary …` |
| `census-summary.md` | The census as tables: screens by role, and every control that differs between roles | Same |
| `screens/<screen>.<desktop\|mobile>.<dark\|light>.jpg` | Now, Approvals, Relationship (B-02), Activity, Health and the print view as the founder; one full-page capture each, never stitched | `node scripts/test/flight-deck-capture.mjs --out …` |
| `screens/approvals.desktop.dark.operator.jpg` | Approvals as the operator: the approval controls withheld | Same |
| `screens/status-vocabulary.desktop.<theme>.jpg` | Every status, stage and Health state in its Badge markup, rendered in the test browser from the definitions in source (not a Flight Deck screen) | Same |
| `screens/relationship-print.<theme>.pdf` | The relationship print view, printed to A4 with backgrounds off | Same |

All data is synthetic. Compare a later build with `node scripts/test/flight-deck-census.mjs --out <tmp> --compare docs/design/phase-4/baseline/census.json`.
