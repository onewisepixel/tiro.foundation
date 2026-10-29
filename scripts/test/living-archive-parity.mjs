// Living Archive visual-parity harness (Milestone 3.0, Phase 2 and later).
//
// Captures the Living Archive pages and the production routes around them
// from a running server, so a structural refactor can be compared against a
// baseline build of the previous commit. Uses Chrome or Edge in headless
// mode over the DevTools protocol; no test dependencies.
//
//   node scripts/test/living-archive-parity.mjs capture <baseUrl> <outDir>
//   node scripts/test/living-archive-parity.mjs compare <beforeDir> <afterDir> <reportDir>
//
// capture, for every page x theme x width x motion setting:
//   - a full-page screenshot;
//   - a style fingerprint: every rendered element's box and the computed
//     properties that decide its appearance (class names excluded, so a
//     renamed class with the same rules compares equal);
//   - console errors, uncaught exceptions and React hydration errors;
//   - horizontal overflow;
//   - the measured height of the site header.
// It also runs keyboard checks (tab order, arrow keys, focus) once per page.
//
// compare reports, per capture, differing pixels and fingerprint entries,
// and writes a diff image for any capture that is not identical.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [mode, ...args] = process.argv.slice(2);

const PAGES = [
  { name: "home-v5", path: "/preview/home-v5" },
  { name: "memory-v1", path: "/preview/memory-v1" },
  { name: "record-public", path: "/preview/memory-v1/records/DEMO-LT-0001" },
  { name: "record-restricted", path: "/preview/memory-v1/records/DEMO-LT-0002" },
  { name: "record-authority", path: "/preview/memory-v1/records/DEMO-MP-0001" },
  // Production routes that must not change.
  { name: "prod-home", path: "/" },
  { name: "prod-memory-project", path: "/memory-project" },
  { name: "prod-manifesto", path: "/manifesto" },
  { name: "prod-living-trace", path: "/living-trace" },
  { name: "prod-pilot", path: "/pilot" },
];
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1180, mobile: true },
  { name: "mobile", width: 390, height: 844, mobile: true },
];
const THEMES = ["light", "dark"];
// "reduced": prefers-reduced-motion: reduce, the static final state.
// "motion": no preference; the page is scrolled end to end so every reveal
// runs, then left to settle before capture.
const MOTIONS = ["reduced", "motion"];

const STYLE_PROPS = [
  "display", "position", "font-family", "font-size", "font-style", "font-weight", "line-height", "letter-spacing", "text-transform",
  "text-decoration-line", "text-decoration-color", "text-underline-offset", "text-wrap", "text-align", "color", "background-color",
  "border-top", "border-right", "border-bottom", "border-left", "box-shadow", "outline-style", "padding", "margin", "gap",
  "grid-template-columns", "opacity", "transform", "visibility", "overflow-x", "top", "z-index", "scroll-margin-top",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "transition-property", "transition-duration", "animation-name",
  "animation-duration", "animation-delay",
];

const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(
  (p) => p && fs.existsSync(p),
);
if (!CHROME) {
  console.error("No Chrome or Edge found; set CHROME_PATH.");
  process.exit(2);
}

