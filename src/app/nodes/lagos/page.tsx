import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";

export const metadata: Metadata = {
  title: "Lagos — Node — The Tiro Foundation",
  description:
    "Node profile for Lagos, connecting related memory records, themes, and language context.",
};

const connectionIds = ["market-song-lagos", "lagos-port-harcourt-migration"];

const memoryConnections = connectionIds
  .map((id) => memories.find((memory) => memory.id === id))
  .filter((memory): memory is NonNullable<typeof memory> => Boolean(memory));

const themes = ["Trade", "Migration", "Urban Memory"];
const languages = [
  { label: "Yoruba" },
  { label: "Nigerian Pidgin", href: "/nodes/nigerian-pidgin" },
  { label: "English" },
];
const relatedNodes = [
  { label: "Port Harcourt" },
  { label: "Balogun Market" },
  { label: "Internal Migration" },
];

export default function LagosNodePage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Node Profile — Place</p>
          <h1 className="mb-6 font-[family-name:var(--font-display)] text-4xl italic tracking-tight md:text-6xl">
            Lagos
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Lagos is represented here as a living urban node where language,
            commerce, migration, and memory intersect. This profile links
            records that document movement into and out of Lagos, as well as
            performance and trade memory embedded in everyday life.
          </p>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Memory Connections</p>
          <div className="space-y-4">
            {memoryConnections.map((memory) => (
              <Link key={memory.id} href={`/memories/${memory.id}`} className="tiro-card-link border border-[var(--tiro-border)] p-4">
                <p className="text-sm font-medium text-[var(--tiro-text-soft)] md:text-base">
                  {memory.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  {memory.summary}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          <div className="tiro-card">
            <p className="tiro-eyebrow mb-5">Themes</p>
            <div className="flex flex-wrap gap-2.5">
              {themes.map((theme) => (
                <span key={theme} className="tiro-chip">
                  {theme}
                </span>
              ))}
            </div>
          </div>

          <div className="tiro-card">
            <p className="tiro-eyebrow mb-5">Languages</p>
            <div className="flex flex-wrap gap-2.5">
              {languages.map((language) =>
                language.href ? (
                  <Link key={language.label} href={language.href} className="tiro-chip">
                    {language.label}
                  </Link>
                ) : (
                  <span key={language.label} className="tiro-chip">
                    {language.label}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Related Nodes</p>
          <div className="flex flex-wrap gap-2.5">
            {relatedNodes.map((node) => (
              <span key={node.label} className="tiro-chip">
                {node.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
