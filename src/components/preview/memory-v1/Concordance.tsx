"use client";

import Link from "next/link";
import { useState } from "react";
import { EVIDENCE } from "@/lib/livingTrace/evidence";
import type { GraphEdge } from "@/lib/livingTrace/graph";
import { EvidenceStroke } from "@/components/trace/EvidenceTag";

// A concordance: one record's relationships to other accounts, places,
// events, translations, and readings, each drawn with its evidence line
// and named in words. A row opens to show who claims the relationship and,
// separately, who recorded it. Accounts held in a restricted source appear
// only as "acknowledged", when (and only when) the projection allows it.
//
// Receives already-projected relations; it can show nothing the projection
// did not send.
export type ConcordanceRow = { edge: GraphEdge; otherLabel: string; otherHref: string | null; outgoing: boolean };

function claims(edge: GraphEdge) {
  const claimants = [...new Set(edge.accounts.flatMap((a) => (a.state === "attributed" ? [`${a.assertedBy}: “${a.position}”`] : [])))];
  const withheld = edge.accounts.filter((a) => a.state === "withheld").length;
  return { claimants, withheld };
}

export default function Concordance({ rows, idPrefix }: { rows: ConcordanceRow[]; idPrefix: string }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="mv1-concordance">
      {rows.map(({ edge, otherLabel, otherHref, outgoing }) => {
        const isOpen = open === edge.id;
        const { claimants, withheld } = claims(edge);
        const panel = `${idPrefix}-${edge.id}`;
        return (
          <li key={edge.id}>
            <button type="button" className="mv1-concordance-row" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : edge.id)}>
              <span className="pt-1.5">
                <EvidenceStroke evidence={edge.evidence} width={28} />
              </span>
              <span className="min-w-0">
                <span className="block text-[var(--tiro-text)]">
                  {edge.relation} <span className="text-[var(--tiro-text-muted)]">{outgoing ? "→" : "←"}</span>
                  <span className="sr-only">{outgoing ? " to " : " from "}</span> {otherLabel}
                </span>
                <span className="mt-0.5 block font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.12em] text-[var(--tiro-text-muted)]">
                  {EVIDENCE[edge.evidence].label}
                  {withheld > 0 ? " · includes a withheld account" : ""}
                </span>
              </span>
              <span aria-hidden="true" className="mv1-concordance-toggle">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            <div id={panel} hidden={!isOpen} className="mv1-concordance-panel">
              <p>{edge.summary}</p>
              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">{EVIDENCE[edge.evidence].meaning}</p>
              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="mv1-dt">Claimed by</dt>
                  <dd>{claimants.length > 0 ? claimants.join("; ") : "No one. It is recorded as an open question."}</dd>
                </div>
                {withheld > 0 ? (
                  <div>
                    <dt className="mv1-dt">Withheld</dt>
                    <dd>
                      {withheld} further account{withheld === 1 ? "" : "s"} from a restricted source, acknowledged only. Its position, claimant, and
                      source are not sent to this page.
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="mv1-dt">Recorded by</dt>
                  <dd>{edge.recordedBy}</dd>
                </div>
              </dl>
              {otherHref ? (
                <Link href={otherHref} className="mv1-more mt-3">
                  Open {otherLabel}
                  <span aria-hidden="true"> →</span>
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
