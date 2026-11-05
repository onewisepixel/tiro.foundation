// Flight Deck protected-boundary checker (Milestone 3.0, Phase 4; decision 58).
//
// Phase 4 may change how Flight Deck looks, never what it does. This script
// compares a branch with its merge base and enforces that, in two layers:
//
//   A. Paths. Every changed file is classified (PATH_RULES): protected
//      (operational code, auth, server actions, machine routes, the shared
//      and public stylesheets and components, backend, infrastructure,
//      deployment, tooling, committed evidence), mixed (Flight Deck files
//      that hold both presentation and behaviour), or presentation (scoped
//      stylesheets, documentation). Anything unlisted is not approved.
//   B. Structure. Each changed mixed file is parsed with the TypeScript
//      compiler and reduced to a canonical tree from which presentation is
//      erased. Before and after must be identical. What is erased, and so
//      intentionally permitted:
//        - the `className` and `style` JSX attributes (their values too);
//        - side-effect stylesheet imports (`import "./x.css"`);
//        - generic wrappers: a `div` or `span` with no attributes other
//          than className/style is replaced by its children, and the two
//          tags are otherwise treated as one ("generic"). A `p` keeps its
//          identity: it is never flattened, and p <-> div/span is a change;
//        - empty decorative elements: an empty `span`, `div` or `hr` whose
//          only attribute is aria-hidden="true" (no handler, tabIndex, role,
//          href or anything else; never a control);
//        - fragments, comments, formatting, JSX whitespace and the order of
//          attributes and of import declarations.
//      Everything else is protected: imports, data reads, every condition,
//      label maps and copy, element types and order, form fields, hidden
//      tokens, action bindings, validation attributes, ids, roles, aria-*,
//      hrefs. A NEW component file passes automatically only if it is
//      provably static presentation (checkPresentationOnly); otherwise it
//      needs explicit review. The third layer, the runtime control census,
//      is scripts/test/flight-deck-census.mjs.
//
// It is a regression safeguard, not a proof of behavioural equivalence. It
// cannot see what CSS does: an erased className can hide, reorder, clip or
// recolour content, or make a control look granted. Those need review.
//
// Exceptions live in scripts/test/flight-deck-boundary.exceptions.json and
// are read from the MERGE BASE, so a branch cannot grant itself one: an
// exception must be merged (and approved) first. Only when the base has no
// exceptions file at all (the PR that introduces this checker) is the
// branch's own file used, and the report says so.
//
// Enforcement (auto mode): a branch is ENFORCED on both layers, path and
// structure, if its name is `phase-4/*` OR it changes any Flight Deck
// presentation file (a mixed file, a component, or a console stylesheet),
// whatever the branch is called. A branch that changes no Flight Deck
// presentation file is REPORTED only: it follows its own review (for
// example an authorized operational change in src/lib/flightDeck). An
// enforced branch that must also change protected code needs an exception
// merged first. --mode enforce|report overrides auto.
//
//   node scripts/test/flight-deck-boundary.mjs [--base origin/main] [--branch NAME]
//        [--mode auto|enforce|report] [--working-tree] [--json FILE]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Resolve TypeScript from the repository being checked, or, failing that,
// from beside this file (CI may run the merge base's copy from a temp dir).
function loadTypeScript() {
  for (const from of [path.join(process.cwd(), "package.json"), import.meta.url]) {
    try {
      return createRequire(from)("typescript");
    } catch {}
  }
  throw new Error("TypeScript not found; run npm ci first.");
}
const ts = loadTypeScript();

export const EXCEPTIONS_FILE = "scripts/test/flight-deck-boundary.exceptions.json";

