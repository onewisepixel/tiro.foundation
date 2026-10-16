"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { EVIDENCE, toneColor } from "@/lib/livingTrace/evidence";
import { sourceChain, type GraphNode, type ProjectedGraph } from "@/lib/livingTrace/graph";
import { EvidenceStroke } from "./EvidenceTag";

// Constellation — plural records, navigable, not merged.
//
// Receives an already-projected graph (src/lib/livingTrace/projection.ts):
// nothing a visitor may not know ever reaches this component. Two equal
// ways in: the drawing (pointer) and the relationship list (keyboard,
// screen reader, and anyone who prefers text). Both drive one inspector
// that states the link's type, its evidence, who asserted it, and the
// chain of traces back to its origin.

type Point = { x: number; y: number };
type Layout = { width: number; height: number; at: Record<string, Point> };

// Composed per breakpoint rather than scaled: the wide layout reads left
// to right, the narrow one top to bottom. Keyed by projected node id;
// any unknown node falls back to a ring so new data never breaks layout.
const WIDE: Layout = {
  width: 760,
  height: 420,
  at: {
    "origin-s01": { x: 70, y: 210 },
    "rec-a": { x: 250, y: 110 },
    "lang-1": { x: 520, y: 62 },
    "place-1": { x: 210, y: 360 },
    "context-1": { x: 420, y: 236 },
    "rec-b": { x: 600, y: 330 },
    "origin-s02": { x: 706, y: 206 },
  },
};

const NARROW: Layout = {
  width: 360,
  height: 560,
  at: {
    "origin-s01": { x: 46, y: 46 },
    "rec-a": { x: 150, y: 140 },
    "lang-1": { x: 300, y: 70 },
    "place-1": { x: 60, y: 330 },
    "context-1": { x: 230, y: 268 },
    "rec-b": { x: 214, y: 442 },
    "origin-s02": { x: 318, y: 520 },
  },
};

function position(layout: Layout, nodes: GraphNode[], id: string): Point {
  const known = layout.at[id];
  if (known) {
    return known;
  }
  const index = nodes.findIndex((n) => n.id === id);
  const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
  return { x: layout.width / 2 + Math.cos(angle) * layout.width * 0.35, y: layout.height / 2 + Math.sin(angle) * layout.height * 0.35 };
}

// A gentle curve: a trace, not a wire.
function curve(a: Point, b: Point): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bend = 0.18;
  return `M ${a.x} ${a.y} Q ${mx - dy * bend} ${my + dx * bend} ${b.x} ${b.y}`;
}

function NodeMark({ node, p, dim }: { node: GraphNode; p: Point; dim: boolean }) {
  const opacity = dim ? 0.45 : 1;
  if (node.kind === "origin") {
    return (
      <g opacity={opacity}>
        <circle cx={p.x} cy={p.y} r="11" fill="var(--tiro-bg)" stroke="var(--tiro-accent)" strokeWidth="1.5" />
        <circle cx={p.x} cy={p.y} r="3.6" fill="var(--tiro-accent)" />
      </g>
    );
  }
  if (node.kind === "record") {
    return (
      <g opacity={opacity}>
        <circle cx={p.x} cy={p.y} r="7" fill="var(--tiro-text)" />
        <circle cx={p.x} cy={p.y} r="11" fill="none" stroke="var(--tiro-border-strong)" strokeWidth="1" />
      </g>
    );
  }
  return <circle cx={p.x} cy={p.y} r="5" fill="var(--tiro-bg)" stroke="var(--tiro-mineral)" strokeWidth="1.5" opacity={opacity} />;
}

