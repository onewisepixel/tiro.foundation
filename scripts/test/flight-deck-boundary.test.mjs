// Self-tests for the Flight Deck boundary checker (decision 58).
//
// A passing run on unchanged code proves nothing, so each case here plants
// a controlled change in a real Flight Deck source file and asserts that the
// checker rejects it (with the expected category) or permits it. A second
// group runs the command line against throwaway git repositories to prove
// the merge-base, branch-mode and exception logic.
//
//   node --test scripts/test/flight-deck-boundary.test.mjs
//   BOUNDARY_MATRIX_OUT=matrix.json node --test ...   (also writes the pass/fail matrix)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPresentationOnly, classifyPath, compareSources } from "./flight-deck-boundary.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CHECKER = path.join(import.meta.dirname, "flight-deck-boundary.mjs");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const FILES = {
  approvals: "src/app/flight-deck/approvals/page.tsx",
  relationship: "src/app/flight-deck/relationships/[id]/page.tsx",
  health: "src/app/flight-deck/health/page.tsx",
  gates: "src/app/flight-deck/gates/page.tsx",
  now: "src/app/flight-deck/page.tsx",
  layout: "src/app/flight-deck/layout.tsx",
  ui: "src/components/flight-deck/ui.tsx",
  client: "src/components/flight-deck/client.tsx",
};

// Replaces exactly one occurrence (or the nth), so a test can never pass
// because its mutation silently did nothing.
function mutate(src, from, to, nth = 0) {
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = src.indexOf(from, at + 1);
    assert.notEqual(at, -1, `mutation anchor not found: ${from}`);
  }
  if (nth === 0) assert.equal(src.indexOf(from, at + 1), -1, `mutation anchor is not unique: ${from}`);
  return src.slice(0, at) + to + src.slice(at + from.length);
}

const matrix = [];
after(() => {
  if (process.env.BOUNDARY_MATRIX_OUT) fs.writeFileSync(process.env.BOUNDARY_MATRIX_OUT, JSON.stringify(matrix, null, 2));
});

function rejects(name, key, mutation, category) {
  test(`rejects: ${name}`, () => {
    const before = read(FILES[key]);
    const after = mutation(before);
    assert.notEqual(after, before);
    const findings = compareSources(before, after, FILES[key]);
    matrix.push({ expect: "reject", name, file: FILES[key], result: findings.length ? "rejected" : "PASSED (wrong)", category: findings[0]?.category ?? null });
    assert.ok(findings.length > 0, "the change was not detected");
    if (category) assert.equal(findings[0].category, category);
  });
}

function permits(name, key, mutation) {
  test(`permits: ${name}`, () => {
    const before = read(FILES[key]);
    const after = mutation(before);
    assert.notEqual(after, before);
    const findings = compareSources(before, after, FILES[key]);
    matrix.push({ expect: "permit", name, file: FILES[key], result: findings.length ? "REJECTED (wrong)" : "permitted", category: findings[0]?.category ?? null });
    assert.deepEqual(findings, []);
  });
}

// ---------- Unchanged code ----------
for (const [key, file] of Object.entries(FILES)) {
  test(`unchanged ${key} compares equal`, () => {
    assert.deepEqual(compareSources(read(file), read(file), file), []);
  });
}

