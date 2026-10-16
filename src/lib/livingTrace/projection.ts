// The Boundary, enforced in data rather than CSS.
//
// The only path from the synthetic archive to a page. Every function
// builds its output field by field from an explicit allow-list — never by
// spreading an internal object — so a field added to the archive later is
// withheld until someone deliberately projects it.
//
// Mirrors the backend's public-view doctrine (backend/src/services/
// publicView.ts): a record a visitor may not discover and a record that
// does not exist are indistinguishable. resolveRecord() returns null for
// both; the route turns both into the same 404.
import {
  INTERNAL_EDGES,
  INTERNAL_NODES,
  INTERNAL_RECORDS,
  type InternalRecord,
} from "../../data/livingTrace/syntheticArchive";
import type { EvidenceState, UseCategory, UseGrant } from "./evidence";
import type { GraphEdge, GraphNode, ProjectedGraph } from "./graph";

export { sourceChain, type GraphEdge, type GraphNode, type ProjectedGraph } from "./graph";

export type SpecimenRecord = {
  recordId: string;
  recordKind: "demo";
  synthetic: true;
  title: string;
  summary: string;
  source: { label: string; note: string };
  capacities: { capacity: string; value: string; evidence: EvidenceState }[];
  context: { field: string; value: string; evidence: EvidenceState; note?: string }[];
  publicationStatus: string;
  custodyStatus: string;
  uses: Record<UseCategory, UseGrant>;
  withdrawal: string;
  provenance: { at: string; event: string; actor: string; evidence: EvidenceState }[];
  media: { kind: "none"; note: string };
  transcript: { note: string };
  aiProcessing: string;
};

export type RestrictedNotice = {
  reference: string;
  notice: string;
  mayContact: boolean;
};

export type ResolvedRecord =
  | { state: "public"; record: SpecimenRecord }
  | { state: "restricted-notice"; notice: RestrictedNotice };

export type ListingEntry =
  | { state: "public"; recordId: string; title: string }
  | { state: "restricted-notice"; reference: string };


export const SPECIMEN_ROUTE = "/living-trace/records";

function projectSpecimen(record: InternalRecord): SpecimenRecord {
  return {
    recordId: record.id,
    recordKind: "demo",
    synthetic: true,
    title: record.title,
    summary: record.summary,
    source: { label: record.source.label, note: record.source.note },
    capacities: record.capacities.map((c) => ({ capacity: c.capacity, value: c.value, evidence: c.evidence })),
    context: record.context.map((c) => ({
      field: c.field,
      value: c.value.value,
      evidence: c.value.evidence,
      ...(c.value.note ? { note: c.value.note } : {}),
    })),
    publicationStatus: record.publicationStatus,
    custodyStatus: record.custodyStatus,
    uses: { ...record.uses },
    withdrawal: record.withdrawal,
    provenance: record.provenance.map((p) => ({ at: p.at, event: p.event, actor: p.actor, evidence: p.evidence })),
    media: { kind: record.media.kind, note: record.media.note },
    transcript: { note: record.transcript.note },
    aiProcessing: record.aiProcessing,
  };
}

function projectNotice(record: InternalRecord): RestrictedNotice | null {
  const disclosure = record.authorizedDisclosure;
  if (!disclosure) {
    // Restricted without an authorized notice is treated exactly like
    // undiscoverable: absence of authorization is not authorization.
    return null;
  }
  return { reference: disclosure.reference, notice: disclosure.notice, mayContact: disclosure.mayContact };
}

export function resolveRecord(id: string): ResolvedRecord | null {
  const record = INTERNAL_RECORDS.find((r) => r.id === id);
  if (!record) {
    return null;
  }
  if (record.visibility === "public") {
    return { state: "public", record: projectSpecimen(record) };
  }
  if (record.visibility === "restricted-notice") {
    const notice = projectNotice(record);
    return notice ? { state: "restricted-notice", notice } : null;
  }
  return null;
}

// Discoverable entries only. There is deliberately no "total" or
// "withheld" count anywhere in this module: reporting how many records are
// hidden would itself disclose that they exist.
export function listDiscoverable(): ListingEntry[] {
  const entries: ListingEntry[] = [];
  for (const record of INTERNAL_RECORDS) {
    const resolved = resolveRecord(record.id);
    if (!resolved) {
      continue;
    }
    entries.push(
      resolved.state === "public"
        ? { state: "public", recordId: resolved.record.recordId, title: resolved.record.title }
        : { state: "restricted-notice", reference: resolved.notice.reference },
    );
  }
  return entries;
}

// Route ids a static build may generate. Undiscoverable ids are absent,
// so with dynamicParams = false they 404 exactly like an id that never
// existed.
export function discoverableRouteIds(): string[] {
  return listDiscoverable().map((entry) => (entry.state === "public" ? entry.recordId : entry.reference));
}

// The relationship graph a visitor may see. A node backed by a record is
// kept only when that record is PUBLIC — a relationship to a restricted
// record is itself metadata about that record, so even a record with an
// authorized notice does not appear as a graph node. Edges are kept only
// when both ends survive.
export function projectGraph(): ProjectedGraph {
  const nodes: GraphNode[] = [];
  for (const node of INTERNAL_NODES) {
    if (node.kind === "record") {
      const resolved = node.recordId ? resolveRecord(node.recordId) : null;
      if (!resolved || resolved.state !== "public") {
        continue;
      }
      nodes.push({ id: node.id, kind: node.kind, label: node.label, href: `${SPECIMEN_ROUTE}/${resolved.record.recordId}` });
    } else {
      nodes.push({ id: node.id, kind: node.kind, label: node.label, href: null });
    }
  }
  const kept = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = INTERNAL_EDGES.filter((e) => kept.has(e.from) && kept.has(e.to)).map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    relation: e.relation,
    evidence: e.evidence,
    basis: e.basis,
    assertedBy: e.assertedBy,
  }));
  return { nodes, edges };
}

// The visible relationships touching one public record, phrased from that
// record's point of view (for the Record view's "Related" section).
export function relationsFor(graph: ProjectedGraph, recordId: string) {
  const node = graph.nodes.find((n) => n.kind === "record" && n.href === `${SPECIMEN_ROUTE}/${recordId}`);
  if (!node) {
    return [];
  }
  return graph.edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((edge) => {
      const outgoing = edge.from === node.id;
      const other = graph.nodes.find((n) => n.id === (outgoing ? edge.to : edge.from))!;
      return { edge, otherLabel: other.label, otherHref: other.href, outgoing };
    });
}