function Drawing({
  graph,
  layout,
  selected,
  chain,
  onSelect,
  className,
}: {
  graph: ProjectedGraph;
  layout: Layout;
  selected: string | null;
  chain: Set<string>;
  onSelect: (id: string) => void;
  className: string;
}) {
  const at = (id: string) => position(layout, graph.nodes, id);
  const lit = (edgeId: string) => selected === null || chain.has(edgeId);
  const litNodes = new Set<string>();
  for (const e of graph.edges) {
    if (lit(e.id)) {
      litNodes.add(e.from);
      litNodes.add(e.to);
    }
  }

  return (
    // Pointer shortcut only; the relationship list below is the complete,
    // accessible equivalent, so the drawing itself is hidden from AT.
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={className} aria-hidden="true" focusable="false">
      {graph.edges.map((edge) => {
        const a = at(edge.from);
        const b = at(edge.to);
        const def = EVIDENCE[edge.evidence];
        const d = curve(a, b);
        const isSelected = edge.id === selected;
        const color = toneColor(def.tone);
        const opacity = lit(edge.id) ? 1 : 0.22;
        return (
          <g key={edge.id} opacity={opacity} style={{ transition: "opacity var(--lt-dur-base) ease" }}>
            {edge.evidence === "contested" ? (
              <>
                <path d={d} className="lt-trace" data-evidence="contested" stroke={color} strokeDasharray={def.dash} transform="translate(0,-2.2)" />
                <path d={d} className="lt-trace" data-evidence="contested" stroke={color} strokeDasharray={def.dash} transform="translate(0,2.2)" />
              </>
            ) : (
              <path
                // Re-keyed on selection so the chain re-draws from its origin.
                key={isSelected || chain.has(edge.id) ? `${edge.id}-on-${selected}` : edge.id}
                d={d}
                pathLength={def.dash === "none" ? 1 : undefined}
                className={`lt-trace ${def.dash === "none" && chain.has(edge.id) ? "lt-draw" : ""}`}
                data-evidence={edge.evidence}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : undefined}
                strokeDasharray={def.dash === "none" ? undefined : def.dash}
              />
            )}
            {/* Generous invisible hit area for pointer and touch. */}
            <path d={d} stroke="transparent" strokeWidth="22" fill="none" style={{ cursor: "pointer" }} onClick={() => onSelect(edge.id)} />
          </g>
        );
      })}
      {graph.nodes.map((node) => {
        const p = at(node.id);
        const dim = selected !== null && !litNodes.has(node.id);
        const labelAbove = p.y > layout.height * 0.55;
        return (
          <g key={node.id}>
            <NodeMark node={node} p={p} dim={dim} />
            <text
              x={p.x}
              y={labelAbove ? p.y - 20 : p.y + 28}
              textAnchor={p.x < 60 ? "start" : p.x > layout.width - 60 ? "end" : "middle"}
              fill={dim ? "var(--tiro-text-subtle)" : "var(--tiro-text-soft)"}
              style={{ font: "500 13px var(--font-code)", letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type ConstellationProps = {
  graph: ProjectedGraph;
  initialEdgeId?: string;
  // Heading level for the inspector/list titles in the host page.
  headingLevel?: 2 | 3;
};

export default function Constellation({ graph, initialEdgeId, headingLevel = 3 }: ConstellationProps) {
  const [selected, setSelected] = useState<string | null>(initialEdgeId ?? graph.edges[0]?.id ?? null);
  const baseId = useId();
  const H = headingLevel === 2 ? "h2" : "h3";

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const chainInfo = useMemo(() => (selected ? sourceChain(graph, selected) : { chain: [], reachesOrigin: false }), [graph, selected]);
  const chain = useMemo(() => new Set(chainInfo.chain), [chainInfo]);
  const edge = graph.edges.find((e) => e.id === selected) ?? null;

  const nodeLink = (id: string) => {
    const node = nodeById.get(id);
    if (!node) {
      return null;
    }
    return node.href ? (
      <Link href={node.href} className="tiro-link !text-[var(--tiro-text)]">
        {node.label}
      </Link>
    ) : (
      <span className="text-[var(--tiro-text)]">{node.label}</span>
    );
  };

  return (
    // Narrow screens: drawing, then inspector, then list, so a selection is
    // never off-screen. Wide screens: inspector in its own sticky column.
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <figure className="lg:col-start-1 lg:row-start-1">
          <Drawing graph={graph} layout={WIDE} selected={selected} chain={chain} onSelect={setSelected} className="hidden h-auto w-full sm:block" />
          <Drawing graph={graph} layout={NARROW} selected={selected} chain={chain} onSelect={setSelected} className="block h-auto w-full sm:hidden" />
          <figcaption className="lt-label mt-3">
            Synthetic demonstration graph, not archival data. Restricted records and their relationships are never drawn.
          </figcaption>
        </figure>

      <div className="lg:col-start-1 lg:row-start-2">
        <H id={`${baseId}-list`} className="lt-label mb-2 text-[var(--tiro-text)]">
          Relationships ({graph.edges.length}). Select one to inspect.
        </H>
        <ul aria-labelledby={`${baseId}-list`} className="border-b border-[var(--tiro-border)]">
          {graph.edges.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="lt-row-button"
                aria-pressed={selected === e.id}
                aria-controls={`${baseId}-inspector`}
                onClick={() => setSelected(e.id)}
              >
                <span className="pt-1.5">
                  <EvidenceStroke evidence={e.evidence} />
                </span>
                <span className="min-w-0 flex-1 text-sm text-[var(--tiro-text-soft)]">
                  {nodeById.get(e.from)?.label} <span className="text-[var(--tiro-text-muted)]">→</span> {nodeById.get(e.to)?.label}
                  <span className="block text-xs text-[var(--tiro-text-muted)]">
                    {e.relation} · {EVIDENCE[e.evidence].label}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <section
        id={`${baseId}-inspector`}
        aria-live="polite"
        aria-labelledby={`${baseId}-inspector-title`}
        className="border border-[var(--tiro-border-strong)] bg-[var(--tiro-raised)] p-5 md:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <H id={`${baseId}-inspector-title`} className="lt-label text-[var(--tiro-accent)]">
          Relationship inspector
        </H>
        {edge ? (
          <>
            <p className="lt-label mt-5">Link type</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-snug">{edge.relation}</p>
            <p className="mt-2 text-sm text-[var(--tiro-text-muted)]">
              {nodeLink(edge.from)} <span aria-hidden="true">→</span>
              <span className="sr-only">to</span> {nodeLink(edge.to)}
            </p>

            <p className="lt-label mt-5">Evidence status</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--tiro-text)]">
              <EvidenceStroke evidence={edge.evidence} /> {EVIDENCE[edge.evidence].label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{EVIDENCE[edge.evidence].meaning}</p>

            <p className="lt-label mt-5">Basis</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-soft)]">{edge.basis}</p>
            <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Asserted by: {edge.assertedBy}</p>

            <p className="lt-label mt-5">Source chain</p>
            {chainInfo.reachesOrigin ? (
              <ol className="mt-2 space-y-2">
                {chainInfo.chain.map((id, index) => {
                  const hop = graph.edges.find((e) => e.id === id)!;
                  return (
                    <li key={id} className="flex items-start gap-2.5 text-sm">
                      <span className="lt-label w-5 shrink-0 pt-0.5">{String(index + 1).padStart(2, "0")}</span>
                      <span className="text-[var(--tiro-text-soft)]">
                        {nodeLink(hop.from)} → {nodeLink(hop.to)}
                        <span className="block text-xs text-[var(--tiro-text-muted)]">
                          {hop.relation} · {EVIDENCE[hop.evidence].label}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-[var(--tiro-text-muted)]">No path back to an origin is on record for this link.</p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--tiro-text-muted)]">Select a relationship to see its type, evidence, and source chain.</p>
        )}
      </section>
    </div>
  );
}