// ---------- Controlled violations (must be rejected) ----------
rejects("permission condition changed (approve -> dispatch)", "approvals", (s) => mutate(s, `{can(actor, "approve") ? (`, `{can(actor, "dispatch") ? (`), "permission, approval or gate condition");
rejects("permission condition inverted", "approvals", (s) => mutate(s, `{!can(actor, "approve") ? (`, `{can(actor, "approve") ? (`), "permission, approval or gate condition");
rejects("role check changed (founder -> any non-reviewer)", "health", (s) => mutate(s, `{actor.role === "founder" ? (`, `{actor.role !== "reviewer" ? (`), "permission, approval or gate condition");
rejects("gate condition changed (fresh sign-in no longer required)", "gates", (s) => mutate(s, `{fresh ? "Approve" : "Sign in again, then approve"}`, `{true ? "Approve" : "Sign in again, then approve"}`), "permission, approval or gate condition");
rejects("server-action binding swapped (withdraw -> erase)", "relationship", (s) => mutate(s, `action={withdrawAction}`, `action={eraseAction}`), "server-action binding");
rejects("hidden token value changed (hash -> id)", "approvals", (s) => mutate(s, `name="hash" value={item.hash}`, `name="hash" value={item.id}`), "form field, value or hidden token");
rejects("form field name changed", "approvals", (s) => mutate(s, `name="secondReviewerId"`, `name="reviewerId"`), "form field, value or hidden token");
rejects("submit control value changed", "approvals", (s) => mutate(s, `name="outcome" value="rejected"`, `name="outcome" value="revision-requested"`, 0), "form field, value or hidden token");
rejects("hidden returnTo token changed in the shared component", "ui", (s) => mutate(s, `<input type="hidden" name="returnTo" value={to} />`, `<input type="hidden" name="returnTo" value="/flight-deck" />`), "form field, value or hidden token");
rejects("validation attribute changed (minLength)", "gates", (s) => mutate(s, `minLength={8}`, `minLength={1}`), "validation or state attribute");
rejects("submit button no longer disabled while pending", "client", (s) => mutate(s, ` disabled={pending || disabled} aria-disabled`, ` disabled={disabled} aria-disabled`), "validation or state attribute");
rejects("operational status label changed", "ui", (s) => mutate(s, `"Approved (exact version)"`, `"Approved"`), "status vocabulary or label map");
rejects("status tone changed (failed shown as done)", "ui", (s) => mutate(s, `failed: { label: "Failed", tone: "blocked"`, `failed: { label: "Failed", tone: "done"`), "status vocabulary or label map");
rejects("integration-state label changed (Off -> Disabled)", "health", (s) => mutate(s, `blocked: "Off"`, `blocked: "Disabled"`), "status vocabulary or label map");
rejects("referenced accessibility attribute changed (aria-labelledby)", "ui", (s) => mutate(s, "aria-labelledby={`${hid}-h`}", "aria-labelledby={hid}"), "referenced id or accessible name");
rejects("label association broken (htmlFor)", "ui", (s) => mutate(s, `<label htmlFor={htmlFor}`, `<label`), "referenced id or accessible name");
rejects("live region downgraded (alert -> status)", "ui", (s) => mutate(s, `<p role="alert"`, `<p role="status"`), "live-region or role semantics");
rejects("screen-reader-only text removed", "ui", (s) => mutate(s, `<span className="sr-only">Error: </span>`, ``));
rejects("SyntheticBanner text changed", "ui", (s) => mutate(s, `"Local demo · synthetic data only · nothing leaves this machine"`, `"Local demo"`), "SyntheticBanner text");
rejects("data read changed (needs-review -> draft)", "approvals", (s) => mutate(s, `tx.list("outreach", (x) => x.status === "needs-review")`, `tx.list("outreach", (x) => x.status === "draft")`), "data read or runtime call");
rejects("operational import added", "approvals", (s) => `import { exportProspect } from "@/lib/flightDeck/prospects";\n${s}`, "operational import");
rejects("navigation target changed", "now", (s) => mutate(s, `href="/flight-deck/approvals"`, `href="/flight-deck/health"`), "navigation target");
rejects("consequence text moved after the decision buttons", "approvals", (s) => {
  const line = `              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">{item.consequence}</p>\n`;
  const out = mutate(s, line, "");
  return mutate(out, `              ) : null}\n            </article>`, `              ) : null}\n${line}            </article>`);
});
rejects("visible copy changed", "approvals", (s) => mutate(s, `Approval never sends or publishes.`, `Approval sends.`), "visible text");
rejects("shell: approvals count read changed", "layout", (s) => mutate(s, `tx.list("campaigns", (c) => c.status === "needs-review").length`, `0`), "data read or runtime call");
rejects("navigation item removed", "client", (s) => mutate(s, `  { href: "/flight-deck/health", label: "Health" },\n`, ``), "status vocabulary or label map");

