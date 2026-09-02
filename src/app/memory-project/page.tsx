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
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-14 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-6">Memory Project v0.1</p>
          <h1 className="mb-6 max-w-3xl font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            A Living Archive for Human Continuity
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            The Memory Project is TIRO&apos;s long-horizon effort to preserve
            memory with provenance, consent, and cultural context. We are
            building systems where collection, curation, and discovery remain
            accountable to the people whose stories are held.
          </p>

          <div className="mt-10 flex flex-wrap gap-6">
            <Link href="/memories" className="tiro-button">
              Browse Memory Records
            </Link>
            <Link href="/nodes" className="tiro-link self-center text-sm">
              Explore the Node Index
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-4">Ethics and Consent</p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            Consent is explicit, traceable, and revocable. Every contribution
            must carry clear provenance and rights context. TIRO treats dignity,
            privacy, and stewardship as infrastructure requirements, not policy
            add-ons.
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-6">Submission Guidelines</p>
          <div className="tiro-card">
            <ul className="space-y-4 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
              {submissionGuidelines.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tiro-accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap gap-6 border-t border-[var(--tiro-border)] pt-6">
              <Link href="/manifesto" className="tiro-link text-sm">
                Read the Manifesto v0.1
              </Link>
              <Link href="/memories/lagos-port-harcourt-migration" className="tiro-link text-sm">
                View Sample Memory
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
