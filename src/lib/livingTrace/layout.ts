// Deterministic layout for the Discover constellation. Pure and data-free,
// so it is safe for client components and stable between server and
// client renders.
//
// The composition is the argument: it reads from origin outward.
//   column 0  origins: the human sources
//   column 1  records: accounts held in custody
//   column 2  derived and interpreted: translations, curatorial readings
//   column 3  shared context: places, languages, events
// Order within a column follows the records each node touches
// (barycentric), so a source sits beside its record and shared context
// sits between the records that share it. Any number of nodes lays out
// without hand-placed coordinates.
import type { GraphNode, GraphNodeKind, ProjectedGraph } from "./graph";

export const COLUMNS: { key: string; label: string; kinds: GraphNodeKind[] }[] = [
  { key: "origins", label: "Origins", kinds: ["origin"] },
  { key: "records", label: "Records", kinds: ["record"] },
  { key: "derived", label: "Derived and interpreted", kinds: ["derivative", "interpretation"] },
  { key: "context", label: "Places, languages, events", kinds: ["event", "place", "language"] },
];

export type Point = { x: number; y: number };

export type Layout = {
  width: number;
  height: number;
  orientation: "wide" | "narrow";
  at: Record<string, Point>;
  // Column (wide) or row (narrow) guide positions, for headers and rules.
  bands: { key: string; label: string; pos: number }[];
};

function columnOf(kind: GraphNodeKind): number {
  return COLUMNS.findIndex((c) => c.kinds.includes(kind));
}

// Order nodes in each column. Records keep input order; every other node
// is placed by the mean position of the records it touches.
function orderColumns(graph: ProjectedGraph): GraphNode[][] {
  const columns: GraphNode[][] = COLUMNS.map(() => []);
  for (const node of graph.nodes) {
    columns[columnOf(node.kind)].push(node);
  }
  const recordRank = new Map(columns[1].map((n, i) => [n.id, i]));
  const neighbors = (id: string) =>
    graph.edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));
  const rankOf = (node: GraphNode, fallback: number): number => {
    const ranks = neighbors(node.id)
      .map((n) => recordRank.get(n))
      .filter((r): r is number => r !== undefined);
    if (ranks.length === 0) {
      // Reached only through non-records (e.g. a translation's own edges):
      // fall back to its neighbors' neighbors.
      const second = neighbors(node.id)
        .flatMap(neighbors)
        .map((n) => recordRank.get(n))
        .filter((r): r is number => r !== undefined);
      return second.length ? second.reduce((a, b) => a + b, 0) / second.length : fallback;
    }
    return ranks.reduce((a, b) => a + b, 0) / ranks.length;
  };
  return columns.map((col, c) => {
    if (c === 1) {
      return col;
    }
    return col
      .map((node, i) => ({ node, rank: rankOf(node, i), i }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.node);
  });
}

// Spread positions along one axis: start at each node's ideal position
// (its rank scaled to the record spacing), then push apart to a minimum gap
// and re-center, so nothing overlaps and the column stays balanced.
function spread(ideals: number[], gap: number, span: number): number[] {
  const out = ideals.slice();
  for (let i = 1; i < out.length; i++) {
    out[i] = Math.max(out[i], out[i - 1] + gap);
  }
  const overflow = out.length ? out[out.length - 1] - span : 0;
  if (overflow > 0) {
    for (let i = out.length - 1; i >= 0; i--) {
      out[i] -= overflow;
      if (i > 0) {
        out[i - 1] = Math.min(out[i - 1], out[i] - gap);
      }
    }
  }
  const min = out.length ? Math.min(0, out[0]) : 0;
  return out.map((v) => v - min);
}

export function layoutGraph(graph: ProjectedGraph, orientation: "wide" | "narrow"): Layout {
  const columns = orderColumns(graph);
  const records = Math.max(columns[1].length, 1);
  const largest = Math.max(...columns.map((c) => c.length), 1);
  const wide = orientation === "wide";

  // Along the flow (columns): fixed bands. Across it: record spacing.
  const flow = wide ? [170, 470, 770, 1010] : [70, 210, 360, 520];
  const step = wide ? 168 : 108;
  const pad = wide ? 70 : 44;
  const across = Math.max(records, largest) * step;
  const recordPos = (r: number) => pad + ((r + 0.5) * across) / records;

  const recordIndex = new Map(columns[1].map((n, i) => [n.id, i]));
  const neighbors = (id: string) => graph.edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));

  const at: Record<string, Point> = {};
  columns.forEach((col, c) => {
    const ideals = col.map((node, i) => {
      if (c === 1) {
        return recordPos(i);
      }
      const ranks = neighbors(node.id)
        .map((n) => recordIndex.get(n))
        .filter((r): r is number => r !== undefined);
      if (ranks.length) {
        return recordPos(ranks.reduce((a, b) => a + b, 0) / ranks.length);
      }
      const placed = neighbors(node.id)
        .map((n) => at[n])
        .filter(Boolean)
        .map((p) => (wide ? p.y : p.x));
      return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : pad + ((i + 0.5) * across) / col.length;
    });
    const positions = spread(
      ideals.map((v) => v - pad),
      wide ? 92 : 104,
      across,
    ).map((v) => v + pad);
    col.forEach((node, i) => {
      // Narrow: a stagger lets neighbouring labels share a row.
      const stagger = !wide && col.length > 1 && i % 2 === 1 ? 38 : 0;
      at[node.id] = wide ? { x: flow[c], y: positions[i] } : { x: positions[i], y: flow[c] + stagger };
    });
  });

  const extent = across + pad * 2;
  return {
    width: wide ? 1200 : extent,
    height: wide ? extent : 600,
    orientation,
    at,
    bands: COLUMNS.map((col, c) => ({ key: col.key, label: col.label, pos: flow[c] })),
  };
}

// A trace between two points, curved along the direction of flow. Two
// nodes in the same band are joined by an arc that bows out of the band,
// so a relationship between peers never runs through other nodes.
export function tracePath(a: Point, b: Point, orientation: "wide" | "narrow", offset = 0): string {
  const wide = orientation === "wide";
  const sameBand = wide ? Math.abs(a.x - b.x) < 1 : Math.abs(a.y - b.y) < 40;
  if (sameBand) {
    const span = wide ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    const bow = 56 + span * 0.22 + offset;
    return wide
      ? `M ${a.x + offset * 0.2} ${a.y} C ${a.x + bow} ${a.y}, ${b.x + bow} ${b.y}, ${b.x + offset * 0.2} ${b.y}`
      : `M ${a.x} ${a.y} C ${a.x} ${a.y + bow}, ${b.x} ${b.y + bow}, ${b.x} ${b.y}`;
  }
  if (wide) {
    const mid = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y + offset} C ${mid} ${a.y + offset}, ${mid} ${b.y + offset}, ${b.x} ${b.y + offset}`;
  }
  const mid = (a.y + b.y) / 2;
  return `M ${a.x + offset} ${a.y} C ${a.x + offset} ${mid}, ${b.x + offset} ${mid}, ${b.x + offset} ${b.y}`;
}

// Midpoint of tracePath's curve, for the selected relationship's label.
export function traceMidpoint(a: Point, b: Point, orientation: "wide" | "narrow"): Point {
  const wide = orientation === "wide";
  const sameBand = wide ? Math.abs(a.x - b.x) < 1 : Math.abs(a.y - b.y) < 40;
  if (sameBand) {
    const span = wide ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    const bow = (56 + span * 0.22) * 0.75;
    return wide ? { x: a.x + bow, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y + bow };
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
