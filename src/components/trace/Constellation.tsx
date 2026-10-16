"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { EVIDENCE, EVIDENCE_ORDER, toneColor, type EvidenceState } from "@/lib/livingTrace/evidence";
import {
  chainsToOrigins,
  edgeProvenance,
  provenanceFootprint,
  type AccountTrace,
  type GraphAccount,
  type GraphEdge,
  type GraphNode,
  type ProjectedGraph,
} from "@/lib/livingTrace/graph";
import { layoutGraph, tracePath, traceMidpoint, type Layout } from "@/lib/livingTrace/layout";
import { EvidenceStroke } from "./EvidenceTag";
import Reveal from "./Reveal";

// Constellation — plural records, navigable, not merged.
//
// Receives an already-projected graph (src/lib/livingTrace/projection.ts):
// nothing a visitor may not know ever reaches this component. Three equal
// ways in: the drawing (pointer and touch), the relationship list, and the
// inspector's own links (keyboard and screen reader). Selecting a
// relationship shows each of its accounts with its own provenance chain;
// selecting a node shows its sources and relationships. The drawing never
// implies more than the data: a path is emphasized as provenance only
// where every step is a source link.

type Selection = { type: "edge"; id: string } | { type: "node"; id: string } | null;

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  origin: "Origin",
  record: "Record",
  derivative: "Derivative",
  interpretation: "Interpretation",
  place: "Place",
  language: "Language",
  event: "Event",
};

// Patterned lines (dashed, dotted) cannot use the stroke-dash draw
// technique without losing their pattern, so they arrive by fading.
const isSolid = (state: EvidenceState) => EVIDENCE[state].dash === "none";

function NodeGlyph({ node, x, y, dim, selected }: { node: GraphNode; x: number; y: number; dim: boolean; selected: boolean }) {
  const o = dim ? 0.5 : 1;
  const ring = selected ? (
    <circle cx={x} cy={y} r={node.kind === "origin" ? 27 : 17} fill="none" stroke="var(--tiro-accent)" strokeWidth="1.25" />
  ) : null;
  switch (node.kind) {
    case "origin":
      return (
        <g opacity={o}>
          {ring}
          {/* Resonance: a faint ring around each origin, never around anything else. */}
          <circle cx={x} cy={y} r="20" fill="none" stroke="var(--tiro-accent)" strokeWidth="1" opacity="0.3" />
          <circle cx={x} cy={y} r="11" fill="var(--lt-graph-bg)" stroke="var(--tiro-accent)" strokeWidth="1.6" />
          <circle cx={x} cy={y} r="3.6" fill="var(--tiro-accent)" />
        </g>
      );
    case "record":
      return (
        <g opacity={o}>
          {ring}
          <circle cx={x} cy={y} r="11" fill="var(--lt-graph-bg)" stroke="var(--tiro-border-strong)" strokeWidth="1" />
          <circle cx={x} cy={y} r="6.5" fill="var(--tiro-text)" />
        </g>
      );
    case "derivative":
      return (
        <g opacity={o}>
          {ring}
          <circle cx={x} cy={y} r="8" fill="var(--lt-graph-bg)" stroke="var(--tiro-text-soft)" strokeWidth="1.25" />
          <circle cx={x} cy={y} r="2.6" fill="var(--tiro-text-soft)" />
        </g>
      );
    case "interpretation":
      // Square-cornered and hollow: an interpretation is not a source.
      return (
        <g opacity={o}>
          {ring}
          <rect x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} fill="var(--lt-graph-bg)" stroke="var(--tiro-mineral)" strokeWidth="1.25" />
        </g>
      );
    default:
      return (
        <g opacity={o}>
          {ring}
          <circle cx={x} cy={y} r="6" fill="var(--lt-graph-bg)" stroke="var(--tiro-mineral)" strokeWidth="1.5" />
        </g>
      );
  }
}

