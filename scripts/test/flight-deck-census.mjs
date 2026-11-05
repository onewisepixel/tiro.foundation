// Flight Deck runtime control census (Milestone 3.0, Phase 4; decision 58).
//
// Against the local synthetic demo (npm run dev:flight-deck, on loopback),
// it resets the store to the synthetic seed, then visits every console
// screen as each role (anonymous, founder, operator, reviewer) and records
// what that role is given:
//   - the HTTP status and final path (redirects, 404s);
//   - landmarks, headings, and live regions (role=alert/status, aria-live);
//   - every form: its server-action binding, every field (tag, type, name,
//     hidden and submit values, select options, validation attributes,
//     disabled/required/checked state, accessible name), in DOM order;
//   - buttons outside forms, and links (outside table bodies).
// Random ids, dates, times and fingerprints are replaced with stable
// placeholders, numbered in order of appearance on each screen, so two runs
// on the same code produce the same JSON. Server-action ids are named from
// the build's server-reference manifest where it gives export names.
//
// It submits nothing but sign-in and the synthetic seed reset, and refuses
// any non-loopback base URL or a console without the local-demo banner.
//
//   node scripts/test/flight-deck-census.mjs --out FILE [--summary FILE.md]
//   node scripts/test/flight-deck-census.mjs --compare docs/design/phase-4/baseline/census.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertOutputDir, launch } from "./flight-deck-browser.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DIST = process.env.FLIGHT_DECK_DIST_DIR || ".next-flight-deck";
export const ROLES = ["anonymous", "founder", "operator", "reviewer"];

// Runs in the page. Returns the raw (unnormalized) record of one screen.
function snapshotInPage() {
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const text = (el) => norm(el?.textContent);
  const nameOf = (el) => {
    if (el.getAttribute("aria-label")) return norm(el.getAttribute("aria-label"));
    const lb = el.getAttribute("aria-labelledby");
    if (lb) return lb.split(/\s+/).map((id) => text(document.getElementById(id))).join(" ");
    if (el.labels && el.labels.length) return [...el.labels].map(text).join(" ");
    if (el.tagName === "INPUT" && ["submit", "button"].includes(el.type)) return norm(el.value);
    return text(el) || norm(el.getAttribute("title"));
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "aside") return "complementary";
    if (tag === "header") return el.closest("main, article, section, aside, nav") ? null : "banner";
    if (tag === "footer") return el.closest("main, article, section, aside, nav") ? null : "contentinfo";
    if (tag === "section") return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") ? "region" : null;
    if (tag === "form") return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") ? "form" : null;
    return null;
  };
  const LANDMARKS = new Set(["banner", "navigation", "main", "contentinfo", "complementary", "region", "form", "search"]);
  const landmarks = [...document.querySelectorAll("header, nav, main, footer, aside, section, form, [role]")]
    .map((el) => ({ role: roleOf(el), name: nameOf(el).slice(0, 120) }))
    .filter((l) => l.role && LANDMARKS.has(l.role))
    .map((l) => (["main", "banner", "contentinfo"].includes(l.role) ? { role: l.role } : l));
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")].map((h) => ({ level: Number(h.getAttribute("aria-level") || h.tagName.slice(1)) || null, text: text(h) }));
  const live = [...document.querySelectorAll("[role=alert], [role=status], [role=log], [aria-live]")].map((el) => ({ role: el.getAttribute("role"), live: el.getAttribute("aria-live"), text: text(el).slice(0, 200) }));
  const forms = [...document.querySelectorAll("form")].map((form) => {
    const actionInput = [...form.querySelectorAll("input[type=hidden]")].find((i) => i.name.startsWith("$ACTION_ID_"));
    const fields = [...form.elements]
      .filter((el) => !(el.name || "").startsWith("$ACTION"))
      .map((el) => {
        const tag = el.tagName.toLowerCase();
        const type = tag === "input" || tag === "button" ? el.type : tag === "select" ? (el.multiple ? "select-multiple" : "select") : tag;
        const f = { tag, type, name: el.name || null };
        if (["hidden", "submit", "button", "checkbox", "radio"].includes(type)) f.value = el.value;
        if (tag === "select") {
          f.options = [...el.options].map((o) => o.value);
          f.selected = [...el.options].filter((o) => o.defaultSelected).map((o) => o.value);
        }
        if (["text", "email", "url", "date", "number", "search", "textarea"].includes(type)) f.defaultLength = (el.defaultValue ?? "").length;
        if (type !== "hidden") f.label = nameOf(el).slice(0, 160);
        if (el.required) f.required = true;
        if (el.disabled) f.disabled = true;
        if (el.readOnly) f.readOnly = true;
        if (el.defaultChecked) f.checked = true;
        if (el.minLength > 0) f.minLength = el.minLength;
        if (el.maxLength > 0 && el.maxLength < 524288) f.maxLength = el.maxLength;
        for (const a of ["pattern", "min", "max", "step", "accept", "formaction"]) if (el.getAttribute(a) !== null) f[a] = el.getAttribute(a);
        if (el.getAttribute("aria-disabled")) f.ariaDisabled = el.getAttribute("aria-disabled");
        return f;
      });
    const section = form.closest("section, article");
    const context = section ? text(section.querySelector("h1, h2, h3")) : null;
    return { action: actionInput ? actionInput.name.slice("$ACTION_ID_".length) : form.getAttribute("action"), method: form.getAttribute("method"), context, fields };
  });
  const buttons = [...document.querySelectorAll("button")].filter((b) => !b.form).map((b) => ({ text: text(b), type: b.type, disabled: b.disabled || undefined, inMain: !!b.closest("main") }));
  const links = [...document.querySelectorAll("main a[href], nav[aria-label='Flight Deck'] a[href]")]
    .filter((a) => !a.closest("tbody"))
    .map((a) => ({ text: text(a).slice(0, 120), href: a.getAttribute("href"), current: a.getAttribute("aria-current") || undefined }));
  const tables = [...document.querySelectorAll("main table")].map((t) => ({ caption: text(t.querySelector("caption")), columns: [...t.querySelectorAll("thead th")].map(text) }));
  return { title: document.title, landmarks, headings, live, forms, buttons, links, tables };
}