// First match wins. [glob, class, reason]
export const PATH_RULES = [
  ["docs/flight-deck/screens/**", "protected", "committed Flight Deck evidence; never overwritten"],
  ["docs/design/phase-4/baseline/**", "protected", "the Phase 4 baseline, recorded once in PR 4.1"],
  ["docs/**", "presentation", "documentation and evidence"],
  ["src/lib/flightDeck/**", "protected", "the operations domain (config, runtime, gates, store, worker, providers, Postgres, identity)"],
  ["src/proxy.ts", "protected", "the outer gate"],
  ["src/app/flight-deck/**/actions.ts", "protected", "server actions"],
  ["src/app/flight-deck/guard.ts", "protected", "page authorization and recovery isolation"],
  ["src/app/flight-deck/auth/**", "protected", "authentication"],
  ["src/app/flight-deck/internal/**", "protected", "machine routes"],
  ["src/app/flight-deck/export/**", "protected", "exports"],
  ["src/app/flight-deck/**/route.ts", "protected", "route handlers"],
  ["src/app/flight-deck/layout.tsx", "mixed", "shell markup with the runtime gate, approvals count and sign-out"],
  ["src/app/flight-deck/**/page.tsx", "mixed", "page markup with data reads, conditions and forms"],
  ["src/app/flight-deck/**/*.css", "presentation", "console-scoped styles"],
  ["src/components/flight-deck/**/*.css", "presentation", "console-scoped styles"],
  ["src/components/flight-deck/ui.tsx", "mixed", "shared components with the status vocabulary, returnTo token and formatting"],
  ["src/components/flight-deck/client.tsx", "mixed", "navigation and submit controls"],
  ["src/components/flight-deck/*.tsx", "component", "a new presentation-only component"],
  ["src/app/globals.css", "protected", "shared with /pilot and the public site"],
  ["src/app/pilot/**", "protected", "the public-form boundary"],
  ["src/components/pilot/**", "protected", "the public-form boundary"],
  ["src/**", "protected", "the public site and shared code, outside the Phase 4 boundary"],
  ["backend/**", "protected", "backend"],
  ["infra/**", "protected", "infrastructure"],
  ["deploy/**", "protected", "deployment configuration"],
  [".github/**", "protected", "workflows"],
  ["scripts/**", "protected", "test and operations tooling, including this checker"],
  ["package.json", "protected", "dependencies and scripts"],
  ["package-lock.json", "protected", "dependencies"],
  ["**", "protected", "not an approved Phase 4 path"],
];

// Mixed files that are authorization screens: permitted, but the report
// asks for founder review of any change (assessment §4).
export const FOUNDER_REVIEW = ["src/app/flight-deck/gates/page.tsx", "src/app/flight-deck/recovery/page.tsx", "src/app/flight-deck/sign-in/page.tsx"];

// Text that must survive verbatim (SyntheticBanner; plan §4).
export const REQUIRED_LITERALS = {
  "src/components/flight-deck/ui.tsx": ["Staging · synthetic data only · cloud-hosted · no real contacts", "Local demo · synthetic data only · nothing leaves this machine"],
};

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      re += "[^/]*";
    } else {
      re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}
const globCache = new Map();
export const matchGlob = (glob, file) => {
  if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
  return globCache.get(glob).test(file);
};

export function classifyPath(file) {
  for (const [glob, cls, reason] of PATH_RULES) {
    if (matchGlob(glob, file)) {
      return { cls, reason, glob };
    }
  }
  return { cls: "protected", reason: "not an approved Phase 4 path", glob: "**" };
}

// ---------- Canonical form (layer B) ----------

const STYLE_ATTRS = new Set(["className", "style"]);
// Wrappers that carry no semantics. `p` is deliberately absent: a
// paragraph keeps its identity in the comparison.
const GENERIC = new Set(["div", "span"]);
// The only elements that may be added or removed as empty decoration.
const DECORATIVE = new Set(["span", "div", "hr"]);
const isIntrinsic = (tag) => /^[a-z]/.test(tag);
const kindName = (node) => ts.SyntaxKind[node.kind];

const serCache = new WeakMap();
export function ser(c) {
  if (serCache.has(c)) return serCache.get(c);
  const s = `${c.k}${c.t !== undefined ? `(${JSON.stringify(c.t)})` : ""}${c.c.length ? `[${c.c.map(ser).join(",")}]` : ""}`;
  serCache.set(c, s);
  return s;
}
const mk = (k, t, c, n) => {
  const o = { k, t, c: c ?? [] };
  Object.defineProperty(o, "n", { value: n, enumerable: false });
  return o;
};

