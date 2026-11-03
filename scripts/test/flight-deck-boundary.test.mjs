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
permits("shell header offset via the token", "layout", (s) => mutate(mutate(s, `pt-[61px]`, `pt-[var(--la-header)]`), `top-[61px]`, `top-[var(--la-header)]`));
permits("approved style-only import (page stylesheet)", "approvals", (s) => `import "./approvals.css";\n${s}`);
permits("approved style-only import (console stylesheet in the shell)", "layout", (s) => `import "@/components/flight-deck/flight-deck.css";\n${s}`);
permits("harmless presentation wrapper", "approvals", (s) => mutate(s, `      <Notice params={params} />`, `      <div className="fd-notices">\n        <Notice params={params} />\n      </div>`));
permits("wrapper inside a shared component", "ui", (s) => mutate(s, `<h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight md:text-4xl">{title}</h1>`, `<div className="fd-title-rule"><h1 className="fd-title">{title}</h1></div>`));
permits("generic tag swap with the same semantics (p -> div)", "ui", (s) => mutate(mutate(s, `<p role="alert" className=`, `<div role="alert" className=`), `      </p>\n    );\n  }\n  if (notice) {`, `      </div>\n    );\n  }\n  if (notice) {`));
permits("inline style removed", "now", (s) => mutate(s, ` style={{ borderColor: a.severity === "action" ? "var(--tiro-contested)" : "var(--tiro-accent)" }}`, ``));
permits("decorative empty element added", "health", (s) => mutate(s, `      <PageTitle eyebrow="Health"`, `      <span aria-hidden="true" className="fd-rule" />\n      <PageTitle eyebrow="Health"`));
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

test("a new presentation-only component passes", () => {
  const src = `import "./frame.css";\nexport function Frame({ children }: { children: React.ReactNode }) {\n  return <div className="fd-frame">{children}</div>;\n}\n`;
  assert.deepEqual(checkPresentationOnly(src), []);
});
test("a new component with a form, an action or an operational import fails", () => {
  const src = `import { can } from "@/lib/flightDeck/access";\nimport { decideAction } from "@/app/flight-deck/actions";\nexport function Bad() {\n  return <form action={decideAction}><input name="hash" /></form>;\n}\n`;
  const cats = checkPresentationOnly(src).map((f) => f.message);
  assert.ok(cats.some((m) => m.includes("@/lib/flightDeck/access")));
  assert.ok(cats.some((m) => m.includes("action=")));
  assert.ok(cats.some((m) => m.includes("<form>")));
  assert.ok(cats.some((m) => m.includes("name=")));
});

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