// Stable placeholders. Numbered per screen, in order of first appearance.
export function normalizeScreen(raw, actionNames) {
  const counters = new Map();
  const seen = new Map();
  const token = (kind, value) => {
    const key = `${kind}:${value}`;
    if (!seen.has(key)) {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      seen.set(key, `<${kind}#${n}>`);
    }
    return seen.get(key);
  };
  let json = JSON.stringify(raw);
  json = json.replace(/"action":"([0-9a-f]{20,})"/g, (_, id) => `"action":"${actionNames.get(id) ?? token("action", id)}"`);
  json = json.replace(/\b([a-z]{2,4})_[A-HJ-NP-Za-km-z2-9]{16}\b/g, (m, prefix) => token(prefix, m));
  json = json.replace(/\b[0-9a-f]{64}\b/g, "<sha256>");
  json = json.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\b/g, "<timestamp>");
  json = json.replace(/\b\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\b/g, "<datetime>");
  json = json.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<date>");
  json = json.replace(/\b\d{2}:\d{2} UTC\b/g, "<time>");
  return JSON.parse(json);
}

// Server-action id -> export name, from the build's manifest where possible.
function actionNameMap() {
  const names = new Map();
  for (const rel of ["server/server-reference-manifest.json", "dev/server/server-reference-manifest.json"]) {
    const file = path.join(ROOT, DIST, rel);
    if (!fs.existsSync(file)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const [id, entry] of Object.entries(manifest.node ?? {})) {
        const name = entry.exportedName ?? Object.values(entry.workers ?? {}).find((w) => w.exportedName)?.exportedName;
        const file = entry.filename ?? null;
        if (name) names.set(id, file ? `${file.replace(/^.*?src\//, "src/")}#${name}` : name);
      }
    } catch {}
  }
  return names;
}

const NAMED = { b02: "Synthetic Prospect B-02", a04: "Synthetic Prospect A-04", a05: "Synthetic Prospect A-05", a07: "Synthetic Prospect A-07" };

