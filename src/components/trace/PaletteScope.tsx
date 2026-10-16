"use client";

import { useState } from "react";

// Lets a reviewer compare the CURRENT brand palette with the Living Trace
// brief's CANDIDATE palette over the same proof content. Scoped to its
// own subtree (data-palette on a wrapper), so the rest of the site never
// changes. Adoption is a founder decision; see docs/design/living-trace.md.
export default function PaletteScope({ children }: { children: React.ReactNode }) {
  const [candidate, setCandidate] = useState(false);
  return (
    <div data-palette={candidate ? "living-trace" : undefined}>
      <div className="sticky top-[57px] z-30 border-b border-[var(--tiro-border)] bg-[var(--tiro-bg)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-[var(--lt-gutter)] py-3 md:px-6">
          <p className="lt-label">
            Palette: <span className="text-[var(--tiro-text)]">{candidate ? "Candidate (not adopted)" : "Current brand"}</span>
          </p>
          <div role="group" aria-label="Palette" className="flex">
            <button
              type="button"
              aria-pressed={!candidate}
              onClick={() => setCandidate(false)}
              className="border border-[var(--tiro-border-strong)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.1em] aria-pressed:bg-[var(--tiro-text)] aria-pressed:text-[var(--tiro-bg)]"
            >
              Current
            </button>
            <button
              type="button"
              aria-pressed={candidate}
              onClick={() => setCandidate(true)}
              className="-ml-px border border-[var(--tiro-border-strong)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.1em] aria-pressed:bg-[var(--tiro-text)] aria-pressed:text-[var(--tiro-bg)]"
            >
              Candidate
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
