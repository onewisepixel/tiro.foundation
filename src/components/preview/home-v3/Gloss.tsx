"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

// The gloss: each section's own provenance, set in the margin the way an
// archivist annotates a document. It names the movements the section
// carries and the accepted document its statements come from, so the page
// practises what it asks of every record. "Consulted" is the reader's own
// date, like a reading-room slip; it is filled in by the browser and is
// absent without JavaScript.
export type GlossEntry = { term: string; value: string; href?: string };

const noop = () => () => {};
const today = () => new Date().toISOString().slice(0, 10);

function Consulted() {
  const date = useSyncExternalStore(noop, today, () => "");
  if (!date) {
    return null;
  }
  return (
    <div>
      <dt>Consulted</dt>
      <dd>{date}</dd>
    </div>
  );
}

export default function Gloss({ mark, entries, consulted = false }: { mark: string; entries: GlossEntry[]; consulted?: boolean }) {
  return (
    <aside aria-label={`Provenance: ${mark}`}>
      <dl className="hv3-gloss">
        <div>
          <dt>Section</dt>
          <dd className="!text-[var(--tiro-accent)]">{mark}</dd>
        </div>
        {entries.map((e) => (
          <div key={e.term + e.value}>
            <dt>{e.term}</dt>
            <dd>{e.href ? <Link href={e.href}>{e.value}</Link> : e.value}</dd>
          </div>
        ))}
        {consulted ? <Consulted /> : null}
      </dl>
    </aside>
  );
}
