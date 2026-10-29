// Verifies the disclosure boundary against the PRODUCTION BUILD OUTPUT,
// not just unit-level projections. Run after `next build`:
//
//   npm run build && npm run verify:disclosure
//
// Checks:
//  1. No client bundle (.next/static) contains internal archive material:
//     canary strings, internal field names, or restricted node ids.
//  2. No prerendered page or RSC payload (.next/server/app, non-JS files)
//     contains a canary or a restricted/undiscoverable identifier.
//  3. The undiscoverable record has no generated page or manifest route,
//     so it is served the same 404 as an id that never existed.
//  4. The Living Trace routes are statically prerendered (so check 2
//     actually covers them) and carry noindex. 4b: the authority scenario's
//     page, at exactly its expected routes, publishes only the safe consent
//     summary. 4c: every synthetic record page carries noindex.
//     A page that should be checked but cannot be found is a failure.
//  5. No public search structure (sitemap, search index) exists that could
//     list specimen records.
//
// Server-side JS chunks are expected to contain the archive (the
// projection runs on the server) and are deliberately not scanned.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NEXT = path.join(ROOT, ".next");
const failures = [];
const fail = (msg) => failures.push(msg);

if (!fs.existsSync(path.join(NEXT, "BUILD_ID"))) {
  console.error("No production build found (.next/BUILD_ID). Run `npm run build` first.");
  process.exit(2);
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const rel = (f) => path.relative(ROOT, f).replaceAll("\\", "/");

// Private keys of the authority scenario (src/data/livingTrace/
// authorityScenario.ts), matched only as SERIALIZED keys ("key":) so that
// documentation or prose naming a field is not a false positive. Their
// values are already caught by /CANARY/; this catches the keys themselves,
// even when empty. Unit-level coverage of every private key, at any depth,
// is src/lib/livingTrace/disclosureGuards.test.ts.
const SERIALIZED_PRIVATE_KEYS =
  /"(contactRecord|receiptRef|documentRef|authorizedBy|identityPublic|publicLabel|publicRole|mandates|requiredFrom|executedBy)"\s*:/;

// 1. Client bundles.
const CLIENT_FORBIDDEN = [
  /CANARY/,
  /INTERNAL_RECORDS|INTERNAL_EDGES|INTERNAL_NODES|SCENARIO_RECORDS/,
  /authorizedDisclosure|grantRef|internalNotes/,
  SERIALIZED_PRIVATE_KEYS,
  /"rec-[ru]"/,
  /DEMO-LT-0003/,
];
const clientFiles = walk(path.join(NEXT, "static")).filter((f) => /\.(js|css|json|txt|html)$/.test(f));
for (const file of clientFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of CLIENT_FORBIDDEN) {
    if (pattern.test(text)) {
      fail(`client bundle ${rel(file)} matches ${pattern}`);
    }
  }
}

// 2. Prerendered output (HTML, RSC payloads, metadata), excluding server JS.
const PAGE_FORBIDDEN = [/CANARY/, /"rec-[ru]"/, /DEMO-LT-0003/, /grantRef|internalNotes/, SERIALIZED_PRIVATE_KEYS];
const serverApp = path.join(NEXT, "server", "app");
const pageFiles = walk(serverApp).filter((f) => !/\.(js|map|nft\.json)$/.test(f));
for (const file of pageFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of PAGE_FORBIDDEN) {
    if (pattern.test(text)) {
      fail(`prerendered output ${rel(file)} matches ${pattern}`);
    }
  }
}

