// TIRO-branded Amazon Cognito managed login for the Flight Deck staging app
// client: builds the exact request bodies from the version-controlled files
// in this directory. It makes no AWS call; scripts/flight-deck/
// staging-managed-login.sh sends them. Docs: docs/flight-deck/managed-login.md.
//
//   node deploy/flight-deck/managed-login/build.mjs logo            # regenerate the logo asset
//   node deploy/flight-deck/managed-login/build.mjs check           # verify it is current
//   node deploy/flight-deck/managed-login/build.mjs create-request --user-pool-id <id> --client-id <id>
//   node deploy/flight-deck/managed-login/build.mjs update-request --user-pool-id <id> --branding-id <id>
//
// The two request bodies are the CreateManagedLoginBranding and
// UpdateManagedLoginBranding inputs (API reference), for the AWS CLI's
// --cli-input-json. They contain styling and images only: no credential,
// token, or client secret.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

// The mark is drawn in currentColor and rendered by the site as --tiro-mark,
// which is --tiro-accent (antique gold) in the dark register. An image
// uploaded to Cognito cannot inherit page CSS, so the colour is fixed here.
export const MARK_COLOR = "#c79a4b";
export const MARK_SOURCE = "public/tiro-mark-primary.svg";
export const LOGO_ASSET = "deploy/flight-deck/managed-login/assets/tiro-mark-gold.svg";

// Derived from the official mark, not redrawn: the drawing is kept exactly.
// Removed: the embedded C2PA provenance <metadata> (its signature no longer
// matches once the colour is fixed), and the role and xmlns:c2pa attributes,
// which are not in Cognito's SVG allowlist.
export function logoSvg(source = fs.readFileSync(path.join(ROOT, MARK_SOURCE), "utf8")) {
  const svg = source
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, "")
    .replace(/\s+xmlns:c2pa="[^"]*"/g, "")
    .replace(/\s+role="[^"]*"/g, "")
    .replace(/currentColor/g, MARK_COLOR)
    // Cognito FORM_LOGO requires a width:height ratio of 1:1 to 4:1.
    // Center the original 90x202 drawing in a transparent 202x202 canvas.
    // A viewBox shift preserves every shape, coordinate, and stroke width.
    .replace('<svg width="90" height="202" viewBox="0 0 90 202"', '<svg width="202" height="202" viewBox="-56 0 202 202"')
    .replace(/\r\n/g, "\n");
  return svg.endsWith("\n") ? svg : `${svg}\n`;
}

// Image assets, by Cognito category. Only what the settings enable.
export const ASSETS = [
  // The official mark, at the top of the sign-in form (components.form.logo).
  { Category: "FORM_LOGO", ColorMode: "DARK", Extension: "SVG", file: LOGO_ASSET },
  // The site's own favicon, unchanged (components.favicon.enabledTypes ICO).
  { Category: "FAVICON_ICO", ColorMode: "DYNAMIC", Extension: "ICO", file: "src/app/favicon.ico" },
];

export const SETTINGS_FILE = "deploy/flight-deck/managed-login/branding-settings.json";

export function settings() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, SETTINGS_FILE), "utf8"));
}

export function assets() {
  return ASSETS.map(({ file, ...a }) => ({ ...a, Bytes: fs.readFileSync(path.join(ROOT, file)).toString("base64") }));
}

export function createRequest({ userPoolId, clientId }) {
  return { UserPoolId: userPoolId, ClientId: clientId, UseCognitoProvidedValues: false, Settings: settings(), Assets: assets() };
}

// Update works as a patch: values not sent keep their current setting.
// Sending the complete TIRO settings and assets makes the result the same
// whether the style was created by this tool or by the console.
export function updateRequest({ userPoolId, brandingId }) {
  return { UserPoolId: userPoolId, ManagedLoginBrandingId: brandingId, UseCognitoProvidedValues: false, Settings: settings(), Assets: assets() };
}