// Resolves the seeded records (random ids) by their synthetic names.
export async function resolveTargets(b) {
  const t = {};
  await b.go("/flight-deck/relationships");
  for (const [k, name] of Object.entries(NAMED)) {
    t[k] = await b.evaluate(`[...document.querySelectorAll("a[href^='/flight-deck/relationships/prs_']")].find((a) => a.textContent.includes(${JSON.stringify(name)}))?.getAttribute("href") ?? null`);
    if (!t[k]) throw new Error(`seeded relationship not found: ${name}`);
  }
  const firstLink = async (page, prefix) => {
    await b.go(page);
    return b.evaluate(`document.querySelector("main a[href^='${prefix}']")?.getAttribute("href") ?? null`);
  };
  t.outreachB02 = await firstLink(t.b02, "/flight-deck/outreach/out_");
  t.outreachA04 = await firstLink(t.a04, "/flight-deck/outreach/out_");
  await b.go("/flight-deck/content");
  const content = await b.evaluate(`[...new Set([...document.querySelectorAll("main a[href^='/flight-deck/content/cnt_']")].map((a) => a.getAttribute("href")))]`);
  t.contentFirst = content[0] ?? null;
  t.contentLast = content[content.length - 1] ?? null;
  t.caseFirst = await firstLink("/flight-deck/cases", "/flight-deck/cases/cas_");
  return t;
}

function screensFor(role, t) {
  if (role === "anonymous") {
    return [
      ["now", "/flight-deck"],
      ["approvals", "/flight-deck/approvals"],
      ["sign-in", "/flight-deck/sign-in"],
      ["signed-out", "/flight-deck/signed-out"],
      ["gates", "/flight-deck/gates"],
      ["recovery", "/flight-deck/recovery"],
    ];
  }
  const list = [
    ["now", "/flight-deck"],
    ["relationships", "/flight-deck/relationships"],
    ["relationships-new", "/flight-deck/relationships/new"],
    ["relationship-b02", t.b02],
    ["relationship-a05", t.a05],
    ["relationship-a07-opted-out", t.a07],
    ["relationship-b02-print", `${t.b02}/print`],
    ["outreach", "/flight-deck/outreach"],
    ["outreach-b02-needs-review", t.outreachB02],
    ["outreach-a04-queued", t.outreachA04],
    ["campaigns", "/flight-deck/campaigns"],
    ["content", "/flight-deck/content"],
    ["content-first", t.contentFirst],
    ["content-last", t.contentLast],
    ["cases", "/flight-deck/cases"],
    ["cases-new", "/flight-deck/cases/new"],
    ["case-first", t.caseFirst],
    ["approvals", "/flight-deck/approvals"],
    ["digest", "/flight-deck/digest"],
    ["activity", "/flight-deck/activity"],
    ["health", "/flight-deck/health"],
    ["recovery", "/flight-deck/recovery"],
    ["gates", "/flight-deck/gates"],
    ["signed-out", "/flight-deck/signed-out"],
  ];
  return list.filter(([, p]) => p);
}

export async function runCensus({ reset = true } = {}) {
  const b = await launch(BASE);
  const actionNames = actionNameMap();
  const census = { meta: {}, roles: {} };
  try {
    await b.viewport(1440, 900);
    if (reset) await b.resetSeed();
    await b.signIn("founder");
    const targets = await resolveTargets(b);
    for (const role of ROLES) {
      if (role === "anonymous") await b.signOutAll();
      else await b.signIn(role);
      const screens = {};
      for (const [key, p] of screensFor(role, targets)) {
        const { status, path: finalPath } = await b.go(p);
        const raw = await b.evaluate(`(${snapshotInPage.toString()})()`);
        const routed = finalPath.split("?")[0] === p ? "same" : finalPath.split("?")[0];
        screens[key] = normalizeScreen({ status, final: routed, ...raw }, actionNames);
      }
      census.roles[role] = screens;
    }
  } finally {
    await b.close();
  }
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {}
  census.meta = {
    generatedAt: new Date().toISOString(),
    commit,
    base: BASE,
    actionNames: actionNames.size ? "server-reference manifest" : "placeholders (manifest unavailable)",
    note: "Synthetic local demo only. Ids, dates, times and fingerprints are placeholders numbered per screen. Compare with --compare; meta is ignored.",
  };
  return census;
}

