// Pure relationship-graph types and traversal, safe for client components.
// Holds no data: graphs arrive here already projected by projection.ts.
//
// A relationship is not a fact; it is a set of ACCOUNTS. Each account was
// made by someone (assertedBy), lives in some record (anchor), and that
// record has its own path back to an origin. A contested relationship
// therefore has several independent provenance chains, one per account,
// and they are never merged into a single lineage. Who made each claim is
// kept separate from who recorded or interpreted the relationship
// (recordedBy).
//
// Provenance is traced ONLY along edges that are themselves source links
// (provenance: true, e.g. "source of the account", "translated from").
// Ordinary connectivity, such as two records describing the same place or
// a curator's interpretation, is never treated as a path to a source.
import type { EvidenceState } from "./evidence";

export type GraphNodeKind = "origin" | "record" | "derivative" | "interpretation" | "place" | "language" | "event";

export type GraphNode = { id: string; kind: GraphNodeKind; label: string; href: string | null };

export type GraphAccount =
  | {
      state: "attributed";
      id: string;
      // What this account says about the relationship, in neutral terms.
      position: string;
      // Who made the claim.
      assertedBy: string;
      // "source": grounded in a record's own account. "interpretation":
      // TIRO's or another named party's reading, which is not testimony.
      kind: "source" | "interpretation";
      evidence: EvidenceState;
      // Graph node holding the account (a record, derivative, or origin);
      // null when no source for the claim is on record.
      anchor: string | null;
    }
  // An account from a restricted source whose rights authority permits
  // acknowledging that it exists, and nothing more: no position, no
  // claimant, no anchor, no reference.
  | { state: "withheld"; id: string };

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: EvidenceState;
  summary: string;
  // Who recorded or interpreted this relationship, as distinct from who
  // made the claims in it.
  recordedBy: string;
  // True for a source link: the edge says where a record came from.
  provenance: boolean;
  accounts: GraphAccount[];
};

export type ProjectedGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type AccountTrace =
  // A chain of provenance edges (origin first) ending at the account's
  // anchor. An empty chain means the anchor is itself the origin.
  | { accountId: string; state: "traced"; origin: string; chain: string[] }
  // The anchor is on record but no provenance path reaches an origin.
  | { accountId: string; state: "incomplete"; chain: string[] }
  // No source is on record for this claim.
  | { accountId: string; state: "no-source" }
  // An interpretation: it has no testimonial source chain of its own.
  | { accountId: string; state: "interpretation" }
  | { accountId: string; state: "withheld" };

export type EdgeProvenance = {
  traces: AccountTrace[];
  // Distinct origins reached by attributed source accounts.
  origins: string[];
  // For a relationship with several source accounts: whether each comes
  // from a different origin. Accounts that share an origin are not
  // independent corroboration, however many there are.
  independent: boolean | null;
};

function incomingProvenance(graph: ProjectedGraph): Map<string, GraphEdge[]> {
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (e.provenance) {
      incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
    }
  }
  return incoming;
}

// Walks back from one anchor node along provenance edges only. Every
// origin reachable is returned with its own chain (origin first); a node
// with two independent sources yields two chains.
export function chainsToOrigins(graph: ProjectedGraph, anchor: string): { origin: string; chain: string[] }[] {
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  if (!kinds.has(anchor)) {
    return [];
  }
  if (kinds.get(anchor) === "origin") {
    return [{ origin: anchor, chain: [] }];
  }
  const incoming = incomingProvenance(graph);
  const found: { origin: string; chain: string[] }[] = [];
  const walk = (node: string, path: string[], seen: Set<string>) => {
    for (const e of incoming.get(node) ?? []) {
      if (seen.has(e.from)) {
        continue;
      }
      const next = [e.id, ...path];
      if (kinds.get(e.from) === "origin") {
        found.push({ origin: e.from, chain: next });
      } else {
        walk(e.from, next, new Set([...seen, e.from]));
      }
    }
  };
  walk(anchor, [], new Set([anchor]));
  return found;
}

function partialChain(graph: ProjectedGraph, anchor: string): string[] {
  const incoming = incomingProvenance(graph);
  const chain: string[] = [];
  let node = anchor;
  const seen = new Set([anchor]);
  for (;;) {
    const e = (incoming.get(node) ?? [])[0];
    if (!e || seen.has(e.from)) {
      return chain;
    }
    chain.unshift(e.id);
    seen.add(e.from);
    node = e.from;
  }
}

export function edgeProvenance(graph: ProjectedGraph, edgeId: string): EdgeProvenance {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { traces: [], origins: [], independent: null };
  }
  const traces: AccountTrace[] = [];
  for (const account of edge.accounts) {
    if (account.state === "withheld") {
      traces.push({ accountId: account.id, state: "withheld" });
    } else if (account.kind === "interpretation") {
      traces.push({ accountId: account.id, state: "interpretation" });
    } else if (account.anchor === null) {
      traces.push({ accountId: account.id, state: "no-source" });
    } else {
      const chains = chainsToOrigins(graph, account.anchor);
      if (chains.length === 0) {
        traces.push({ accountId: account.id, state: "incomplete", chain: partialChain(graph, account.anchor) });
      } else {
        for (const c of chains) {
          traces.push({ accountId: account.id, state: "traced", origin: c.origin, chain: c.chain });
        }
      }
    }
  }
  const sourceAccounts = edge.accounts.filter((a) => a.state === "attributed" && a.kind === "source");
  const originsByAccount = sourceAccounts.map((a) =>
    traces.flatMap((t) => (t.accountId === a.id && t.state === "traced" ? [t.origin] : [])),
  );
  const origins = [...new Set(originsByAccount.flat())];
  let independent: boolean | null = null;
  if (sourceAccounts.length > 1) {
    const allTraced = originsByAccount.every((o) => o.length > 0);
    const shared = originsByAccount.some((a, i) => originsByAccount.some((b, j) => i !== j && a.some((o) => b.includes(o))));
    independent = allTraced ? !shared : null;
  }
  return { traces, origins, independent };
}

// Every edge id and node id that lies on any of an edge's account chains,
// for highlighting. The edge itself is included.
export function provenanceFootprint(graph: ProjectedGraph, edgeId: string): { edges: Set<string>; nodes: Set<string> } {
  const edge = graph.edges.find((e) => e.id === edgeId);
  const edges = new Set<string>();
  const nodes = new Set<string>();
  if (!edge) {
    return { edges, nodes };
  }
  edges.add(edge.id);
  nodes.add(edge.from);
  nodes.add(edge.to);
  for (const trace of edgeProvenance(graph, edgeId).traces) {
    if (trace.state === "traced" || trace.state === "incomplete") {
      for (const id of trace.chain) {
        const hop = graph.edges.find((e) => e.id === id);
        if (hop) {
          edges.add(hop.id);
          nodes.add(hop.from);
          nodes.add(hop.to);
        }
      }
    }
  }
  return { edges, nodes };
}
