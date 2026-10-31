import type { Metadata } from "next";
import Link from "next/link";
import { memories } from "@/data/memories";
import { countByDemo, formatRecordCountLabel, hasCollectionRecord } from "@/lib/recordKind";
import "@/components/archive/archive.css";
import "./nodes.css";

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

// Only the places and languages the demonstration records use as example
// metadata. Theme nodes (and "Balogun Market") were derived from invented
// demonstration stories and were removed with them in Living Trace 0.2.1;
// themes will come from collected records.
const nodeSeeds: NodeSeed[] = [
  { label: "Lagos", type: "Place", href: "/nodes/lagos" },
  { label: "Port Harcourt", type: "Place" },
  { label: "Enugu", type: "Place" },
  { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
  { label: "Yoruba", type: "Language" },
  { label: "Igbo", type: "Language" },
];

function getLinkedMemories(label: string) {
  return memories.filter((memory) =>
    memory.relatedNodes.some(
      (node) => node.label.toLowerCase() === label.toLowerCase(),
    ),
  );
}

function getPageNotice(): string | null {
  const { total, demo } = countByDemo(memories);

  if (total === 0 || demo === 0) {
    return null;
  }
  if (demo === total) {
    return "Record counts and linked memories below reference demonstration content — illustrative identities, provenance, and permissions; not collected archival testimony.";
  }
  return "Some record counts and linked memories below reference demonstration content; others reference other record categories. Demonstration links are labeled individually.";
}

// Each entry's anchor (/nodes#port-harcourt), so a seed can be cited
// before it has a profile.
function slug(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

// The directory, set as a gazetteer: one entry per seed, its kind in the
// margin and its record count at the right. The ring before the count is
// dashed until a collection record (not a demonstration or pilot record)
// refers to the node. It is computed from the static records in
// src/data/memories.ts, not the live Memory service, which is not enabled.
export default function NodesIndexPage() {
  const pageNotice = getPageNotice();

  return (
    <main id="top" className="la nd bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame nd-wrap nd-head">
        <p className="la-eyebrow">Node Index v0.1</p>
        <h1 className="nd-h1 mt-6">Nodes</h1>
        <p className="nd-intro mt-8">
          Foundational graph entities: places and languages that memory
          records will connect to. No collected records exist yet; the links
          below come from demonstration records using them as example
          metadata.
        </p>
        {pageNotice ? <p className="nd-notice mt-8">{pageNotice}</p> : null}
      </header>

      <div className="la-frame nd-wrap">
        <ul className="nd-index">
          {nodeSeeds.map((seed) => {
            const linkedMemories = getLinkedMemories(seed.label);
            const hasCollection = hasCollectionRecord(linkedMemories);

            return (
              <li
                key={`${seed.type}-${seed.label}`}
                id={slug(seed.label)}
                className="nd-entry"
                data-profile={seed.href ? "" : undefined}
              >
                <p className="la-term">{seed.type}</p>
                <p className="nd-standing">
                  <span className="nd-ring" data-has-collection={hasCollection} aria-hidden="true" />
                  {formatRecordCountLabel(linkedMemories)}
                </p>

                <div className="nd-entry-body">
                  <h2 className="nd-name">{seed.label}</h2>

                  {linkedMemories.length > 0 ? (
                    <ul className="nd-links">
                      {linkedMemories.slice(0, 3).map((memory) => (
                        <li key={memory.id}>
                          <Link href={`/memories/${memory.id}`}>{memory.title}</Link>
                          {memory.recordKind === "demo" ? (
                            <span className="tiro-chip">Demo</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {seed.href ? (
                    <Link href={seed.href} className="la-more mt-5">
                      Open node profile
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