// ---------- Permitted presentation changes (must pass) ----------
permits("CSS class change", "approvals", (s) => mutate(s, `className="fd-panel" aria-labelledby`, `className="fd-register fd-decision" aria-labelledby`));
// The header offset is set through the token on the shell root and on the
// console's navigation bar. Anchored on where each element sits in the
// layout, not on its current offset classes, so the case holds before and
// after the shell adopts the token.
permits("shell header offset via the token", "layout", (s) => mutate(mutate(s, `return (\n    <div className="`, `return (\n    <div className="pt-[var(--la-header)] `), `{actor && consoleOpen ? (\n        <div className="`, `{actor && consoleOpen ? (\n        <div className="top-[var(--la-header)] `));
permits("approved style-only import (page stylesheet)", "approvals", (s) => `import "./approvals.css";\n${s}`);
permits("approved style-only import (console stylesheet in the shell)", "layout", (s) => `import "@/components/flight-deck/flight-deck.css";\n${s}`);
permits("harmless presentation wrapper", "approvals", (s) => mutate(s, `      <Notice params={params} />`, `      <div className="fd-notices">\n        <Notice params={params} />\n      </div>`));
permits("wrapper inside a shared component", "ui", (s) => mutate(s, `<h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight md:text-4xl">{title}</h1>`, `<div className="fd-title-rule"><h1 className="fd-title">{title}</h1></div>`));
rejects("paragraph replaced by a division (p -> div, same attributes)", "ui", (s) => mutate(mutate(s, `<p role="alert" className=`, `<div role="alert" className=`), `      </p>\n    );\n  }\n  if (notice) {`, `      </div>\n    );\n  }\n  if (notice) {`), "element structure (landmarks, headings, controls, order)");
rejects("paragraph unwrapped (a styled p removed around its text)", "approvals", (s) => mutate(s, `<p className="mb-6 text-sm text-[var(--tiro-text-muted)]">Your role can see this queue but cannot decide.</p>`, `<>Your role can see this queue but cannot decide.</>`));
permits("generic wrapper swap with the same attributes (div -> span)", "approvals", (s) => mutate(s, `<div key={k} className="tiro-kv">\n                    <dt className="k">{k}</dt>\n                    <dd className="v">{v}</dd>\n                  </div>`, `<span key={k} className="tiro-kv">\n                    <dt className="k">{k}</dt>\n                    <dd className="v">{v}</dd>\n                  </span>`));
permits("inline style removed", "now", (s) => mutate(s, ` style={{ borderColor: a.severity === "action" ? "var(--tiro-contested)" : "var(--tiro-accent)" }}`, ``));
const ANCHOR = `      <PageTitle eyebrow="Health"`;
const decorate = (el) => (s) => mutate(s, ANCHOR, `      ${el}\n${ANCHOR}`);
permits("decorative empty span added", "health", decorate(`<span aria-hidden="true" className="fd-rule" />`));
permits("decorative empty div added (open and close tags)", "health", decorate(`<div aria-hidden="true" className="fd-rule"></div>`));
permits("decorative rule added (hr)", "health", decorate(`<hr aria-hidden="true" className="fd-rule" />`));
rejects("aria-hidden button added (a control is never decorative)", "health", decorate(`<button aria-hidden="true" className="fd-rule" />`), "element structure (landmarks, headings, controls, order)");
rejects("aria-hidden link added", "health", decorate(`<a aria-hidden="true" className="fd-rule" />`));
rejects("aria-hidden input added", "health", decorate(`<input aria-hidden="true" className="fd-rule" />`));
rejects("aria-hidden span with an event handler", "health", decorate(`<span aria-hidden="true" className="fd-rule" onClick={() => undefined} />`));
rejects("aria-hidden span made focusable", "health", decorate(`<span aria-hidden="true" className="fd-rule" tabIndex={0} />`));
rejects("aria-hidden span with a role", "health", decorate(`<span aria-hidden="true" className="fd-rule" role="button" />`));
rejects("aria-hidden span wrapping content", "health", decorate(`<span aria-hidden="true" className="fd-rule">Live</span>`));
permits("comments and formatting", "client", (s) => mutate(s, `export function SubmitButton(`, `// Presentation note.\nexport function SubmitButton(\n`));
permits("attribute order changed", "approvals", (s) => mutate(s, `<button type="submit" name="outcome" value="approved" className="fd-button" data-tone="primary">`, `<button className="fd-button" data-tone="primary" value="approved" name="outcome" type="submit">`));

