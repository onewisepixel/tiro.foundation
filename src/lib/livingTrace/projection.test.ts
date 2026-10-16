import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { discoverableRouteIds, listDiscoverable, projectGraph, relationsFor, resolveRecord } from "./projection";
import { chainsToOrigins, edgeProvenance, provenanceFootprint, type GraphEdge, type ProjectedGraph } from "./graph";
import { INTERNAL_RECORDS } from "../../data/livingTrace/syntheticArchive";

// Every canary planted in the internal archive. If any of these appears in
// any projection, the boundary has leaked.
const CANARY = /CANARY/;

function everyProjection(): unknown[] {
  const graph = projectGraph();
  return [
    ...INTERNAL_RECORDS.map((r) => resolveRecord(r.id)),
    listDiscoverable(),
    discoverableRouteIds(),
    graph,
    ...graph.edges.map((e) => edgeProvenance(graph, e.id)),
    ...INTERNAL_RECORDS.map((r) => relationsFor(graph, r.id)),
  ];
}

function withRecord<T>(id: string, mutate: (r: (typeof INTERNAL_RECORDS)[number]) => void, run: () => T): T {
  const record = INTERNAL_RECORDS.find((r) => r.id === id)!;
  const saved = structuredClone(record);
  try {
    mutate(record);
    return run();
  } finally {
    Object.assign(record, saved);
    if (!("authorizedDisclosure" in saved)) {
      delete record.authorizedDisclosure;
    }
  }
}

const edgeOf = (graph: ProjectedGraph, id: string) => graph.edges.find((e) => e.id === id);

// ---------------------------------------------------------------------
// Disclosure boundary
// ---------------------------------------------------------------------

test("no projection carries any internal-only or restricted string", () => {
  for (const projection of everyProjection()) {
    assert.doesNotMatch(JSON.stringify(projection) ?? "", CANARY);
  }
});

test("undiscoverable and nonexistent records resolve identically", () => {
  assert.equal(resolveRecord("DEMO-LT-0003"), null);
  assert.equal(resolveRecord("DEMO-LT-9999"), null);
  assert.equal(resolveRecord(""), null);
});

test("undiscoverable record has no route, listing entry, graph node, or account", () => {
  const everything = JSON.stringify(everyProjection());
  assert.ok(!discoverableRouteIds().includes("DEMO-LT-0003"));
  assert.ok(!everything.includes("DEMO-LT-0003"));
  assert.ok(!everything.includes("rec-u"));
});

test("restricted record projects only its authorized notice fields", () => {
  const resolved = resolveRecord("DEMO-LT-0002");
  assert.ok(resolved);
  assert.equal(resolved.state, "restricted-notice");
  assert.deepEqual(Object.keys(resolved).sort(), ["notice", "state"]);
  if (resolved.state === "restricted-notice") {
    // The acknowledgement flag decides behavior; it is not itself disclosed.
    assert.deepEqual(Object.keys(resolved.notice).sort(), ["mayContact", "notice", "reference"]);
  }
});

test("a restricted record never appears as a graph node, even with a notice", () => {
  const graph = projectGraph();
  assert.ok(!JSON.stringify(graph).includes("DEMO-LT-0002"));
  assert.ok(!graph.nodes.some((n) => n.id === "rec-r"));
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.some((n) => n.id === edge.from));
    assert.ok(graph.nodes.some((n) => n.id === edge.to));
  }
});

test("listing exposes no count of withheld records", () => {
  const listing = listDiscoverable();
  assert.equal(listing.length, INTERNAL_RECORDS.filter((r) => r.visibility !== "undiscoverable").length);
  for (const entry of listing) {
    assert.ok(!("total" in entry) && !("withheld" in entry));
  }
});

test("a restricted record without an authorized notice is treated as undiscoverable", () => {
  withRecord(
    "DEMO-LT-0002",
    (r) => {
      r.authorizedDisclosure = undefined;
    },
    () => {
      assert.equal(resolveRecord("DEMO-LT-0002"), null);
      assert.ok(!discoverableRouteIds().includes("DEMO-LT-0002"));
      // ...and its account in a public relationship is no longer acknowledged.
      const place = edgeOf(projectGraph(), "e-a-place")!;
      assert.equal(place.accounts.length, 1);
      assert.ok(place.accounts.every((a) => a.state === "attributed"));
    },
  );
});

test("projection is an allow-list: a new internal field is withheld by default", () => {
  const record = INTERNAL_RECORDS.find((r) => r.id === "DEMO-LT-0001")! as unknown as Record<string, unknown>;
  record.futureSensitiveField = "CANARY-FUTURE-FIELD";
  try {
    for (const projection of everyProjection()) {
      assert.doesNotMatch(JSON.stringify(projection) ?? "", CANARY);
    }
  } finally {
    delete record.futureSensitiveField;
  }
});

// ---------------------------------------------------------------------
// Source-specific authorization inside relationships
// ---------------------------------------------------------------------

