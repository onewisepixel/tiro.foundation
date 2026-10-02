import type { Metadata } from "next";
import Link from "next/link";
import { memories, type MemoryRecord } from "@/data/memories";
import { getRecordKindNotice } from "@/data/recordNotices";

function getIndexCopy(records: MemoryRecord[]) {
  const total = records.length;
  const demoCount = records.filter((record) => record.recordKind === "demo").length;

  if (total === 0) {
    return {
      heading: "Memory Records",
      subtitle: "No memory records are published yet.",
      metaTitle: "Memory Records — The Tiro Foundation",
      metaDescription: "No memory records are published yet.",
    };
  }

  if (demoCount === total) {
    return {
      heading: "Memory Record Demonstrations",
      subtitle:
        "Illustrative records demonstrating archival structure. These examples are not collected testimony, verified records, or evidence of consent.",
      metaTitle: "Memory Record Demonstrations — The Tiro Foundation",
      metaDescription:
        "Illustrative records demonstrating archival structure. These examples are not collected testimony, verified records, or evidence of consent.",
    };
  }

  if (demoCount === 0) {
    return {
      heading: "Memory Records",
      subtitle:
        "Memory records preserved by TIRO, each with its own provenance, consent, and rights record.",
      metaTitle: "Memory Records — The Tiro Foundation",
      metaDescription:
        "Memory records preserved by TIRO, each with its own provenance, consent, and rights record.",
    };
  }

  return {
    heading: "Memory Records",
    subtitle:
      "This index includes demonstration records alongside TIRO-evidenced records. Each record states its status individually below.",
    metaTitle: "Memory Records — The Tiro Foundation",
    metaDescription:
      "This index includes demonstration records alongside TIRO-evidenced records. Each record states its status individually.",
  };
}

const indexCopy = getIndexCopy(memories);

export const metadata: Metadata = {
  title: indexCopy.metaTitle,
  description: indexCopy.metaDescription,
};

export default function MemoriesIndexPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Archive Index</p>
          <h1 className="mb-5 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            {indexCopy.heading}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            {indexCopy.subtitle}
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {memories.map((memory) => {
            const notice = getRecordKindNotice(memory.recordKind);

            return (
              <article key={memory.id} className="tiro-card">
                {notice ? (
                  <p className="mb-5 inline-block border border-[var(--tiro-accent)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--tiro-accent)]">
                    {notice.full}
                  </p>
                ) : null}

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
            );
          })}
        </div>
      </section>
    </main>
  );
}
