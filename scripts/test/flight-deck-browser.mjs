// Headless Chrome over the DevTools protocol, for the Phase 4 census and
// baseline captures (decision 58). No test dependencies, like e2e.mjs.
//
// Safety: it refuses any base URL that is not loopback, and refuses to go
// on unless the console shows the local-demo synthetic banner. It never
// submits a form other than sign-in and the synthetic seed reset.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const LOCAL_DEMO_BANNER = "Local demo · synthetic data only · nothing leaves this machine";

const CHROME_PATHS = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

export function assertLoopback(base) {
  const host = new URL(base).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    throw new Error(`Refusing ${base}: Phase 4 tooling runs only against the local synthetic demo on loopback.`);
  }
}

export async function launch(base) {
  assertLoopback(base);
  const chromePath = CHROME_PATHS.find((p) => p && fs.existsSync(p));
  if (!chromePath) throw new Error("No Chrome or Edge found; set CHROME_PATH.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fd-phase4-"));
  const port = 9800 + Math.floor(Math.random() * 150);
  const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
  let wsUrl = null;
  for (let i = 0; i < 75 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!wsUrl) await new Promise((r) => setTimeout(r, 200));
  }
  if (!wsUrl) throw new Error("Chrome did not start");
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) =>
    new Promise((r) => {
      const l = (m) => {
        if (m.method === method) {
          listeners.delete(l);
          r(m.params);
        }
      };
      listeners.add(l);
    });
  let lastDocumentStatus = null;
  listeners.add((m) => {
    if (m.method === "Network.responseReceived" && m.params.type === "Document") lastDocumentStatus = m.params.response.status;
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async function go(pathname) {
    lastDocumentStatus = null;
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: `${base}${pathname}` });
    await loaded;
    await sleep(350);
    return { status: lastDocumentStatus, path: await evaluate("location.pathname + location.search") };
  }
  async function waitFor(expression, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return;
      } catch {}
      await sleep(150);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }
  const js = JSON.stringify;
  async function clickButton(label) {
    await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase().startsWith(${js(label)}.toLowerCase()) && !x.disabled); if (!b) throw new Error("no button " + ${js(label)}); b.click(); })()`);
  }
  async function fill(selector, value) {
    await evaluate(`(() => { const el = document.querySelector(${js(selector)}); if (!el) throw new Error("missing ${selector.replaceAll('"', "")}"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${js(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  }
  async function assertSynthetic() {
    const ok = await evaluate(`document.body.textContent.includes(${js(LOCAL_DEMO_BANNER)})`);
    if (!ok) throw new Error("Refusing to continue: the local-demo synthetic banner is not shown.");
  }
  async function signIn(role) {
    await send("Network.clearBrowserCookies");
    await go("/flight-deck/sign-in");
    await assertSynthetic();
    await clickButton(`Continue as ${role}`);
    await waitFor(`location.search.includes("signed-in")`);
    await assertSynthetic();
  }
  async function signOutAll() {
    await send("Network.clearBrowserCookies");
  }
  // The synthetic seed reset, exactly as e2e.mjs performs it (founder only).
  async function resetSeed() {
    await signIn("founder");
    await go("/flight-deck/health");
    await assertSynthetic();
    await fill("#confirm", "RESET");
    await clickButton("Reset to synthetic seed");
    await waitFor(`location.search.includes("notice=reset")`);
  }
  async function viewport(width, height = 900, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  }
  // Sets the site theme the way the header toggle stores it, then reloads.
  async function theme(name) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: name }, { name: "prefers-reduced-motion", value: "reduce" }] });
    await evaluate(`localStorage.setItem("theme", ${js(name)})`);
  }
  // One-pass, full-page capture (captureBeyondViewport; nothing stitched).
  async function capture(file, { format = "jpeg", quality = 80 } = {}) {
    await evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(300);
    const { cssContentSize } = await send("Page.getLayoutMetrics");
    const height = Math.ceil(cssContentSize.height);
    if (height > 16000) throw new Error(`${file}: page is ${height}px tall, beyond a single capture`);
    const { data } = await send("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality } : {}), captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height, scale: 1 } });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return { width: Math.ceil(cssContentSize.width), height };
  }
  async function pdf(file) {
    const { data } = await send("Page.printToPDF", { printBackground: false, preferCSSPageSize: false, paperWidth: 8.27, paperHeight: 11.69 });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  }
  async function close() {
    try {
      ws.close();
    } catch {}
    chrome.kill();
    await sleep(500);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
  return { send, evaluate, go, waitFor, clickButton, signIn, signOutAll, resetSeed, viewport, theme, capture, pdf, close, assertSynthetic, sleep };
}

// Refuses to write into committed evidence directories.
export function assertOutputDir(dir, root) {
  const rel = path.relative(root, path.resolve(dir)).replaceAll("\\", "/");
  if (rel === "docs/flight-deck/screens" || rel.startsWith("docs/flight-deck/screens/")) {
    throw new Error("Refusing to write into docs/flight-deck/screens (committed evidence).");
  }
}