function mergeText(children) {
  const out = [];
  for (const ch of children) {
    const last = out[out.length - 1];
    if (ch.k === "text" && last?.k === "text") {
      out[out.length - 1] = mk("text", `${last.t} ${ch.t}`, [], last.n);
    } else {
      out.push(ch);
    }
  }
  return out;
}

const collapse = (s) => s.replace(/\s+/g, " ").trim();

function canonJsx(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tag = opening.tagName.getText();
  const attrs = opening.attributes.properties.flatMap((a) => canon(a)).sort((x, y) => (ser(x) < ser(y) ? -1 : ser(x) > ser(y) ? 1 : 0));
  const children = ts.isJsxElement(node) ? mergeText(node.children.flatMap((ch) => canonChild(ch))) : [];
  if (isIntrinsic(tag)) {
    if (GENERIC.has(tag) && attrs.length === 0) {
      return children;
    }
    // Decorative only if it is a safe tag, has no children at all in the
    // source, and its one remaining attribute is aria-hidden="true". Any
    // handler, tabIndex, role, href, id or other attribute disqualifies it.
    const rawEmpty = ts.isJsxSelfClosingElement(node) || node.children.every((ch) => ts.isJsxText(ch) && !ch.text.trim());
    const onlyHidden = attrs.length === 1 && attrs[0].t === "aria-hidden" && attrs[0].c.length === 1 && attrs[0].c[0].k === "str" && attrs[0].c[0].t === "true";
    if (DECORATIVE.has(tag) && rawEmpty && onlyHidden) {
      return [];
    }
  }
  return [mk("jsx", isIntrinsic(tag) && GENERIC.has(tag) ? "generic" : tag, [mk("attrs", undefined, attrs, node), mk("children", undefined, children, node)], node)];
}

function canonChild(node) {
  if (ts.isJsxText(node)) {
    const t = collapse(node.text);
    return t ? [mk("text", t, [], node)] : [];
  }
  if (ts.isJsxExpression(node)) {
    if (!node.expression) return [];
    const e = node.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      const t = collapse(e.text);
      return t ? [mk("text", t, [], e)] : [];
    }
    return [mk("expr", undefined, canon(e), node)];
  }
  return canon(node);
}

export function canon(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    return canonJsx(node);
  }
  if (ts.isJsxFragment(node)) {
    return mergeText(node.children.flatMap((ch) => canonChild(ch)));
  }
  if (ts.isJsxAttribute(node)) {
    const name = node.name.getText();
    if (STYLE_ATTRS.has(name)) return [];
    const init = node.initializer;
    const value = !init ? [] : ts.isJsxExpression(init) ? (init.expression ? canon(init.expression) : []) : canon(init);
    return [mk("attr", name, value, node)];
  }
  if (ts.isJsxSpreadAttribute(node)) {
    return [mk("attr", "...", canon(node.expression), node)];
  }
  if (ts.isParenthesizedExpression(node) && (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression) || ts.isJsxFragment(node.expression))) {
    const inner = canon(node.expression);
    return inner.length === 1 ? inner : [mk("fragment", undefined, inner, node)];
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [mk("str", node.text, [], node)];
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return [mk("id", node.text, [], node)];
  }
  if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) || ts.isRegularExpressionLiteral(node)) {
    return [mk(kindName(node), node.text, [], node)];
  }
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return [mk(kindName(node), node.text, [], node)];
  }
  const children = [];
  ts.forEachChild(node, (ch) => {
    children.push(...canon(ch));
  });
  const op = ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? ts.tokenToString(node.operator) : undefined;
  // A JSX expression that reduced to nothing (e.g. a fragment of wrappers)
  // still keeps its place, so conditions around it stay comparable.
  return [mk(kindName(node), op, children, node)];
}

const isStyleImport = (spec) => /\.(css|scss)$/.test(spec);

