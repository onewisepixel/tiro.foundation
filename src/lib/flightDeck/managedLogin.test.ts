// The TIRO-branded Cognito managed login configuration
// (deploy/flight-deck/managed-login/). Local checks only: they cannot show how
// Cognito renders the pages; the staging test plan does that
// (docs/flight-deck/managed-login.md §5).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// Plain ES modules, shared with the operator script.
import { ASSETS, LOGO_ASSET, MARK_COLOR, MARK_SOURCE, assets, createRequest, logoSvg, settings, settingsMismatches, updateRequest, verifyBranding } from "../../../deploy/flight-deck/managed-login/build.mjs";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const S = settings() as { [k: string]: Json };
const REFERENCE = JSON.parse(fs.readFileSync("deploy/flight-deck/managed-login/reference/aws-settings-example.json", "utf8")) as Json;

// Key paths; arrays become "[]" so element structure is compared too.
function paths(v: Json, at = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => paths(x, `${at}/[]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [`${at}/${k}`, ...paths(x, `${at}/${k}`)]);
  return [];
}
function leaves(v: Json, at = ""): [string, Json][] {
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${at}/${i}`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => leaves(x, `${at}/${k}`));
  return [[at, v]];
}

// ---------- Settings: only keys Cognito knows, only TIRO tokens ----------

test("settings: every key exists in Cognito's documented branding schema (unknown keys are ignored silently, so a typo would fall back to AWS styling)", () => {
  const known = new Set(paths(REFERENCE));
  const unknown = paths(S).filter((p) => !known.has(p));
  assert.deepEqual(unknown, []);
});

test("settings: dark (Indigo) register only, square corners, no imagery, no header or footer", () => {
  const cats = S.categories as { [k: string]: { [k: string]: Json } };
  assert.equal((cats.global as { colorSchemeMode: string }).colorSchemeMode, "DARK");
  assert.deepEqual(paths(S).filter((p) => p.includes("lightMode")), [], "no light-mode values: they would never be shown");
  for (const [p, v] of leaves(S)) if (p.endsWith("/borderRadius")) assert.equal(v, 0, p);
  const comps = S.components as { [k: string]: { [k: string]: Json } };
  assert.deepEqual(comps.pageBackground.image, { enabled: false });
  assert.deepEqual(comps.form.backgroundImage, { enabled: false });
  assert.equal((cats.form as { displayGraphics: boolean }).displayGraphics, false, "Cognito's illustrations off");
  assert.deepEqual((cats.global as { pageHeader: Json; pageFooter: Json }).pageHeader, { enabled: false });
  assert.deepEqual((cats.global as { pageHeader: Json; pageFooter: Json }).pageFooter, { enabled: false });
  assert.deepEqual((cats.auth as { authMethodOrder: Json }).authMethodOrder, [[{ display: "INPUT", type: "USERNAME_PASSWORD" }]], "local password sign-in only, as the pool allows");
});

