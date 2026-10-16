import { EVIDENCE } from "@/lib/livingTrace/evidence";
import type { ProjectedGraph } from "@/lib/livingTrace/graph";
import { layoutGraph } from "@/lib/livingTrace/layout";
import { EvidenceStroke } from "./EvidenceTag";

// Server-rendered stand-in for the interactive constellation: the complete
// relationship list as plain text (so the page is whole without
// JavaScript) and a frame that reserves the drawing's exact space (so the
// swap shifts nothing). ConstellationIsland replaces it with the
// interactive version when Discover nears the viewport.
export default function ConstellationPreview({ graph }: { graph: ProjectedGraph }) {
  const wide = layoutGraph(graph, "wide");
  const narrow = layoutGraph(graph, "narrow");
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0">
        <div className="mb-6 h-[34px]" aria-hidden="true" />
        <div
          className="hidden w-full border border-dashed border-[var(--tiro-border)] md:block"
          style={{ aspectRatio: `${wide.width} / ${wide.height}` }}
          aria-hidden="true"
        />
        <div
          className="block w-full border border-dashed border-[var(--tiro-border)] md:hidden"
          style={{ aspectRatio: `${narrow.width} / ${narrow.height}` }}
          aria-hidden="true"
        />
        <p className="lt-label mt-4">Synthetic demonstration graph · not archival data</p>
        <noscript>
          <p className="mt-3 text-sm text-[var(--tiro-text-muted)]">
            The drawing and inspector need JavaScript. Every relationship is listed below.
          </p>
        </noscript>
      </div>
      <div className="hidden min-h-[24rem] border border-[var(--tiro-border-strong)] bg-[var(--tiro-raised)] xl:row-span-2 xl:block" aria-hidden="true" />
      <div className="min-w-0">
        <h3 className="lt-label mb-2 text-[var(--tiro-text)]">Relationships ({graph.edges.length})</h3>
        <ul className="grid border-b border-[var(--tiro-border)] md:grid-cols-2 md:gap-x-8">
          {graph.edges.map((e) => (
            <li key={e.id} className="flex items-start gap-[0.85rem] border-t border-[var(--tiro-border)] px-1 py-[0.85rem]">
              <span className="pt-1.5">
                <EvidenceStroke evidence={e.evidence} />
              </span>
              <span className="min-w-0 flex-1 text-sm text-[var(--tiro-text-soft)]">
                {label(e.from)} <span className="text-[var(--tiro-text-muted)]">→</span> {label(e.to)}
                <span className="block text-xs text-[var(--tiro-text-muted)]">
                  {e.relation} · {EVIDENCE[e.evidence].label}
                  {e.accounts.length > 1 ? ` · ${e.accounts.length} accounts` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