export function canonicalize(text, file = "file.tsx") {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = [];
  const styleImports = [];
  const statements = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      if (!st.importClause && isStyleImport(spec)) {
        styleImports.push(spec);
        continue;
      }
      const cl = st.importClause;
      const parts = [];
      if (cl?.isTypeOnly) parts.push("type");
      if (cl?.name) parts.push(`default=${cl.name.text}`);
      if (cl?.namedBindings) {
        if (ts.isNamespaceImport(cl.namedBindings)) {
          parts.push(`* as ${cl.namedBindings.name.text}`);
        } else {
          const names = cl.namedBindings.elements.map((e) => `${e.isTypeOnly ? "type " : ""}${e.propertyName ? `${e.propertyName.text} as ` : ""}${e.name.text}`).sort();
          parts.push(`{${names.join(", ")}}`);
        }
      }
      imports.push({ key: `${spec} :: ${parts.join(" ")}`, node: st });
      continue;
    }
    statements.push(...canon(st));
  }
  imports.sort((a, b) => (a.key < b.key ? -1 : 1));
  return { sf, imports, styleImports, statements };
}

function diverge(a, b) {
  if (!a || !b || a.k !== b.k || a.t !== b.t) {
    return { a, b };
  }
  const n = Math.max(a.c.length, b.c.length);
  for (let i = 0; i < n; i++) {
    if (!a.c[i] || !b.c[i]) {
      return { a: a.c[i] ?? a, b: b.c[i] ?? b };
    }
    if (ser(a.c[i]) !== ser(b.c[i])) {
      return diverge(a.c[i], b.c[i]);
    }
  }
  return null;
}

