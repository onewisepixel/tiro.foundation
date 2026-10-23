"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EVIDENCE, EVIDENCE_ORDER, toneColor } from "@/lib/livingTrace/evidence";
import type { GraphEdge, GraphNode, GraphNodeKind, ProjectedGraph } from "@/lib/livingTrace/graph";
import { EvidenceStroke } from "@/components/trace/EvidenceTag";

// Discover: the projected synthetic graph drawn as a section through
// strata, the way a survey or an architectural section is drawn. Sources
// sit on the ground; records stand on their sources; derivatives and
// readings hang beside the record they come from; shared context (an
// event, a language, a place) sits above. Height means kind, never value
// or importance.
//
// It receives only the already-projected graph (src/lib/livingTrace/
// projection.ts): withheld accounts arrive as opaque "withheld" markers and
// restricted or undiscoverable records never arrive at all.
//
// Every node is a keyboard button. Hover or focus previews a node's
// relationships; selecting it pins them in the inspector, where each
// relationship opens to its summary and accounts. All relationships are
// also available as text.

type Tier = "context" | "records" | "readings" | "sources";

const TIER_OF: Record<GraphNodeKind, Tier> = {
  event: "context",
  language: "context",
  place: "context",
  record: "records",
  derivative: "readings",
  interpretation: "readings",
  origin: "sources",
};

const TIER_LABEL: Record<Tier, string> = {
  context: "Shared context",
  records: "Records",
  readings: "Derived & interpreted",
  sources: "Sources",
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  origin: "Source",
  record: "Record",
  derivative: "Derivative",
  interpretation: "Interpretation",
  event: "Event",
  language: "Language",
  place: "Place",
};

const KIND_NOTE: Record<GraphNodeKind, string> = {
  origin: "Where an account begins. In a real record, a person or community, identified as they choose.",
  record: "One account, held with its context. It keeps its own way back to its source.",
  derivative: "Made from a record. It is attributed and keeps its source; it is not a new source.",
  interpretation: "A reading of a record by a named party, kept apart from the account itself.",
  event: "Shared context. Records that share it are connected; that does not make them agree.",
  language: "Shared context. Sharing a language connects records; it does not make one confirm another.",
  place: "Shared context. Whether two accounts name the same place can stay an open question.",
};

// Preferred left-to-right orders keep crossings low for the known
// demonstration graph; anything else falls in after them by label.
const ORDER = ["rec-b", "rec-a", "rec-c", "event-1", "lang-1", "place-1"];

type Frame = { w: number; h: number; left: number; right: number; y: Record<Tier, number>; reading: number };

const WIDE: Frame = { w: 1000, h: 540, left: 190, right: 60, y: { context: 70, records: 225, readings: 345, sources: 470 }, reading: 120 };
const NARROW: Frame = { w: 360, h: 610, left: 34, right: 34, y: { context: 80, records: 245, readings: 375, sources: 525 }, reading: 70 };

type Placed = { node: GraphNode; x: number; y: number; tier: Tier };

function rank(n: GraphNode) {
  const i = ORDER.indexOf(n.id);
  return i === -1 ? ORDER.length : i;
}

function spread(count: number, f: Frame) {
  const span = f.w - f.left - f.right;
  return Array.from({ length: count }, (_, i) => f.left + (count === 1 ? span / 2 : (span * i) / (count - 1)));
}

function layout(graph: ProjectedGraph, f: Frame): Map<string, Placed> {
  const byTier = (t: Tier) =>
    graph.nodes.filter((n) => TIER_OF[n.kind] === t).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  const placed = new Map<string, Placed>();
  const put = (node: GraphNode, x: number, tier: Tier) => placed.set(node.id, { node, x, y: f.y[tier], tier });

  const records = byTier("records");
  spread(records.length, f).forEach((x, i) => put(records[i], x, "records"));
  const context = byTier("context");
  // Context spans slightly inside the record row so labels clear the edges.
  spread(context.length, { ...f, left: f.left + f.reading * 0.4, right: f.right + f.reading * 0.2 }).forEach((x, i) => put(context[i], x, "context"));

  const linked = (id: string) =>
    graph.edges.filter((e) => e.from === id || e.to === id).map((e) => (e.from === id ? e.to : e.from)).find((o) => placed.get(o)?.tier === "records");

  const sources = byTier("sources");
  const fallbackSources = spread(sources.length, f);
  sources.forEach((n, i) => {
    const r = linked(n.id);
    put(n, r ? placed.get(r)!.x : fallbackSources[i], "sources");
  });

  // Readings flank the record they come from, alternating sides.
  const readings = byTier("readings");
  const fallbackReadings = spread(readings.length, f);
  const sideCount = new Map<string, number>();
  readings.forEach((n, i) => {
    const r = linked(n.id);
    if (!r) {
      put(n, fallbackReadings[i], "readings");
      return;
    }
    const k = sideCount.get(r) ?? 0;
    sideCount.set(r, k + 1);
    const step = Math.floor(k / 2) + 1;
    put(n, placed.get(r)!.x + (k % 2 === 0 ? -1 : 1) * f.reading * step, "readings");
  });
  return placed;
}