// The dark-register tokens, read from the design system itself.
function tokens() {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const map = new Map<string, string>();
  for (const m of root.matchAll(/--(tiro-[a-z-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}
const hex2 = (a: number) => Math.round(a * 255).toString(16).padStart(2, "0");
function tokenColor(value: string): string | null {
  const h = /^#([0-9a-f]{6})$/i.exec(value);
  if (h) return `${h[1].toLowerCase()}ff`;
  const r = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  return r ? [r[1], r[2], r[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("") + hex2(Number(r[4])) : null;
}

test("settings: every colour is a TIRO design token (globals.css), and the five named brand colours are the ones used", () => {
  const t = tokens();
  const palette = new Map<string, string>();
  for (const [name, value] of t) {
    const c = tokenColor(value);
    if (c) palette.set(c, name);
  }
  // The console's disabled button: the accent at 50% opacity (.fd-button:disabled).
  palette.set(`${tokenColor(t.get("tiro-accent")!)!.slice(0, 6)}80`, "tiro-accent (disabled, 50%)");
  const used = leaves(S).filter(([, v]) => typeof v === "string" && /^[0-9a-f]{8}$/i.test(v)) as [string, string][];
  for (const [p, c] of used) assert.ok(palette.has(c.toLowerCase()), `${p} = ${c} is not a TIRO token`);
  // The direction given: background, deep background, text, accent, raised.
  assert.equal(t.get("tiro-bg"), "#0b0e16");
  assert.equal(t.get("tiro-bg-deep"), "#060811");
  assert.equal(t.get("tiro-text"), "#ede4d3");
  assert.equal(t.get("tiro-accent"), "#c79a4b");
  assert.equal(t.get("tiro-raised"), "#121621");
  for (const c of ["0b0e16ff", "060811ff", "ede4d3ff", "c79a4bff", "121621ff"]) assert.ok(used.some(([, v]) => v === c), `${c} used`);
});

// ---------- Accessibility: contrast of what Cognito will render ----------

const channel = (hex: string, i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
// An RRGGBBAA colour over an opaque RRGGBB background, as a browser blends it.
function over(fg: string, bg: string): number[] {
  const a = channel(fg, 3) / 255;
  return [0, 1, 2].map((i) => a * channel(fg, i) + (1 - a) * channel(bg, i));
}
function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string) {
  const b = bg.slice(0, 6);
  const [l1, l2] = [luminance(over(fg, b)), luminance(over(`${b}ff`, b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const get = (p: string) => p.split("/").filter(Boolean).reduce<Json>((o, k) => (o as { [k: string]: Json })[k], S) as string;

test("contrast: text meets WCAG AA (4.5:1) and component boundaries and focus meet 3:1, on the surfaces they sit on", () => {
  const form = get("components/form/darkMode/backgroundColor");
  const input = get("componentClasses/input/darkMode/defaults/backgroundColor");
  const page = get("components/pageBackground/darkMode/color");
  const alertBg = get("components/alert/darkMode/error/backgroundColor");
  const text: [string, string, string][] = [
    ["heading", get("components/pageText/darkMode/headingColor"), form],
    ["body text", get("components/pageText/darkMode/bodyColor"), form],
    ["description", get("components/pageText/darkMode/descriptionColor"), form],
    ["input label", get("componentClasses/inputLabel/darkMode/textColor"), form],
    ["input description", get("componentClasses/inputDescription/darkMode/textColor"), form],
    ["placeholder", get("componentClasses/input/darkMode/placeholderColor"), input],
    ["link", get("componentClasses/link/darkMode/defaults/textColor"), form],
    ["link (hover)", get("componentClasses/link/darkMode/hover/textColor"), form],
    ["primary button text", get("components/primaryButton/darkMode/defaults/textColor"), get("components/primaryButton/darkMode/defaults/backgroundColor")],
    ["secondary button text", get("components/secondaryButton/darkMode/defaults/textColor"), get("components/secondaryButton/darkMode/defaults/backgroundColor")],
    ["selected option", get("componentClasses/optionControls/darkMode/selected/foregroundColor"), get("componentClasses/optionControls/darkMode/selected/backgroundColor")],
    ["error indicator", get("componentClasses/statusIndicator/darkMode/error/indicatorColor"), alertBg],
    ["success indicator", get("componentClasses/statusIndicator/darkMode/success/indicatorColor"), get("componentClasses/statusIndicator/darkMode/success/backgroundColor")],
    ["warning indicator", get("componentClasses/statusIndicator/darkMode/warning/indicatorColor"), get("componentClasses/statusIndicator/darkMode/warning/backgroundColor")],
  ];
  for (const [what, fg, bg] of text) assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${contrast(fg, bg).toFixed(2)}:1`);
  const ui: [string, string, string][] = [
    ["focus ring on the form", get("componentClasses/focusState/darkMode/borderColor"), form],
    ["focus ring on an input", get("componentClasses/focusState/darkMode/borderColor"), input],
    ["input border on the form", get("componentClasses/input/darkMode/defaults/borderColor"), form],
    ["input border on the input", get("componentClasses/input/darkMode/defaults/borderColor"), input],
    ["checkbox border", get("componentClasses/optionControls/darkMode/defaults/borderColor"), form],
    ["error border", get("components/alert/darkMode/error/borderColor"), alertBg],
    ["primary button on the form", get("components/primaryButton/darkMode/defaults/backgroundColor"), form],
    ["form on the page (logo colour)", `${MARK_COLOR.slice(1)}ff`, form],
  ];
  for (const [what, fg, bg] of ui) assert.ok(contrast(fg, bg) >= 3, `${what}: ${contrast(fg, bg).toFixed(2)}:1`);
  assert.ok(page.length === 8);
});

// ---------- The logo: the official mark, unaltered in drawing ----------

const ALLOWED_ELEMENTS = new Set(["svg", "title", "desc", "circle", "line", "path", "g", "defs", "metadata", "rect", "polygon", "polyline", "ellipse"]);
// From Cognito's SVG allowlist (developer guide), the attributes this file may use.
const ALLOWED_ATTRIBUTES = new Set(["width", "height", "viewbox", "xmlns", "cx", "cy", "r", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "d", "x1", "x2", "y1", "y2", "id", "class", "style"]);
const shapes = (svg: string) =>
  [...svg.matchAll(/<(circle|line|path)\s([^>]*?)\/?>/g)].map((m) => ({
    tag: m[1],
    attrs: Object.fromEntries([...m[2].matchAll(/([\w-:]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  }));

test("logo: generated from the official mark (public/tiro-mark-primary.svg), committed and current", () => {
  const committed = fs.readFileSync(LOGO_ASSET, "utf8").replace(/\r\n/g, "\n");
  assert.equal(committed, logoSvg(), "run: node deploy/flight-deck/managed-login/build.mjs logo");
  assert.equal(MARK_SOURCE, "public/tiro-mark-primary.svg");
});

test("logo: the same drawing as the official mark and TiroMark.tsx; only the colour is fixed, to the mark's gold", () => {
  const official = shapes(fs.readFileSync(MARK_SOURCE, "utf8"));
  const logo = shapes(logoSvg());
  assert.equal(logo.length, official.length);
  assert.equal(logo.length, 5);
  logo.forEach((s, i) => {
    assert.equal(s.tag, official[i].tag);
    const recoloured = Object.fromEntries(Object.entries(official[i].attrs).map(([k, v]) => [k, v === "currentColor" ? MARK_COLOR : v]));
    assert.deepEqual(s.attrs, recoloured, `${s.tag} ${i}`);
  });
  // The React component the site renders (primary variant) draws the same.
  const tsx = fs.readFileSync("src/components/TiroMark.tsx", "utf8");
  const primary = tsx.slice(tsx.lastIndexOf("return ("));
  for (const s of logo) {
    for (const [k, v] of Object.entries(s.attrs)) {
      if (["fill", "stroke"].includes(k)) continue;
      const jsx = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      assert.ok(primary.includes(`${jsx}="${v}"`), `TiroMark.tsx has ${jsx}="${v}"`);
    }
  }
  assert.match(logoSvg(), /viewBox="0 0 90 202"/);
});

test("logo: only elements and attributes in Cognito's SVG allowlist; no script, link, metadata, or external reference", () => {
  const svg = logoSvg();
  for (const m of svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) assert.ok(ALLOWED_ELEMENTS.has(m[1].toLowerCase()), `element ${m[1]}`);
  for (const m of svg.matchAll(/\s([\w:-]+)="/g)) assert.ok(ALLOWED_ATTRIBUTES.has(m[1].toLowerCase()), `attribute ${m[1]}`);
  assert.doesNotMatch(svg, /<script|<a\s|href|<metadata|c2pa|javascript:|url\(/i);
  const colours = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...colours].sort(), ["#c79a4b", "none"]);
});

// ---------- Assets and requests ----------

const ACCEPTED: Record<string, string[]> = { FAVICON_ICO: ["ICO"], FAVICON_SVG: ["SVG"], FORM_LOGO: ["PNG", "SVG", "JPEG"], PAGE_BACKGROUND: ["PNG", "SVG", "JPEG"] };

test("assets: accepted category and file types, within Cognito's size limit, and exactly what the settings enable", () => {
  for (const a of assets()) {
    assert.ok(ACCEPTED[a.Category]?.includes(a.Extension), `${a.Category} accepts ${a.Extension}`);
    assert.ok(["LIGHT", "DARK", "DYNAMIC"].includes(a.ColorMode));
    assert.ok(a.Bytes.length <= 1_000_000, `${a.Category} base64 length ${a.Bytes.length}`);
  }
  assert.deepEqual(ASSETS.map((a) => a.Category).sort(), ["FAVICON_ICO", "FORM_LOGO"]);
  assert.equal((S.components as { form: { logo: { enabled: boolean } } }).form.logo.enabled, true, "the form shows the logo");
  assert.deepEqual((S.components as { favicon: { enabledTypes: string[] } }).favicon.enabledTypes, ["ICO"]);
  const favicon = assets().find((a) => a.Category === "FAVICON_ICO")!;
  assert.equal(favicon.Bytes, fs.readFileSync("src/app/favicon.ico").toString("base64"), "the site's own favicon, unchanged");
});

const POOL = "us-east-1_H1ukCFTYB";
const CLIENT = "3ukekra5fk6p6ce8fgafer4p4a";

test("requests: exactly the CreateManagedLoginBranding / UpdateManagedLoginBranding inputs, under 2 MB, with no credential", () => {
  const create = createRequest({ userPoolId: POOL, clientId: CLIENT });
  assert.deepEqual(Object.keys(create).sort(), ["Assets", "ClientId", "Settings", "UseCognitoProvidedValues", "UserPoolId"]);
  assert.equal(create.UseCognitoProvidedValues, false);
  const update = updateRequest({ userPoolId: POOL, brandingId: "a1b2c3d4-5678-90ab-cdef-111111111111" });
  assert.deepEqual(Object.keys(update).sort(), ["Assets", "ManagedLoginBrandingId", "Settings", "UseCognitoProvidedValues", "UserPoolId"]);
  for (const r of [create, update]) {
    const body = JSON.stringify(r);
    assert.ok(body.length < 2_000_000, `request is ${body.length} bytes`);
    // No credential-bearing field anywhere (USERNAME_PASSWORD is the sign-in method's name, a value).
    const keys = paths(r as unknown as Json).map((p) => p.split("/").pop()!);
    assert.deepEqual(keys.filter((k) => /secret|password|token|credential|key$/i.test(k)), []);
    assert.doesNotMatch(body, /AKIA[0-9A-Z]{16}|aws_secret_access_key/i);
  }
});

// ---------- Verification of what Cognito stored ----------

const stored = () => ({ ManagedLoginBranding: { ManagedLoginBrandingId: "a1b2c3d4-5678-90ab-cdef-111111111111", UserPoolId: POOL, UseCognitoProvidedValues: false, Settings: structuredClone(settings()), Assets: assets() } });

test("verify: a stored style matching the repository passes; any difference is reported", () => {
  assert.deepEqual(verifyBranding(stored(), { userPoolId: POOL }), []);
  // Cognito may return numbers as 0.0 and colours in another case.
  const r = stored();
  (r.ManagedLoginBranding.Settings as { components: { form: { darkMode: { backgroundColor: string } } } }).components.form.darkMode.backgroundColor = "121621FF";
  assert.deepEqual(verifyBranding(r, { userPoolId: POOL }), []);

  const cases: [string, (x: ReturnType<typeof stored>) => void, RegExp][] = [
    ["another colour", (x) => ((x.ManagedLoginBranding.Settings as { components: { primaryButton: { darkMode: { defaults: { backgroundColor: string } } } } }).components.primaryButton.darkMode.defaults.backgroundColor = "539fe5ff"), /primaryButton\/darkMode\/defaults\/backgroundColor/],
    ["the logo missing", (x) => (x.ManagedLoginBranding.Assets = x.ManagedLoginBranding.Assets.filter((a) => a.Category !== "FORM_LOGO")), /asset FORM_LOGO \(DARK\) is missing/],
    ["different logo bytes", (x) => (x.ManagedLoginBranding.Assets.find((a) => a.Category === "FORM_LOGO")!.Bytes = Buffer.from("<svg/>").toString("base64")), /FORM_LOGO \(DARK\) differs/],
    ["Cognito defaults", (x) => (x.ManagedLoginBranding.UseCognitoProvidedValues = true), /Cognito's default values/],
    ["another pool", (x) => (x.ManagedLoginBranding.UserPoolId = "us-east-1_Other"), /belongs to user pool us-east-1_Other/],
  ];
  for (const [what, mutate, problem] of cases) {
    const x = stored();
    mutate(x);
    const problems = verifyBranding(x, { userPoolId: POOL });
    assert.ok(problems.some((p) => problem.test(p)), `${what}: ${problems.join("; ")}`);
  }
  assert.deepEqual(verifyBranding({}, { userPoolId: POOL }), ["no managed login branding style for this app client"]);
  assert.deepEqual(settingsMismatches({ a: [1, 2] }, { a: [1, 2] }), []);
});

// ---------- What this change leaves alone ----------

test("the CloudFormation template is untouched: the domain's version is set by the reviewed script, the app client is never redefined", () => {
  const t = JSON.parse(fs.readFileSync("deploy/flight-deck/flight-deck.template.json", "utf8")) as { Resources: Record<string, { Type: string; Properties: Record<string, unknown> }> };
  assert.equal("ManagedLoginVersion" in t.Resources.OperatorDomain.Properties, false, "see docs/flight-deck/managed-login.md §3 before adding it");
  assert.equal(Object.values(t.Resources).filter((r) => r.Type === "AWS::Cognito::ManagedLoginBranding").length, 0);
  assert.equal(t.Resources.OperatorPool.Properties.MfaConfiguration, "ON");
  assert.deepEqual(t.Resources.ConsoleClient.Properties.AllowedOAuthFlows, ["code"]);
});