// Every leaf of `expected` must be present, with the same value, in `actual`.
export function settingsMismatches(expected, actual, at = "") {
  const out = [];
  if (Array.isArray(expected)) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) out.push(`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else if (expected && typeof expected === "object") {
    for (const [k, v] of Object.entries(expected)) out.push(...settingsMismatches(v, actual?.[k], `${at}/${k}`));
  } else if (typeof expected === "string" ? String(actual).toLowerCase() !== expected.toLowerCase() : actual !== expected) {
    out.push(`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return out;
}

// Checks a DescribeManagedLoginBrandingByClient response against this
// directory: the TIRO settings, and each asset by category and colour mode
// with identical bytes. Returns the problems found.
export function verifyBranding(response, { userPoolId }) {
  const b = response?.ManagedLoginBranding;
  if (!b) return ["no managed login branding style for this app client"];
  const problems = [];
  if (b.UserPoolId !== userPoolId) problems.push(`style belongs to user pool ${b.UserPoolId}`);
  if (b.UseCognitoProvidedValues) problems.push("style uses Cognito's default values, not TIRO's");
  problems.push(...settingsMismatches(settings(), b.Settings ?? {}).map((p) => `settings ${p}`));
  for (const a of assets()) {
    const found = (b.Assets ?? []).find((x) => x.Category === a.Category && x.ColorMode === a.ColorMode);
    if (!found) problems.push(`asset ${a.Category} (${a.ColorMode}) is missing`);
    else if (found.Bytes && found.Bytes !== a.Bytes) problems.push(`asset ${a.Category} (${a.ColorMode}) differs from the repository`);
  }
  return problems;
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const need = (name, pattern) => {
    const v = arg(name);
    if (!v || !pattern.test(v)) {
      console.error(`--${name} is required and must match ${pattern}`);
      process.exit(2);
    }
    return v;
  };
  switch (argv[0]) {
    case "logo":
      fs.writeFileSync(path.join(ROOT, LOGO_ASSET), logoSvg());
      console.log(`wrote ${LOGO_ASSET}`);
      return 0;
    case "check": {
      const current = fs.readFileSync(path.join(ROOT, LOGO_ASSET), "utf8").replace(/\r\n/g, "\n");
      if (current !== logoSvg()) {
        console.error(`${LOGO_ASSET} is out of date with ${MARK_SOURCE}; run: node deploy/flight-deck/managed-login/build.mjs logo`);
        return 1;
      }
      console.log("logo asset is current");
      return 0;
    }
    case "create-request":
      console.log(JSON.stringify(createRequest({ userPoolId: need("user-pool-id", /^[\w-]+_[0-9a-zA-Z]+$/), clientId: need("client-id", /^[\w+]+$/) })));
      return 0;
    case "update-request":
      console.log(JSON.stringify(updateRequest({ userPoolId: need("user-pool-id", /^[\w-]+_[0-9a-zA-Z]+$/), brandingId: need("branding-id", /^[0-9a-fA-F-]{36}$/) })));
      return 0;
    case "verify": {
      // A DescribeManagedLoginBrandingByClient response on stdin.
      const problems = verifyBranding(JSON.parse(fs.readFileSync(0, "utf8")), { userPoolId: need("user-pool-id", /^[\w-]+_[0-9a-zA-Z]+$/) });
      if (problems.length) {
        console.error("The app client's managed login style does not match deploy/flight-deck/managed-login:");
        for (const p of problems) console.error(`  - ${p}`);
        return 1;
      }
      console.log("The app client's managed login style matches the repository (settings and assets).");
      return 0;
    }
    default:
      console.error("usage: build.mjs logo | check | create-request ... | update-request ... | verify ...");
      return 2;
  }
}

if (/managed-login[\\/]build\.mjs$/.test(process.argv[1] ?? "")) {
  process.exit(main(process.argv.slice(2)));
}
