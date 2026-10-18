// Starts `next dev` with the Flight Deck LOCAL DEMO switched on for this
// process only: synthetic fixtures and test identities. Nothing is set in
// any .env file, so a normal `npm run dev`, any build, and any deployment
// stay in the default disabled mode.
//
//   npm run dev:flight-deck                 local JSON file store
//   npm run dev:flight-deck -- --pg         a local PostgreSQL (embedded, synthetic,
//                                           data under .flight-deck/pgdata): the same
//                                           store adapter production uses
//   npm run dev:flight-deck -- --outbox     also write dry-run messages to .flight-deck/outbox
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const outbox = process.argv.includes("--outbox");
const usePg = process.argv.includes("--pg");
const port = process.env.PORT ?? "3100";
const root = path.resolve(import.meta.dirname, "../..");

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

let pg = null;
if (usePg) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = path.join(root, ".flight-deck", "pgdata");
  const secretFile = path.join(root, ".flight-deck", "pg-password");
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  const fresh = !fs.existsSync(path.join(dir, "PG_VERSION"));
  if (!fs.existsSync(secretFile)) {
    fs.writeFileSync(secretFile, randomBytes(16).toString("hex"), { mode: 0o600 });
  }
  const password = fs.readFileSync(secretFile, "utf8").trim();
  const pgPort = Number(process.env.FLIGHT_DECK_PG_PORT ?? 55433);
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "fd_local", password, port: pgPort, persistent: true, onLog: () => {} });
  if (fresh) {
    await pg.initialise();
  }
  await pg.start();
  if (fresh) {
    await pg.createDatabase("flight_deck_demo");
  }
  env.FLIGHT_DECK_DATABASE_URL = `postgresql://fd_local:${password}@127.0.0.1:${pgPort}/flight_deck_demo`;
}

console.log(`Flight Deck local demo on http://localhost:${port}/flight-deck (synthetic data; ${usePg ? "local PostgreSQL" : "local JSON file"}; dry-run outbox ${outbox ? "on" : "off"})`);
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--turbopack", "-p", port, "-H", "localhost"], { env, stdio: "inherit" });
const stop = async (code) => {
  if (pg) {
    await pg.stop().catch(() => undefined);
  }
  process.exit(code ?? 0);
};
child.on("exit", (code) => stop(code));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
