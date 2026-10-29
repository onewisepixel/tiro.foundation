import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTHORITY_PUBLIC_FIELDS, listScenario, resolveScenarioRecord, scenarioRouteIds } from "./authorityProjection";
import { findOutsideAllowlist, findPrivate, RESTRICTED_NOTICE_FIELDS, SPECIMEN_PUBLIC_FIELDS } from "./disclosureGuards";
import { discoverableRouteIds, listDiscoverable, projectGraph, relationsFor, resolveRecord } from "./projection";
import { INTERNAL_RECORDS } from "../../data/livingTrace/syntheticArchive";
import { SCENARIO_RECORDS } from "../../data/livingTrace/authorityScenario";

// Protections 1 and 2 (allowlists and forbidden-field assertions), applied
// to every record projection in both fixture sets. Protection 3 (build-output
// scanning) is scripts/test/verify-disclosure.mjs.

const livingTrace = () => INTERNAL_RECORDS.map((r) => resolveRecord(r.id));
const scenario = () => SCENARIO_RECORDS.map((r) => resolveScenarioRecord(r.id));

test("the guards are not vacuous: they report nested private keys, canary values, and fields outside an allowlist", () => {
  const leaky = { a: { b: [{ ok: 1, receiptRef: "" }] }, note: "x CANARY y" };
  assert.deepEqual(findPrivate(leaky), ["$.a.b[0].receiptRef: private key", "$.note: private value"]);
  assert.deepEqual(findOutsideAllowlist({ a: { b: 1, extra: 2 } }, { a: { b: true } }), ["$.a.extra: not in the public allowlist"]);
  assert.deepEqual(findOutsideAllowlist({ a: { deep: 1 } }, { a: true }), ["$.a: structured value where a primitive is allowed"]);
});

test("no record projection, in either fixture set, carries a private key or value at any depth", () => {
  const graph = projectGraph();
  const everything = [
    ...livingTrace(),
    ...scenario(),
    listDiscoverable(),
    discoverableRouteIds(),
    listScenario(),
    scenarioRouteIds(),
    ...INTERNAL_RECORDS.map((r) => relationsFor(graph, r.id)),
  ];
  assert.deepEqual(findPrivate(everything), []);
});

test("every public Living Trace record projects only allowlisted fields", () => {
  for (const resolved of livingTrace()) {
    if (resolved?.state === "public") {
      assert.deepEqual(findOutsideAllowlist(resolved.record, SPECIMEN_PUBLIC_FIELDS), [], resolved.record.recordId);
    }
  }
});

test("a restricted record projects only its allowlisted notice", () => {
  const restricted = livingTrace().filter((r) => r?.state === "restricted-notice");
  assert.ok(restricted.length > 0);
  for (const r of restricted) {
    if (r?.state === "restricted-notice") {
      assert.deepEqual(Object.keys(r).sort(), ["notice", "state"]);
      assert.deepEqual(findOutsideAllowlist(r.notice, RESTRICTED_NOTICE_FIELDS), []);
    }
  }
});

test("every scenario record projects only allowlisted fields", () => {
  for (const resolved of scenario()) {
    assert.ok(resolved);
    assert.deepEqual(findOutsideAllowlist(resolved.record, AUTHORITY_PUBLIC_FIELDS), []);
  }
});