const PERMISSION_RE = /\bcan\(|\.role\b|founder|reviewer|operator|approv|gate|consoleOk|fresh|\.ok\b|recovery|[pP]aused|actor\b/;
const DATA_RE = /^(rt\.store|rt\.identity|tx|identity|store)\.|^(operatorDirectory|checkRecovery|requirePage|getActor|getBootstrapRuntime|getConsoleRuntime|computeAlerts|buildBriefing|contactEligibility|payloadFor|verifyGate|isFreshAuth|exportProspect|allowedTransitions)\b/;
const ATTR_CATEGORY = [
  [/^(action|formAction)$/, "server-action binding"],
  [/^(name|value|type|defaultValue|defaultChecked|checked|multiple|encType|method)$/, "form field, value or hidden token"],
  [/^(required|minLength|maxLength|min|max|pattern|step|disabled|readOnly|accept|autoComplete|inputMode)$/, "validation or state attribute"],
  [/^(role|aria-live|aria-atomic|aria-relevant|aria-busy)$/, "live-region or role semantics"],
  [/^(id|htmlFor|aria-.*|tabIndex|title|alt)$/, "referenced id or accessible name"],
  [/^(href|target|rel|download)$/, "navigation target"],
];

export function categorize(node) {
  let attr = null;
  let condition = null;
  let fn = null;
  let topConst = null;
  let call = null;
  let inJsxText = ts.isJsxText(node);
  for (let x = node; x && x.parent; x = x.parent) {
    const p = x.parent;
    if (!attr && ts.isJsxAttribute(x)) attr = x.name.getText();
    if (!attr && ts.isJsxAttribute(p)) attr = p.name.getText();
    if (!condition) {
      if ((ts.isConditionalExpression(p) && p.condition === x) || ((ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === x)) {
        condition = x.getText();
      } else if (ts.isBinaryExpression(p) && p.left === x && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) {
        condition = x.getText();
      }
    }
    if (!call && ts.isCallExpression(p) && DATA_RE.test(p.expression.getText())) call = p.expression.getText();
    if (ts.isFunctionDeclaration(p) && p.name) fn = p.name.text;
    const statement = ts.isVariableDeclaration(p) ? p.parent?.parent : undefined;
    if (statement && ts.isVariableStatement(statement) && statement.parent && ts.isSourceFile(statement.parent) && p.initializer && (ts.isObjectLiteralExpression(p.initializer) || ts.isArrayLiteralExpression(p.initializer) || ts.isAsExpression(p.initializer))) {
      topConst = p.name.getText();
    }
    if (ts.isJsxText(x)) inJsxText = true;
  }
  if (fn === "SyntheticBanner") return "SyntheticBanner text";
  if (attr) {
    for (const [re, cat] of ATTR_CATEGORY) if (re.test(attr)) return cat;
    return `behaviour attribute (${attr})`;
  }
  if (condition) return PERMISSION_RE.test(condition) ? "permission, approval or gate condition" : "conditional rendering";
  if (topConst) return "status vocabulary or label map";
  if (call) return "data read or runtime call";
  if (inJsxText || (ts.isStringLiteral(node) && ts.isJsxExpression(node.parent))) return "visible text";
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return "element structure (landmarks, headings, controls, order)";
  return "behaviour code or element order";
}

// A difference is categorized from both sides (a removed attribute exists
// only before; a new condition only after); the more specific one is kept.
const SPECIFICITY = [
  "SyntheticBanner text",
  "server-action binding",
  "form field, value or hidden token",
  "validation or state attribute",
  "live-region or role semantics",
  "referenced id or accessible name",
  "navigation target",
  "permission, approval or gate condition",
  "status vocabulary or label map",
  "data read or runtime call",
  "conditional rendering",
  "visible text",
];
function mostSpecific(categories) {
  const rank = (c) => {
    const i = SPECIFICITY.indexOf(c);
    return i === -1 ? SPECIFICITY.length : i;
  };
  return [...categories].sort((x, y) => rank(x) - rank(y))[0];
}

const lineOf = (node) => (node ? node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1 : null);
const snippet = (node) => (node ? collapse(node.getText()).slice(0, 120) : "(absent)");

// Compares two versions of a mixed file. Returns findings (empty = equal).
export function compareSources(before, after, file = "file.tsx") {
  const A = canonicalize(before, file);
  const B = canonicalize(after, file);
  const findings = [];
  const aKeys = new Set(A.imports.map((i) => i.key));
  const bKeys = new Set(B.imports.map((i) => i.key));
  for (const i of B.imports) if (!aKeys.has(i.key)) findings.push({ file, line: lineOf(i.node), category: "operational import", message: `import added or changed: ${i.key}` });
  for (const i of A.imports) if (!bKeys.has(i.key)) findings.push({ file, line: null, category: "operational import", message: `import removed or changed: ${i.key}` });
  const n = Math.max(A.statements.length, B.statements.length);
  for (let i = 0; i < n; i++) {
    const a = A.statements[i];
    const b = B.statements[i];
    if (a && b && ser(a) === ser(b)) continue;
    const d = a && b ? diverge(a, b) : { a, b };
    if (!d) continue;
    findings.push({
      file,
      line: lineOf(d.b?.n) ?? lineOf(d.a?.n),
      category: mostSpecific([d.a?.n, d.b?.n].filter(Boolean).map(categorize)),
      message: `before: ${snippet(d.a?.n)} | after: ${snippet(d.b?.n)}`,
    });
    break; // statements after a structural change are misaligned; one finding per file is enough to fail
  }
  for (const literal of REQUIRED_LITERALS[file] ?? []) {
    if (!after.includes(literal)) findings.push({ file, line: null, category: "SyntheticBanner text", message: `required text missing: "${literal}"` });
  }
  return findings;
}

// A NEW component under src/components/flight-deck passes automatically only
// if it is provably static presentation. The rule is an allowlist: anything
// the checker cannot establish as safe is a finding, and the file then needs
// explicit review (an exception merged first). Permitted:
//   - imports of stylesheets and of types only (no value import at all, so
//     no indirect route to operational modules, actions, hooks or Link);
//   - type declarations, function components, and constants made of literals;
//   - JSX of non-interactive elements and of components declared in the
//     same file, with no event handler, ref, spread, href/src, tabIndex,
//     action, name or dangerouslySetInnerHTML;
//   - only these calls: join, filter, map, slice, concat, trim, toUpperCase,
//     toLowerCase (building class names and lists).
// Rejected: "use client"/"use server", any other call (fetch, hooks, server
// actions, timers, router, clipboard), new, await, assignment, increment,
// tagged templates, browser and runtime globals, top-level code.
const SAFE_METHODS = new Set(["join", "filter", "map", "slice", "concat", "trim", "toUpperCase", "toLowerCase"]);
const UNSAFE_GLOBALS = new Set(["window", "document", "globalThis", "self", "localStorage", "sessionStorage", "navigator", "location", "history", "process", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "eval", "Function", "setTimeout", "setInterval", "requestAnimationFrame", "require", "module", "crypto", "indexedDB", "caches"]);
const UNSAFE_TAGS = new Set(["a", "button", "input", "select", "textarea", "form", "label", "option", "details", "summary", "dialog", "iframe", "object", "embed", "script", "style", "link", "meta", "video", "audio", "img", "picture", "source", "area", "map", "canvas"]);
const UNSAFE_ATTRS = new Set(["action", "formAction", "form", "name", "ref", "tabIndex", "href", "src", "srcSet", "dangerouslySetInnerHTML", "contentEditable", "autoFocus", "draggable", "target", "download"]);
const isLiteralValue = (n) =>
  ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isArrayLiteralExpression(n) && n.elements.every(isLiteralValue)) ||
  (ts.isObjectLiteralExpression(n) && n.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralValue(p.initializer))) ||
  ((ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) && isLiteralValue(n.expression));