function EdgeStrands({ edge, layout, className, style }: { edge: GraphEdge; layout: Layout; className: string; style?: React.CSSProperties }) {
  const a = layout.at[edge.from];
  const b = layout.at[edge.to];
  const def = EVIDENCE[edge.evidence];
  const color = toneColor(def.tone);
  if (edge.evidence === "contested") {
    // Two strands: two accounts, kept side by side.
    return (
      <>
        {[-2.6, 2.6].map((offset) => (
          <path
            key={offset}
            d={tracePath(a, b, layout.orientation, offset)}
            className={`lt-trace ${className}`}
            style={style}
            data-evidence="contested"
            stroke={color}
            strokeDasharray={def.dash}
          />
        ))}
      </>
    );
  }
  return (
    <path
      d={tracePath(a, b, layout.orientation)}
      pathLength={isSolid(edge.evidence) ? 1 : undefined}
      className={`lt-trace ${className}`}
      style={style}
      data-evidence={edge.evidence}
      stroke={color}
      strokeDasharray={isSolid(edge.evidence) ? undefined : def.dash}
    />
  );
}

function Drawing({
  graph,
  layout,
  selection,
  footprint,
  hidden,
  onSelect,
  className,
}: {
  graph: ProjectedGraph;
  layout: Layout;
  selection: Selection;
  footprint: { edges: Set<string>; nodes: Set<string>; order: Map<string, number> };
  hidden: Set<EvidenceState>;
  onSelect: (s: Selection) => void;
  className: string;
}) {
  const wide = layout.orientation === "wide";
  const active = selection !== null;
  const selectedEdge = selection?.type === "edge" ? graph.edges.find((e) => e.id === selection.id) : undefined;

  // Arrival order when the region is revealed: source links first, then
  // attested relationships, then interpretation, disagreement, and open
  // questions. The order restates the grammar: sources before readings.
  const arrival = (edge: GraphEdge) => (edge.provenance ? 0 : edge.evidence === "attested" ? 1 : 2);

  return (
    // The drawing is a pointer and touch shortcut. The relationship list
    // and inspector are its complete accessible equivalent, so the SVG is
    // hidden from assistive technology.
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={className} aria-hidden="true" focusable="false">
      {/* Bands: the direction of the argument, from origin outward. */}
      {layout.bands.map((band) =>
        wide ? (
          <g key={band.key}>
            <line x1={band.pos} x2={band.pos} y1="34" y2={layout.height - 12} stroke="var(--tiro-border)" strokeDasharray="1 6" />
            <text x={band.pos} y="18" textAnchor="middle" fill="var(--tiro-text-muted)" style={{ font: "500 11px var(--font-code)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {band.label}
            </text>
          </g>
        ) : (
          <text key={band.key} x="8" y={band.pos - 34} fill="var(--tiro-text-muted)" style={{ font: "500 10px var(--font-code)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {band.label}
          </text>
        ),
      )}

      {graph.edges.map((edge) => {
        const filtered = hidden.has(edge.evidence);
        const lit = !active ? !filtered : footprint.edges.has(edge.id);
        const emphasized = active && footprint.edges.has(edge.id);
        const hop = footprint.order.get(edge.id) ?? 0;
        const a = layout.at[edge.from];
        const b = layout.at[edge.to];
        const solid = isSolid(edge.evidence);
        return (
          <g key={edge.id} opacity={lit ? 1 : filtered ? 0.06 : 0.3} style={{ transition: "opacity var(--lt-dur-base) ease" }}>
            <EdgeStrands
              // Re-keyed on selection so the chain redraws from its origin.
              key={emphasized ? `${edge.id}@${selection?.id}` : edge.id}
              edge={edge}
              layout={layout}
              className={emphasized ? (solid ? "lt-draw" : "lt-fade-in") : solid ? "lt-on-reveal-draw" : "lt-on-reveal-fade"}
              style={{ "--lt-delay": `${emphasized ? hop * 260 : arrival(edge) * 420}ms`, strokeWidth: emphasized ? 2.25 : undefined } as React.CSSProperties}
            />
            {/* Generous invisible hit area for pointer and touch. */}
            <path
              d={tracePath(a, b, layout.orientation)}
              stroke="transparent"
              strokeWidth="24"
              fill="none"
              style={{ cursor: "pointer" }}
              onClick={() => onSelect({ type: "edge", id: edge.id })}
            />
          </g>
        );
      })}

      {graph.nodes.map((node) => {
        const p = layout.at[node.id];
        const dim = active && !footprint.nodes.has(node.id);
        const isSelected = selection?.type === "node" && selection.id === node.id;
        const anchor = wide ? (node.kind === "origin" ? "end" : "start") : p.x < 70 ? "start" : p.x > layout.width - 70 ? "end" : "middle";
        const lx = wide ? (node.kind === "origin" ? p.x - 30 : p.x + 20) : p.x;
        const ly = wide ? p.y + 4 : p.y + 30;
        return (
          <g key={node.id} className="lt-on-reveal-fade" style={{ "--lt-delay": "200ms", cursor: "pointer" } as React.CSSProperties} onClick={() => onSelect({ type: "node", id: node.id })}>
            <circle cx={p.x} cy={p.y} r="22" fill="transparent" />
            <NodeGlyph node={node} x={p.x} y={p.y} dim={dim} selected={isSelected} />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              fill={dim ? "var(--tiro-text-subtle)" : "var(--tiro-text-soft)"}
              style={{ font: `500 ${wide ? 12 : 11}px var(--font-code)`, letterSpacing: "0.12em", textTransform: "uppercase", transition: "fill var(--lt-dur-base) ease" }}
            >
              {node.label}
            </text>
          </g>
        );
      })}

      {/* The selected relationship names itself on the drawing. */}
      {selectedEdge && wide
        ? (() => {
            const m = traceMidpoint(layout.at[selectedEdge.from], layout.at[selectedEdge.to], layout.orientation);
            const text = selectedEdge.relation;
            const w = text.length * 7.1 + 20;
            return (
              <g key={`label-${selectedEdge.id}`} className="lt-fade-in" style={{ "--lt-delay": "300ms" } as React.CSSProperties}>
                <rect x={m.x - w / 2} y={m.y - 13} width={w} height="26" fill="var(--lt-graph-bg)" stroke="var(--tiro-accent)" strokeWidth="1" />
                <text x={m.x} y={m.y + 4.5} textAnchor="middle" fill="var(--tiro-text)" style={{ font: "400 13px var(--font-body)" }}>
                  {text}
                </text>
              </g>
            );
          })()
        : null}
    </svg>
  );
}

function hopLabel(graph: ProjectedGraph, id: string) {
  const hop = graph.edges.find((e) => e.id === id);
  if (!hop) {
    return null;
  }
  const label = (nodeId: string) => graph.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
  return { from: label(hop.from), to: label(hop.to), relation: hop.relation, evidence: hop.evidence };
}

function TraceDetail({ graph, trace }: { graph: ProjectedGraph; trace: AccountTrace }) {
  switch (trace.state) {
    case "withheld":
      return null;
    case "interpretation":
      return (
        <p className="mt-2 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
          An interpretation, not testimony. It has no source chain of its own; it rests on the record it reads.
        </p>
      );
    case "no-source":
      return <p className="mt-2 text-xs leading-relaxed text-[var(--tiro-text-muted)]">No source for this claim is on record. Shown as missing, not filled in.</p>;
    case "incomplete":
    case "traced":
      return (
        <>
          <ol className="mt-2 space-y-1.5">
            {trace.chain.map((id, i) => {
              const hop = hopLabel(graph, id);
              return hop ? (
                <li key={id} className="flex items-start gap-2 text-xs">
                  <span className="w-4 shrink-0 font-[family-name:var(--font-code)] text-[var(--tiro-text-muted)]">{i + 1}</span>
                  <span className="text-[var(--tiro-text-soft)]">
                    {hop.from} → {hop.to}
                    <span className="block text-[var(--tiro-text-muted)]">
                      {hop.relation} · {EVIDENCE[hop.evidence].label}
                    </span>
                  </span>
                </li>
              ) : null;
            })}
          </ol>
          {trace.state === "traced" && trace.chain.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Held by the origin itself.</p>
          ) : null}
          {trace.state === "incomplete" ? (
            <p className="mt-2 text-xs leading-relaxed text-[var(--tiro-contested)]">The chain stops before an origin. Its provenance is incomplete.</p>
          ) : null}
        </>
      );
  }
}

function AccountCard({ graph, account, index, traces }: { graph: ProjectedGraph; account: GraphAccount; index: number; traces: AccountTrace[] }) {
  const mine = traces.filter((t) => t.accountId === account.id);
  if (account.state === "withheld") {
    return (
      <li className="lt-boundary p-3">
        <p className="lt-label">Account {index + 1} · Restricted source</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
          Its rights authority permits acknowledging that this account exists, and nothing else: not its content, its
          claimant, or its source.
        </p>
      </li>
    );
  }
  const origin = mine.find((t) => t.state === "traced");
  const originLabel = origin && origin.state === "traced" ? graph.nodes.find((n) => n.id === origin.origin)?.label : null;
  return (
    <li className="border border-[var(--tiro-border)] p-3">
      <p className="lt-label">
        Account {index + 1}
        {originLabel ? ` · from ${originLabel}` : account.kind === "interpretation" ? " · interpretation" : ""}
      </p>
      <p className="mt-1.5 text-sm text-[var(--tiro-text)]">{account.position}</p>
      <p className="mt-1 text-xs text-[var(--tiro-text-muted)]">Claimed by: {account.assertedBy}</p>
      {mine.map((trace, i) => (
        <TraceDetail key={i} graph={graph} trace={trace} />
      ))}
    </li>
  );
}

function EdgeInspector({ graph, edge, H, onSelect }: { graph: ProjectedGraph; edge: GraphEdge; H: "h2" | "h3"; onSelect: (s: Selection) => void }) {
  const prov = edgeProvenance(graph, edge.id);
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;
  const sourceAccounts = edge.accounts.filter((a) => a.state === "attributed" && a.kind === "source").length;
  return (
    <>
      <p className="lt-label mt-5">Relationship</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-snug">{edge.relation}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
        <NodeButton node={node(edge.from)} onSelect={onSelect} />
        <span aria-hidden="true" className="text-[var(--tiro-text-muted)]">
          →
        </span>
        <span className="sr-only">to</span>
        <NodeButton node={node(edge.to)} onSelect={onSelect} />
      </p>

      <p className="lt-label mt-5">Evidence</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--tiro-text)]">
        <EvidenceStroke evidence={edge.evidence} /> {EVIDENCE[edge.evidence].label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{edge.summary}</p>

      <H className="lt-label mt-6 text-[var(--tiro-text)]">
        {edge.accounts.length === 0 ? "Accounts" : `Accounts (${edge.accounts.length})`}
      </H>
      {edge.accounts.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">No one has made this claim. It is recorded as an open question.</p>
      ) : (
        <ol className="mt-2 space-y-2.5">
          {edge.accounts.map((account, i) => (
            <AccountCard key={account.id} graph={graph} account={account} index={i} traces={prov.traces} />
          ))}
        </ol>
      )}
      {sourceAccounts > 1 && prov.independent !== null ? (
        <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
          {prov.independent
            ? `${sourceAccounts} accounts from ${prov.origins.length} separate origins. The archive keeps each; it does not decide between them.`
            : "These accounts share an origin, so they are not independent corroboration."}
        </p>
      ) : null}

      <p className="lt-label mt-6">Recorded by</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{edge.recordedBy}</p>
    </>
  );
}

function NodeButton({ node, onSelect }: { node: GraphNode; onSelect: (s: Selection) => void }) {
  return (
    <button type="button" className="tiro-link !text-[var(--tiro-text)]" onClick={() => onSelect({ type: "node", id: node.id })}>
      {node.label}
    </button>
  );
}

function NodeInspector({ graph, node, H, onSelect }: { graph: ProjectedGraph; node: GraphNode; H: "h2" | "h3"; onSelect: (s: Selection) => void }) {
  const incident = graph.edges.filter((e) => e.from === node.id || e.to === node.id);
  const origins = node.kind === "record" || node.kind === "derivative" ? chainsToOrigins(graph, node.id) : [];
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <>
      <p className="lt-label mt-5">{KIND_LABEL[node.kind]}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-snug">{node.label}</p>
      {node.href ? (
        <Link href={node.href} className="tiro-link mt-2 inline-block text-sm">
          Open the specimen record
        </Link>
      ) : null}
      {node.kind === "record" || node.kind === "derivative" ? (
        <>
          <p className="lt-label mt-5">Traced to</p>
          {origins.length ? (
            <ul className="mt-1 space-y-1 text-sm text-[var(--tiro-text-soft)]">
              {origins.map((o) => (
                <li key={o.origin}>
                  {label(o.origin)} <span className="text-xs text-[var(--tiro-text-muted)]">({o.chain.length} source link{o.chain.length === 1 ? "" : "s"})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--tiro-text-muted)]">No source link is on record.</p>
          )}
        </>
      ) : null}
      {node.kind === "place" || node.kind === "language" || node.kind === "event" ? (
        <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          Shared context. Records that meet here are connected, not corroborated.
        </p>
      ) : null}
      <H className="lt-label mt-6 text-[var(--tiro-text)]">Relationships ({incident.length})</H>
      <ul className="mt-1">
        {incident.map((e) => (
          <li key={e.id}>
            <button type="button" className="lt-row-button !py-2" onClick={() => onSelect({ type: "edge", id: e.id })}>
              <span className="pt-1">
                <EvidenceStroke evidence={e.evidence} width={22} />
              </span>
              <span className="text-sm text-[var(--tiro-text-soft)]">
                {e.relation}
                <span className="block text-xs text-[var(--tiro-text-muted)]">
                  {label(e.from)} → {label(e.to)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

type ConstellationProps = {
  graph: ProjectedGraph;
  initialEdgeId?: string;
  headingLevel?: 2 | 3;
  // Read ?edge= from the address on mount and keep it in sync, so a
  // selected relationship can be linked to.
  syncUrl?: boolean;
};

export default function Constellation({ graph, initialEdgeId, headingLevel = 3, syncUrl = false }: ConstellationProps) {
  const [selection, setSelection] = useState<Selection>(initialEdgeId ? { type: "edge", id: initialEdgeId } : null);
  const [hidden, setHidden] = useState<Set<EvidenceState>>(new Set());
  const baseId = useId();
  const H = headingLevel === 2 ? "h2" : "h3";

  const wide = useMemo(() => layoutGraph(graph, "wide"), [graph]);
  const narrow = useMemo(() => layoutGraph(graph, "narrow"), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  useEffect(() => {
    if (!syncUrl) {
      return;
    }
    const edge = new URLSearchParams(window.location.search).get("edge");
    // Only an edge that exists in the projected graph may be preselected.
    if (edge && graph.edges.some((e) => e.id === edge)) {
      // Mount-only read of the address bar, which the server cannot see
      // on a statically generated page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelection({ type: "edge", id: edge });
    }
  }, [syncUrl, graph.edges]);

  const select = (next: Selection) => {
    setSelection(next);
    if (syncUrl && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next?.type === "edge") {
        url.searchParams.set("edge", next.id);
      } else {
        url.searchParams.delete("edge");
      }
      window.history.replaceState(window.history.state, "", url);
    }
  };

  const footprint = useMemo(() => {
    const order = new Map<string, number>();
    if (!selection) {
      return { edges: new Set<string>(), nodes: new Set<string>(), order };
    }
    if (selection.type === "edge") {
      const fp = provenanceFootprint(graph, selection.id);
      // Hop order for the redraw: each chain from its origin, then the edge.
      for (const trace of edgeProvenance(graph, selection.id).traces) {
        if (trace.state === "traced" || trace.state === "incomplete") {
          trace.chain.forEach((id, i) => order.set(id, Math.min(order.get(id) ?? i, i)));
        }
      }
      order.set(selection.id, Math.max(0, ...[...order.values()].map((v) => v + 1)));
      return { ...fp, order };
    }
    const edges = new Set<string>();
    const nodes = new Set<string>([selection.id]);
    for (const e of graph.edges) {
      if (e.from === selection.id || e.to === selection.id) {
        edges.add(e.id);
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
    for (const c of chainsToOrigins(graph, selection.id)) {
      c.chain.forEach((id, i) => {
        edges.add(id);
        order.set(id, i);
        const hop = graph.edges.find((e) => e.id === id)!;
        nodes.add(hop.from);
        nodes.add(hop.to);
      });
    }
    return { edges, nodes, order };
  }, [graph, selection]);

  const counts = useMemo(() => {
    const m = new Map<EvidenceState, number>();
    for (const e of graph.edges) {
      m.set(e.evidence, (m.get(e.evidence) ?? 0) + 1);
    }
    return m;
  }, [graph.edges]);

  const visibleEdges = graph.edges.filter((e) => !hidden.has(e.evidence));
  const selectedEdge = selection?.type === "edge" ? graph.edges.find((e) => e.id === selection.id) : undefined;
  const selectedNode = selection?.type === "node" ? nodeById.get(selection.id) : undefined;

  const toggle = (state: EvidenceState) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  };

  return (
    <div className="lt-constellation grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_25rem]" style={{ "--lt-graph-bg": "var(--tiro-bg-deep)" } as React.CSSProperties}>
      <div className="min-w-0">
        <div role="group" aria-label="Show relationships by evidence" className="mb-6 flex flex-wrap items-center gap-2">
          <span className="lt-label mr-2">Evidence</span>
          {EVIDENCE_ORDER.filter((s) => counts.has(s)).map((state) => (
            <button
              key={state}
              type="button"
              aria-pressed={!hidden.has(state)}
              onClick={() => toggle(state)}
              className="inline-flex items-center gap-2 border border-[var(--tiro-border)] px-2.5 py-1.5 text-xs text-[var(--tiro-text-muted)] transition-colors aria-pressed:border-[var(--tiro-border-strong)] aria-pressed:text-[var(--tiro-text)] hover:border-[var(--tiro-accent)]"
            >
              <EvidenceStroke evidence={state} width={20} />
              {EVIDENCE[state].label}
              <span className="font-[family-name:var(--font-code)] text-[10px] text-[var(--tiro-text-muted)]">{counts.get(state)}</span>
            </button>
          ))}
        </div>

        <figure>
          <Reveal>
            <Drawing graph={graph} layout={wide} selection={selection} footprint={footprint} hidden={hidden} onSelect={select} className="hidden h-auto w-full md:block" />
            <Drawing graph={graph} layout={narrow} selection={selection} footprint={footprint} hidden={hidden} onSelect={select} className="block h-auto w-full md:hidden" />
          </Reveal>
          <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="lt-label">Synthetic demonstration graph · not archival data</span>
            {selection ? (
              <button type="button" className="tiro-link text-xs" onClick={() => select(null)}>
                Clear selection
              </button>
            ) : null}
          </figcaption>
        </figure>
      </div>

      <section
        id={`${baseId}-inspector`}
        aria-live="polite"
        aria-labelledby={`${baseId}-inspector-title`}
        className="border border-[var(--tiro-border-strong)] bg-[var(--tiro-raised)] p-5 md:p-6 xl:sticky xl:top-20 xl:row-span-2 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
      >
        <H id={`${baseId}-inspector-title`} className="lt-label text-[var(--tiro-accent)]">
          Inspector
        </H>
        {selectedEdge ? (
          <EdgeInspector graph={graph} edge={selectedEdge} H={H} onSelect={select} />
        ) : selectedNode ? (
          <NodeInspector graph={graph} node={selectedNode} H={H} onSelect={select} />
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
            Select a relationship or a point, in the drawing or the list, to see its accounts, who made each claim, and the
            chain of sources behind it.
          </p>
        )}
        <p className="mt-8 border-t border-[var(--tiro-border)] pt-4 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
          A path through this graph counts as provenance only where every step is a source link. Being connected is not being
          corroborated. Restricted records, and relationships that depend on them, are never drawn.
        </p>
      </section>

      <div className="min-w-0">
        <H id={`${baseId}-list`} className="lt-label mb-2 text-[var(--tiro-text)]">
          Relationships ({visibleEdges.length === graph.edges.length ? graph.edges.length : `${visibleEdges.length} of ${graph.edges.length} shown`})
        </H>
        <ul aria-labelledby={`${baseId}-list`} className="grid border-b border-[var(--tiro-border)] md:grid-cols-2 md:gap-x-8">
          {visibleEdges.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="lt-row-button"
                aria-pressed={selection?.type === "edge" && selection.id === e.id}
                aria-controls={`${baseId}-inspector`}
                onClick={() => select({ type: "edge", id: e.id })}
              >
                <span className="pt-1.5">
                  <EvidenceStroke evidence={e.evidence} />
                </span>
                <span className="min-w-0 flex-1 text-sm text-[var(--tiro-text-soft)]">
                  {nodeById.get(e.from)?.label} <span className="text-[var(--tiro-text-muted)]">→</span> {nodeById.get(e.to)?.label}
                  <span className="block text-xs text-[var(--tiro-text-muted)]">
                    {e.relation} · {EVIDENCE[e.evidence].label}
                    {e.accounts.length > 1 ? ` · ${e.accounts.length} accounts` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
