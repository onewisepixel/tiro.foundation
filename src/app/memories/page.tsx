import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";

export const metadata: Metadata = {
  title: "Memory Records — The Tiro Foundation",
  description:
    "Early archival prototypes for preserving memory with provenance, consent, and cultural context.",
};

export default function MemoriesIndexPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32"
      style={{ fontFamily: "var(--font-geist-sans, sans-serif)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div className="ambient-orb" />
      </div>

      <section className="relative z-10 px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-5 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Memory Records
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Early archival prototypes for preserving memory with provenance,
            consent, and cultural context.
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-28 md:pb-36">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5">
          {memories.map((memory) => (
            <article
              key={memory.id}
              className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-6 backdrop-blur-sm md:p-7"
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
                <span>{memory.location}</span>
                <span>-</span>
                <span>{memory.era}</span>
                <span>-</span>
                <span>Media: {memory.media.type}</span>
              </div>

              <h2 className="text-2xl font-semibold tracking-tight text-[var(--tiro-text-soft)]">
                {memory.title}
              </h2>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                {memory.summary}
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {memory.tags.slice(0, 4).map((tag) => (
                  <span
                    key={`${memory.id}-${tag}`}
                    className="rounded-full border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-1 text-xs text-[var(--tiro-text-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                href={`/memories/${memory.id}`}
                className="mt-6 inline-block text-sm text-[var(--tiro-text-muted)] underline decoration-[var(--tiro-border)] underline-offset-4 transition-colors duration-300 hover:text-[var(--tiro-text-soft)]"
              >
                View record
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