// ---------- Path layer ----------
const PATHS = {
  protected: [
    "src/lib/flightDeck/access.ts",
    "src/proxy.ts",
    "src/app/flight-deck/actions.ts",
    "src/app/flight-deck/gates/actions.ts",
    "src/app/flight-deck/guard.ts",
    "src/app/flight-deck/auth/login/route.ts",
    "src/app/flight-deck/internal/worker/route.ts",
    "src/app/flight-deck/export/[id]/route.ts",
    "src/app/globals.css",
    "src/app/layout.tsx",
    "src/components/TopNav.tsx",
    "src/app/pilot/page.tsx",
    "src/components/pilot/PilotInterestForm.tsx",
    "backend/src/index.ts",
    "infra/lib/stack.ts",
    "deploy/flight-deck/flight-deck.template.json",
    ".github/workflows/ci.yml",
    "package.json",
    "package-lock.json",
    "scripts/test/flight-deck-boundary.mjs",
    "scripts/flight-deck/e2e.mjs",
    "docs/flight-deck/screens/now-desktop.png",
    "docs/design/phase-4/baseline/census.json",
    "next.config.ts",
  ],
  mixed: ["src/components/flight-deck/ui.tsx", "src/components/flight-deck/client.tsx", "src/app/flight-deck/layout.tsx", "src/app/flight-deck/page.tsx", "src/app/flight-deck/relationships/[id]/print/page.tsx", "src/app/flight-deck/gates/page.tsx"],
  component: ["src/components/flight-deck/Frame.tsx"],
  presentation: ["src/components/flight-deck/flight-deck.css", "src/app/flight-deck/approvals/approvals.css", "docs/design/milestone-3.0-phase-4-flight-deck.md"],
};
for (const [cls, list] of Object.entries(PATHS)) {
  for (const file of list) {
    test(`path ${file} is ${cls}`, () => {
      const got = classifyPath(file).cls;
      matrix.push({ expect: cls === "protected" ? "reject" : "permit", name: `path: ${file}`, file, result: got, category: `path class ${got}` });
      assert.equal(got, cls);
    });
  }
}

