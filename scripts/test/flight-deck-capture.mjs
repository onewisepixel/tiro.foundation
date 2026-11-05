// Flight Deck visual baseline captures (Milestone 3.0, Phase 4; decision 58).
//
// Against the local synthetic demo, after a seed reset, captures the
// representative screens as the founder in both themes at desktop (1440)
// and mobile (390) widths. Each image is ONE full-page capture
// (captureBeyondViewport), never stitched from viewport slices. Also:
//   - Approvals as the operator (the approval controls withheld);
//   - a status-vocabulary sheet in both themes, rendered in the test browser
//     from the Badge markup and the STATUS, STAGE_TONE (ui.tsx) and
//     STAGE_LABELS (workflow.ts) definitions, read from source; it is not a
//     Flight Deck screen and nothing in the app is changed to draw it;
//   - the relationship print view printed to PDF (A4, backgrounds off, as a
//     browser prints by default), in both themes.
// Run it on `main` for "before" and on a branch for "after"; the images are
// for review, not pixel identity across days (dates in the seed move).
//
//   node scripts/test/flight-deck-capture.mjs --out DIR
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertOutputDir, launch } from "./flight-deck-browser.mjs";
import { resolveTargets } from "./flight-deck-census.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const ts = createRequire(path.join(ROOT, "package.json"))("typescript");

export const WIDTHS = { desktop: [1440, 900, false], mobile: [390, 844, true] };
export const THEMES = ["dark", "light"];

// Reads a top-level object literal of string values (one level of nesting).
function readObject(file, name) {
  const sf = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const value = (node) => {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.text ?? p.name.getText(), value(p.initializer)]));
    if (ts.isAsExpression(node)) return value(node.expression);
    return undefined;
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (d.name.getText() === name) return value(d.initializer);
  }
  throw new Error(`${name} not found in ${file}`);
}

function vocabularySheet() {
  const STATUS = readObject("src/components/flight-deck/ui.tsx", "STATUS");
  const STAGE_TONE = readObject("src/components/flight-deck/ui.tsx", "STAGE_TONE");
  const STAGE_LABELS = readObject("src/lib/flightDeck/workflow.ts", "STAGE_LABELS");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // The exact markup of Badge (ui.tsx): neutral carries no data-tone.
  const badge = (tone, glyph, label) => `<span class="fd-badge"${tone && tone !== "neutral" ? ` data-tone="${tone}"` : ""}>${glyph ? `<span aria-hidden="true">${esc(glyph)}</span>` : ""}${esc(label)}</span>`;
  const row = (key, tone, html) => `<tr style="border-top:1px solid var(--tiro-border)"><td style="padding:.45rem .8rem .45rem 0;font-family:var(--font-code);font-size:.72rem;color:var(--tiro-text-muted)">${esc(key)}</td><td style="padding:.45rem .8rem .45rem 0;font-size:.72rem;color:var(--tiro-text-muted)">${esc(tone)}</td><td style="padding:.45rem 0">${html}</td></tr>`;
  const statusRows = Object.entries(STATUS).map(([k, s]) => row(k, s.tone, badge(s.tone, s.glyph, s.label))).join("");
  const stageRows = Object.entries(STAGE_LABELS).map(([k, label]) => {
    const tone = STAGE_TONE[k] ?? "neutral";
    return row(k, tone, badge(tone, tone === "blocked" ? "■" : "○", label));
  }).join("");
  const health = [["done", "●", "Live"], ["attention", "◌", "Local only"], ["blocked", "■", "Off"]].map(([tone, g, l]) => row(`health: ${l}`, tone, badge(tone, g, l))).join("");
  const table = (title, rows) => `<h2 class="lt-label" style="margin:2rem 0 .5rem">${title}</h2><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th style="font-weight:400" class="lt-label">Key</th><th style="font-weight:400" class="lt-label">Tone</th><th style="font-weight:400" class="lt-label">Rendered (Badge markup)</th></tr></thead><tbody>${rows}</tbody></table>`;
  return `<p class="lt-label mb-2 text-[var(--tiro-accent)]">Phase 4 baseline · test-rendered sheet</p><h1 class="font-[family-name:var(--font-display)] text-3xl">Status vocabulary, before the redesign</h1><p style="margin-top:.75rem;max-width:44rem;font-size:.9rem;color:var(--tiro-text-muted)">Rendered in the test browser from the Badge markup and the STATUS and STAGE_TONE maps (ui.tsx) and STAGE_LABELS (workflow.ts), read from source. Not a Flight Deck screen. Word, then glyph; tone only repeats them.</p>${table("StatusBadge (STATUS)", statusRows)}${table("StageBadge (STAGE_LABELS, STAGE_TONE)", stageRows)}${table("Health: what is live (TONE_LABEL)", health)}`;
}

async function main(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!out) throw new Error("--out DIR is required");
  assertOutputDir(out, ROOT);
  fs.mkdirSync(out, { recursive: true });
  const b = await launch(BASE);
  const written = [];
  try {
    await b.viewport(1440, 900);
    await b.resetSeed();
    await b.signIn("founder");
    const t = await resolveTargets(b);
    const screens = [
      ["now", "/flight-deck"],
      ["approvals", "/flight-deck/approvals"],
      ["relationship", t.b02],
      ["activity", "/flight-deck/activity"],
      ["health", "/flight-deck/health"],
      ["relationship-print", `${t.b02}/print`],
    ];
    for (const themeName of THEMES) {
      await b.go("/flight-deck");
      await b.theme(themeName);
      for (const [size, [w, h, mobile]] of Object.entries(WIDTHS)) {
        await b.viewport(w, h, mobile);
        for (const [name, p] of screens) {
          await b.go(p);
          await b.assertSynthetic();
          const file = path.join(out, `${name}.${size}.${themeName}.jpg`);
          const dim = await b.capture(file);
          written.push({ file: path.basename(file), ...dim });
        }
      }
    }
    // The approval controls withheld: Approvals as the operator.
    await b.signIn("operator");
    await b.theme("dark");
    await b.viewport(1440, 900);
    await b.go("/flight-deck/approvals");
    await b.assertSynthetic();
    written.push({ file: "approvals.desktop.dark.operator.jpg", ...(await b.capture(path.join(out, "approvals.desktop.dark.operator.jpg"))) });
    // The vocabulary sheet, in both themes.
    await b.signIn("founder");
    const sheet = vocabularySheet();
    for (const themeName of THEMES) {
      await b.theme(themeName);
      await b.go("/flight-deck");
      await b.evaluate(`(() => { document.querySelector("#flight-deck").innerHTML = ${JSON.stringify(sheet)}; return true; })()`);
      const file = `status-vocabulary.desktop.${themeName}.jpg`;
      written.push({ file, ...(await b.capture(path.join(out, file))) });
    }
    // Print: the relationship summary as a browser would print it.
    for (const themeName of THEMES) {
      await b.theme(themeName);
      await b.go(`${t.b02}/print`);
      await b.assertSynthetic();
      const file = `relationship-print.${themeName}.pdf`;
      await b.pdf(path.join(out, file));
      written.push({ file });
    }
  } finally {
    await b.close();
  }
  for (const w of written) console.log(`${w.file}${w.width ? ` ${w.width}×${w.height}` : ""}`);
  console.log(`${written.length} file(s) in ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
