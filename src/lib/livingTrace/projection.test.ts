import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  discoverableRouteIds,
  listDiscoverable,
  projectGraph,
  resolveRecord,
  sourceChain,
} from "./projection";
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
    ...graph.edges.map((e) => sourceChain(graph, e.id)),
  ];
}

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

test("undiscoverable record has no route, listing entry, or graph presence", () => {
  assert.ok(!discoverableRouteIds().includes("DEMO-LT-0003"));
  assert.ok(!JSON.stringify(listDiscoverable()).includes("DEMO-LT-0003"));
  assert.ok(!JSON.stringify(projectGraph()).includes("DEMO-LT-0003"));
});

test("restricted record projects only its authorized notice", () => {
  const resolved = resolveRecord("DEMO-LT-0002");
  assert.ok(resolved);
  assert.equal(resolved.state, "restricted-notice");
  assert.deepEqual(Object.keys(resolved).sort(), ["notice", "state"]);
  if (resolved.state === "restricted-notice") {
    assert.deepEqual(Object.keys(resolved.notice).sort(), ["mayContact", "notice", "reference"]);
  }
});

test("a restricted record never appears in the relationship graph, even with a notice", () => {
  const graph = projectGraph();
  assert.ok(!JSON.stringify(graph).includes("DEMO-LT-0002"));
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.some((n) => n.id === edge.from));
    assert.ok(graph.nodes.some((n) => n.id === edge.to));
  }
});

test("listing exposes no count of withheld records", () => {
  const listing = listDiscoverable();
  // Only the discoverable entries exist; nothing summarizes the rest.
  assert.equal(listing.length, INTERNAL_RECORDS.filter((r) => r.visibility !== "undiscoverable").length);
  for (const entry of listing) {
    assert.ok(!("total" in entry) && !("withheld" in entry));
  }
});

test("a restricted record without an authorized notice is treated as undiscoverable", async () => {
  const archive = await import("../../data/livingTrace/syntheticArchive");
  const restricted = archive.INTERNAL_RECORDS.find((r) => r.id === "DEMO-LT-0002")!;
  const saved = restricted.authorizedDisclosure;
  try {
    restricted.authorizedDisclosure = undefined;
    assert.equal(resolveRecord("DEMO-LT-0002"), null);
    assert.ok(!discoverableRouteIds().includes("DEMO-LT-0002"));
  } finally {
    restricted.authorizedDisclosure = saved;
  }
});

test("projection is an allow-list: a new internal field is withheld by default", () => {
  const record = INTERNAL_RECORDS.find((r) => r.id === "DEMO-LT-0001")! as unknown as Record<string, unknown>;
  record.futureSensitiveField = "CANARY-FUTURE-FIELD";
  try {
    assert.doesNotMatch(JSON.stringify(resolveRecord("DEMO-LT-0001")), CANARY);
  } finally {
    delete record.futureSensitiveField;
  }
});

test("every visible relationship has a type, an evidence state, a basis, and a path back to an origin", () => {
  const graph = projectGraph();
  assert.ok(graph.edges.length > 0);
  for (const edge of graph.edges) {
    assert.ok(edge.relation.length > 0, `${edge.id} relation`);
    assert.ok(edge.basis.length > 0, `${edge.id} basis`);
    assert.ok(edge.assertedBy.length > 0, `${edge.id} assertedBy`);
    const { chain, reachesOrigin } = sourceChain(graph, edge.id);
    assert.ok(reachesOrigin, `${edge.id} reaches an origin`);
    assert.equal(chain[chain.length - 1], edge.id);
    const first = graph.edges.find((e) => e.id === chain[0])!;
    assert.equal(graph.nodes.find((n) => n.id === first.from)?.kind, "origin");
  }
});

test("client components never import the internal archive or the projection", () => {
  const root = path.resolve(__dirname, "../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const source = fs.readFileSync(full, "utf8");
        const isClient = /^\s*["']use client["']/.test(source);
        const importsArchive = /livingTrace\/syntheticArchive/.test(source);
        if (importsArchive && (isClient || !full.endsWith(path.join("livingTrace", "projection.ts")))) {
          offenders.push(path.relative(root, full));
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "only server code may reach the internal archive, directly or via projection.ts");
});
