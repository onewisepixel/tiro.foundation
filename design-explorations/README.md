# Design explorations: status

Status: **Superseded. Retain for history; do not reuse copy or claims.** Reviewed 2026-10-16 during Living Trace 0.2.

These static HTML studies predate the accepted Manifesto v0.2 (2026-10-02), the demonstration-labeling rules in `docs/ethos.txt` §6.0–6.1, and The Living Trace (`docs/design/living-trace.md`). They are not served by the site. They contain statements that now contradict governing documents, so they should not be reused as copy sources or shown as current direction.

| File | Statement | Conflict | Recommendation |
| --- | --- | --- | --- |
| `explore-thread.html` (≈ line 216–226) | "The Memory Project — pilot record … The first proof of the archive is not a demo. It's a single, properly consented record"; record `TIR-MEM-0001`, "STATUS Verified", "CONSENT Explicit" | That record is a demonstration with no real consent or verification (`docs/memory.txt`; `docs/ethos.txt` §6.0). Presenting it as consented testimony is the specific failure the labeling rules exist to prevent. | **Correct or deprecate.** If kept for history, add a banner stating that the record shown is a demonstration and the claims are void. |
| `explore-thread.html` (≈ line 272–278), `index.html` (≈ line 332–338) | "The Steward protects the constitution. The Board governs the charity." Steward-Protector role and override sequence stated as fact | Governance is proposed, not adopted (`docs/501c3.txt` §6 Stage 5; Manifesto v0.2 status note). No board exists yet. | Deprecate, or reword as "proposed" if reused. |
| `index.html` (≈ line 277) | "PILOT CORPUS: Igbo language & oral history" | The Igbo pilot is a *proposed* first bounded collection (Manifesto v0.2 §II). The label reads as an existing corpus. | Reword as "Proposed first collection" if reused. |
| `index.html` (≈ line 293), `explore-thread.html` | "Nothing enters the archive without documented provenance"; conditions travel with material "permanently" | Stated as present practice, but there is no archive intake yet. "Permanently" conflicts with withdrawal and deletion rights (`/community-rights`; `docs/ethos.txt` §12). | Do not reuse. Current wording lives at `/community-rights`. |

Deletion is not recommended without founder approval: the files document how the identity developed. The smallest safe step is a visible "superseded" banner in each file, which has **not** been added, so the files stay byte-identical pending your decision.
