import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";

type NodeSeed = {
  label: string;
  type: "Place" | "Theme" | "Language";
  href?: string;
};

export const metadata: Metadata = {
  title: "Nodes — The Tiro Foundation",
  description:
    "Seed node index for places, themes, and languages connected to TIRO memory records.",
};

const nodeSeeds: NodeSeed[] = [
  { label: "Lagos", type: "Place", href: "/nodes/lagos" },
  { label: "Port Harcourt", type: "Place" },
  { label: "Balogun Market", type: "Place" },
  { label: "Internal Migration", type: "Theme" },
  { label: "Trade", type: "Theme" },
  { label: "Urban Memory", type: "Theme" },
  { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
  { label: "Yoruba", type: "Language" },
  { label: "English", type: "Language" },
];

function getLinkedMemories(label: string) {
  return memories.filter((memory) =>
    memory.relatedNodes.some(
      (node) => node.label.toLowerCase() === label.toLowerCase(),
    ),
  );
}

export default function NodesIndexPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Node Index v0.1</p>
          <h1 className="mb-5 font-[family-name:var(--font-display)] text-4xl italic tracking-tight md:text-6xl">
            Nodes
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Foundational graph entities connected to memory records. This index
            is the first architectural layer linking memory to place, language,
            and thematic context.
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          {nodeSeeds.map((seed) => {
            const linkedMemories = getLinkedMemories(seed.label);

            return (
              <article key={`${seed.type}-${seed.label}`} className="tiro-card">
                <div className="tiro-kv border-t-0">
                  <span className="k">{seed.type}</span>
                  <span className="v">{linkedMemories.length} Record{linkedMemories.length === 1 ? "" : "s"}</span>
                </div>

                <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl italic tracking-tight text-[var(--tiro-text-soft)]">
                  {seed.label}
                </h2>

                {linkedMemories.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm text-[var(--tiro-text-muted)]">
                    {linkedMemories.slice(0, 3).map((memory) => (
                      <li key={memory.id}>
                        <Link href={`/memories/${memory.id}`} className="tiro-link">
                          {memory.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {seed.href ? (
                  <Link href={seed.href} className="tiro-link mt-5 inline-block text-sm">
                    Open node profile
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