// 3. No page or route for the undiscoverable record.
for (const file of walk(serverApp)) {
  if (file.includes("DEMO-LT-0003")) {
    fail(`generated file for undiscoverable record: ${rel(file)}`);
  }
}
const manifestPath = path.join(NEXT, "prerender-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routes = Object.keys(manifest.routes ?? {});
if (routes.some((r) => r.includes("DEMO-LT-0003"))) {
  fail("prerender-manifest lists the undiscoverable record");
}
const specimenRoutes = routes.filter((r) => r.startsWith("/living-trace/records/"));
const expectedSpecimens = ["/living-trace/records/DEMO-LT-0001", "/living-trace/records/DEMO-LT-0002", "/living-trace/records/DEMO-LT-0004", "/living-trace/records/DEMO-LT-0005"];
for (const r of expectedSpecimens) {
  if (!specimenRoutes.includes(r)) {
    fail(`expected prerendered specimen route missing: ${r}`);
  }
}
for (const r of specimenRoutes) {
  if (!expectedSpecimens.includes(r)) {
    fail(`unexpected prerendered specimen route: ${r}`);
  }
}

// 4. Living Trace routes are static and noindex.
for (const route of ["/", "/living-trace", "/living-trace/graph.json", ...expectedSpecimens]) {
  if (!routes.includes(route)) {
    fail(`route is not statically prerendered, so its output is not verified here: ${route}`);
  }
}
const NOINDEX = /<meta name="robots" content="noindex, nofollow"/;
// A missing file is a failure, not a pass: an unchecked page is unverified.
function requireNoindex(route) {
  const html = path.join(serverApp, `${route.slice(1)}.html`);
  if (!fs.existsSync(html)) {
    fail(`${route} has no prerendered HTML, so its noindex cannot be verified`);
  } else if (!NOINDEX.test(fs.readFileSync(html, "utf8"))) {
    fail(`${route} is missing noindex`);
  }
}
for (const route of ["/living-trace", ...expectedSpecimens]) {
  requireNoindex(route);
}

// 4b. The authority scenario's page publishes only the safe consent summary.
// The signer's and the subject's ids, and the mandate's dates, are
// prohibited on this page alone: "S-01" is also the public label of a
// Living Trace source elsewhere.
//
// The scenario's routes are listed exactly. A scenario page found anywhere
// else, or an expected one that is missing, fails: moving the records (plan
// Phase 3) must update this list, so the checks can never be skipped
// silently by a route change.
const EXPECTED_SCENARIO_ROUTES = ["/preview/memory-v1/records/DEMO-MP-0001"];
const scenarioRoutes = routes.filter((r) => /\/DEMO-MP-\d+$/.test(r));
for (const r of EXPECTED_SCENARIO_ROUTES) {
  if (!scenarioRoutes.includes(r)) {
    fail(`expected authority-scenario route missing (moved? update EXPECTED_SCENARIO_ROUTES): ${r}`);
  }
}
for (const r of scenarioRoutes) {
  if (!EXPECTED_SCENARIO_ROUTES.includes(r)) {
    fail(`unexpected authority-scenario route, not covered by these checks: ${r}`);
  }
}
const SCENARIO_FORBIDDEN = [/\bS-01\b/, /\bP-02\b/, /2026-10-01|2027-09-30/, /validFrom|validUntil/];
for (const route of scenarioRoutes) {
  for (const ext of [".html", ".rsc"]) {
    const file = path.join(serverApp, `${route.slice(1)}${ext}`);
    if (!fs.existsSync(file)) {
      fail(`${route} has no prerendered ${ext} output, so it cannot be verified`);
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of SCENARIO_FORBIDDEN) {
      if (pattern.test(text)) {
        fail(`authority scenario output ${rel(file)} matches ${pattern}`);
      }
    }
  }
  // .meta is optional output; scan it when present.
  const meta = path.join(serverApp, `${route.slice(1)}.meta`);
  if (fs.existsSync(meta)) {
    const text = fs.readFileSync(meta, "utf8");
    for (const pattern of SCENARIO_FORBIDDEN) {
      if (pattern.test(text)) {
        fail(`authority scenario output ${rel(meta)} matches ${pattern}`);
      }
    }
  }
}

// 4c. Every synthetic record page is noindex (decision 45, proposed):
// fictional records must not be mistaken for historical evidence. Covers
// every prerendered DEMO-LT / DEMO-MP record route, wherever it lives.
for (const route of routes.filter((r) => /\/DEMO-(LT|MP)-\d+$/.test(r))) {
  requireNoindex(route);
}

// 5. No public search structures.
for (const name of ["sitemap.xml", "sitemap.xml.body", "search.json"]) {
  if (fs.existsSync(path.join(serverApp, name))) {
    fail(`public search structure present: ${name}; it must be checked for specimen records`);
  }
}

console.log(`scanned ${clientFiles.length} client files, ${pageFiles.length} prerendered files, ${routes.length} routes`);
if (failures.length) {
  console.error(`\n${failures.length} disclosure failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("disclosure boundary holds in the production build");