function edgePath(a: Placed, b: Placed) {
  if (a.tier === b.tier) {
    const mx = (a.x + b.x) / 2;
    const lift = Math.min(70, Math.abs(b.x - a.x) * 0.28);
    return { d: `M${a.x},${a.y} Q${mx},${a.y - lift} ${b.x},${b.y}`, vertical: false };
  }
  const my = (a.y + b.y) / 2;
  return { d: `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`, vertical: true };
}

function NodeGlyph({ kind, active }: { kind: GraphNodeKind; active: boolean }) {
  const stroke = active ? "var(--tiro-accent)" : kind === "origin" ? "var(--tiro-mark)" : "var(--tiro-mineral)";
  const w = active ? 1.8 : 1.4;
  switch (kind) {
    case "origin":
      return (
        <>
          <circle r="8" fill="var(--hv2-node-bg)" stroke={active ? "var(--tiro-accent)" : "var(--tiro-mark)"} strokeWidth={w + 0.2} />
          <circle r="2.6" fill="var(--tiro-mark)" />
        </>
      );
    case "record":
      return (
        <>
          <rect x="-8" y="-8" width="16" height="16" fill="var(--hv2-node-bg)" stroke={stroke} strokeWidth={w} />
          <rect x="-2.5" y="-2.5" width="5" height="5" fill={stroke} />
        </>
      );
    case "derivative":
      return <rect x="-6.5" y="-6.5" width="13" height="13" fill="var(--hv2-node-bg)" stroke={stroke} strokeWidth={w} strokeDasharray="3 2" />;
    case "interpretation":
      return <circle r="6.5" fill="var(--hv2-node-bg)" stroke={stroke} strokeWidth={w} strokeDasharray="3 2.5" />;
    default:
      return <rect x="-5.5" y="-5.5" width="11" height="11" transform="rotate(45)" fill="var(--hv2-node-bg)" stroke={active ? "var(--tiro-accent)" : "var(--tiro-text-soft)"} strokeWidth={w} />;
  }
}