// ---------- Minimal CDP client (as in scripts/flight-deck/e2e.mjs) ----------
async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "la-parity-"));
  const port = 9800 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "about:blank"], { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await new Promise((r) => setTimeout(r, 200));
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
  const close = () => {
    ws.close();
    proc.kill();
  };
  return { send, once, listeners, close };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(base, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await openBrowser();
  const { send, once, listeners } = b;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  let errors = [];
  listeners.push((m) => {
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
      errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
    } else if (m.method === "Runtime.exceptionThrown") {
      errors.push(`exception: ${(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)}`);
    } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      errors.push(`log: ${m.params.entry.text.slice(0, 300)} ${m.params.entry.url ?? ""}`);
    }
  });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (url) => {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
    // Fonts, hydration, and the first reveal frame.
    await evaluate("document.fonts.ready.then(() => true)");
    await sleep(500);
  };

  const summary = [];
  for (const w of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width: w.width, height: w.height, deviceScaleFactor: 1, mobile: w.mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: w.mobile });
    for (const theme of THEMES) {
      for (const motion of MOTIONS) {
        await send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: theme },
            { name: "prefers-reduced-motion", value: motion === "reduced" ? "reduce" : "no-preference" },
          ],
        });
        for (const p of PAGES) {
          const id = `${p.name}.${w.name}.${theme}.${motion}`;
          // PARITY_ONLY=<regex> recaptures a subset (e.g. to re-check one
          // capture for timing noise).
          if (process.env.PARITY_ONLY && !new RegExp(process.env.PARITY_ONLY).test(id)) continue;
          // The theme is set from a same-origin 404 page, whose own errors
          // are not counted.
          await go(`${base}/__parity_unknown__`).catch(() => {});
          await evaluate(`localStorage.setItem("theme", ${JSON.stringify(theme)}), true`);
          errors = [];
          await go(`${base}${p.path}`);
          const status = await evaluate(`performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0`);
          if (motion === "motion") {
            // Run every reveal once, then let the longest (sheet separation,
            // 300 ms + delays + 1300 ms) settle.
            await evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y <= h; y += Math.round(innerHeight * 0.6)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); return true; })()`);
            await sleep(2600);
          } else {
            await sleep(200);
          }
          const info = await evaluate(`(() => {
            const header = document.querySelector("body > header, header.fixed");
            return {
              theme: document.documentElement.getAttribute("data-theme"),
              headerHeight: header ? header.getBoundingClientRect().height : null,
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              height: document.documentElement.scrollHeight,
            };
          })()`);
          const fingerprint = await evaluate(`(() => {
            const props = ${JSON.stringify(STYLE_PROPS)};
            const out = [];
            const root = document.querySelector("main") ?? document.body;
            for (const el of root.querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (!r.width && !r.height) continue;
              const cs = getComputedStyle(el);
              const s = {};
              for (const k of props) s[k] = cs.getPropertyValue(k);
              const attrs = {};
              for (const a of el.attributes) {
                // Class names may change in a refactor; inline styles and SVG
                // presentation attributes are compared through the computed
                // style instead.
                if (["class", "style", "fill", "stroke", "stroke-width"].includes(a.name)) continue;
                attrs[a.name] = a.value.length > 160 ? a.value.slice(0, 160) + "…" : a.value;
              }
              const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 80);
              out.push({ tag: el.tagName.toLowerCase(), box: [r.x, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 100) / 100), attrs, text: own, s });
            }
            return out;
          })()`);
          const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: info.clientWidth, height: info.height, scale: 1 } });
          fs.writeFileSync(path.join(outDir, `${id}.png`), Buffer.from(shot.data, "base64"));
          fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ id, status, info, errors, fingerprint }, null, 1));
          const overflow = info.scrollWidth > info.clientWidth;
          summary.push({ id, status, overflow, errors: errors.length, header: info.headerHeight, theme: info.theme });
          console.log(`${id}  status=${status} theme=${info.theme} header=${info.headerHeight} overflow=${overflow} errors=${errors.length}${errors.length ? "  " + errors[0] : ""}`);
        }
      }
    }
  }

  // ---------- Keyboard checks (desktop, light, reduced motion) ----------
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const key = async (k) => {
    const codes = { Tab: 9, Enter: 13, " ": 32, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: codes[k], nativeVirtualKeyCode: codes[k] });
    }
    if (k === "Enter" || k === " ") await send("Input.dispatchKeyEvent", { type: "char", text: k === "Enter" ? "\r" : " " });
    // Past every colour transition (--lt-dur-base, 240 ms), so the focus
    // ring is read in its settled state.
    await sleep(320);
  };
  const focused = () => evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return "body"; return a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") + "[" + (a.getAttribute("aria-selected") ?? a.getAttribute("aria-expanded") ?? a.getAttribute("aria-current") ?? "") + "] " + (a.textContent ?? "").trim().slice(0, 50); })()`);
  const focusRing = () => evaluate(`(() => { const a = document.activeElement; const cs = getComputedStyle(a); return cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor + " " + cs.boxShadow; })()`);
  const keyboard = [];
  const log = (page, step, value) => keyboard.push({ page, step, value });

  // Tab order through each page: the first 40 stops.
  for (const p of PAGES.slice(0, 5)) {
    await go(`${base}/__parity_unknown__`).catch(() => {});
    await evaluate(`localStorage.setItem("theme", "light"), true`);
    await go(`${base}${p.path}`);
    for (let i = 0; i < 40; i++) {
      await key("Tab");
      log(p.name, `tab ${i + 1}`, `${await focused()} | ${await focusRing()}`);
    }
  }

  // Tablists: arrow keys, Home, End, and the panel that follows.
  const tablist = async (page, selector) => {
    await go(`${base}${page.path}`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)} + ' [role=tab][aria-selected=true]').focus(), true`);
    log(page.name, "tablist start", await focused());
    for (const k of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowUp", "End", "Home", "ArrowLeft", "ArrowUp"]) {
      await key(k);
      const panel = await evaluate(`(() => { const p = document.querySelector(${JSON.stringify(selector)}).parentElement.querySelector("[role=tabpanel]"); return p.getAttribute("aria-labelledby") + " :: " + p.textContent.trim().slice(0, 60); })()`);
      log(page.name, `tablist ${k}`, `${await focused()} | ${panel}`);
    }
  };
  await tablist(PAGES[0], "[role=tablist]");
  await tablist(PAGES[1], "[role=tablist]");

  // Concordance disclosure buttons and the record map on the record page.
  await go(`${base}${PAGES[2].path}`);
  const toggles = await evaluate(`[...document.querySelectorAll("main button[aria-expanded]")].length`);
  log(PAGES[2].name, "disclosure buttons", toggles);
  if (toggles) {
    await evaluate(`document.querySelector("main button[aria-expanded]").focus(), true`);
    await key("Enter");
    log(PAGES[2].name, "disclosure after Enter", await focused());
    await key(" ");
    log(PAGES[2].name, "disclosure after Space", await focused());
  }
  const mapLinks = await evaluate(`[...document.querySelectorAll("nav a[href^='#layer-']")].map((a) => a.getAttribute("href") + ":" + (a.getAttribute("aria-current") ?? "")).join(" ")`);
  log(PAGES[2].name, "record map links", mapLinks);
  await evaluate(`document.querySelector("nav a[href='#layer-terms']").focus(), true`);
  await key("Enter");
  await sleep(400);
  log(PAGES[2].name, "record map Enter on terms", `${await focused()} | hash=${await evaluate("location.hash")}`);

  // V5: a hash link opens the matching layer.
  await go(`${base}${PAGES[0].path}#record-terms`);
  await sleep(400);
  log(PAGES[0].name, "hash #record-terms", await evaluate(`document.querySelector("[role=tab][aria-selected=true]").id`));

  fs.writeFileSync(path.join(outDir, "_keyboard.json"), JSON.stringify(keyboard, null, 1));
  fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 1));
  b.close();
  const bad = summary.filter((s) => s.overflow || s.errors);
  console.log(`\n${summary.length} captures; ${bad.length} with overflow or errors; ${keyboard.length} keyboard observations`);
}

