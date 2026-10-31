import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";
import { getConnectionsNotice } from "@/lib/recordKind";
import "@/components/archive/archive.css";
import "../nodes.css";

export const metadata: Metadata = {
  title: "Lagos — Node — The Tiro Foundation",
  description:
    "Place node for Lagos. No collected records yet; connections shown are demonstration records using Lagos as example metadata.",
};

const memoryConnections = memories.filter((memory) =>
  memory.relatedNodes.some((node) => node.label.toLowerCase() === "lagos"),
);

// Themes and related nodes are relationships, and every visible
// relationship needs a type and a basis. None can be stated until
// collected records establish them, so these lists are honestly empty
// (Living Trace 0.2.1; the earlier lists were derived from invented
// demonstration stories).
const themes: string[] = [];
const languages: { label: string; href?: string }[] = [];
const relatedNodes: { label: string }[] = [];
const NONE_RECORDED = "None recorded. These are established by collected records, and none exist yet.";

export default function LagosNodePage() {
  const connectionsNotice = getConnectionsNotice(memoryConnections);

  return (
    <main id="top" className="la nd bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame nd-wrap nd-head">
        <p className="la-eyebrow">Node Profile — Place</p>
        <h1 className="nd-h1 mt-6">Lagos</h1>
        <p className="nd-intro mt-8">
          A place node. TIRO holds no collected records about Lagos. The
          connections below are demonstration records that use Lagos as
          example metadata, to show how a place node will gather the
          records that refer to it. They say nothing about Lagos itself.
        </p>
      </header>

      <div className="la-frame nd-wrap nd-sections">
        <section id="memory-connections" aria-labelledby="memory-connections-title" className="nd-section">
          <h2 id="memory-connections-title" className="nd-h2">
            Memory Connections
          </h2>
          <div className="nd-body">
            {connectionsNotice ? <p className="nd-notice mb-6">{connectionsNotice}</p> : null}
            <ul className="nd-records">
              {memoryConnections.map((memory) => (
                <li key={memory.id}>
                  <Link href={`/memories/${memory.id}`}>
                    <span className="nd-record-title">
                      {memory.title}
                      {memory.recordKind === "demo" ? (
                        <span className="tiro-chip">Demo</span>
                      ) : null}
                    </span>
                    <span className="nd-record-summary block">{memory.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="themes" aria-labelledby="themes-title" className="nd-section" data-empty={themes.length === 0 ? "" : undefined}>
          <h2 id="themes-title" className="nd-h2">
            Themes
          </h2>
          <div className="nd-body flex flex-wrap gap-2.5">
            {themes.length === 0 ? (
              <p className="nd-none">
                <span className="nd-ring" aria-hidden="true" />
                {NONE_RECORDED}
              </p>
            ) : null}
            {themes.map((theme) => (
              <span key={theme} className="tiro-chip">
                {theme}
              </span>
            ))}
          </div>
        </section>

        <section id="languages" aria-labelledby="languages-title" className="nd-section" data-empty={languages.length === 0 ? "" : undefined}>
          <h2 id="languages-title" className="nd-h2">
            Languages
          </h2>
          <div className="nd-body flex flex-wrap gap-2.5">
            {languages.length === 0 ? (
              <p className="nd-none">
                <span className="nd-ring" aria-hidden="true" />
                {NONE_RECORDED}
              </p>
            ) : null}
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
        </section>

        <section id="related-nodes" aria-labelledby="related-nodes-title" className="nd-section" data-empty={relatedNodes.length === 0 ? "" : undefined}>
          <h2 id="related-nodes-title" className="nd-h2">
            Related Nodes
          </h2>
          <div className="nd-body flex flex-wrap gap-2.5">
            {relatedNodes.length === 0 ? (
              <p className="nd-none">
                <span className="nd-ring" aria-hidden="true" />
                {NONE_RECORDED}
              </p>
            ) : null}
            {relatedNodes.map((node) => (
              <span key={node.label} className="tiro-chip">
                {node.label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
