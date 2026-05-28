import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Memory Project — The Tiro Foundation",
  description:
    "Overview, ethics, consent stance, and submission guidelines for The Memory Project.",
};

const submissionGuidelines = [
  "Submit only material you have rights or permission to share.",
  "Include contextual metadata: place, date, language, and cultural significance.",
  "Record explicit consent from contributors and subjects before publication.",
  "Provide transcripts or notes where possible to preserve accessibility.",
  "Flag sensitive content clearly so curation can apply appropriate safeguards.",
];

export default function MemoryProjectPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#0b0c10] pt-28 text-white md:pt-32"
      style={{ fontFamily: "var(--font-geist-sans, sans-serif)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div className="ambient-orb" />
      </div>

      <section className="relative z-10 px-6 pb-14 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-white/30">
            Memory Project v0.1
          </p>
          <h1 className="mb-6 text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
            A Living Archive for Human Continuity
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-white/55 md:text-lg">
            The Memory Project is TIRO&apos;s long-horizon effort to preserve
            memory with provenance, consent, and cultural context. We are
            building systems where collection, curation, and discovery remain
            accountable to the people whose stories are held.
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-white/30">
            Ethics and Consent
          </p>
          <p className="text-sm leading-[1.9] text-white/55 md:text-base">
            Consent is explicit, traceable, and revocable. Every contribution
            must carry clear provenance and rights context. TIRO treats dignity,
            privacy, and stewardship as infrastructure requirements, not policy
            add-ons.
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-white/30">
            Submission Guidelines
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm md:p-9">
            <ul className="space-y-4 text-sm leading-relaxed text-white/55 md:text-base">
              {submissionGuidelines.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 border-t border-white/10 pt-6">
              <Link
                href="/manifesto"
                className="text-sm text-white/50 underline decoration-white/20 underline-offset-4 transition-colors duration-300 hover:text-white/75"
              >
                Read the Manifesto v0.1
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
