import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutGraph } from "./layout";
import { projectGraph } from "./projection";
import type { GraphNodeKind, ProjectedGraph } from "./graph";

function synthetic(records: number): ProjectedGraph {
  const nodes: ProjectedGraph["nodes"] = [];
  const edges: ProjectedGraph["edges"] = [];
  const edge = (id: string, from: string, to: string) => ({
    id,
    from,
    to,
    relation: "r",
    evidence: "attested" as const,
    summary: "s",
    recordedBy: "x",
    provenance: false,
    accounts: [],
  });
  for (let i = 0; i < records; i++) {
    nodes.push({ id: `o${i}`, kind: "origin" as GraphNodeKind, label: `o${i}`, href: null });
    nodes.push({ id: `r${i}`, kind: "record" as GraphNodeKind, label: `r${i}`, href: null });
    edges.push(edge(`p${i}`, `o${i}`, `r${i}`));
  }
  nodes.push({ id: "place", kind: "place", label: "place", href: null });
  for (let i = 0; i < records; i++) {
    edges.push(edge(`c${i}`, `r${i}`, "place"));
  }
  return { nodes, edges };
}

function minGap(graph: ProjectedGraph, orientation: "wide" | "narrow"): number {
  const layout = layoutGraph(graph, orientation);
  const points = graph.nodes.map((n) => layout.at[n.id]);
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return min;
}

test("every projected node is placed, inside the frame", () => {
  const graph = projectGraph();
  for (const orientation of ["wide", "narrow"] as const) {
    const layout = layoutGraph(graph, orientation);
    for (const node of graph.nodes) {
      const p = layout.at[node.id];
      assert.ok(p, `${orientation} ${node.id}`);
      assert.ok(p.x >= 0 && p.x <= layout.width && p.y >= 0 && p.y <= layout.height, `${orientation} ${node.id} in frame`);
    }
  }
});

test("each origin sits level with the record it gave (wide)", () => {
  const graph = projectGraph();
  const layout = layoutGraph(graph, "wide");
  for (const [origin, record] of [
    ["origin-s01", "rec-a"],
    ["origin-s02", "rec-b"],
    ["origin-s03", "rec-c"],
  ]) {
    assert.equal(layout.at[origin].y, layout.at[record].y, origin);
  }
});

test("layout is deterministic", () => {
  const graph = projectGraph();
  assert.deepEqual(layoutGraph(graph, "wide"), layoutGraph(graph, "wide"));
});

test("larger collections lay out without overlapping nodes", () => {
  for (const n of [1, 4, 12, 30]) {
    assert.ok(minGap(synthetic(n), "wide") >= 60, `wide ${n}`);
  }
});
