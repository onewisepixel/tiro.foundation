import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAuthorization, listScenario, mandateCovers, resolveScenarioRecord, scenarioRouteIds } from "./authorityProjection";
import { USE_CATEGORIES, type UseCategory } from "./evidence";
import { discoverableRouteIds, listDiscoverable, resolveRecord } from "./projection";
import { SCENARIO_RECORDS } from "../../data/livingTrace/authorityScenario";

// The model distinguishes five things (founder clarification, 2026-10-28):
//   who POSSESSES the authority a use requires   requiredFrom
//   who MADE or authorized the decision           decision.by
//   who EXECUTED and who RECORDED it              decision.executedBy, recordedBy
//   what MANDATE permitted the execution          decision.mandate
//   whether the mandate was VALID for that holder, record, use, and date
// A signer possesses no authority of their own by being a signer, but an
// authorized signer may execute a holder's decision within a valid mandate.

const internal = () => SCENARIO_RECORDS[0];
const internalAuth = (use: UseCategory) => internal().authorizations.find((a) => a.use === use)!;
const record = () => resolveScenarioRecord("DEMO-MP-0001")!.record;
const publicAuth = (use: UseCategory) => record().authorizations.find((a) => a.use === use)!;
const capacityOf = (id: string) => internal().parties.find((p) => p.id === id)!.capacity;

function withScenario<T>(mutate: (r: (typeof SCENARIO_RECORDS)[number]) => void, run: () => T): T {
  const r = SCENARIO_RECORDS[0];
  const saved = structuredClone(r);
  try {
    mutate(r);
    return run();
  } finally {
    Object.assign(r, saved);
  }
}

// ---------------------------------------------------------------------
// Boundary and isolation
// ---------------------------------------------------------------------

test("unknown ids resolve to null, and the two fixture sets never answer for each other", () => {
  assert.equal(resolveScenarioRecord("DEMO-MP-9999"), null);
  assert.equal(resolveScenarioRecord(""), null);
  assert.equal(resolveScenarioRecord("DEMO-LT-0001"), null);
  assert.equal(resolveRecord("DEMO-MP-0001"), null);
  assert.deepEqual(scenarioRouteIds(), ["DEMO-MP-0001"]);
  assert.equal(listScenario().length, 1);
});

test("the Living Trace specimens are unchanged by the scenario", () => {
  assert.deepEqual(discoverableRouteIds(), ["DEMO-LT-0001", "DEMO-LT-0002", "DEMO-LT-0004", "DEMO-LT-0005"]);
  assert.ok(!JSON.stringify(listDiscoverable()).includes("DEMO-MP"));
});

// ---------------------------------------------------------------------
// 1. Who possesses the authority
// ---------------------------------------------------------------------

test("authority is held only by holders of an interest; never by a signer or a collector", () => {
  for (const a of internal().authorizations) {
    for (const h of a.requiredFrom) {
      assert.ok(!["Signer", "Collector"].includes(capacityOf(h)), `${a.use}: ${h} is a ${capacityOf(h)}`);
    }
  }
});

test("each capacity is held by a different party in this scenario; the projection never merges parties", () => {
  const r = record();
  assert.equal(new Set(r.parties.map((p) => p.capacity)).size, 6);
  assert.equal(r.parties.length, internal().parties.length);
});

test("copyright is required beside the source authority only where the recording itself is reused", () => {
  assert.ok(!internalAuth("preservation").requiredFrom.includes("I-01"));
  assert.ok(!internalAuth("publication").requiredFrom.includes("I-01"));
  assert.deepEqual([...internalAuth("derivatives").requiredFrom].sort(), ["A-01", "I-01"]);
});

test("the subject's interest is required to publish; the contributor's to reproduce their voice", () => {
  assert.ok(internalAuth("publication").requiredFrom.includes("P-02"));
  assert.ok(internalAuth("syntheticReproduction").requiredFrom.includes("P-01"));
});

// ---------------------------------------------------------------------
// 2–4. Who decided, who executed and recorded, under what mandate
// ---------------------------------------------------------------------

test("every decision is attributed to the holder whose authority it exercises", () => {
  for (const a of internal().authorizations) {
    for (const d of a.decisions) {
      assert.ok(a.requiredFrom.includes(d.by), `${a.use}: decision by ${d.by}, who holds no authority required for this use`);
      assert.ok(d.recordedBy.length > 0, `${a.use}: unrecorded decision`);
    }
  }
});

test("an execution by anyone other than the holder cites a mandate, and the executor is that mandate's signer", () => {
  for (const a of internal().authorizations) {
    for (const d of a.decisions.filter((x) => x.executedBy !== x.by)) {
      const m = internal().mandates.find((x) => x.id === d.mandate);
      assert.ok(m, `${a.use}: execution by ${d.executedBy} without a mandate`);
      assert.equal(m.signer, d.executedBy);
      assert.equal(m.represents, d.by);
      assert.equal(capacityOf(d.executedBy), "Signer");
    }
  }
});

test("a collector neither decides nor executes anything", () => {
  for (const a of internal().authorizations) {
    for (const d of a.decisions) {
      assert.notEqual(capacityOf(d.by), "Collector");
      assert.notEqual(capacityOf(d.executedBy), "Collector");
    }
  }
});