const isPlainFunction = (n) => (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && !n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) && !n.asteriskToken;

export function checkPresentationOnly(text, file = "component.tsx") {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  const push = (node, message) => findings.push({ file, line: lineOf(node), category: "new component needs explicit review", message });
  const local = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      const cl = st.importClause;
      const typeOnly = cl && (cl.isTypeOnly || (!cl.name && cl.namedBindings && ts.isNamedImports(cl.namedBindings) && cl.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!(isStyleImport(spec) && !cl) && !typeOnly) push(st, `value import from "${spec}" (new components may import only stylesheets and types)`);
    } else if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      push(st, `"${st.expression.text}" directive`);
    } else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) {
      // types are erased
    } else if (ts.isFunctionDeclaration(st)) {
      if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) || st.asteriskToken) push(st, "async or generator function");
      if (st.name) local.add(st.name.text);
    } else if (ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const) {
      for (const d of st.declarationList.declarations) {
        if (!d.initializer || !(isPlainFunction(d.initializer) || isLiteralValue(d.initializer))) push(d, `top-level value that is neither a plain function nor a literal: ${d.name.getText()}`);
        if (ts.isIdentifier(d.name)) local.add(d.name.text);
      }
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      // export default Name
    } else if (ts.isExportDeclaration(st) && !st.moduleSpecifier) {
      // export { Name }
    } else {
      push(st, `top-level statement that may run code: ${collapse(st.getText()).slice(0, 60)}`);
    }
  }
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (!method || !SAFE_METHODS.has(method)) push(node, `call: ${collapse(callee.getText()).slice(0, 60)}()`);
    }
    if (ts.isNewExpression(node)) push(node, "new expression");
    if (ts.isAwaitExpression(node) || ts.isYieldExpression(node)) push(node, "await or yield");
    if (ts.isTaggedTemplateExpression(node)) push(node, "tagged template");
    if (ts.isDeleteExpression(node)) push(node, "delete");
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) push(node, "assignment");
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) push(node, "increment or decrement");
    if (ts.isIdentifier(node) && UNSAFE_GLOBALS.has(node.text)) {
      const p = node.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node);
      if (!isPropertyName) push(node, `browser or runtime global: ${node.text}`);
    }
    if (ts.isJsxSpreadAttribute(node)) push(node, "spread attributes (could pass handlers or bindings)");
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText();
      if (/^on[A-Z]/.test(name)) push(node, `event handler: ${name}`);
      else if (UNSAFE_ATTRS.has(name)) push(node, `attribute: ${name}`);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      if (isIntrinsic(tag) && UNSAFE_TAGS.has(tag)) push(node, `interactive or resource element: <${tag}>`);
      if (!isIntrinsic(tag) && !local.has(tag)) push(node, `component not declared in this file: <${tag}>`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

// ---------- Git and exceptions ----------

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const showAt = (rev, file, cwd) => {
  try {
    return git(["show", `${rev}:${file}`], cwd);
  } catch {
    return null;
  }
};

export function loadExceptions(mergeBase, cwd, readHead) {
  const fromBase = showAt(mergeBase, EXCEPTIONS_FILE, cwd);
  let source = "merge base";
  let text = fromBase;
  if (text === null) {
    text = readHead(EXCEPTIONS_FILE);
    source = text === null ? "none" : "branch (bootstrap: the merge base has no exceptions file)";
  }
  if (text === null) return { source, list: [] };
  const list = JSON.parse(text).exceptions ?? [];
  for (const e of list) {
    if (!e.branch || typeof e.decision !== "number" || !e.reason) {
      throw new Error(`${EXCEPTIONS_FILE}: every exception needs a branch, a decision number and a reason`);
    }
  }
  return { source, list };
}

function changedFiles(mergeBase, cwd, workingTree) {
  const out = git(["diff", "--name-status", "--no-renames", "-z", mergeBase, ...(workingTree ? [] : ["HEAD"])], cwd).split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < out.length; i += 2) files.push({ status: out[i][0], file: out[i + 1] });
  if (workingTree) {
    for (const f of git(["ls-files", "--others", "--exclude-standard", "-z"], cwd).split("\0").filter(Boolean)) files.push({ status: "A", file: f });
  }
  return files.sort((a, b) => (a.file < b.file ? -1 : 1));
}

