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
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Archive Index</p>
          <h1 className="mb-5 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            Memory Records
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Early archival prototypes for preserving memory with provenance,
            consent, and cultural context.
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {memories.map((memory) => (
            <article key={memory.id} className="tiro-card">
              <div className="tiro-kv border-t-0">
                <span className="k">{memory.recordId}</span>
                <span className="v">{memory.archiveStatus}</span>
              </div>
              <div className="tiro-kv">
                <span className="k">Location</span>
                <span className="v">{memory.location}</span>
              </div>
              <div className="tiro-kv">
                <span className="k">Era</span>
                <span className="v">{memory.era}</span>
              </div>
              <div className="tiro-kv">
                <span className="k">Media</span>
                <span className="v">{memory.media.type}</span>
              </div>

              <h2 className="mt-6 font-[family-name:var(--font-display)] text-2xl italic tracking-tight text-[var(--tiro-text-soft)]">
                {memory.title}
              </h2>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                {memory.summary}
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {memory.tags.slice(0, 4).map((tag) => (
                  <span key={`${memory.id}-${tag}`} className="tiro-chip">
                    {tag}
                  </span>
                ))}
              </div>

              <Link href={`/memories/${memory.id}`} className="tiro-link mt-6 inline-block text-sm">
                View record
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
