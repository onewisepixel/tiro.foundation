"use client";

import Link from "next/link";
import { useState } from "react";
import { USE_CATEGORIES, USE_GRANT_LABEL, type EvidenceState, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";
import EvidenceTag from "@/components/trace/EvidenceTag";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// Witness → Preserve: one synthetic specimen as a catalogue card. The
// front says who the memory comes from; the back says what may be done
// with it. Turning the card is the only way to the back, so permissions
// arrive when asked for. The hidden face is inert, so keyboard and screen
// reader users meet exactly the face that is showing.
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
};

export default function CatalogueCard({ card }: { card: CardData }) {
  const [turned, setTurned] = useState(false);

  return (
    <div>
      <div className="hv3-card-stage">
        <div id="hv3-card-turn" className="hv3-card-turn" data-turned={turned}>
          <article data-face="front" className="hv3-card-face tiro-register-paper hv3-card" aria-labelledby="hv3-card-title" inert={turned}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{card.recordId} · front</span>
              <SyntheticPill />
            </header>
            <div className="hv3-card-rule" aria-hidden="true" />
            <h3 id="hv3-card-title" className="lt-display text-2xl leading-tight md:text-[1.7rem]">
              {card.title}
            </h3>
            <dl className="mt-4">
              <div className="hv3-field">
                <dt className="lt-label pt-0.5">Source</dt>
                <dd className="text-[var(--tiro-text-soft)]">
                  {card.source}
                  <span className="block text-xs leading-relaxed text-[var(--tiro-text-muted)]">{card.sourceNote}</span>
                </dd>
              </div>
              <div className="hv3-field">
                <dt className="lt-label pt-0.5">Authority</dt>
                <dd className="text-[var(--tiro-text-soft)]">
                  {card.authority.value} <EvidenceTag evidence={card.authority.evidence} />
                </dd>
              </div>
              <div className="hv3-field">
                <dt className="lt-label pt-0.5">Language</dt>
                <dd className="text-[var(--tiro-text-soft)]">
                  {card.language.value} <EvidenceTag evidence={card.language.evidence} />
                </dd>
              </div>
            </dl>
            <span className="hv3-card-hole" aria-hidden="true" />
          </article>

          <article data-face="back" className="hv3-card-face tiro-register-paper hv3-card" aria-labelledby="hv3-card-back-title" inert={!turned}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{card.recordId} · back</span>
              <SyntheticPill />
            </header>
            <div className="hv3-card-rule" aria-hidden="true" />
            <h3 id="hv3-card-back-title" className="lt-display text-2xl leading-tight md:text-[1.7rem]">
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
            <p className="mt-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
              <span className="lt-label !text-[10px]">Model processing</span> {card.aiProcessing}
            </p>
            <span className="hv3-card-hole" aria-hidden="true" />
          </article>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <button type="button" className="tiro-button !px-4 !py-2 !text-[11px]" aria-controls="hv3-card-turn" onClick={() => setTurned((t) => !t)}>
          {turned ? "Turn back to the source" : "Turn the card: what may be done with it?"}
        </button>
        <Link href={card.href} className="tiro-link text-sm">
          Open the full specimen
        </Link>
      </div>
    </div>
  );
}
