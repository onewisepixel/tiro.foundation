// Flight Deck 0.1 end-to-end check, driven through a real browser.
//
// Runs the representative founder review session (acceptance item 16)
// against a running local demo, plus browser-level adversarial checks, and
// writes screenshots to docs/flight-deck/screens/. Uses Chrome or Edge in
// headless mode over the DevTools protocol; no test dependencies.
//
//   npm run dev:flight-deck            (in another terminal)
//   npm run e2e:flight-deck            (BASE_URL defaults to http://localhost:3100)
//
// The run resets the local store to the synthetic seed first.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = path.resolve(import.meta.dirname, "../../docs/flight-deck/screens");
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(
  (p) => p && fs.existsSync(p),
);
if (!CHROME) {
  console.error("No Chrome or Edge found; set CHROME_PATH.");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------- Minimal CDP client ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fd-e2e-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });

async function targetUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await targetUrl());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = [];
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
const once = (method) => new Promise((r) => listeners.push(function l(m) { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } }));

await send("Page.enable");
await send("Runtime.enable");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}
async function go(pathname) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: `${BASE}${pathname}` });
  await loaded;
  await sleep(300);
}
async function waitFor(expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`)) {
        return true;
      }
    } catch {}
    await sleep(150);
  }
  throw new Error(`timed out waiting for: ${expression}`);
}
const text = () => evaluate("document.body.innerText");
// innerText honours CSS text-transform (labels and badges are uppercase).
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
const url = () => evaluate("location.pathname + location.search");
// Elements that reach past the 390px viewport (for diagnosing overflow).
const culprits = () => evaluate(`[...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > 392 && !el.closest("header") && !el.parentElement?.closest(".overflow-x-auto")).slice(-4).map((el) => el.tagName.toLowerCase() + "." + String(el.className).slice(0, 60) + " " + Math.round(el.getBoundingClientRect().right)).join(" | ")`);
const noOverflow = async (name) => {
  const ok = (await evaluate(`document.documentElement.scrollWidth <= 391`)) === true;
  check(name, ok, ok ? "" : await culprits());
};
// Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A and AA rules).
// Fails on serious or critical violations; records the rest.
const AXE = fs.readFileSync(path.resolve(import.meta.dirname, "../../node_modules/axe-core/axe.min.js"), "utf8");
const axeFindings = [];
async function axe(name) {
  await evaluate(`if (!window.axe) { ${AXE} }`);
  const result = await evaluate(`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, where: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + (n.any[0]?.data?.contrastRatio ? " (" + n.any[0].data.contrastRatio + ":1, fg " + n.any[0].data.fgColor + " on " + n.any[0].data.bgColor + ")" : "")) })))`);
  axeFindings.push({ page: name, violations: result });
  const severe = result.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`axe: ${name} has no serious or critical WCAG violations`, severe.length === 0, severe.map((v) => `${v.id}×${v.nodes} at ${v.where.join("; ")}`).join(", ") || (result.length ? `minor: ${result.map((v) => v.id).join(", ")}` : ""));
}
async function viewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
}
async function media({ reduced = false, scheme = "dark" } = {}) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }, { name: "prefers-color-scheme", value: scheme }] });
}
async function shot(name, full = true) {
  await sleep(250);
  const { cssContentSize } = await send("Page.getLayoutMetrics");
  const clip = full ? { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 9000), scale: 1 } : undefined;
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
}
// Sets a field by name inside the form that contains `scope` text, then
// clicks a submit button by its visible label.
const js = (v) => JSON.stringify(v);
async function fill(selector, value) {
  await evaluate(`(() => { const el = document.querySelector(${js(selector)}); if (!el) throw new Error("missing ${selector.replaceAll('"', "")}"); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${js(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
}
async function clickButton(label, within = "document") {
  await evaluate(`(() => { const b = [...${within}.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase().startsWith(${js(label)}.toLowerCase()) && !x.disabled); if (!b) throw new Error("no button " + ${js(label)}); b.click(); })()`);
}
async function clickLink(label) {
  await evaluate(`(() => { const a = [...document.querySelectorAll("a")].find((x) => x.innerText.toLowerCase().includes(${js(label)}.toLowerCase())); if (!a) throw new Error("no link " + ${js(label)}); a.click(); })()`);
}

const started = Date.now();
let prospectPath = "/flight-deck/relationships";
try {
  await viewport(1280, 900);
  await media();

  // ---------- Sign in and reset to the seed ----------
  await go("/flight-deck/sign-in");
  check("unauthenticated /flight-deck redirects to sign-in", (await url()).startsWith("/flight-deck/sign-in"));
  await clickButton("Continue as founder");
  await waitFor(`location.search.includes("signed-in")`);
  await go("/flight-deck/health");
  await fill("#confirm", "RESET");
  await clickButton("Reset to synthetic seed");
  await waitFor(`location.search.includes("notice=reset")`);
  check("local store reset to synthetic seed", true);

  // ---------- Public form (as a member of the public, in a fresh context) ----------
  await go("/pilot");
  await shot("pilot-desktop");
  const pilotText = await text();
  check("/pilot states it is not collecting material", /we are not collecting/i.test(pilotText) && /recordings, audio, or video/i.test(pilotText));
  check("/pilot has no file input or drag-and-drop", (await evaluate(`document.querySelectorAll('input[type=file], [draggable=true]').length`)) === 0);
  check("/pilot updates opt-in is unchecked by default", (await evaluate(`document.querySelector('input[name=updatesOptIn]').checked`)) === false);
  check("/pilot has no free-text note or any textarea (0.2)", (await evaluate(`document.querySelectorAll('form textarea, [name=note]').length`)) === 0);
  await axe("/pilot (form)");
  // Submit without the acknowledgement: refused, fields flagged.
  await sleep(2600);
  await fill("#displayName", "Synthetic Visitor E2E");
  await fill("#email", "visitor-e2e@example.invalid");
  await evaluate(`document.querySelector('input[name=category][value=community-partner]').click()`);
  await evaluate(`document.querySelector('input[name=topics][value=community-consultation]').click(); document.querySelector('input[name=topics][value=archival-practice]').click();`);
  await evaluate(`document.querySelector('input[name=replyConsent]').click()`);
  await clickButton("Send expression of interest");
  await waitFor(`document.body.innerText.toLowerCase().includes("confirm you have read the privacy notice")`);
  check("submission without privacy acknowledgement is refused server-side", true);
  await shot("pilot-validation-error", false);
  check("entries survive a validation error", (await evaluate(`document.querySelector("#displayName").value`)) === "Synthetic Visitor E2E" && (await evaluate(`document.querySelector('input[name=topics][value=community-consultation]').checked`)) === true);
  await axe("/pilot (validation error)");
  check("error is announced and invalid field is marked", (await evaluate(`document.querySelector("[role=alert]") !== null && document.querySelector("input[name=noticeAck]").getAttribute("aria-invalid") === "true"`)) === true);
  await evaluate(`document.querySelector("input[name=noticeAck]").click()`);
  await clickButton("Send expression of interest");
  await waitFor(`document.body.innerText.toLowerCase().includes("your inquiry has been received")`);
  check("valid submission shows an accessible confirmation", (await evaluate(`document.activeElement?.getAttribute("role")`)) === "status");
  await shot("pilot-confirmation", false);
  // Same address again: identical response.
  await go("/pilot");
  await sleep(2600);
  await fill("#displayName", "Someone Else");
  await fill("#email", "VISITOR-E2E@example.invalid");
  await evaluate(`document.querySelector('input[name=category][value=interested-contributor]').click(); document.querySelector('input[name=noticeAck]').click(); document.querySelector('input[name=replyConsent]').click();`);
  await clickButton("Send expression of interest");
  await waitFor(`document.body.innerText.toLowerCase().includes("your inquiry has been received")`);
  check("repeat submission gets the identical response (no enumeration)", true);

  // ---------- The representative founder review session ----------
  const sessionStart = Date.now();
  await go("/flight-deck");
  await shot("now-desktop");
  await axe("Now");
  const now = await text();
  check("Now: new inquiry is visible", has(now, "Synthetic Visitor E2E"));
  check("Now: shows next actions, blockers, approvals", /Next actions/i.test(now) && /Blocked by a gate/i.test(now) && /Ready for your approval/i.test(now));

  await clickLink("Synthetic Visitor E2E");
  await waitFor(`location.pathname.startsWith("/flight-deck/relationships/prs_")`);
  prospectPath = await url();
  const detail = await text();
  check("relationship: safe context shown (chosen topics, notice version, unverified authority)", has(detail, "How communities would be consulted") && has(detail, "pilot-privacy-draft-0.2") && /Authority: unverified/i.test(detail));
  check("relationship: repeat submission linked to one record", (detail.match(/repeat submission/g) ?? []).length === 1);
  check("relationship: no newsletter permission without opt-in", !has(detail, "Occasional updates"));
  await shot("relationship-desktop");
  await axe("relationship detail");

  await fill("#templateKey", "inquiry-reply");
  await clickButton("Create draft");
  await waitFor(`location.pathname.startsWith("/flight-deck/outreach/out_")`);
  const draftPath = (await url()).split("?")[0];
  // Placeholders block review.
  await clickButton("Send for review");
  await waitFor(`location.search.includes("error=unfilled-placeholders")`);
  check("draft with [placeholders] cannot be sent for review", true);
  const body = (await evaluate(`document.querySelector("#body").value`))
    .replace("[One or two sentences responding to what they actually said.]", "Thank you for asking how communities would be consulted; that question is exactly where a pilot has to begin.")
    .replace("[proposed times or a scheduling link approved for use]", "Tuesday or Thursday afternoon next week")
    .replace("[Founder name]", "Demo Founder");
  await fill("#body", body);
  await clickButton("Save new version");
  await waitFor(`location.search.includes("notice=saved")`);
  await clickButton("Send for review");
  await waitFor(`location.search.includes("notice=submitted")`);

  await go("/flight-deck/approvals");
  await shot("approvals-desktop");
  await axe("Approvals");
  const card = `[...document.querySelectorAll("article")].find((a) => a.innerText.includes("Synthetic Visitor E2E"))`;
  await waitFor(card);
  const shownHash = await evaluate(`${card}.querySelector("input[name=hash]").value`);
  await clickButton("Approve this exact version", card);
  await waitFor(`location.search.includes("notice=approved")`);
  check("approval recorded for the exact version", true);

  await go(draftPath);
  const approvedText = await text();
  check("draft shows the approved fingerprint", has(approvedText, shownHash));
  await clickButton("Queue for dispatch");
  await waitFor(`location.search.includes("notice=queued")`);
  await go("/flight-deck/health");
  await clickButton("Run worker tick now");
  await waitFor(`location.search.includes("notice=worker-ran")`);
  check("worker tick recorded on Health", has(await text(), "task") && (await evaluate(`document.body.innerText.includes("job")`)) === true);
  await shot("health-desktop");
  await axe("Health");
  await go(draftPath);
  const afterRun = await text();
  check("no provider: message held as 'ready to send by hand', never 'sent'", has(afterRun, "Ready to send by hand") && !/\bSent\b(?! by hand)/.test(afterRun.split("Next step")[0] ?? ""));
  await shot("outreach-manual-ready-desktop");
  await evaluate(`document.querySelector('input[name=attest]').click()`);
  await clickButton("Record as sent by hand");
  await waitFor(`location.search.includes("notice=manual-sent")`);
  const sent = await text();
  check("manual send recorded as an attestation by a named person", has(sent, "Attested by a person") && has(sent, "Demo Founder"));

  await go(prospectPath.split("?")[0]);
  const fu = await text();
  check("a single follow-up reminder was registered", has(fu, "Decide on one follow-up (limit 1)"));
  check("stage advanced to Contacted", has(fu, "Contacted"));

  await go("/flight-deck/digest");
  const digest = await text();
  check("digest generated locally, delivery off, no addresses", has(digest, "weekly digest") && has(digest, "Automatic delivery is off") && !/@example\.invalid/.test(await evaluate(`document.querySelector("pre").innerText`)));
  await shot("digest-desktop");
  await axe("Weekly review");
  await clickButton("Mark this week");
  await waitFor(`location.search.includes("review-complete")`);
  const sessionSeconds = Math.round((Date.now() - sessionStart) / 1000);
  check("representative review session completed without a spreadsheet", true, `${sessionSeconds}s of automated interaction`);

  // ---------- Exceptions (0.2): a deletion request, end to end ----------
  // On a different seeded person, so the main test person stays for later checks.
  await go("/flight-deck/relationships");
  const casePerson = await evaluate(`[...document.querySelectorAll("a")].find((x) => x.innerText.includes("Synthetic Prospect A-01"))?.getAttribute("href")`);
  await go(`/flight-deck/cases/new?prospect=${casePerson.split("/").pop()}`);
  await axe("Open a case");
  await evaluate(`document.querySelector('input[name=kind][value=deletion-request]').click()`);
  await fill("#summary", "Asked by email to delete their details; request came from the address on record.");
  await clickButton("Open case");
  await waitFor(`location.pathname.startsWith("/flight-deck/cases/case_")`);
  const casePath = (await url()).split("?")[0];
  await shot("case-deletion-desktop");
  await axe("Case detail");
  await go(casePerson);
  check("an open deletion request holds outreach to the person", has(await text(), "Case open: held"));
  await go(casePath);
  for (const step of ["verify-requester", "export-if-asked"]) {
    await evaluate(`[...document.querySelectorAll("form")].find((f) => f.querySelector("input[name=step][value=${step}]")).querySelector("button").click()`);
    await waitFor(`location.search.includes("notice=case-step")`);
    await go(casePath);
  }
  await go(casePerson);
  await evaluate(`document.querySelector("details summary") && [...document.querySelectorAll("details")].find((d) => d.innerText.includes("Erase this person")).setAttribute("open", "")`);
  await fill("#confirm", "ERASE");
  await clickButton("Erase permanently");
  await waitFor(`location.search.includes("notice=erased")`);
  await go(casePath);
  const caseAfter = await text();
  check("erasure completed the case's erase step and unlinked the person", has(caseAfter, "No person is linked") && (await evaluate(`document.querySelectorAll("form input[name=step][value=erase-record]").length`)) === 0);
  await evaluate(`[...document.querySelectorAll("form")].find((f) => f.querySelector("input[name=step][value=confirm-deletion]")).querySelector("button").click()`);
  await waitFor(`location.search.includes("notice=case-step")`);
  await go(casePath);
  await fill("#outcome", "erased");
  await clickButton("Resolve case");
  await waitFor(`location.search.includes("notice=case-resolved")`);
  check("deletion request resolved with every step recorded", has(await text(), "Outcome: erased"));

  // ---------- Adversarial, in the browser ----------
  // Edit after approval revokes it.
  await go("/flight-deck/outreach");
  const heldDraft = await evaluate(`[...document.querySelectorAll("a")].find((a) => a.href.includes("/outreach/out_") && a.innerText.includes("Synthetic Prospect B-02"))?.getAttribute("href")`);
  if (heldDraft) {
    await go("/flight-deck/approvals");
    const b02 = `[...document.querySelectorAll("article")].find((a) => a.innerText.includes("Synthetic Prospect B-02"))`;
    await waitFor(b02);
    await clickButton("Approve this exact version", b02);
    await waitFor(`location.search.includes("notice=approved")`);
    await go(heldDraft);
    check("approved draft offers manual send", has(await text(), "Record as sent by hand"));
    const b = await evaluate(`document.querySelector("#body").value`);
    await fill("#body", `${b}\n\nP.S. an edit after approval.`);
    await clickButton("Save new version");
    await waitFor(`location.search.includes("notice=saved")`);
    const after = await text();
    check("editing after approval revokes it (no send controls, approval invalidated)", !has(after, "Record as sent by hand") && has(after, "No valid approval for this version") && has(after, "Invalidated"));
  } else {
    check("seeded B-02 draft present for edit-after-approval check", false);
  }

  // Reviewer cannot edit; operator cannot approve.
  await go("/flight-deck/sign-in");
  await clickButton("Continue as reviewer");
  await waitFor(`location.search.includes("signed-in")`);
  await go(draftPath);
  const reviewerView = await text();
  check("reviewer sees the message but no edit form", has(reviewerView, "Exact message") && (await evaluate(`document.querySelector("#body")`)) === null);
  await go("/flight-deck/sign-in");
  await clickButton("Continue as operator");
  await waitFor(`location.search.includes("signed-in")`);
  await go("/flight-deck/approvals");
  check("operator sees no approval controls", !has(await text(), "Approve this exact version"));

  // Mobile founder review.
  await go("/flight-deck/sign-in");
  await clickButton("Continue as founder");
  await waitFor(`location.search.includes("signed-in")`);
  await viewport(390, 844, true);
  await go("/flight-deck");
  await shot("now-mobile");
  await noOverflow("Now board has no horizontal overflow at 390px");
  await go("/flight-deck/approvals");
  await shot("approvals-mobile");
  await noOverflow("Approvals has no horizontal overflow at 390px");
  await go(prospectPath.split("?")[0]);
  await shot("relationship-mobile");
  await noOverflow("Relationship detail has no horizontal overflow at 390px");
  await go("/pilot");
  await shot("pilot-mobile");
  await noOverflow("/pilot has no horizontal overflow at 390px");
  await media({ reduced: true });
  await go("/pilot");
  await shot("pilot-mobile-reduced-motion", false);
  await viewport(1280, 900);
  await media({ reduced: true, scheme: "light" });
  await evaluate(`localStorage.setItem("theme", "light")`);
  await go("/flight-deck");
  await shot("now-desktop-light-reduced-motion");
  await axe("Now (light theme)");
  await go("/pilot");
  await axe("/pilot (light theme)");
  await evaluate(`localStorage.removeItem("theme")`);

  // Keyboard: the first Tab reaches the skip link; the form has labels.
  await go("/pilot");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  check("first Tab focuses the skip link", (await evaluate(`document.activeElement?.className ?? ""`)).includes("tiro-skip-link"));
  const unlabeled = await evaluate(`[...document.querySelectorAll("form input:not([type=hidden]), form textarea, form select")].filter((el) => !el.closest("[aria-hidden=true]") && !(el.labels && el.labels.length) && !el.getAttribute("aria-label")).length`);
  check("every visible /pilot form control has a label", unlabeled === 0, `${unlabeled} unlabeled`);

  // Optional: the same page served by a production build (form closed).
  if (process.env.CLOSED_BASE_URL) {
    await viewport(1280, 900);
    await media();
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: `${process.env.CLOSED_BASE_URL}/pilot` });
    await loaded;
    await evaluate(`document.getElementById("interest").scrollIntoView()`);
    await sleep(400);
    await shot("pilot-production-closed", false);
    const closed = await text();
    check("production build: /pilot form is closed and accepts nothing", has(closed, "Form not yet open") && (await evaluate(`document.querySelectorAll("form input, form textarea").length`)) === 0);
  }
} catch (e) {
  check("run completed", false, e.message);
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
}

const failed = results.filter((r) => !r.ok);
const summary = { at: new Date().toISOString(), base: BASE, seconds: Math.round((Date.now() - started) / 1000), passed: results.length - failed.length, failed: failed.length, results, axe: axeFindings };
fs.writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed (${summary.seconds}s). Screenshots: ${path.relative(process.cwd(), OUT)}`);
process.exit(failed.length ? 1 : 0);