async function compare(beforeDir, afterDir, reportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  const b = await openBrowser();
  const { send } = b;
  await send("Runtime.enable");
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const rows = [];
  const ids = fs.readdirSync(beforeDir).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
  for (const id of ids) {
    const A = JSON.parse(fs.readFileSync(path.join(beforeDir, `${id}.json`), "utf8"));
    const Bj = path.join(afterDir, `${id}.json`);
    if (!fs.existsSync(Bj)) {
      rows.push({ id, missing: true });
      continue;
    }
    const B = JSON.parse(fs.readFileSync(Bj, "utf8"));
    // Fingerprint: element by element, in document order.
    const fpDiffs = [];
    const n = Math.max(A.fingerprint.length, B.fingerprint.length);
    for (let i = 0; i < n; i++) {
      const a = A.fingerprint[i];
      const c = B.fingerprint[i];
      if (!a || !c) {
        fpDiffs.push({ i, only: a ? "before" : "after", el: a ?? c });
        continue;
      }
      const d = {};
      if (a.tag !== c.tag) d.tag = [a.tag, c.tag];
      if (a.text !== c.text) d.text = [a.text, c.text];
      if (JSON.stringify(a.box) !== JSON.stringify(c.box)) d.box = [a.box, c.box];
      for (const k of new Set([...Object.keys(a.attrs), ...Object.keys(c.attrs)])) if (a.attrs[k] !== c.attrs[k]) d[`@${k}`] = [a.attrs[k], c.attrs[k]];
      for (const k of Object.keys(a.s)) if (a.s[k] !== c.s[k]) d[k] = [a.s[k], c.s[k]];
      if (Object.keys(d).length) fpDiffs.push({ i, tag: a.tag, text: a.text, d });
    }
    // Pixels, compared in the browser (no image dependency).
    const pa = fs.readFileSync(path.join(beforeDir, `${id}.png`)).toString("base64");
    const pb = fs.readFileSync(path.join(afterDir, `${id}.png`)).toString("base64");
    const px = await evaluate(`(async () => {
      const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
      const [a, b] = await Promise.all([load(${JSON.stringify(pa)}), load(${JSON.stringify(pb)})]);
      if (a.width !== b.width || a.height !== b.height) return { size: [a.width, a.height, b.width, b.height], diff: -1 };
      const ctx = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return [c, x]; };
      const [ca, xa] = ctx(a);
      const [, xb] = ctx(b);
      const da = xa.getImageData(0, 0, a.width, a.height);
      const db = xb.getImageData(0, 0, a.width, a.height).data;
      let diff = 0;
      let minY = Infinity, maxY = -1;
      for (let i = 0; i < db.length; i += 4) {
        if (da.data[i] !== db[i] || da.data[i + 1] !== db[i + 1] || da.data[i + 2] !== db[i + 2]) {
          diff++;
          const y = Math.floor(i / 4 / a.width);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          da.data[i] = 255; da.data[i + 1] = 0; da.data[i + 2] = 255; da.data[i + 3] = 255;
        } else {
          da.data[i + 3] = 60;
        }
      }
      if (!diff) return { diff: 0 };
      xa.putImageData(da, 0, 0);
      return { diff, rows: [minY, maxY], image: ca.toDataURL("image/png").split(",")[1] };
    })()`);
    if (px.image) fs.writeFileSync(path.join(reportDir, `${id}.diff.png`), Buffer.from(px.image, "base64"));
    rows.push({ id, pixels: px.diff, pixelRows: px.rows, size: px.size, fingerprint: fpDiffs.length, fpSample: fpDiffs.slice(0, 6), errorsBefore: A.errors.length, errorsAfter: B.errors.length, errorList: B.errors, overflowAfter: B.info.scrollWidth > B.info.clientWidth });
  }
  // Keyboard logs.
  const ka = JSON.parse(fs.readFileSync(path.join(beforeDir, "_keyboard.json"), "utf8"));
  const kb = JSON.parse(fs.readFileSync(path.join(afterDir, "_keyboard.json"), "utf8"));
  const keyboardDiffs = ka.flatMap((a, i) => (JSON.stringify(a) === JSON.stringify(kb[i]) ? [] : [{ before: a, after: kb[i] }]));
  if (kb.length !== ka.length) keyboardDiffs.push({ lengths: [ka.length, kb.length] });
  fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify({ rows, keyboardDiffs }, null, 1));
  b.close();
  const changed = rows.filter((r) => r.missing || r.pixels || r.fingerprint || r.errorsAfter || r.overflowAfter);
  for (const r of rows) console.log(`${r.missing ? "MISSING" : r.pixels || r.fingerprint ? "DIFF   " : "same   "} ${r.id}  pixels=${r.pixels} fingerprint=${r.fingerprint} errors=${r.errorsBefore}->${r.errorsAfter}${r.overflowAfter ? " OVERFLOW" : ""}`);
  console.log(`\n${rows.length} captures compared; ${changed.length} differ; keyboard differences: ${keyboardDiffs.length}`);
  process.exitCode = changed.length || keyboardDiffs.length ? 1 : 0;
}

if (mode === "capture" && args.length === 2) {
  await capture(args[0].replace(/\/$/, ""), path.resolve(args[1]));
} else if (mode === "compare" && args.length === 3) {
  await compare(...args.map((a) => path.resolve(a)));
} else {
  console.error("usage: capture <baseUrl> <outDir> | compare <beforeDir> <afterDir> <reportDir>");
  process.exit(2);
}
