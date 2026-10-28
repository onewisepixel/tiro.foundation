"use client";

import Link from "next/link";
import { useState } from "react";
import { USE_CATEGORIES, USE_GRANT_LABEL, type EvidenceState, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";
import EvidenceTag from "@/components/trace/EvidenceTag";
import OriginPoint from "@/components/trace/OriginPoint";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// Witness → Preserve: one synthetic specimen as a catalogue card.
//
// The front reads as a single line of provenance, top to bottom: the human
// source first and largest (with the fixture's own note on how a real
// person is identified), then who holds authority, then context, then the
// conditions of stewardship in one line. It is complete without turning.
// The back itemizes each use. Every value is the projected fixture's; no
// testimony, person, or consent is invented.
export type CardData = {
  recordId: string;
  href: string;
  title: string;
  source: string;
  sourceNote: string;
  authority: { value: string; evidence: EvidenceState };
  language: { value: string; evidence: EvidenceState };
  uses: Record<UseCategory, UseGrant>;
  aiProcessing: string;
  withdrawal: string;
};

function summarize(uses: Record<UseCategory, UseGrant>) {
  const counts = new Map<UseGrant, number>();
  for (const grant of Object.values(uses)) {
    counts.set(grant, (counts.get(grant) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([grant, n]) => `${n} ${USE_GRANT_LABEL[grant].toLowerCase()}`)
    .join(" · ");
}

function Step({ label, origin = false, children }: { label: string; origin?: boolean; children: React.ReactNode }) {
  return (
    <div className="hv4-step">
      <dt className="lt-label">
        <span className="hv4-step-dot" aria-hidden="true">
          {origin ? <OriginPoint size={17} tone="accent" /> : <span />}
        </span>
        {label}
      </dt>
      <dd className="mt-1 min-w-0">{children}</dd>
    </div>
  );
}

export default function CatalogueCard({ card }: { card: CardData }) {
  const [turned, setTurned] = useState(false);

  return (
    <div>
      <div className="hv4-card-stage">
        <div id="hv4-card-turn" className="hv4-card-turn" data-turned={turned}>
          <article data-face="front" className="hv4-card-face tiro-register-paper hv4-card" aria-labelledby="hv4-card-title" inert={turned}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{card.recordId}</span>
              <SyntheticPill />
            </header>
            <div className="hv4-card-rule" aria-hidden="true" />
            <h3 id="hv4-card-title" className="lt-display text-2xl leading-tight md:text-[1.7rem]">
              {card.title}
            </h3>

            <dl className="hv4-spine mt-4">
              <Step label="Source" origin>
                <span className="block font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--tiro-text)]">{card.source}</span>
                <span className="mt-1 block font-[family-name:var(--font-display)] text-[0.95rem] italic leading-relaxed text-[var(--tiro-text-soft)]">
                  {card.sourceNote}
                </span>
              </Step>
              <Step label="Authority">
                <span className="text-sm text-[var(--tiro-text-soft)]">{card.authority.value}</span> <EvidenceTag evidence={card.authority.evidence} />
              </Step>
              <Step label="Language">
                <span className="text-sm text-[var(--tiro-text-soft)]">{card.language.value}</span> <EvidenceTag evidence={card.language.evidence} />
              </Step>
              <Step label="Conditions">
                <span className="text-sm text-[var(--tiro-text-soft)]">{summarize(card.uses)}</span>
              </Step>
            </dl>
            <span className="hv4-card-hole" aria-hidden="true" />
          </article>

          <article data-face="back" className="hv4-card-face tiro-register-paper hv4-card" aria-labelledby="hv4-card-back-title" inert={!turned}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{card.recordId} · conditions</span>
              <SyntheticPill />
            </header>
            <div className="hv4-card-rule" aria-hidden="true" />
            <h3 id="hv4-card-back-title" className="lt-display text-2xl leading-tight md:text-[1.7rem]">
              What may be done with it
            </h3>
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {USE_CATEGORIES.map((use) => (
                <li key={use.key} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--tiro-border)] py-1.5 text-xs">
                  <span className="text-[var(--tiro-text-muted)]">{use.label}</span>
                  <span className="shrink-0 font-[family-name:var(--font-code)] text-[var(--tiro-text)]">{USE_GRANT_LABEL[card.uses[use.key]]}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-2 text-xs leading-relaxed">
              <div>
                <dt className="lt-label inline !text-[10px]">Withdrawal</dt> <dd className="inline text-[var(--tiro-text-muted)]">{card.withdrawal}</dd>
              </div>
              <div>
                <dt className="lt-label inline !text-[10px]">Model processing</dt> <dd className="inline text-[var(--tiro-text-muted)]">{card.aiProcessing}</dd>
              </div>
            </dl>
            <span className="hv4-card-hole" aria-hidden="true" />
          </article>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <button type="button" className="tiro-button !px-4 !py-2 !text-[11px]" aria-controls="hv4-card-turn" onClick={() => setTurned((t) => !t)}>
          {turned ? "Turn back to the source" : "Turn the card: each use"}
        </button>
        <Link href={card.href} className="tiro-link text-sm">
          Open the full specimen
        </Link>
      </div>
    </div>
  );
}
