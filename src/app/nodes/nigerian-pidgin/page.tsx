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
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Node Profile
          </p>
          <h1 className="mb-3 text-4xl font-semibold tracking-tight md:text-6xl">
            Nigerian Pidgin
          </h1>
          <p className="mb-6 text-sm uppercase tracking-[0.24em] text-[var(--tiro-text-subtle)]">
            Language
          </p>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Nigerian Pidgin functions in these records as a bridge language for
            migration, labor, and market interaction. Preserving it in memory
            transcripts protects social nuance that formal translation can
            flatten.
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Memory Connections
          </p>
          <div className="space-y-4">
            {memoryConnections.map((memory) => (
              <Link
                key={memory.id}
                href={`/memories/${memory.id}`}
                className="block rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 transition-colors duration-200 hover:bg-[var(--tiro-surface-strong)]"
              >
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

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
              Themes
            </p>
            <div className="flex flex-wrap gap-2.5">
              {themes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-2 text-xs text-[var(--tiro-text-muted)]"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
              Related Nodes
            </p>
            <div className="flex flex-wrap gap-2.5">
              {relatedNodes.map((node) =>
                node.href ? (
                  <Link
                    key={node.label}
                    href={node.href}
                    className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-2 text-xs text-[var(--tiro-text-muted)] transition-colors duration-200 hover:bg-[var(--tiro-surface-strong)]"
                  >
                    {node.label}
                  </Link>
                ) : (
                  <span
                    key={node.label}
                    className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-2 text-xs text-[var(--tiro-text-muted)]"
                  >
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
