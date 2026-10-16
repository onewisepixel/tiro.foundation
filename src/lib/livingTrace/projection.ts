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
//
// SCOPE: this is a static demonstration of disclosure rules over a fixed,
// synthetic, build-time dataset. It is NOT an authorization implementation
// for mutable production records: it evaluates no current permission
// state, no audience, no revocation, and its output is baked into static
// pages. Integrating with the live archive needs per-request permission
// checks against current state and cache/CDN invalidation on any change
// (see docs/design/living-trace.md, "Production integration").
import "server-only";
import {
  INTERNAL_EDGES,
  INTERNAL_NODES,
  INTERNAL_RECORDS,
  type InternalAccount,
  type InternalRecord,
} from "../../data/livingTrace/syntheticArchive";
import type { EvidenceState, UseCategory, UseGrant } from "./evidence";
import type { GraphAccount, GraphEdge, GraphNode, ProjectedGraph } from "./graph";

export type { GraphEdge, GraphNode, ProjectedGraph } from "./graph";

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

// The relationship graph a visitor may see.
//
// Nodes: a node backed by a record is kept only when that record is
// PUBLIC; any other node only while a visible relationship touches it. A relationship to a restricted record is itself metadata about
// it, so even a record with an authorized notice is not a graph node.
//
// Accounts are authorized one by one. The disclosure unit is the CLAIM,
// not the record (docs/design/decisions.md):
//   held in a public record   -> attributed (position, claimant, anchor)
//   held in a restricted record with a public notice, AND the claim's own
//   grant covers both existence and association with this relationship
//                             -> "withheld" (that it exists, nothing more)
//   anything else             -> omitted, leaving no trace (default deny)
// A record's public notice authorizes nothing about its claims.
//
// An edge is kept only when both ends are visible AND its ATTRIBUTED
// accounts alone support its evidence state. Withheld accounts never count:
// a relationship that is "contested" only because of a withheld claim would
// reveal that claim's position, so it is withheld whole.
type AccountVisibility = "attributed" | "withheld" | "omitted";

function accountVisibility(inNode: string | null, grant: InternalAccount["disclosure"]): AccountVisibility {
  if (inNode === null) {
    return "attributed";
  }
  const node = INTERNAL_NODES.find((n) => n.id === inNode);
  if (!node) {
    return "omitted";
  }
  if (node.kind !== "record") {
    return "attributed";
  }
  const resolved = node.recordId ? resolveRecord(node.recordId) : null;
  if (resolved?.state === "public") {
    return "attributed";
  }
  if (resolved?.state === "restricted-notice" && grant?.existence === true && grant.association === true) {
    return "withheld";
  }
  return "omitted";
}

// Judged on attributed accounts only; withheld accounts never count.
function supportsEvidence(edge: (typeof INTERNAL_EDGES)[number], accounts: GraphAccount[]): boolean {
  const attributed = accounts.filter((a) => a.state === "attributed").length;
  switch (edge.evidence) {
    case "unknown":
      // An open question has no claimants; acknowledging a withheld one
      // would say someone made the claim.
      return accounts.length === 0;
    case "contested":
      return attributed >= 2;
    default:
      return attributed >= 1;
  }
}

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
  const edges: GraphEdge[] = [];
  for (const e of INTERNAL_EDGES) {
    if (!kept.has(e.from) || !kept.has(e.to)) {
      continue;
    }
    const accounts: GraphAccount[] = [];
    let withheld = 0;
    for (const a of e.accounts) {
      const visibility = accountVisibility(a.inNode, a.disclosure);
      if (visibility === "attributed") {
        accounts.push({
          state: "attributed",
          id: a.id,
          position: a.position,
          assertedBy: a.assertedBy,
          kind: a.kind,
          evidence: a.evidence,
          anchor: a.inNode !== null && kept.has(a.inNode) ? a.inNode : null,
        });
      } else if (visibility === "withheld") {
        withheld += 1;
        // Opaque, positional id: never derived from the internal account
        // id, which could name the restricted record.
        accounts.push({ state: "withheld", id: `${e.id}:withheld-${withheld}` });
      }
    }
    if (!supportsEvidence(e, accounts)) {
      continue;
    }
    edges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      relation: e.relation,
      evidence: e.evidence,
      summary: e.summary,
      recordedBy: e.recordedBy,
      provenance: e.provenance === true,
      accounts,
    });
  }
  // A source, place, language, or other non-record node exists in the
  // graph only through its relationships. Once none is visible, keeping
  // it would disclose that something hidden stands behind it (an origin
  // whose only record is restricted still names a source). Public records
  // may stand alone.
  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));
  return { nodes: nodes.filter((n) => n.kind === "record" || touched.has(n.id)), edges };
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
