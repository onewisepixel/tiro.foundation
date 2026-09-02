import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";

export const metadata: Metadata = {
  title: "Nigerian Pidgin — Node — The Tiro Foundation",
  description:
    "Node profile for Nigerian Pidgin, linking memory records, themes, and related entities.",
};

const memoryConnections = memories.filter((memory) =>
  memory.relatedNodes.some(
    (node) => node.label.toLowerCase() === "nigerian pidgin",
  ),
);

const themes = ["Urban Memory", "Migration", "Market Culture"];
const relatedNodes = [
  { label: "Lagos", href: "/nodes/lagos" },
  { label: "Internal Migration" },
  { label: "Informal Trade" },
];

export default function NigerianPidginNodePage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Node Profile — Language</p>
          <h1 className="mb-6 font-[family-name:var(--font-display)] text-4xl italic tracking-tight md:text-6xl">
            Nigerian Pidgin
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Nigerian Pidgin functions in these records as a bridge language for
            migration, labor, and market interaction. Preserving it in memory
            transcripts protects social nuance that formal translation can
            flatten.
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

      <section className="px-6 pb-28 md:pb-36">
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
            <p className="tiro-eyebrow mb-5">Related Nodes</p>
            <div className="flex flex-wrap gap-2.5">
              {relatedNodes.map((node) =>
                node.href ? (
                  <Link key={node.label} href={node.href} className="tiro-chip">
                    {node.label}
                  </Link>
                ) : (
                  <span key={node.label} className="tiro-chip">
                    {node.label}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