export function runCheck({ base = "origin/main", branch, mode = "auto", workingTree = false, cwd = process.cwd() } = {}) {
  const mergeBase = git(["merge-base", base, "HEAD"], cwd).trim();
  const head = git(["rev-parse", "HEAD"], cwd).trim();
  branch = branch || process.env.BOUNDARY_BRANCH || git(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
  const readHead = (file) => {
    if (workingTree) {
      const p = path.join(cwd, file);
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    }
    return showAt("HEAD", file, cwd);
  };
  const exceptions = loadExceptions(mergeBase, cwd, readHead);
  const mine = exceptions.list.filter((e) => matchGlob(e.branch, branch));
  const pathException = (file) => mine.find((e) => (e.paths ?? []).some((g) => matchGlob(g, file)));
  const structuralException = (file) => mine.find((e) => (e.structural ?? []).some((g) => matchGlob(g, file)));

  const files = changedFiles(mergeBase, cwd, workingTree).map((f) => ({ ...f, ...classifyPath(f.file) }));
  // Flight Deck presentation: a mixed file, a component, or a console
  // stylesheet. Touching any of them brings the whole branch under
  // enforcement, whatever it is called.
  const presentationFiles = files.filter((f) => f.cls === "mixed" || f.cls === "component" || (f.cls === "presentation" && f.file.startsWith("src/")));
  const phase4Branch = branch.startsWith("phase-4/");
  if (!["auto", "enforce", "report"].includes(mode)) throw new Error(`unknown mode: ${mode}`);
  const effective = mode === "auto" ? (phase4Branch || presentationFiles.length ? "enforce" : "report") : mode;
  const reason =
    mode !== "auto" ? `--mode ${mode}` : phase4Branch ? "a phase-4/* branch" : presentationFiles.length ? `changes Flight Deck presentation (${presentationFiles.map((f) => f.file).slice(0, 3).join(", ")}${presentationFiles.length > 3 ? ", ..." : ""})` : "changes no Flight Deck presentation file";

  const findings = [];
  const notes = [];
  const add = (layer, f) => findings.push({ layer, enforced: effective === "enforce", ...f });

  for (const f of files) {
    if (f.cls === "protected") {
      const ex = pathException(f.file);
      if (ex) {
        notes.push(`${f.file}: protected (${f.reason}); permitted by exception, decision ${ex.decision}: ${ex.reason}`);
      } else {
        add("A", { file: f.file, line: null, category: "protected path", message: `${f.status === "D" ? "deleted" : f.status === "A" ? "added" : "modified"}: ${f.reason}` });
      }
      continue;
    }
    if (f.cls === "presentation") continue;
    const after = f.status === "D" ? null : readHead(f.file);
    if (f.cls === "component") {
      if (f.status === "D") {
        add("B", { file: f.file, line: null, category: "deleted Flight Deck file", message: "a Flight Deck component was deleted" });
      } else if (f.status === "A") {
        const result = checkPresentationOnly(after, f.file);
        const ex = structuralException(f.file);
        if (result.length && ex) notes.push(`${f.file}: new component reviewed and permitted by exception, decision ${ex.decision}: ${ex.reason}`);
        else for (const x of result) add("B", x);
      } else {
        const before = showAt(mergeBase, f.file, cwd);
        for (const x of compareSources(before, after, f.file)) add("B", x);
      }
      continue;
    }
    // mixed
    if (f.status === "D" || f.status === "A") {
      if (structuralException(f.file)) {
        notes.push(`${f.file}: ${f.status === "A" ? "new" : "deleted"} mixed file permitted by exception, decision ${structuralException(f.file).decision}`);
      } else {
        add("B", { file: f.file, line: null, category: f.status === "A" ? "new route or layout" : "deleted Flight Deck file", message: f.status === "A" ? "adds a page or layout (new behaviour)" : "removes a page or component" });
      }
      continue;
    }
    if (FOUNDER_REVIEW.includes(f.file)) notes.push(`${f.file}: an authorization screen; any change needs founder review`);
    const before = showAt(mergeBase, f.file, cwd);
    const result = compareSources(before, after, f.file);
    const ex = structuralException(f.file);
    if (result.length && ex) {
      notes.push(`${f.file}: ${result.length} structural difference(s) permitted by exception, decision ${ex.decision}: ${ex.reason}`);
      continue;
    }
    for (const x of result) add("B", x);
    const styleAdded = canonicalize(after, f.file).styleImports.filter((s) => !canonicalize(before, f.file).styleImports.includes(s));
    for (const s of styleAdded) notes.push(`${f.file}: stylesheet import added (${s}); permitted as style-only`);
  }

  const failed = findings.filter((x) => x.enforced);
  return { base, mergeBase, head, branch, mode: effective, modeReason: reason, exceptionsSource: exceptions.source, files, findings, notes, ok: failed.length === 0 };
}

export function formatReport(r) {
  const lines = [];
  lines.push(`Flight Deck boundary check (decision 58)`);
  lines.push(`  branch ${r.branch}, head ${r.head.slice(0, 12)}, merge base ${r.mergeBase.slice(0, 12)} (${r.base})`);
  lines.push(`  mode: ${r.mode} (${r.mode === "enforce" ? "paths and structure enforced" : "reported only; the branch follows its own review"}): ${r.modeReason}`);
  lines.push(`  exceptions read from: ${r.exceptionsSource}`);
  const counts = {};
  for (const f of r.files) counts[f.cls] = (counts[f.cls] ?? 0) + 1;
  lines.push(`  ${r.files.length} changed file(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`);
  for (const n of r.notes) lines.push(`  note: ${n}`);
  for (const x of r.findings) lines.push(`  ${x.enforced ? "FAIL" : "info"} [${x.layer}] ${x.file}${x.line ? `:${x.line}` : ""} — ${x.category}: ${x.message}`);
  lines.push(r.ok ? "PASS: the protected boundary holds." : `FAIL: ${r.findings.filter((x) => x.enforced).length} protected change(s).`);
  return lines.join("\n");
}

function main(argv) {
  const opt = { base: "origin/main", mode: "auto", workingTree: false };
  let json = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opt.base = argv[++i];
    else if (a === "--branch") opt.branch = argv[++i];
    else if (a === "--mode") opt.mode = argv[++i];
    else if (a === "--working-tree") opt.workingTree = true;
    else if (a === "--json") json = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  const r = runCheck(opt);
  console.log(formatReport(r));
  if (json) fs.writeFileSync(json, JSON.stringify({ ...r, files: r.files.map(({ status, file, cls }) => ({ status, file, cls })) }, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
