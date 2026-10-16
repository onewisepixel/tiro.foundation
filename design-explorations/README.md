# Design explorations: archive

Status: **Archived and superseded.** Kept as design history; do not reuse their copy or claims.
Decision: archive with superseded banners (`docs/design/decisions.md`, 2026-10-16, decision 4).

The static HTML studies in `archive/` predate the accepted Manifesto v0.2 (2026-10-02), the demonstration-labeling rules in `docs/ethos.txt` §6.0–6.1, and The Living Trace (`docs/design/living-trace.md`). The site does not serve them.

Each file now opens with a conspicuous, non-dismissible banner listing its false or proposed-only statements. Everything below the banner is the original markup, byte-for-byte apart from line endings (11 lines added per file; none removed).

| File | Statement | Conflict |
| --- | --- | --- |
| `archive/explore-thread.html` | "The Memory Project — pilot record … not a demo. It's a single, properly consented record"; `TIR-MEM-0001`, "STATUS Verified", "CONSENT Explicit" | That record was a demonstration with no consent or verification (`docs/memory.txt`; `docs/ethos.txt` §6.0). It was retired in Living Trace 0.2.1. |
| `archive/explore-thread.html`, `archive/index.html` | "The Steward protects the constitution. The Board governs the charity." Steward-Protector sequence stated as fact | Governance is proposed, not adopted (`docs/501c3.txt` §6 Stage 5). No board exists. |
| `archive/index.html` | "PILOT CORPUS: Igbo language & oral history" | The Igbo pilot is a *proposed* first bounded collection (Manifesto v0.2 §II). |
| `archive/index.html` | "Nothing enters the archive without documented provenance"; conditions travel "permanently" | No archive intake exists. "Permanently" conflicts with withdrawal and deletion rights (`/community-rights`; `docs/ethos.txt` §12). |
