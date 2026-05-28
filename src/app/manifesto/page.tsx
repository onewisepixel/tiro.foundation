import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manifesto v0.1 — The Tiro Foundation",
  description:
    "An exploration into memory, systems, empathy, and human continuity.",
};

const pillars = [
  {
    label: "Memory",
    description: "Preserving knowledge, identity, and lived experience.",
  },
  {
    label: "Intelligence",
    description: "Building systems that augment human capability responsibly.",
  },
  {
    label: "Stewardship",
    description: "Creating structures that can safely outlive their creators.",
  },
];

export default function ManifestoPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#0b0c10] text-white"
      style={{ fontFamily: "var(--font-geist-sans, sans-serif)" }}
    >
      {/* Animated background orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div className="ambient-orb" />
      </div>

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 pb-14 pt-32 text-center md:pb-16 md:pt-44">
        <p
          className="mb-6 text-xs tracking-[0.3em] uppercase text-white/30"
          aria-label="Version"
        >
          Manifesto v0.1
        </p>

        <h1 className="mb-6 text-5xl font-semibold leading-tight tracking-tight text-white md:text-7xl">
          The Tiro Foundation
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
          An exploration into memory, systems, empathy, and human continuity.
        </p>

        {/* Thin divider */}
        <div className="mt-12 h-px w-16 bg-white/15" />
      </section>

      <section id="core-thesis" className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-white/30">
            Core Thesis
          </p>
          <p className="text-sm leading-[1.9] text-white/55 md:text-base">
            Exploration without empathy becomes extraction. Intelligence
            without memory becomes dangerous. Systems intended to shape the
            future must first understand the people, histories, and cultures
            they affect.
          </p>
        </div>
      </section>

      {/* ── Core Pillars ── */}
      <section id="core-pillars" className="relative z-10 px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-xs tracking-[0.3em] uppercase text-white/30">
            Core Pillars
          </h2>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {pillars.map(({ label, description }) => (
              <div
                key={label}
                className="group rounded-xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm
                           transition-all duration-500
                           hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_32px_rgba(120,100,255,0.07)]"
              >
                <h3 className="mb-3 text-lg font-semibold tracking-wide text-white/90 transition-colors duration-300 group-hover:text-white">
                  {label}
                </h3>
                <p className="text-sm leading-relaxed text-white/55 transition-colors duration-300 group-hover:text-white/70">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founding Statement ── */}
      <section id="founding-statement" className="relative z-10 px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-xl">
          <p className="mb-5 text-xs tracking-[0.3em] uppercase text-white/25">
            A Note on Origins
          </p>
          <p className="text-sm leading-[1.85] text-white/55 md:text-base">
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
