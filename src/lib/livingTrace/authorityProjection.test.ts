import { test } from "node:test";
import assert from "node:assert/strict";
import { listScenario, resolveScenarioRecord, scenarioRouteIds } from "./authorityProjection";
import { USE_CATEGORIES } from "./evidence";
import { discoverableRouteIds, listDiscoverable, resolveRecord } from "./projection";
import { SCENARIO_RECORDS } from "../../data/livingTrace/authorityScenario";

const everyProjection = () => [...SCENARIO_RECORDS.map((r) => resolveScenarioRecord(r.id)), listScenario(), scenarioRouteIds()];
const record = () => resolveScenarioRecord("DEMO-MP-0001")!.record;
const deciders = (use: string) => record().authorizations.find((a) => a.use === use)!.decidedBy.map((d) => d.id);

// ---------------------------------------------------------------------
// Disclosure boundary
// ---------------------------------------------------------------------

test("no scenario projection carries an internal-only string", () => {
  for (const p of everyProjection()) {
    assert.doesNotMatch(JSON.stringify(p) ?? "", /CANARY/);
  }
});

test("internal-only fields are never projected, even as empty keys", () => {
  const json = JSON.stringify(everyProjection());
  for (const field of ["contactRecord", "receiptRef", "documentRef", "internalNotes", "authorizedBy"]) {
    assert.ok(!json.includes(`"${field}"`), field);
  }
});

test("unknown ids resolve to null, and the two fixture sets never answer for each other", () => {
  assert.equal(resolveScenarioRecord("DEMO-MP-9999"), null);
  assert.equal(resolveScenarioRecord(""), null);
  assert.equal(resolveScenarioRecord("DEMO-LT-0001"), null);
  assert.equal(resolveRecord("DEMO-MP-0001"), null);
});

test("the Living Trace specimens are unchanged by the scenario", () => {
  assert.deepEqual(discoverableRouteIds(), ["DEMO-LT-0001", "DEMO-LT-0002", "DEMO-LT-0004", "DEMO-LT-0005"]);
  assert.ok(!JSON.stringify(listDiscoverable()).includes("DEMO-MP"));
});

// ---------------------------------------------------------------------
// The authority model the scenario demonstrates
// ---------------------------------------------------------------------

test("the six capacities are each held by a different party, and parties are never merged", () => {
  const r = record();
  const capacities = r.parties.map((p) => p.capacity);
  assert.deepEqual(new Set(capacities).size, 6);
  assert.equal(new Set(r.parties.map((p) => p.id)).size, r.parties.length);
  assert.equal(r.parties.length, SCENARIO_RECORDS[0].parties.length);
  assert.equal(r.capacities.length, r.parties.length);
});

test("every use is authorized or refused explicitly, and every decider is a named party", () => {
  const r = record();
  assert.deepEqual(r.authorizations.map((a) => a.use).sort(), USE_CATEGORIES.map((u) => u.key).sort());
  for (const a of r.authorizations) {
    assert.ok(a.decidedBy.length > 0, a.use);
    assert.equal(r.uses[a.use], a.grant);
    for (const d of a.decidedBy) {
      assert.ok(r.parties.some((p) => p.id === d.id && p.label === d.label), `${a.use}: ${d.id}`);
    }
  }
});

test("a signer acts for the authority and never decides in their own right", () => {
  const r = record();
  for (const a of r.authorizations) {
    assert.ok(!a.decidedBy.some((d) => d.capacity === "Signer"), a.use);
  }
  assert.equal(r.mandate.signer, "Synthetic signer S-01");
  assert.equal(r.mandate.represents, "Synthetic collective A-01");
});

test("the collector facilitates and decides nothing", () => {
  for (const a of record().authorizations) {
    assert.ok(!a.decidedBy.some((d) => d.capacity === "Collector"), a.use);
  }
});

test("copyright alone never authorizes preservation or publication of the account", () => {
  assert.ok(!deciders("preservation").includes("I-01"));
  assert.ok(!deciders("publication").includes("I-01"));
  // …but it is required, beside the source authority, where the recording itself is reused.
  assert.ok(deciders("derivatives").includes("I-01") && deciders("derivatives").includes("A-01"));
});

test("a subject's interest is part of the decision to publish; the contributor keeps their own voice", () => {
  assert.ok(deciders("publication").includes("P-02"));
  assert.ok(deciders("syntheticReproduction").includes("P-01"));
});

test("granting one use never implies another", () => {
  const r = record();
  assert.equal(r.uses.preservation, "granted");
  assert.notEqual(r.uses.publication, "granted");
  assert.equal(r.uses.modelTraining, "not-granted");
});
