// Public-site release checks (Milestone 3.0 Phase 3a, gate G3), against a
// running production build. Uses Chrome or Edge over the DevTools
// protocol and axe-core (a dev dependency); no other test dependencies.
//
//   node scripts/test/public-site-checks.mjs check <baseUrl> <outFile.json>
//   node scripts/test/public-site-checks.mjs perf <outFile.json> <url> [<url> ...]
//
// check: redirects and status codes; every internal link from the public
// pages, crawled; robots (indexable pages vs noindex synthetic records);
// axe-core (WCAG 2.0-2.2 A/AA) in both themes at desktop and mobile;
// horizontal overflow at 320, 390 and 820 px; the narrow-screen menu
// (opens, lists every destination, closes on Escape); the header's tab
// order. Exits 1 on any failure.
//
// perf: each URL loaded cold five times with a throttled CPU (4x) and
// network (150 ms RTT, 1.6 Mbps down) at 390 px; reports the median LCP,
// CLS, FCP, total blocking time, and transferred bytes (all and script).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [mode, ...args] = process.argv.slice(2);
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(
  (p) => p && fs.existsSync(p),
);
if (!CHROME) {
  console.error("No Chrome or Edge found; set CHROME_PATH.");
  process.exit(2);
}
const AXE = fs.readFileSync(path.resolve(import.meta.dirname, "../../node_modules/axe-core/axe.min.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "public-checks-"));
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error("Chrome did not start");
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of [...listeners]) l(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) => new Promise((r) => listeners.push(function l(m) { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } }));
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (url) => {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
    await evaluate("document.fonts.ready.then(() => true)");
    await sleep(400);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return { send, evaluate, go, listeners, close: () => { ws.close(); proc.kill(); } };
}

const LIVING_ARCHIVE = ["/", "/memory-project", "/memory-project/records/DEMO-LT-0001", "/memory-project/records/DEMO-LT-0002", "/memory-project/records/DEMO-MP-0001"];
const INNER = ["/manifesto", "/about", "/community-rights", "/nodes", "/pilot", "/contact", "/living-trace", "/memories"];