test("an account from a restricted source is acknowledged only as withheld, with an opaque id", () => {
  const place = edgeOf(projectGraph(), "e-a-place")!;
  assert.ok(place);
  const withheld = place.accounts.filter((a) => a.state === "withheld");
  assert.equal(withheld.length, 1);
  assert.deepEqual(Object.keys(withheld[0]).sort(), ["id", "state"]);
  // Never derived from the internal account id (which ends in ":r").
  assert.ok(!withheld[0].id.endsWith(":r"));
  assert.equal(edgeProvenance(projectGraph(), "e-a-place").traces.filter((t) => t.state === "withheld").length, 1);
});

test("an account from an undiscoverable source is omitted without a trace", () => {
  const lang = edgeOf(projectGraph(), "e-a-lang")!;
  assert.equal(lang.accounts.length, 1);
  assert.equal(lang.accounts[0].state, "attributed");
  assert.doesNotMatch(JSON.stringify(lang), /withheld|:u\b/);
});

test("a relationship whose evidence depends on an unauthorized account is withheld whole", () => {
  const graph = projectGraph();
  // Contested only via an undiscoverable account: showing it with one
  // account would misstate it; acknowledging the other would disclose it.
  assert.equal(edgeOf(graph, "x-b-place-contested"), undefined);
  assert.equal(edgeOf(graph, "x-a-r"), undefined);
  assert.equal(edgeOf(graph, "x-b-u"), undefined);
});

test("if a public source becomes restricted, its accounts stop being attributed", () => {
  withRecord(
    "DEMO-LT-0004",
    (r) => {
      r.visibility = "undiscoverable";
    },
    () => {
      const graph = projectGraph();
      assert.ok(!graph.nodes.some((n) => n.id === "rec-b"));
      // The contested relationship touched Record B, so it is gone, not
      // shown as a one-sided claim.
      assert.equal(edgeOf(graph, "c-ab-when"), undefined);
      assert.doesNotMatch(JSON.stringify(graph), /S-02/);
    },
  );
});

// ---------------------------------------------------------------------
// Provenance of contested and derived relationships
// ---------------------------------------------------------------------

test("a contested relationship keeps one independent chain per account", () => {
  const graph = projectGraph();
  const contested = edgeOf(graph, "c-ab-when")!;
  assert.equal(contested.evidence, "contested");
  assert.equal(contested.accounts.length, 2);

  const prov = edgeProvenance(graph, "c-ab-when");
  const traced = prov.traces.filter((t) => t.state === "traced");
  assert.equal(traced.length, 2);
  const origins = traced.map((t) => (t.state === "traced" ? t.origin : ""));
  assert.deepEqual(origins.sort(), ["origin-s01", "origin-s02"]);
  assert.equal(prov.independent, true);

  // The chains share no edge: neither account is routed through the other.
  const [first, second] = traced.map((t) => (t.state === "traced" ? t.chain : []));
  assert.ok(first.length > 0 && second.length > 0);
  assert.ok(!first.some((id) => second.includes(id)));
});

test("who made each claim is kept distinct from who recorded the disagreement", () => {
  const contested = edgeOf(projectGraph(), "c-ab-when")!;
  const claimants = contested.accounts.flatMap((a) => (a.state === "attributed" ? [a.assertedBy] : []));
  assert.equal(new Set(claimants).size, 2);
  for (const claimant of claimants) {
    assert.notEqual(contested.recordedBy, claimant);
  }
  assert.match(contested.recordedBy, /curator/i);
});

test("a derivative traces through its source record to the origin", () => {
  const graph = projectGraph();
  const prov = edgeProvenance(graph, "p-a-t");
  const trace = prov.traces[0];
  assert.equal(trace.state, "traced");
  if (trace.state === "traced") {
    assert.equal(trace.origin, "origin-s01");
    assert.deepEqual(trace.chain, ["p-s01-a", "p-a-t"]);
  }
});

test("an interpretation is never presented as having a testimonial source", () => {
  const prov = edgeProvenance(projectGraph(), "i-a-note");
  assert.deepEqual(
    prov.traces.map((t) => t.state),
    ["interpretation"],
  );
  assert.deepEqual(prov.origins, []);
});

test("an unknown relationship has no accounts and claims no provenance", () => {
  const graph = projectGraph();
  const unknown = edgeOf(graph, "u-c-place")!;
  assert.equal(unknown.evidence, "unknown");
  assert.deepEqual(unknown.accounts, []);
  assert.deepEqual(edgeProvenance(graph, "u-c-place").traces, []);
});

test("graph connectivity alone is never treated as provenance", () => {
  const graph = projectGraph();
  // Place, language, event, and the curatorial note are all connected to
  // records, but none has a source link, so none reaches an origin.
  for (const node of ["place-1", "lang-1", "event-1", "note-1"]) {
    assert.deepEqual(chainsToOrigins(graph, node), [], node);
  }
  // Record B is reachable from Record A through the contested edge, yet
  // its only origin is its own source.
  assert.deepEqual(
    chainsToOrigins(graph, "rec-b").map((c) => c.origin),
    ["origin-s02"],
  );
});