function Drawing({
  graph,
  frame,
  focus,
  selected,
  onHover,
  onSelect,
  className,
  narrow,
}: {
  graph: ProjectedGraph;
  frame: Frame;
  focus: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  className: string;
  narrow: boolean;
}) {
  const placed = useMemo(() => layout(graph, frame), [graph, frame]);
  const neighbours = useMemo(() => {
    if (!focus) {
      return null;
    }
    const set = new Set([focus]);
    for (const e of graph.edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  }, [graph, focus]);
  const tiers = (Object.keys(frame.y) as Tier[]).filter((t) => Array.from(placed.values()).some((p) => p.tier === t));
  const fontLabel = narrow ? 12 : 15;

  return (
    <svg viewBox={`0 0 ${frame.w} ${frame.h}`} className={className} role="group" aria-label="Synthetic demonstration graph. Each node is a button.">
      {/* Strata: datum lines and their names. */}
      <g aria-hidden="true">
        {tiers.map((t) => (
          <g key={t}>
            <line x1={narrow ? 0 : 0} x2={frame.w} y1={frame.y[t]} y2={frame.y[t]} stroke="var(--hv2-faint)" strokeWidth="1" strokeDasharray={t === "sources" ? undefined : "2 6"} />
            <text
              x={0}
              y={narrow ? frame.y[t] - 44 : frame.y[t] - 10}
              fill="var(--tiro-text-muted)"
              style={{ fontFamily: "var(--font-code)", fontSize: narrow ? 10.5 : 12.5, letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              {TIER_LABEL[t]}
            </text>
          </g>
        ))}
      </g>

      <g aria-hidden="true">
        {graph.edges.map((e, i) => {
          const a = placed.get(e.from);
          const b = placed.get(e.to);
          if (!a || !b) return null;
          const { d, vertical } = edgePath(a, b);
          const def = EVIDENCE[e.evidence];
          const color = toneColor(def.tone);
          const dash = def.dash === "none" ? undefined : def.dash;
          const lit = focus !== null && (e.from === focus || e.to === focus);
          const dim = focus !== null && !lit;
          return (
            <g key={e.id} className="hv2-edge lt-on-reveal-fade" data-lit={lit} data-dim={dim} style={{ "--lt-delay": `${300 + i * 70}ms` } as React.CSSProperties}>
              {e.evidence === "contested" ? (
                <>
                  <path d={d} stroke={color} strokeWidth="1.25" strokeDasharray={dash} transform={vertical ? "translate(-2.2,0)" : "translate(0,-2.2)"} />
                  <path d={d} stroke={color} strokeWidth="1.25" strokeDasharray={dash} transform={vertical ? "translate(2.2,0)" : "translate(0,2.2)"} />
                </>
              ) : (
                <path d={d} stroke={color} strokeWidth={e.evidence === "recorded" || e.evidence === "attested" ? 1.5 : 1.25} strokeDasharray={dash} />
              )}
            </g>
          );
        })}
      </g>

      {Array.from(placed.values()).map((p, i) => {
        const active = focus === p.node.id || selected === p.node.id;
        const dim = neighbours !== null && !neighbours.has(p.node.id);
        const count = graph.edges.filter((e) => e.from === p.node.id || e.to === p.node.id).length;
        const below = p.tier !== "context";
        return (
          <g
            key={p.node.id}
            className="hv2-node lt-on-reveal-fade"
            data-dim={dim}
            transform={`translate(${p.x},${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={selected === p.node.id}
            aria-label={`${p.node.label}, ${KIND_LABEL[p.node.kind].toLowerCase()}, ${count} relationship${count === 1 ? "" : "s"}`}
            style={{ "--lt-delay": `${i * 50}ms` } as React.CSSProperties}
            onPointerEnter={() => onHover(p.node.id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(p.node.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(p.node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(p.node.id);
              }
            }}
          >
            <circle r="24" fill="transparent" />
            <circle className="hv2-node-focus" r="16" fill="none" stroke="var(--tiro-accent)" strokeWidth="2" />
            {selected === p.node.id ? <circle r="14" fill="none" stroke="var(--tiro-accent)" strokeWidth="1" strokeDasharray="2 3" /> : null}
            <NodeGlyph kind={p.node.kind} active={active} />
            <text
              y={below ? 30 : -20}
              textAnchor="middle"
              fill={active ? "var(--tiro-text)" : "var(--tiro-text-soft)"}
              style={{ fontFamily: "var(--font-body)", fontSize: fontLabel }}
            >
              {p.node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RelationRow({ edge, other, from }: { edge: GraphEdge; other: string; from: boolean }) {
  const [open, setOpen] = useState(false);
  const withheld = edge.accounts.filter((a) => a.state === "withheld").length;
  const attributed = edge.accounts.filter((a) => a.state === "attributed");
  return (
    <li className="border-t border-[var(--tiro-border)]">
      <button type="button" className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-[var(--tiro-surface)]" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="pt-1.5">
          <EvidenceStroke evidence={edge.evidence} width={22} />
        </span>
        <span className="min-w-0 flex-1 text-sm text-[var(--tiro-text-soft)]">
          {from ? edge.relation : other} <span className="text-[var(--tiro-text-muted)]">·</span> {from ? other : edge.relation}
          <span className="block text-xs text-[var(--tiro-text-muted)]">{EVIDENCE[edge.evidence].label}</span>
        </span>
        <span aria-hidden="true" className="pt-0.5 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="hv2-panel-enter pb-3 pl-[34px] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          <p>{edge.summary}</p>
          {attributed.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {attributed.map((a) =>
                a.state === "attributed" ? (
                  <li key={a.id}>
                    <span className="text-[var(--tiro-text-soft)]">{a.position}</span> <span className="text-xs">({a.assertedBy})</span>
                  </li>
                ) : null,
              )}
            </ul>
          ) : (
            <p className="mt-2 text-xs">No account asserts this. It is an open question.</p>
          )}
          {withheld > 0 ? (
            <p className="mt-2 text-xs">
              {withheld} further account{withheld === 1 ? " is" : "s are"} acknowledged but withheld by {withheld === 1 ? "its" : "their"} rights authority.
            </p>
          ) : null}
          <p className="mt-2 text-xs">Recorded by: {edge.recordedBy}</p>
        </div>
      ) : null}
    </li>
  );
}

export default function SourceGraph({ graph, inspectHref }: { graph: ProjectedGraph; inspectHref: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const focus = hover ?? selected;
  const shown = focus ? graph.nodes.find((n) => n.id === focus) ?? null : null;
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const relations = shown ? graph.edges.filter((e) => e.from === shown.id || e.to === shown.id) : [];
  const select = (id: string) => setSelected((s) => (s === id ? null : id));

  return (
    <div className="hv2-graph grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10" style={{ "--hv2-node-bg": "var(--tiro-bg-deep)" } as React.CSSProperties}>
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2 border border-[var(--tiro-accent)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.14em] text-[var(--tiro-accent)]">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-[var(--tiro-accent)]" />
            Synthetic demonstration
          </span>
          <span className="text-xs text-[var(--tiro-text-muted)]">Illustrative relationships, not archival records.</span>
        </div>
        <Drawing graph={graph} frame={WIDE} focus={focus} selected={selected} onHover={setHover} onSelect={select} className="hv2-graph-drawing hidden md:block" narrow={false} />
        <Drawing graph={graph} frame={NARROW} focus={focus} selected={selected} onHover={setHover} onSelect={select} className="hv2-graph-drawing block md:hidden" narrow />
        <ul aria-label="Line key" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--tiro-border)] pt-4">
          {EVIDENCE_ORDER.map((state) => (
            <li key={state} className="flex items-center gap-2">
              <EvidenceStroke evidence={state} width={22} />
              <span className="lt-label !tracking-[0.12em]">{EVIDENCE[state].label}</span>
            </li>
          ))}
        </ul>
      </div>

      <aside aria-label="Inspector" className="min-w-0 border-t border-[var(--tiro-border-strong)] pt-5 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
        <div aria-live="polite">
          {shown ? (
            <div key={shown.id} className="hv2-panel-enter">
              <p className="lt-label text-[var(--tiro-accent)]">
                {KIND_LABEL[shown.kind]} · synthetic
                {selected === shown.id ? " · pinned" : ""}
              </p>
              <h3 className="lt-display mt-2 text-3xl">{shown.label}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{KIND_NOTE[shown.kind]}</p>
              <p className="lt-label mb-1 mt-6">
                {relations.length} relationship{relations.length === 1 ? "" : "s"}
              </p>
              <ul className="border-b border-[var(--tiro-border)]">
                {relations.map((e) => (
                  <RelationRow key={e.id} edge={e} from={e.from === shown.id} other={label(e.from === shown.id ? e.to : e.from)} />
                ))}
              </ul>
              {shown.href ? (
                <Link href={shown.href} className="tiro-link mt-5 inline-block text-sm !text-[var(--tiro-text)]">
                  Open {shown.label}&apos;s specimen
                </Link>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="lt-label text-[var(--tiro-accent)]">Inspector</p>
              <h3 className="lt-display mt-2 text-3xl">Choose a node.</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                Hover or focus to preview its relationships; select to pin them here. Start with Record A: one account, a translation, a
                reading, and a disagreement with Record B.
              </p>
              <button type="button" className="tiro-button mt-5 !px-4 !py-2 !text-[11px]" onClick={() => setSelected(graph.nodes.find((n) => n.id === "rec-a")?.id ?? graph.nodes[0]?.id ?? null)}>
                Inspect Record A
              </button>
            </div>
          )}
        </div>
        <Link href={inspectHref} className="tiro-link mt-8 inline-block text-sm">
          Trace every account to its source in the full demonstration
        </Link>
      </aside>

      <details className="xl:col-span-2">
        <summary className="lt-label cursor-pointer py-2 hover:text-[var(--tiro-text)]">All {graph.edges.length} relationships as text</summary>
        <ul className="mt-2 grid border-b border-[var(--tiro-border)] md:grid-cols-2 md:gap-x-8">
          {graph.edges.map((e) => (
            <li key={e.id} className="flex items-start gap-3 border-t border-[var(--tiro-border)] py-2.5">
              <span className="pt-1.5">
                <EvidenceStroke evidence={e.evidence} width={22} />
              </span>
              <span className="min-w-0 text-sm text-[var(--tiro-text-soft)]">
                {label(e.from)} <span className="text-[var(--tiro-text-muted)]">→</span> {label(e.to)}
                <span className="block text-xs text-[var(--tiro-text-muted)]">
                  {e.relation} · {EVIDENCE[e.evidence].label}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
