import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";
import { getConnectionsNotice } from "@/lib/recordKind";

export const metadata: Metadata = {
  title: "Nigerian Pidgin — Node — The Tiro Foundation",
  description:
    "Language node for Nigerian Pidgin. No collected records yet; connections shown are demonstration records using it as example metadata.",
};

const memoryConnections = memories.filter((memory) =>
  memory.relatedNodes.some(
    (node) => node.label.toLowerCase() === "nigerian pidgin",
  ),
);

// Themes and related nodes are relationships, and every visible
// relationship needs a type and a basis. None can be stated until
// collected records establish them, so these lists are honestly empty
// (Living Trace 0.2.1; the earlier lists were derived from invented
// demonstration stories).
const themes: string[] = [];
const relatedNodes: { label: string; href?: string }[] = [];
const NONE_RECORDED = "None recorded. These are established by collected records, and none exist yet.";

export default function NigerianPidginNodePage() {
  const connectionsNotice = getConnectionsNotice(memoryConnections);

  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Node Profile — Language</p>
          <h1 className="mb-6 font-[family-name:var(--font-display)] text-4xl italic tracking-tight md:text-6xl">
            Nigerian Pidgin
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            A language node. TIRO holds no collected records in Nigerian
            Pidgin. The connections below are demonstration records that use
            it as example metadata, to show how a language node will gather
            records. A real language node describes the language only as its
            speakers and records establish.
          </p>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Memory Connections</p>
          {connectionsNotice ? (
            <p className="mb-5 font-[family-name:var(--font-code)] text-[11px] uppercase leading-relaxed tracking-[0.08em] text-[var(--tiro-accent)]">
              {connectionsNotice}
            </p>
          ) : null}
          <div className="space-y-4">
            {memoryConnections.map((memory) => (
              <Link key={memory.id} href={`/memories/${memory.id}`} className="tiro-card-link border border-[var(--tiro-border)] p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-sm font-medium text-[var(--tiro-text-soft)] md:text-base">
                    {memory.title}
                  </p>
                  {memory.recordKind === "demo" ? (
                    <span className="tiro-chip">Demo</span>
                  ) : null}
                </div>
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
              {themes.length === 0 ? <p className="text-sm text-[var(--tiro-text-muted)]">{NONE_RECORDED}</p> : null}
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
              {relatedNodes.length === 0 ? <p className="text-sm text-[var(--tiro-text-muted)]">{NONE_RECORDED}</p> : null}
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
