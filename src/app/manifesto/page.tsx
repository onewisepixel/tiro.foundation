import type { Metadata } from "next";
import TiroMark from "@/components/TiroMark";

export const metadata: Metadata = {
  title: "Manifesto v0.1 — The Tiro Foundation",
  description:
    "An exploration into memory, systems, empathy, and human continuity.",
};

const pillars = [
  {
    label: "Memory",
    description:
      "Civilizations survive through memory — not only archives and records, but stories, identities, languages, rituals, and lived experience. We reject the idea that cultural memory should become disposable.",
  },
  {
    label: "Intelligence",
    description:
      "Intelligence is not inherently wisdom. TIRO supports the responsible exploration of advanced systems that augment human capability while preserving human dignity, agency, and context.",
  },
  {
    label: "Stewardship",
    description:
      "The measure of a system is not merely whether it functions, but whether it can safely endure. TIRO builds structures that can outlive individual creators while remaining aligned with human-centered principles.",
  },
];

export default function ManifestoPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-14 pt-8 text-center md:pb-16 md:pt-12">
        <TiroMark variant="primary" className="mx-auto mb-8 h-16 w-auto text-[var(--tiro-mark)] md:h-20" />

        <p className="tiro-eyebrow mb-6">Manifesto v0.1</p>

        <h1 className="mx-auto mb-6 max-w-3xl font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
          The Tiro Foundation
        </h1>

        <p className="mx-auto max-w-xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
          An exploration into memory, systems, empathy, and human continuity.
        </p>

        <hr className="tiro-rule mx-auto mt-12 w-16" />
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-5">Core Thesis</p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            Exploration without empathy becomes extraction. Intelligence
            without memory becomes dangerous. Systems intended to shape the
            future must first understand the people, histories, and cultures
            they affect.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-12 text-center">Core Pillars</p>

          <div className="grid grid-cols-1 gap-px border border-[var(--tiro-border)] bg-[var(--tiro-border)] md:grid-cols-3">
            {pillars.map(({ label, description }) => (
              <div key={label} className="bg-[var(--tiro-bg)] p-8">
                <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl italic text-[var(--tiro-accent)]">
                  {label}
                </h2>
                <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-6">Doctrine</p>
          <div className="border-t border-[var(--tiro-border)]">
            {[
              [
                "Custody is not ownership",
                "Recording something does not grant the right to reinterpret, monetize, or erase it.",
              ],
              [
                "Witness before interpreter",
                "Systems should point back to the human source rather than synthesizing themselves into an authority.",
              ],
              [
                "A node, not a center",
                "TIRO is one point of connection among many possible ones — a person, a village, a library.",
              ],
              [
                "Built for the long view",
                "Quiet, unglamorous preservation work is sufficient. It is not something to scale past.",
              ],
            ].map(([term, note]) => (
              <div
                key={term}
                className="grid grid-cols-1 gap-2 border-b border-[var(--tiro-border)] py-6 md:grid-cols-[minmax(180px,240px)_1fr] md:gap-8"
              >
                <h3 className="font-[family-name:var(--font-display)] text-base italic text-[var(--tiro-text-soft)]">
                  {term}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-xl">
          <p className="tiro-eyebrow mb-5">A Note on Origins</p>
          <p className="text-sm leading-[1.85] text-[var(--tiro-text-muted)] md:text-base">
            TIRO emerged from a belief that technological progress without
            cultural memory and human empathy becomes directionless. The
            Foundation exists to explore systems that preserve continuity
            between intelligence, identity, and meaning.
          </p>
        </div>
      </section>
    </main>
  );
}