// ---------- New components: automatic only if provably static ----------
const STATIC_COMPONENT = `import "./frame.css";
import type { ReactNode } from "react";

type Tone = "plain" | "ruled";
const TONES = { plain: "fd-frame", ruled: "fd-frame fd-frame-ruled" } as const;

function Rule() {
  return <hr aria-hidden="true" className="fd-rule" />;
}

export function Frame({ tone = "plain", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const cls = [TONES[tone], title ? "fd-frame-titled" : ""].filter(Boolean).join(" ");
  return (
    <section className={cls}>
      {title ? <h2 className="fd-frame-title">{title}</h2> : null}
      <Rule />
      <div className="fd-frame-body">{children}</div>
    </section>
  );
}
`;
function componentCase(name, expect, src, needle) {
  test(`new component: ${name}`, () => {
    const findings = checkPresentationOnly(src);
    matrix.push({ expect, name: `new component: ${name}`, file: "src/components/flight-deck/<new>.tsx", result: findings.length ? "needs review" : "permitted", category: findings[0]?.message ?? null });
    if (expect === "permit") {
      assert.deepEqual(findings, []);
    } else {
      assert.ok(findings.length > 0, "not detected");
      if (needle) assert.ok(findings.some((f) => f.message.includes(needle)), findings.map((f) => f.message).join("; "));
    }
  });
}
const wrap = (body, head = "") => `${head}export function Panel({ id }: { id: string }) {\n${body}\n}\n`;
componentCase("an ordinary static presentation component", "permit", STATIC_COMPONENT);
componentCase("a network request (fetch)", "reject", wrap(`  fetch("/flight-deck/internal/status");\n  return <div className="x">{id}</div>;`), "call: fetch()");
componentCase("an effect that invokes a server action", "reject", wrap(`  useEffect(() => { void decideAction(new FormData()); }, []);\n  return <div className="x">{id}</div>;`, `"use client";\nimport { useEffect } from "react";\nimport { decideAction } from "@/app/flight-deck/actions";\n`), 'value import from "@/app/flight-deck/actions"');
componentCase("an event handler with an operational consequence", "reject", wrap(`  return <div className="x" onClick={() => pauseAction(new FormData())}>{id}</div>;`, `import { pauseAction } from "@/app/flight-deck/actions";\n`), "event handler: onClick");
componentCase("a direct server-action call in render", "reject", wrap(`  return <div className="x">{String(runWorkerAction())}</div>;`, `import { runWorkerAction } from "@/app/flight-deck/actions";\n`), "call: runWorkerAction()");
componentCase("indirect access through a sibling module (./ui)", "reject", wrap(`  return <div className="x"><Badge>{id}</Badge></div>;`, `import { Badge } from "./ui";\n`), 'value import from "./ui"');
componentCase("indirect access through a protected module", "reject", wrap(`  return <div className="x">{id}</div>;`, `import { STAGE_LABELS } from "@/lib/flightDeck/workflow";\n`), 'value import from "@/lib/flightDeck/workflow"');
componentCase("a client directive", "reject", wrap(`  return <div className="x">{id}</div>;`, `"use client";\n`), '"use client" directive');
componentCase("a browser global (navigation)", "reject", wrap(`  return <div className="x" title={window.location.href}>{id}</div>;`), "browser or runtime global: window");
componentCase("a link to an operational route", "reject", wrap(`  return <a className="x" href={"/flight-deck/relationships/" + id}>{id}</a>;`), "interactive or resource element: <a>");
componentCase("a form control", "reject", wrap(`  return <form className="x"><input name="hash" defaultValue={id} /></form>;`), "<form>");
componentCase("spread props (could pass handlers)", "reject", wrap(`  return <div className="x" {...({ id })}>{id}</div>;`), "spread attributes");
componentCase("top-level code with a side effect", "reject", `console.log("loaded");\n${wrap(`  return <div className="x">{id}</div>;`)}`, "top-level statement");
componentCase("state mutation", "reject", wrap(`  let n = 0;\n  n += 1;\n  return <div className="x">{id}{n}</div>;`), "assignment");

// ---------- Command line against throwaway repositories ----------
const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-boundary-"));
  tmpRoots.push(dir);
  const g = (...args) => execFileSync("git", ["-c", "user.name=Boundary Test", "-c", "user.email=boundary@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "pipe", encoding: "utf8" });
  g("init", "-q", "-b", "main");
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  for (const rel of [FILES.approvals, FILES.ui, "src/lib/flightDeck/access.ts"]) write(rel, read(rel));
  g("add", "-A");
  g("commit", "-q", "-m", "base");
  const run = (branch) => spawnSync(process.execPath, [CHECKER, "--base", "main", "--branch", branch], { cwd: dir, encoding: "utf8" });
  const change = (branch, edits, from = "main") => {
    g("checkout", "-q", "-B", branch, from);
    for (const [rel, fn] of edits) write(rel, fn(fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), "utf8") : ""));
    g("add", "-A");
    g("commit", "-q", "-m", branch);
    return run(branch);
  };
  return { dir, g, write, change };
}