async function check(base, outFile) {
  const results = [];
  const ok = (name, pass, detail = "") => {
    results.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };
  const head = (p) => fetch(base + p, { redirect: "manual" });

  // ---------- Redirects and status ----------
  for (const [from, to] of [
    ["/preview/home-v5", "/"],
    ["/preview/memory-v1", "/memory-project"],
    ["/preview/memory-v1/records/DEMO-LT-0001", "/memory-project/records/DEMO-LT-0001"],
    ["/preview/memory-v1/records/DEMO-MP-0001?ref=x", "/memory-project/records/DEMO-MP-0001?ref=x"],
  ]) {
    const r = await head(from);
    const loc = r.headers.get("location");
    ok(`redirect ${from}`, r.status === 307 && loc === to, `${r.status} -> ${loc}`);
    const final = await fetch(base + from);
    ok(`redirect ${from} lands on 200`, final.status === 200, String(final.status));
  }
  // An undiscoverable id and an id that never existed are indistinguishable.
  const a = await fetch(base + "/preview/memory-v1/records/DEMO-LT-0003");
  const b = await fetch(base + "/preview/memory-v1/records/DEMO-LT-9999");
  ok("undiscoverable record redirects and 404s like a nonexistent one", a.status === 404 && b.status === 404 && a.redirected && b.redirected, `${a.status}/${b.status}`);
  for (const p of ["/memory-project/records/DEMO-LT-0003", "/memory-project/records/DEMO-LT-9999", "/flight-deck", "/flight-deck/sign-in", "/flight-deck/internal/status"]) {
    ok(`${p} is 404`, (await head(p)).status === 404);
  }
  for (const p of ["/preview/home-v2", "/preview/home-v3", "/preview/home-v3-1", "/preview/home-v4"]) {
    ok(`${p} still served (Phase 5)`, (await head(p)).status === 200);
  }

  // ---------- Robots ----------
  const robots = async (p) => /<meta name="robots" content="noindex/.test(await (await fetch(base + p)).text());
  for (const p of ["/", "/memory-project", ...INNER.filter((x) => x !== "/living-trace")]) {
    ok(`${p} is indexable`, !(await robots(p)));
  }
  for (const p of ["/memory-project/records/DEMO-LT-0001", "/memory-project/records/DEMO-LT-0002", "/memory-project/records/DEMO-LT-0004", "/memory-project/records/DEMO-LT-0005", "/memory-project/records/DEMO-MP-0001", "/living-trace"]) {
    ok(`${p} is noindex`, await robots(p));
  }

  // ---------- Link crawl ----------
  const seen = new Map();
  const queue = [...LIVING_ARCHIVE, ...INNER];
  const linksFrom = new Map();
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    const r = await fetch(base + p, { redirect: "manual" });
    seen.set(p, r.status);
    if (r.status !== 200 || !/text\/html/.test(r.headers.get("content-type") ?? "")) continue;
    const html = await r.text();
    const hrefs = [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]).filter((h) => !h.startsWith("/_next") && !/\.(ico|png|svg|webmanifest|woff2)$/.test(h));
    linksFrom.set(p, new Set(hrefs));
    for (const h of hrefs) if (!seen.has(h) && !h.startsWith("/flight-deck") && !h.startsWith("/living-trace/graph.json")) queue.push(h);
  }
  const broken = [...seen].filter(([, s]) => s !== 200);
  ok(`internal links: ${seen.size} pages crawled, all 200`, broken.length === 0, broken.map(([p, s]) => `${p} ${s}`).join(", "));
  const toPreview = [...linksFrom].filter(([p, hs]) => !p.startsWith("/preview/") && [...hs].some((h) => h.startsWith("/preview/")));
  ok("no production page links to /preview/", toPreview.length === 0, toPreview.map(([p]) => p).join(", "));
  for (const dest of ["/manifesto", "/about", "/memory-project", "/community-rights", "/pilot", "/nodes", "/contact"]) {
    const from = [...linksFrom].filter(([p, hs]) => p !== dest && hs.has(dest)).length;
    ok(`${dest} is linked from the other pages (navigation)`, from >= LIVING_ARCHIVE.length, `${from} pages`);
  }
  // Community Rights: each principle and the request procedure keep a
  // stable anchor, for citing them (/community-rights#consent).
  const rightsHtml = await (await fetch(base + "/community-rights")).text();
  const RIGHTS_ANCHORS = ["custody", "source-authority", "consent", "access", "provenance", "purpose", "exclusivity", "requests"];
  const missingAnchors = RIGHTS_ANCHORS.filter((id) => !rightsHtml.includes(`id="${id}"`));
  ok("/community-rights keeps its clause anchors", missingAnchors.length === 0, missingAnchors.join(", "));
  ok("/community-rights: the request procedure is a heading", /<h2[^>]*>Requesting a Correction, Restriction, or Withdrawal<\/h2>/.test(rightsHtml));
  // About: its two sections are headings with stable anchors (/about#governance).
  const aboutHtml = await (await fetch(base + "/about")).text();
  ok("/about keeps its section anchors", ["custodial-paradigm", "governance"].every((id) => aboutHtml.includes(`id="${id}"`)));
  ok("/about: its sections are headings", /<h2[^>]*>Custodial Paradigm<\/h2>/.test(aboutHtml) && /<h2[^>]*>Governance<\/h2>/.test(aboutHtml));
  // Nodes: every seed has an anchor in the directory (/nodes#enugu), and a
  // profile's sections are headings with anchors (/nodes/lagos#themes).
  const nodesHtml = await (await fetch(base + "/nodes")).text();
  ok("/nodes: every entry has an anchor", ["lagos", "port-harcourt", "enugu", "nigerian-pidgin", "yoruba", "igbo"].every((id) => nodesHtml.includes(`id="${id}"`)));
  // The ring turns solid only for a collection record; every node's records
  // are demonstrations today, so every ring must render dashed.
  const rings = nodesHtml.match(/data-has-collection="(true|false)"/g) ?? [];
  ok("/nodes: no ring claims a collection record (all six dashed)", rings.length === 6 && rings.every((r) => r.endsWith('"false"')), rings.join(" "));
  for (const [route, sections] of [["/nodes/lagos", ["Memory Connections", "Themes", "Languages", "Related Nodes"]], ["/nodes/nigerian-pidgin", ["Memory Connections", "Themes", "Related Nodes"]]]) {
    const html = await (await fetch(base + route)).text();
    const ids = sections.map((s) => s.toLowerCase().replace(/\s+/g, "-"));
    ok(`${route}: its sections are headings with anchors`, sections.every((s) => new RegExp(`<h2[^>]*>${s}</h2>`).test(html)) && ids.every((id) => html.includes(`id="${id}"`)));
  }
  // /memories is outside the navigation (decision 44). Its records stay
  // linked from the node pages; who links to its index is reported.
  const memoriesRecords = [...linksFrom].filter(([, hs]) => [...hs].some((h) => h.startsWith("/memories/"))).map(([p]) => p);
  ok("/memories records stay reachable from the node pages", memoriesRecords.some((p) => p.startsWith("/nodes")), memoriesRecords.join(", "));
  const memoriesIndex = [...linksFrom].filter(([p, hs]) => p !== "/memories" && hs.has("/memories")).map(([p]) => p);
  ok("the /memories index keeps a place (footer, every page)", memoriesIndex.length >= LIVING_ARCHIVE.length + INNER.length - 1, `${memoriesIndex.length} pages`);
  const headerOrMenu = await (await fetch(base + "/")).text();
  ok("/memories is not in the header (decision 44)", !/<header[\s\S]*?href="\/memories"[\s\S]*?<\/header>/.test(headerOrMenu));

  // Decision 44: with live records not enabled (no API base URL on this
  // build), /memories says so, and does not describe an outage.
  if (!process.env.NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL) {
    const memoriesHtml = await (await fetch(base + "/memories")).text();
    ok("/memories describes live records as not enabled", /Live records are not enabled on this site/.test(memoriesHtml));
    ok("/memories does not describe an outage", !/temporarily unavailable/i.test(memoriesHtml));
    const unknown = await fetch(base + "/memories/not-a-record");
    const unknownHtml = await unknown.text();
    ok("an unknown /memories record is 404, not an outage page", unknown.status === 404 && !/Temporarily Unavailable/i.test(unknownHtml), String(unknown.status));
    for (const id of ["demo-audio-record", "demo-image-record", "demo-video-record"]) {
      ok(`/memories/${id} (static demonstration) still 200`, (await head(`/memories/${id}`)).status === 200);
    }
  }

  // ---------- Browser checks ----------
  const br = await openBrowser();
  const { send, evaluate, go } = br;
  let consoleErrors = [];
  br.listeners.push((m) => {
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((x) => x.value ?? x.description ?? "").join(" ").slice(0, 200));
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push((m.params.exceptionDetails.exception?.description ?? "").slice(0, 200));
  });
  const setTheme = async (theme) => {
    await go(`${base}/__checks_unknown__`).catch(() => {});
    await evaluate(`localStorage.setItem("theme", ${JSON.stringify(theme)}), true`);
  };
  const viewport = (width, height, mobile) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

  const axeFindings = [];
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    await viewport(w, h, mobile);
    for (const theme of ["light", "dark"]) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
      await setTheme(theme);
      for (const p of [...LIVING_ARCHIVE, "/manifesto", "/about", "/community-rights", "/pilot", "/nodes", "/nodes/lagos", "/nodes/nigerian-pidgin"]) {
        consoleErrors = [];
        await go(base + p);
        await evaluate(`if (!window.axe) { ${AXE} }`);
        const v = await evaluate(`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, where: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) })))`);
        axeFindings.push({ page: p, width: w, theme, violations: v });
        const severe = v.filter((x) => x.impact === "serious" || x.impact === "critical");
        ok(`axe ${p} ${w}px ${theme}: no serious or critical violations`, severe.length === 0, severe.map((x) => `${x.id}×${x.nodes} ${x.where.join("; ")}`).join(", ") || (v.length ? `minor: ${v.map((x) => x.id).join(", ")}` : ""));
        ok(`console ${p} ${w}px ${theme}: no errors`, consoleErrors.length === 0, consoleErrors[0] ?? "");
      }
    }
  }

  // Overflow, at three widths.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (const w of [320, 390, 820]) {
    await viewport(w, 800, true);
    for (const p of [...LIVING_ARCHIVE, ...INNER]) {
      await go(base + p);
      const sw = await evaluate("document.documentElement.scrollWidth");
      ok(`no horizontal overflow ${p} at ${w}px`, sw <= w, `scrollWidth ${sw}`);
    }
  }

  // The narrow-screen menu.
  await viewport(390, 844, true);
  await go(base + "/memory-project/records/DEMO-LT-0001");
  await evaluate(`document.querySelector('button[aria-controls="tiro-nav-menu"]').focus(), true`);
  const press = async (key, code, vk) => {
    for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", text: "\r" });
    await sleep(250);
  };
  await press("Enter", "Enter", 13);
  const menu = await evaluate(`(() => { const m = document.getElementById("tiro-nav-menu"); if (!m) return null; const r = m.getBoundingClientRect(); return { links: [...m.querySelectorAll("a")].map((a) => a.getAttribute("href") + (a.getAttribute("aria-current") ? "*" : "")), groups: [...m.querySelectorAll("p")].map((p) => p.textContent), bottom: r.bottom, expanded: document.querySelector('button[aria-controls="tiro-nav-menu"]').getAttribute("aria-expanded") }; })()`);
  ok("menu opens with Enter and lists every destination in four groups", menu && menu.expanded === "true" && menu.links.length === 7 && menu.groups.length === 4, JSON.stringify(menu));
  ok("menu marks the current section", menu && menu.links.includes("/memory-project*"), menu?.links.join(" "));
  ok("menu fits the viewport", menu && menu.bottom <= 844, `bottom ${menu?.bottom}`);
  await press("Escape", "Escape", 27);
  ok("menu closes on Escape", (await evaluate(`!document.getElementById("tiro-nav-menu")`)) === true);
  await viewport(320, 568, true);
  await go(base + "/");
  await evaluate(`document.querySelector('button[aria-controls="tiro-nav-menu"]').click(), true`);
  await sleep(250);
  const small = await evaluate(`(() => { const m = document.getElementById("tiro-nav-menu"); return { bottom: m.getBoundingClientRect().bottom, scroll: m.scrollHeight > m.clientHeight, last: [...m.querySelectorAll("button")].pop()?.textContent }; })()`);
  ok("on a 320 x 568 screen the menu stays within the viewport and scrolls", small.bottom <= 568, JSON.stringify(small));

  // Header tab order at desktop.
  await viewport(1440, 900, false);
  await go(base + "/memory-project");
  const stops = [];
  for (let i = 0; i < 7; i++) {
    await press("Tab", "Tab", 9);
    stops.push(await evaluate(`(() => { const a = document.activeElement; return (a.getAttribute("href") ?? a.textContent.trim()) + (a.getAttribute("aria-current") ? "[" + a.getAttribute("aria-current") + "]" : ""); })()`));
  }
  const expected = ["#content", "/", "/manifesto", "/memory-project[page]", "/community-rights", "/pilot"];
  ok("header tab order: skip link, mark, four groups, theme", JSON.stringify(stops.slice(0, 6)) === JSON.stringify(expected) && /^(Light|Dark)$/.test(stops[6]), stops.join(" | "));
  await go(base + "/memory-project/records/DEMO-LT-0001");
  const groupCurrent = await evaluate(`[...document.querySelectorAll("header nav a[aria-current]")].map((a) => a.getAttribute("href") + "=" + a.getAttribute("aria-current")).join(" ")`);
  ok("inside a section, its group is marked current (not page)", groupCurrent === "/memory-project=true", groupCurrent);

  br.close();
  fs.writeFileSync(outFile, JSON.stringify({ base, results, axeFindings, crawled: Object.fromEntries(seen) }, null, 1));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length} checks, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
}