// Pure graph cases that the synthetic data does not contain.
function miniGraph(edges: Partial<GraphEdge>[], kinds: Record<string, "origin" | "record">): ProjectedGraph {
  return {
    nodes: Object.entries(kinds).map(([id, kind]) => ({ id, kind, label: id, href: null })),
    edges: edges.map((e, i) => ({
      id: e.id ?? `e${i}`,
      from: e.from!,
      to: e.to!,
      relation: "r",
      evidence: e.evidence ?? "attested",
      summary: "s",
      recordedBy: "x",
      provenance: e.provenance ?? false,
      accounts: e.accounts ?? [],
    })),
  };
}

test("accounts sharing an origin are reported as not independent", () => {
  const g = miniGraph(
    [
      { id: "s1", from: "o", to: "r1", provenance: true },
      { id: "s2", from: "o", to: "r2", provenance: true },
      {
        id: "c",
        from: "r1",
        to: "r2",
        evidence: "contested",
        accounts: [
          { state: "attributed", id: "a", position: "p", assertedBy: "A", kind: "source", evidence: "attested", anchor: "r1" },
          { state: "attributed", id: "b", position: "q", assertedBy: "B", kind: "source", evidence: "attested", anchor: "r2" },
        ],
      },
    ],
    { o: "origin", r1: "record", r2: "record" },
  );
  assert.equal(edgeProvenance(g, "c").independent, false);
});

test("missing provenance is reported as incomplete or no-source, never filled in", () => {
  const g = miniGraph(
    [
      {
        id: "c",
        from: "r1",
        to: "r2",
        accounts: [
          { state: "attributed", id: "a", position: "p", assertedBy: "A", kind: "source", evidence: "attested", anchor: "r1" },
          { state: "attributed", id: "b", position: "q", assertedBy: "B", kind: "source", evidence: "attested", anchor: null },
        ],
      },
    ],
    { r1: "record", r2: "record" },
  );
  const prov = edgeProvenance(g, "c");
  assert.deepEqual(
    prov.traces.map((t) => t.state),
    ["incomplete", "no-source"],
  );
  assert.equal(prov.independent, null);
});

test("every visible relationship has a type, a summary, a recorder, and resolvable accounts", () => {
  const graph = projectGraph();
  assert.ok(graph.edges.length > 0);
  for (const edge of graph.edges) {
    assert.ok(edge.relation.length > 0, `${edge.id} relation`);
    assert.ok(edge.summary.length > 0, `${edge.id} summary`);
    assert.ok(edge.recordedBy.length > 0, `${edge.id} recordedBy`);
    for (const trace of edgeProvenance(graph, edge.id).traces) {
      // In the synthetic dataset every source account resolves fully.
      assert.notEqual(trace.state, "incomplete", `${edge.id} ${trace.accountId}`);
    }
  }
});

test("the provenance footprint covers every chain of a contested edge", () => {
  const graph = projectGraph();
  const { edges, nodes } = provenanceFootprint(graph, "c-ab-when");
  for (const id of ["c-ab-when", "p-s01-a", "p-s02-b"]) {
    assert.ok(edges.has(id), id);
  }
  for (const id of ["origin-s01", "origin-s02", "rec-a", "rec-b"]) {
    assert.ok(nodes.has(id), id);
  }
  assert.ok(!edges.has("e-a-event"));
});

// ---------------------------------------------------------------------
// Bundle boundary (source level; scripts/test/verify-disclosure.mjs checks
// the production build output itself)
// ---------------------------------------------------------------------

const SRC = path.resolve(__dirname, "../..");
const FORBIDDEN = [path.join(SRC, "data", "livingTrace", "syntheticArchive.ts"), path.join(SRC, "lib", "livingTrace", "projection.ts")];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) {
    base = path.join(SRC, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(from), spec);
  } else {
    return null;
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const specs = [...source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );
  return specs.flatMap((spec) => {
    const resolved = resolveImport(file, spec);
    return resolved ? [resolved] : [];
  });
}

function allSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return allSourceFiles(full);
    }
    return /\.(tsx?)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

test("no client component reaches the archive or the projection, directly or transitively", () => {
  const offenders: string[] = [];
  for (const file of allSourceFiles(SRC)) {
    if (!/^\s*["']use client["']/.test(fs.readFileSync(file, "utf8"))) {
      continue;
    }
    const seen = new Set<string>();
    const stack = [file];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      if (FORBIDDEN.includes(current)) {
        offenders.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, current)}`);
        continue;
      }
      stack.push(...importsOf(current));
    }
  }
  assert.deepEqual(offenders, []);
});

test("the archive and the projection both declare a server-only boundary", () => {
  for (const file of FORBIDDEN) {
    assert.match(fs.readFileSync(file, "utf8"), /^import "server-only";$/m, path.relative(SRC, file));
  }
});