function cli(name, expectExit, setup) {
  test(`cli: ${name}`, () => {
    const r = setup(repo());
    matrix.push({ expect: expectExit === 0 ? "permit" : "reject", name: `cli: ${name}`, file: "(git repository)", result: r.status === 0 ? "exit 0" : `exit ${r.status}`, category: null });
    assert.equal(r.status, expectExit, `${r.stdout}\n${r.stderr}`);
  });
}

cli("phase-4 branch with a class change passes", 0, (t) => t.change("phase-4/classes", [[FILES.approvals, (s) => s.replace(`className="fd-panel" aria-labelledby`, `className="fd-register" aria-labelledby`)]]));
cli("phase-4 branch touching src/lib/flightDeck fails", 1, (t) => t.change("phase-4/lib", [["src/lib/flightDeck/access.ts", (s) => `${s}\n// edit\n`]]));
cli("phase-4 branch changing a hidden token fails", 1, (t) => t.change("phase-4/token", [[FILES.approvals, (s) => s.replace(`value={item.hash}`, `value={item.id}`)]]));
cli("phase-4 branch adding a new route fails", 1, (t) => t.change("phase-4/route", [["src/app/flight-deck/extra/page.tsx", () => "export default function P() { return null; }\n"]]));
cli("non-Phase-4 branch touching only operational code is reported, not failed", 0, (t) => t.change("feature/backend", [["src/lib/flightDeck/access.ts", (s) => `${s}\n// edit\n`]]));
// Enforcement does not depend on the branch name: any branch that changes
// Flight Deck presentation is enforced on both layers.
const presentationEdit = [FILES.approvals, (s) => s.replace(`className="fd-panel" aria-labelledby`, `className="fd-register" aria-labelledby`)];
const operationalEdit = ["src/lib/flightDeck/access.ts", (s) => `${s}\n// edit\n`];
const behaviourEdit = [FILES.approvals, (s) => s.replace(`name="hash" value={item.hash}`, `name="hash" value={item.hash} disabled={false}`)];
cli("non-Phase-4 branch changing presentation AND a protected operational file fails", 1, (t) => t.change("feature/mixed-change", [presentationEdit, operationalEdit]));
cli("the same non-Phase-4 branch with presentation-only changes passes", 0, (t) => t.change("feature/mixed-change", [presentationEdit]));
cli("an authorized operational change touching Flight Deck passes with its exception merged first", 0, (t) => {
  t.write("scripts/test/flight-deck-boundary.exceptions.json", JSON.stringify({ exceptions: [{ branch: "fix/no-op-save", decision: 998, reason: "a separately authorized behaviour fix", paths: ["src/lib/flightDeck/access.ts"], structural: [FILES.approvals] }] }));
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "authorized exception");
  return t.change("fix/no-op-save", [operationalEdit, behaviourEdit]);
});
cli("the same operational change without its exception fails", 1, (t) => t.change("fix/no-op-save", [operationalEdit, behaviourEdit]));
cli("a non-Phase-4 PR cannot authorize its own exception", 1, (t) => {
  t.write("scripts/test/flight-deck-boundary.exceptions.json", JSON.stringify({ exceptions: [] }));
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "empty exceptions");
  return t.change("feature/self-granted", [
    ["scripts/test/flight-deck-boundary.exceptions.json", () => JSON.stringify({ exceptions: [{ branch: "feature/self-granted", decision: 1, reason: "self-granted", paths: ["src/lib/flightDeck/access.ts", "scripts/**"], structural: ["src/**"] }] })],
    presentationEdit,
    operationalEdit,
  ]);
});