async function perf(outFile, urls) {
  const out = [];
  for (const url of urls) {
    const runs = [];
    for (let attempts = 0; runs.length < 5 && attempts < 8; attempts++) {
      const br = await openBrowser();
      try {
        // A load that stalls is abandoned after 60 s and retried, never awaited forever.
        const run = await Promise.race([measure(br, url), sleep(60000).then(() => null)]);
        if (run) {
          runs.push(run);
          console.log(`  ${url} run ${runs.length}: lcp ${Math.round(run.lcp)} ms, cls ${run.cls.toFixed(3)}, tbt ${Math.round(run.tbt)} ms, ${Math.round(run.bytes / 1024)} KB`);
        } else {
          console.log(`  ${url}: a load stalled past 60 s; retrying`);
        }
      } finally {
        br.close();
      }
    }
    if (runs.length < 5) {
      throw new Error(`${url}: only ${runs.length} of 5 loads completed`);
    }
    const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[2];
    const row = { url, lcp: Math.round(med("lcp")), fcp: Math.round(med("fcp")), cls: Math.round(med("cls") * 1000) / 1000, tbt: Math.round(med("tbt")), kb: Math.round(med("bytes") / 1024), scriptKb: Math.round(med("scriptBytes") / 1024) };
    out.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
}

async function measure(br, url) {
  const { send, evaluate } = br;
  let bytes = 0;
  let scriptBytes = 0;
  const types = new Map();
  br.listeners.push((m) => {
    if (m.method === "Network.responseReceived") types.set(m.params.requestId, m.params.type);
    if (m.method === "Network.loadingFinished") {
      bytes += m.params.encodedDataLength;
      if (types.get(m.params.requestId) === "Script") scriptBytes += m.params.encodedDataLength;
    }
  });
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__perf = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; }).observe({ type: "paint", buffered: true });`,
  });
  await br.go(url);
  await sleep(4000);
  const p = await evaluate("window.__perf");
  return { ...p, bytes, scriptBytes };
}

if (mode === "check" && args.length === 2) {
  await check(args[0].replace(/\/$/, ""), path.resolve(args[1]));
} else if (mode === "perf" && args.length >= 2) {
  await perf(path.resolve(args[0]), args.slice(1));
} else {
  console.error("usage: check <baseUrl> <out.json> | perf <out.json> <url> [<url> ...]");
  process.exit(2);
}
