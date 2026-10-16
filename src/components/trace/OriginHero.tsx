import Link from "next/link";
import TiroMark from "@/components/TiroMark";
import { SPINE_COLUMNS } from "./Movement";

// Proof A — The Origin.
//
// The approved mark, unaltered and at monumental scale, is the first thing
// a visitor meets, annotated with its own three parts: "Origin.
// Transmission. Resonance." (Manifesto v0.2, IV). Its resonance line does
// not stop at the mark's edge: it narrows into the page's spine, and every
// movement below begins on it. The mark is never animated; only the
// annotations arrive and the trace emerges from it. With motion off the
// composition is identical, already drawn.
//
// Geometry: the mark is placed so its resonance line (x=47 of its 90-unit
// viewBox) sits exactly on the spine (--lt-spine-dx). All positions are
// derived from --lt-mark-w in mark units, so the composition recomposes
// at each breakpoint instead of shrinking.
export type MovementLink = { id: string; index: string; name: string };

// y positions in mark units (viewBox 90 x 202).
const PARTS = [
  { key: "origin", label: "Origin", y: 20, edge: 53, delay: 150 },
  { key: "transmission", label: "Transmission", y: 87, edge: 63, delay: 450 },
  { key: "resonance", label: "Resonance", y: 158, edge: 49, delay: 750 },
] as const;

const unit = (u: number) => `calc(var(--lt-mark-w) * ${u} / 90)`;

export default function OriginHero({ movements }: { movements: MovementLink[] }) {
  return (
    <section id="encounter" aria-labelledby="encounter-title" className="lt-hero relative overflow-hidden lg:min-h-[100svh]">
      <div className={`mx-auto grid w-full max-w-6xl px-[var(--lt-gutter)] md:px-6 ${SPINE_COLUMNS}`}>
        <div aria-hidden="true" className="relative">
          {/* The mark: resonance line on the spine. */}
          <div
            className="absolute"
            style={{ top: "var(--lt-mark-top)", left: `calc(50% + var(--lt-spine-dx) - ${unit(47)})`, width: "var(--lt-mark-w)" }}
          >
            <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
          </div>

          {/* The resonance line, continued: it narrows from the mark's own
              stroke width to the 1px trace, then runs on as the spine. */}
          <span
            className="lt-hero-taper lt-grow-down absolute"
            style={{ top: `calc(var(--lt-mark-top) + ${unit(181)})`, "--lt-delay": "900ms" } as React.CSSProperties}
          />
          <span
            className="lt-spine lt-grow-down"
            style={{ top: `calc(var(--lt-mark-top) + ${unit(181)} + 3rem)`, "--lt-delay": "1500ms" } as React.CSSProperties}
          />

          {/* Annotations: the mark's three parts, named in its own words. */}
          {PARTS.map((part) => (
            <span
              key={part.key}
              className="lt-hero-annotation lt-fade-in absolute flex items-center"
              style={
                {
                  top: `calc(var(--lt-mark-top) + ${unit(part.y)})`,
                  left: `calc(50% + var(--lt-spine-dx) + ${unit(part.edge - 47)} + 6px)`,
                  "--lt-delay": `${part.delay}ms`,
                } as React.CSSProperties
              }
            >
              <span
                className="lt-hero-leader block h-px bg-[var(--tiro-mineral-line)]"
                style={{ width: `calc(var(--lt-annotation-x) - ${unit(part.edge - 47)})` }}
              />
              <span className="lt-label whitespace-nowrap pl-2.5 text-[var(--tiro-text-soft)]">{part.label}</span>
            </span>
          ))}
          <span
            className="lt-hero-citation lt-fade-in absolute whitespace-nowrap font-[family-name:var(--font-display)] text-sm italic text-[var(--tiro-text-muted)]"
            style={
              {
                top: `calc(var(--lt-mark-top) + ${unit(158)} + 1.4rem)`,
                left: `calc(50% + var(--lt-spine-dx) + var(--lt-annotation-x) + 6px + 0.625rem)`,
                "--lt-delay": "1050ms",
              } as React.CSSProperties
            }
          >
            Manifesto v0.2, IV
          </span>
        </div>

        <div className="lt-hero-text min-w-0 pb-24 pl-3 md:pb-28 md:pl-6">
          <p className="sr-only">
            The TIRO mark: origin, transmission, resonance (Manifesto v0.2, IV). Its resonance line continues down the page as the
            spine of the movements below.
          </p>
          {/* Breaks before "Node Zero" on narrow screens in every font, so the
              line count, and the headline below it, never shift when the
              label face swaps in. */}
          <p className="lt-label mb-8 text-[var(--tiro-accent)]">
            <span className="whitespace-nowrap">
              00 <span aria-hidden="true">/</span> The Tiro Foundation
            </span>{" "}
            <span aria-hidden="true" className="hidden sm:inline">
              ·{" "}
            </span>
            <span className="block whitespace-nowrap sm:inline">Node Zero</span>
          </p>

          <h1 id="encounter-title" className="lt-display max-w-[17ch] text-[2.6rem] sm:text-6xl lg:text-[4.75rem] xl:text-[5.25rem]">
            There is enlightenment in exploration, <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
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
            <ol className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:gap-x-8">
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