cli("non-Phase-4 branch changing Flight Deck copy fails on structure", 1, (t) => t.change("feature/fd-copy", [[FILES.approvals, (s) => s.replace("Approval never sends or publishes.", "Approval sends.")]]));
cli("an exception merged into the base is honoured", 0, (t) => {
  t.write("scripts/test/flight-deck-boundary.exceptions.json", JSON.stringify({ exceptions: [{ branch: "phase-4/excepted", decision: 999, reason: "test", paths: ["src/lib/flightDeck/access.ts"] }] }));
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "exception");
  return t.change("phase-4/excepted", [["src/lib/flightDeck/access.ts", (s) => `${s}\n// edit\n`]]);
});
cli("an exception a branch grants itself is ignored once the base has an exceptions file", 1, (t) => {
  t.write("scripts/test/flight-deck-boundary.exceptions.json", JSON.stringify({ exceptions: [] }));
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "empty exceptions");
  return t.change("phase-4/sneaky", [
    ["scripts/test/flight-deck-boundary.exceptions.json", () => JSON.stringify({ exceptions: [{ branch: "phase-4/sneaky", decision: 1, reason: "self-granted", paths: ["src/lib/flightDeck/access.ts", "scripts/**"] }] })],
    ["src/lib/flightDeck/access.ts", (s) => `${s}\n// edit\n`],
  ]);
});
cli("the merge base, not the base tip, is the comparison point", 0, (t) => {
  t.change("phase-4/late", [[FILES.approvals, (s) => s.replace(`className="fd-panel" aria-labelledby`, `className="fd-x" aria-labelledby`)]]);
  // main moves on with an operational change the branch does not contain.
  t.g("checkout", "-q", "main");
  t.write("src/lib/flightDeck/access.ts", `${fs.readFileSync(path.join(t.dir, "src/lib/flightDeck/access.ts"), "utf8")}\n// later on main\n`);
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "main moves");
  t.g("checkout", "-q", "phase-4/late");
  return spawnSync(process.execPath, [CHECKER, "--base", "main", "--branch", "phase-4/late"], { cwd: t.dir, encoding: "utf8" });
});

// ---------- The future CI path: the checker taken from the merge base ----------
// Every PR after PR 4.1 is judged by the checker on its merge base, copied
// into $RUNNER_TEMP, with exceptions read from the base. This runs the exact
// "Flight Deck protected boundary" step script from .github/workflows/ci.yml
// with bash, in a throwaway repository whose base already contains the
// checker. The repository gets its own copy of typescript (as npm ci gives
// CI); $RUNNER_TEMP has none, so resolution must come from the working copy.
import { createRequire } from "node:module";

function ciStepScript() {
  const lines = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n").split("\n");
  const step = lines.findIndex((l) => l.trim() === "- name: Flight Deck protected boundary");
  assert.notEqual(step, -1, "CI step not found");
  const run = lines.findIndex((l, i) => i > step && l.trim() === "run: |");
  assert.notEqual(run, -1, "CI step has no run block");
  const indent = lines[run].search(/\S/);
  const body = [];
  for (let i = run + 1; i < lines.length && (lines[i].trim() === "" || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
  return body.map((l) => l.slice(indent + 2)).join("\n");
}

function findBash() {
  for (const c of ["bash", "C:/Program Files/Git/bin/bash.exe", "/usr/bin/bash", "/bin/bash"]) {
    if (spawnSync(c, ["-c", "echo ok"], { encoding: "utf8" }).stdout?.trim() === "ok") return c;
  }
  return null;
}
const BASH = findBash();
const posix = (p) => p.replaceAll("\\", "/");

let ciRepo = null;
function ciRepoOnce() {
  if (ciRepo) return ciRepo;
  const t = repo();
  fs.cpSync(path.join(ROOT, "node_modules/typescript"), path.join(t.dir, "node_modules/typescript"), { recursive: true });
  t.write(".gitignore", "node_modules/\n");
  t.write("scripts/test/flight-deck-boundary.mjs", fs.readFileSync(CHECKER, "utf8"));
  t.write("scripts/test/flight-deck-boundary.exceptions.json", JSON.stringify({ exceptions: [{ branch: "phase-4/excepted", decision: 997, reason: "test: an approved exception on the base", paths: ["src/lib/flightDeck/access.ts"] }] }));
  t.g("add", "-A");
  t.g("commit", "-q", "-m", "base with the checker and an exceptions file");
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), "fd-runner-temp-"));
  tmpRoots.push(runnerTemp);
  ciRepo = { ...t, runnerTemp, script: ciStepScript() };
  return ciRepo;
}