// ---------------------------------------------------------------------
// 5. Whether the mandate was valid for that scope and time
// ---------------------------------------------------------------------

test("mandateCovers checks verification, holder, record, use, and period", () => {
  const m = internal().mandates[0];
  const act = { signer: "S-01", holder: "A-01", record: "DEMO-MP-0001", use: "preservation" as UseCategory, at: "2026-10-12" };
  assert.equal(mandateCovers(m, act), "covered");
  assert.equal(mandateCovers(m, { ...act, use: "research" }), "outside-scope");
  assert.equal(mandateCovers(m, { ...act, at: "2026-09-30" }), "outside-period");
  assert.equal(mandateCovers(m, { ...act, at: "2027-10-01" }), "outside-period");
  assert.equal(mandateCovers(m, { ...act, holder: "P-01" }), "wrong-holder");
  assert.equal(mandateCovers(m, { ...act, record: "DEMO-MP-0002" }), "wrong-record");
  assert.equal(mandateCovers(m, { ...act, signer: "C-01" }), "missing");
  assert.equal(mandateCovers({ ...m, verified: false }, act), "not-verified");
  assert.equal(mandateCovers(undefined, act), "missing");
});

test("a signature outside the mandate's scope has no effect, and leaves no public trace", () => {
  const e = evaluateAuthorization(internal(), internalAuth("research"));
  assert.equal(e.decisions[0].check, "outside-scope");
  assert.equal(e.inEffect, false);
  const pub = publicAuth("research");
  assert.equal(pub.grant, "not-granted");
  assert.equal(pub.inEffect, false);
  assert.deepEqual(pub.exercised, []);
});

test("every intended grant in the scenario is in effect, through a valid route for every holder", () => {
  for (const a of internal().authorizations.filter((x) => x.grant === "granted" || x.grant === "limited")) {
    const e = evaluateAuthorization(internal(), a);
    assert.ok(e.inEffect, `${a.use}: missing ${e.missing.join(", ")}`);
    assert.equal(publicAuth(a.use).grant, a.grant);
  }
});

test("fail closed: a decision executed after the mandate expires leaves the use not in effect, published as unknown", () => {
  const pub = withScenario(
    (r) => {
      r.authorizations.find((a) => a.use === "preservation")!.decisions[0].at = "2027-10-01";
    },
    () => resolveScenarioRecord("DEMO-MP-0001")!.record.authorizations.find((a) => a.use === "preservation")!,
  );
  assert.equal(pub.inEffect, false);
  assert.equal(pub.grant, "unknown");
  assert.deepEqual(pub.exercised, []);
});

test("fail closed: one holder's missing decision is enough to stop a use", () => {
  const pub = withScenario(
    (r) => {
      const a = r.authorizations.find((x) => x.use === "publication")!;
      a.decisions = a.decisions.filter((d) => d.by !== "P-02");
    },
    () => resolveScenarioRecord("DEMO-MP-0001")!.record.authorizations.find((a) => a.use === "publication")!,
  );
  assert.equal(pub.inEffect, false);
  assert.equal(pub.grant, "unknown");
});

test("a signer cannot make a decision in their own right", () => {
  const e = withScenario(
    (r) => {
      r.authorizations.find((a) => a.use === "preservation")!.decisions = [{ by: "S-01", executedBy: "S-01", mandate: null, at: "2026-10-12", recordedBy: "x" }];
    },
    () => evaluateAuthorization(SCENARIO_RECORDS[0], SCENARIO_RECORDS[0].authorizations.find((a) => a.use === "preservation")!),
  );
  assert.equal(e.decisions[0].check, "not-a-holder");
  assert.equal(e.inEffect, false);
});

// ---------------------------------------------------------------------
// The safe consent summary
// ---------------------------------------------------------------------

test("each use states whose authority it rests on and how it was exercised, by capacity", () => {
  const pub = publicAuth("publication");
  assert.deepEqual(
    pub.requires.map((r) => r.capacity),
    ["Source authority", "Subject"],
  );
  assert.deepEqual(
    pub.exercised.map((x) => [x.capacity, x.how]),
    [
      ["Source authority", "Through an authorized representative, under a verified mandate"],
      ["Subject", "In their own right"],
    ],
  );
});

test("the signer's and subject's identities, and the mandate's identity and terms, never reach the page", () => {
  const json = JSON.stringify(record());
  assert.ok(!json.includes("S-01") && !json.includes("P-02"));
  for (const term of ["2026-10-01", "2027-09-30", "validFrom", "validUntil", "M01"]) {
    assert.ok(!json.includes(term), term);
  }
  const withheld = record().parties.filter((p) => p.identityWithheld).map((p) => p.capacity);
  assert.deepEqual(withheld.sort(), ["Signer", "Subject"]);
});

test("every use category is stated, and granting one never implies another", () => {
  const r = record();
  assert.deepEqual(r.authorizations.map((a) => a.use).sort(), USE_CATEGORIES.map((u) => u.key).sort());
  assert.equal(r.uses.preservation, "granted");
  assert.notEqual(r.uses.publication, "granted");
  assert.equal(r.uses.modelTraining, "not-granted");
});
