// Self-tests for the census comparison (decision 58): normalization is
// stable, and a withheld, added or altered control is reported. The census
// itself needs a browser and the local demo; these do not.
//
//   node --test scripts/test/flight-deck-census.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { diffCensus, normalizeScreen } from "./flight-deck-census.mjs";

const BASELINE = path.resolve(import.meta.dirname, "../../docs/design/phase-4/baseline/census.json");

test("ids, dates, times and fingerprints become stable placeholders", () => {
  const raw = {
    forms: [{ action: "a".repeat(40), fields: [{ type: "hidden", name: "id", value: "prs_AbCdEfGhJkMnPqRs" }, { type: "hidden", name: "hash", value: "f".repeat(64) }] }],
    links: [{ href: "/flight-deck/relationships/prs_AbCdEfGhJkMnPqRs" }, { href: "/flight-deck/relationships/prs_ZyXwVuTsRqPnMkJh" }],
    live: [{ text: "since 2026-10-17 09:00 UTC (2026-10-17 onward)" }],
  };
  const names = new Map([["a".repeat(40), "src/app/flight-deck/actions.ts#decideAction"]]);
  const n = normalizeScreen(raw, names);
  assert.equal(n.forms[0].action, "src/app/flight-deck/actions.ts#decideAction");
  assert.equal(n.forms[0].fields[0].value, "<prs#1>");
  assert.equal(n.links[0].href, "/flight-deck/relationships/<prs#1>");
  assert.equal(n.links[1].href, "/flight-deck/relationships/<prs#2>");
  assert.equal(n.forms[0].fields[1].value, "<sha256>");
  assert.equal(n.live[0].text, "since <datetime> (<date> onward)");
  // A different random id in the same position normalizes identically.
  const again = normalizeScreen(JSON.parse(JSON.stringify(raw).replaceAll("prs_AbCdEfGhJkMnPqRs", "prs_QqQqQqQqQqQqQqQq")), names);
  assert.deepEqual(again, n);
});

test("an unnamed server action is numbered, not dropped", () => {
  const n = normalizeScreen({ forms: [{ action: "b".repeat(42) }, { action: "c".repeat(42) }, { action: "b".repeat(42) }] }, new Map());
  assert.deepEqual(n.forms.map((f) => f.action), ["<action#1>", "<action#2>", "<action#1>"]);
});

const sample = () => ({
  meta: { generatedAt: "x" },
  roles: {
    operator: { approvals: { status: 200, forms: [{ action: "a#signOut", fields: [] }] } },
    reviewer: { approvals: { status: 200, forms: [{ action: "a#decideAction", fields: [{ type: "hidden", name: "hash", value: "<sha256>" }, { type: "submit", name: "outcome", value: "approved" }] }] } },
  },
});

test("identical censuses compare equal, ignoring meta", () => {
  const a = sample();
  const b = sample();
  b.meta.generatedAt = "y";
  assert.deepEqual(diffCensus(a, b), []);
});

test("a control newly given to a role is reported", () => {
  const b = sample();
  b.roles.operator.approvals.forms.push({ action: "a#decideAction", fields: [] });
  assert.ok(diffCensus(sample(), b).some((d) => d.startsWith("roles.operator.approvals.forms.1")));
});

test("a control withheld from a role is reported", () => {
  const b = sample();
  b.roles.reviewer.approvals.forms = [];
  assert.ok(diffCensus(sample(), b).some((d) => d.startsWith("roles.reviewer.approvals.forms")));
});

test("a changed hidden value, field name or submit value is reported", () => {
  for (const mutate of [(f) => (f[0].name = "fingerprint"), (f) => (f[0].value = "<out#1>"), (f) => (f[1].value = "rejected")]) {
    const b = sample();
    mutate(b.roles.reviewer.approvals.forms[0].fields);
    assert.equal(diffCensus(sample(), b).length, 1);
  }
});

test("a changed status code is reported", () => {
  const b = sample();
  b.roles.operator.approvals.status = 404;
  assert.deepEqual(diffCensus(sample(), b), ["roles.operator.approvals.status: 200 -> 404"]);
});

test("the committed baseline is a complete census", { skip: !fs.existsSync(BASELINE) }, () => {
  const c = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  assert.deepEqual(Object.keys(c.roles), ["anonymous", "founder", "operator", "reviewer"]);
  for (const role of ["founder", "operator", "reviewer"]) assert.ok(Object.keys(c.roles[role]).length >= 20, role);
  assert.equal(c.meta.actionNames, "server-reference manifest");
});
