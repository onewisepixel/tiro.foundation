// Starts `next dev` with the Flight Deck LOCAL DEMO switched on for this
// process only: synthetic fixtures, a local file store under .flight-deck/,
// and test identities. Nothing is set in any .env file, so a normal
// `npm run dev`, any build, and any deployment stay in the default
// disabled mode.
//
//   npm run dev:flight-deck            (form open, dry-run outbox off)
//   npm run dev:flight-deck -- --outbox (also write dry-run messages to .flight-deck/outbox)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const outbox = process.argv.includes("--outbox");
const port = process.env.PORT ?? "3100";

const env = {
  ...process.env,
  NODE_ENV: "development",
  FLIGHT_DECK_MODE: "local-demo",
  FLIGHT_DECK_PUBLIC_FORM_ENABLED: "true",
  FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED: outbox ? "true" : "false",
  FLIGHT_DECK_SOCIAL_PUBLISHING_ENABLED: outbox ? "true" : "false",
  FLIGHT_DECK_BACKGROUND_JOBS_ENABLED: "false",
  // A separate build directory, so this can run beside `npm run dev`.
  FLIGHT_DECK_DIST_DIR: ".next-flight-deck",
};

console.log(`Flight Deck local demo on http://localhost:${port}/flight-deck (synthetic data; dry-run outbox ${outbox ? "on" : "off"})`);
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--turbopack", "-p", port, "-H", "localhost"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
