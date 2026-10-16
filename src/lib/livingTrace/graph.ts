// Pure relationship-graph types and traversal, safe for client components.
// Holds no data: graphs arrive here already projected by projection.ts.
import type { EvidenceState } from "./evidence";

export type GraphNodeKind = "origin" | "record" | "place" | "language" | "context";

export type GraphNode = { id: string; kind: GraphNodeKind; label: string; href: string | null };

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: EvidenceState;
  basis: string;
  assertedBy: string;
};

export type ProjectedGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

// The path back to the origin for any edge: the chain of visible edges
// leading from an origin node to this edge's target. Returns edge ids in
// order (origin first). An edge with no visible path back yields just
// itself, and the inspector says the chain is incomplete.
export function sourceChain(graph: ProjectedGraph, edgeId: string): { chain: string[]; reachesOrigin: boolean } {
  const target = graph.edges.find((e) => e.id === edgeId);
  if (!target) {
    return { chain: [], reachesOrigin: false };
  }
  const origins = new Set(graph.nodes.filter((n) => n.kind === "origin").map((n) => n.id));
  // Breadth-first backwards from the edge's source node.
  const incoming = new Map<string, typeof graph.edges>();
  for (const e of graph.edges) {
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
  }
  type Step = { node: string; path: string[] };
  const queue: Step[] = [{ node: target.from, path: [target.id] }];
  const seen = new Set<string>([target.from]);
  while (queue.length > 0) {
    const step = queue.shift()!;
    if (origins.has(step.node)) {
      return { chain: step.path, reachesOrigin: true };
    }
    for (const e of incoming.get(step.node) ?? []) {
      if (!seen.has(e.from)) {
        seen.add(e.from);
        queue.push({ node: e.from, path: [e.id, ...step.path] });
      }
    }
  }
  return { chain: [target.id], reachesOrigin: false };
}