// Lists every difference between two censuses (meta ignored).
export function diffCensus(a, b, at = "") {
  const out = [];
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== "object") {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at || "(root)"}: ${JSON.stringify(a)?.slice(0, 160)} -> ${JSON.stringify(b)?.slice(0, 160)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (at === "" && k === "meta") continue;
    out.push(...diffCensus(a[k], b[k], at ? `${at}.${k}` : k));
  }
  return out;
}

// A readable summary: what each role is given on each screen.
export function summarize(census) {
  const lines = ["# Flight Deck runtime control census: summary", "", `Generated ${census.meta.generatedAt} from \`${census.meta.commit?.slice(0, 12)}\` against the local synthetic demo. Action names: ${census.meta.actionNames}.`, ""];
  const screens = [...new Set(ROLES.flatMap((r) => Object.keys(census.roles[r] ?? {})))];
  lines.push("## Screens by role", "", "Status and route per role; forms and controls are counted. `same` means served at the requested path.", "", `| Screen | ${ROLES.join(" | ")} |`, `| --- | ${ROLES.map(() => "---").join(" | ")} |`);
  for (const s of screens) {
    const cells = ROLES.map((r) => {
      const x = census.roles[r]?.[s];
      if (!x) return "—";
      const route = x.final === "same" ? "" : ` → ${x.final}`;
      const submits = x.forms.reduce((n, f) => n + f.fields.filter((fl) => fl.type === "submit").length, 0);
      return `${x.status ?? "?"}${route}; ${x.forms.length} form(s), ${submits} submit`;
    });
    lines.push(`| ${s} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## Permission-dependent controls", "", "Each distinct form (its action, context and submit labels) and where it appears. A control missing for a role is withheld from that role.", "");
  for (const s of screens) {
    const byControl = new Map();
    for (const r of ROLES) {
      for (const f of census.roles[r]?.[s]?.forms ?? []) {
        const submits = f.fields.filter((fl) => fl.type === "submit").map((fl) => fl.label || fl.value).join(" / ");
        const key = `${f.action ?? "(no action)"}${f.context ? ` · ${f.context}` : ""}${submits ? ` · [${submits}]` : ""}`;
        if (!byControl.has(key)) byControl.set(key, new Set());
        byControl.get(key).add(r);
      }
    }
    const varying = [...byControl].filter(([, set]) => set.size < ROLES.filter((r) => census.roles[r]?.[s]).length);
    if (!varying.length) continue;
    lines.push(`### ${s}`, "", `| Control | ${ROLES.join(" | ")} |`, `| --- | ${ROLES.map(() => "---").join(" | ")} |`);
    for (const [key, set] of varying) lines.push(`| ${key.replaceAll("|", "\\|")} | ${ROLES.map((r) => (census.roles[r]?.[s] ? (set.has(r) ? "yes" : "**no**") : "—")).join(" | ")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main(argv) {
  const opt = { out: path.join(os.tmpdir(), "flight-deck-census.json"), summary: null, compare: null, reset: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") opt.out = argv[++i];
    else if (argv[i] === "--summary") opt.summary = argv[++i];
    else if (argv[i] === "--compare") opt.compare = argv[++i];
    else if (argv[i] === "--no-reset") opt.reset = false;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  assertOutputDir(path.dirname(opt.out), ROOT);
  const census = await runCensus(opt);
  fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
  fs.writeFileSync(opt.out, `${JSON.stringify(census, null, 2)}\n`);
  if (opt.summary) fs.writeFileSync(opt.summary, `${summarize(census)}\n`);
  const counts = ROLES.map((r) => `${r} ${Object.keys(census.roles[r]).length}`).join(", ");
  console.log(`census written to ${opt.out} (screens: ${counts})`);
  if (opt.compare) {
    const baseline = JSON.parse(fs.readFileSync(opt.compare, "utf8"));
    const diffs = diffCensus(baseline, census);
    if (diffs.length) {
      console.log(`DIFFERENT from ${opt.compare}: ${diffs.length} difference(s)`);
      for (const d of diffs.slice(0, 200)) console.log(`  ${d}`);
      process.exit(1);
    }
    console.log(`IDENTICAL to ${opt.compare}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