function ciRun(branch, edits) {
  const t = ciRepoOnce();
  t.g("checkout", "-q", "-B", branch, "main");
  for (const [rel, fn] of edits) t.write(rel, fn(fs.existsSync(path.join(t.dir, rel)) ? fs.readFileSync(path.join(t.dir, rel), "utf8") : ""));
  t.g("add", "-A");
  t.g("commit", "-q", "--allow-empty", "-m", branch);
  const r = spawnSync(BASH, ["-c", t.script], { cwd: t.dir, encoding: "utf8", env: { ...process.env, BOUNDARY_BRANCH: branch, BASE_REF: "main", MODE: "auto", RUNNER_TEMP: posix(t.runnerTemp) } });
  return { ...r, out: `${r.stdout}\n${r.stderr}` };
}

function ciCase(name, expectExit, branch, edits, check) {
  test(`ci path: ${name}`, { skip: BASH ? false : "bash not found (CI on Linux always has it)" }, () => {
    const r = ciRun(branch, edits);
    matrix.push({ expect: expectExit === 0 ? "permit" : "reject", name: `ci path: ${name}`, file: "(base checker from $RUNNER_TEMP)", result: `exit ${r.status}`, category: null });
    assert.equal(r.status, expectExit, r.out);
    assert.ok(r.out.includes("Checker taken from the merge base"), `the base copy was not used:\n${r.out}`);
    assert.ok(r.out.includes("exceptions read from: merge base"), r.out);
    check?.(r);
  });
}

test("ci path: $RUNNER_TEMP alone cannot resolve typescript (resolution comes from the working copy)", { skip: BASH ? false : "bash not found" }, () => {
  const t = ciRepoOnce();
  assert.throws(() => createRequire(path.join(t.runnerTemp, "probe.js")).resolve("typescript"));
  assert.ok(fs.existsSync(path.join(t.dir, "node_modules/typescript/package.json")));
});
ciCase("a permitted change passes, the base checker loading TypeScript", 0, "phase-4/permitted", [presentationEdit], (r) => {
  assert.ok(r.out.includes("Flight Deck boundary check (decision 58)"));
  assert.ok(r.out.includes("PASS: the protected boundary holds."));
});
ciCase("a protected change fails", 1, "phase-4/protected", [operationalEdit], (r) => assert.ok(r.out.includes("FAIL [A] src/lib/flightDeck/access.ts")));
ciCase("an exception on the base is honoured", 0, "phase-4/excepted", [operationalEdit], (r) => assert.ok(r.out.includes("permitted by exception, decision 997")));
ciCase("an exception added by the branch is ignored", 1, "phase-4/self-granted", [
  ["scripts/test/flight-deck-boundary.exceptions.json", () => JSON.stringify({ exceptions: [{ branch: "phase-4/self-granted", decision: 1, reason: "self-granted", paths: ["**"] }] })],
  operationalEdit,
]);
const weaken = ["scripts/test/flight-deck-boundary.mjs", (s) => s.replace("process.exit(r.ok ? 0 : 1);", "process.exit(0);")];
ciCase("a checker weakened on the branch cannot weaken the base checker", 1, "phase-4/weakened", [weaken, operationalEdit], (r) => {
  assert.ok(r.out.includes("FAIL [A] src/lib/flightDeck/access.ts"));
  // The weakening is real: the branch's own copy would have passed.
  const own = spawnSync(process.execPath, ["scripts/test/flight-deck-boundary.mjs", "--base", "main", "--branch", "phase-4/weakened"], { cwd: ciRepoOnce().dir, encoding: "utf8" });
  assert.equal(own.status, 0, "the weakened branch copy should exit 0 on its own");
});
