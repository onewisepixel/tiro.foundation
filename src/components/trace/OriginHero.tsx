import Link from "next/link";
import TiroMark from "@/components/TiroMark";
import { SPINE_COLUMNS } from "./Movement";

// Proof A — The Origin.
//
// The approved mark, unaltered, is the origin: "Origin. Transmission.
// Resonance." (Manifesto v0.2, IV). Its resonance line does not stop at
// the mark's edge; it continues as the page's spine, and every movement
// below begins on it. The statement is TIRO's founding premise, not a new
// slogan. With motion off the composition is identical, only already
// drawn.
export type MovementLink = { id: string; index: string; name: string };

export default function OriginHero({ movements }: { movements: MovementLink[] }) {
  return (
    <section id="encounter" aria-labelledby="encounter-title" className="relative overflow-hidden">
      <div className={`mx-auto grid w-full max-w-6xl px-[var(--lt-gutter)] md:px-6 ${SPINE_COLUMNS}`}>
        <div aria-hidden="true" className="relative">
          <div className="absolute left-1/2 top-[7.25rem] w-7 -translate-x-1/2 md:top-[9.5rem] md:w-[4.5rem]">
            <TiroMark variant="primary" className="h-auto w-full text-[var(--tiro-mark)]" />
          </div>
          {/* The resonance line, continued. Starts where the mark's ends
              (y=182 of 202 in the mark's viewBox; x=47 of 90). */}
          <span
            className="lt-spine lt-grow-down top-[calc(7.25rem+56px)] md:top-[calc(9.5rem+145px)]"
            style={{ "--lt-delay": "300ms" } as React.CSSProperties}
          />
        </div>

        <div className="min-w-0 pb-24 pl-3 pt-28 md:pb-32 md:pl-6 md:pt-40">
          <p className="lt-label lt-fade-in mb-8 text-[var(--tiro-accent)]">
            00 <span aria-hidden="true">/</span> The Tiro Foundation <span aria-hidden="true">·</span> Node Zero
          </p>

          <h1 id="encounter-title" className="lt-display max-w-[15ch] md:max-w-[19ch] text-[2.6rem] sm:text-6xl md:text-[5.25rem]">
            There is enlightenment in exploration,{" "}
            <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
          </h1>

          <p className="mt-10 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            TIRO is a permanent, neutral custodian of endangered cultural and linguistic memory, building custodial systems
            for memory, consent, and human continuity in an age of accelerating intelligence.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-5">
            <Link href="/memory-project" className="tiro-button">
              Explore the Memory Project
            </Link>
            <Link href="/manifesto" className="tiro-link text-sm">
              Read Manifesto v0.2
            </Link>
          </div>

          <nav aria-label="On this page" className="mt-16 border-t border-[var(--tiro-border)] pt-5 md:mt-20">
            <p className="lt-label mb-3">On this page</p>
            <ol className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-8">
              {movements.map((m) => (
                <li key={m.id}>
                  <a href={`#${m.id}`} className="group inline-flex items-baseline gap-2 py-1 text-sm text-[var(--tiro-text-muted)] hover:text-[var(--tiro-text)]">
                    <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">{m.index}</span>
                    <span className="underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-[var(--tiro-accent)]">
                      {m.name}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}
