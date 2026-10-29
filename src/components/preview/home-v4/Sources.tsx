import Link from "next/link";

// A section's own provenance: which document each of its statements comes
// from, which part, and that document's actual status. In the margin on
// wide screens; after the section, as its footnote, on narrow ones.
//
// Statuses are quoted from the documents themselves, never upgraded:
//   Manifesto v0.2     "Accepted" 2026-10-02 as public expression only
//                      (docs/manifestov0-2.txt header)
//   Community Rights   published policy that "will be formalized as part of
//                      TIRO's constitutional documents" (/community-rights)
//   Fixtures           synthetic Living Trace demonstration records
// Neither public document has section anchors yet, so a citation names its
// section and links to the document.
export type Source = { title: string; href?: string; section?: string; status: string };

export const MANIFESTO_STATUS = "Accepted 2026-10-02 · public expression";
export const RIGHTS_STATUS = "Published policy · formal adoption pending";
export const FIXTURE_STATUS = "Synthetic fixture · not a record";

export default function Sources({ section, sources }: { section: string; sources: Source[] }) {
  return (
    <aside className="hv4-sources" aria-label={`Sources for section ${section}`}>
      <p className="hv4-sources-head" aria-hidden="true">
        Sources · {section}
      </p>
      <ol>
        {sources.map((s) => (
          <li key={s.title + (s.section ?? "")}>
            {s.href ? (
              <Link href={s.href} className="hv4-source-title">
                {s.title}
              </Link>
            ) : (
              <span className="hv4-source-title">{s.title}</span>
            )}
            {s.section ? <span className="hv4-source-meta">{s.section}</span> : null}
            <span className="hv4-source-status">{s.status}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
