import { test } from "node:test";
import assert from "node:assert/strict";
import { cite } from "./citation";

const base = {
  kind: "record" as const,
  recordId: "DEMO-MP-0001",
  title: "An account",
  attribution: "Synthetic contributor P-01, with the authority of Synthetic collective A-01",
  version: "1",
  persistentUrl: "https://example.invalid/records/DEMO-MP-0001",
  accessed: "2026-10-28",
  synthetic: true,
};

test("the source is credited first; TIRO appears only as custodian", () => {
  const { text, warnings } = cite(base);
  assert.ok(text.startsWith("Synthetic contributor P-01"));
  assert.ok(!/^(The )?Ti(ro|RO)/i.test(text));
  assert.match(text, /held by the Tiro Foundation \(custodian\)/);
  assert.match(text, /DEMO-MP-0001, version 1\./);
  assert.match(text, /Accessed 2026-10-28\./);
  assert.match(text, /Synthetic demonstration; not archival evidence\./);
  assert.deepEqual(warnings, []);
});

test("without an authorized attribution, no one is credited in the source's place", () => {
  const { text, warnings } = cite({ ...base, attribution: null });
  assert.ok(text.startsWith("Source not credited, as authorized."));
  assert.ok(!/^(The )?Tiro/i.test(text));
  assert.equal(warnings.length, 1);
});

test("missing version, URL, and date are stated and warned, never faked", () => {
  const { text, warnings } = cite({ ...base, version: null, persistentUrl: null, accessed: null });
  assert.match(text, /DEMO-MP-0001, unversioned\./);
  assert.match(text, /Persistent URL not yet issued\./);
  assert.ok(!text.includes("Accessed"));
  assert.equal(warnings.length, 3);
});

test("a title that may not be published is not cited", () => {
  assert.match(cite({ ...base, title: null }).text, /Title not published\./);
});

test("an interpretation is its own work and says it is not a source account", () => {
  const { text } = cite({
    kind: "interpretation",
    recordId: "DEMO-LT-0001",
    version: null,
    title: "Curatorial note",
    by: "TIRO curator (illustrative role)",
    recordAttribution: "Synthetic source S-01",
    persistentUrl: null,
    accessed: "2026-10-28",
    synthetic: true,
  });
  assert.ok(text.startsWith("TIRO curator (illustrative role), interpreter."));
  assert.match(text, /Interpretation of DEMO-LT-0001, unversioned, from an account attributed to Synthetic source S-01\./);
  assert.match(text, /An interpretation, not a source account\./);
});

test("a translation credits its translator and points back to the record", () => {
  const { text } = cite({ kind: "translation", recordId: "DEMO-MP-0001", version: "1", title: "Translation", by: "Synthetic translator X-01", recordAttribution: null, persistentUrl: null, accessed: null, synthetic: true });
  assert.ok(text.startsWith("Synthetic translator X-01, translator."));
  assert.match(text, /Translation of DEMO-MP-0001, version 1\./);
});

test("a restricted record is cited by its reference alone", () => {
  const { text } = cite({ kind: "restricted", reference: "DEMO-LT-0002", accessed: "2026-10-28" });
  assert.equal(text, "Restricted record DEMO-LT-0002. The Memory Project; held by the Tiro Foundation (custodian). No further details are published. Accessed 2026-10-28.");
});
