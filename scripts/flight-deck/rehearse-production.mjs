// Production-mode rehearsal on one machine.
//
// Runs the PRODUCTION BUILD (`next start`, NODE_ENV=production,
// FLIGHT_DECK_MODE=production) against a throwaway PostgreSQL that only
// accepts TLS, with certificate and hostname verification against a
// self-signed CA, then probes it over HTTP with the configured Host header.
// The Cognito settings are well-formed but fictitious: no probe reaches
// Cognito, and no network service is contacted. Requires `npm run build`
// first and `openssl` on PATH.
//
//   npm run build && npm run rehearse:flight-deck
//
// Writes docs/flight-deck/screens/production-rehearsal.json.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "docs/flight-deck/screens/production-rehearsal.json");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = () => randomBytes(32).toString("hex");

if (!fs.existsSync(path.join(ROOT, ".next/BUILD_ID"))) {
  console.error("No production build. Run `npm run build` first.");
  process.exit(2);
}

// ---------- TLS-only PostgreSQL with a self-signed CA ----------
const work = fs.mkdtempSync(path.join(os.tmpdir(), "fd-rehearsal-"));
const certDir = path.join(work, "tls");
fs.mkdirSync(certDir);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", path.join(certDir, "server.key"), "-out", path.join(certDir, "server.crt")], { stdio: "ignore" });
const ca = fs.readFileSync(path.join(certDir, "server.crt"), "utf8");

const { default: EmbeddedPostgres } = await import("embedded-postgres");
const dataDir = path.join(work, "data");
const pgPort = 57000 + randomInt(0, 2000);
const pgPassword = secret();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "fd_owner", password: pgPassword, port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
await server.initialise();
fs.copyFileSync(path.join(certDir, "server.crt"), path.join(dataDir, "server.crt"));
fs.copyFileSync(path.join(certDir, "server.key"), path.join(dataDir, "server.key"));
fs.appendFileSync(path.join(dataDir, "postgresql.conf"), "\nssl = on\nssl_cert_file = 'server.crt'\nssl_key_file = 'server.key'\n");
await server.start();
await server.createDatabase("flight_deck_rehearsal");
// From here on, refuse any non-TLS TCP connection, then reload.
fs.writeFileSync(path.join(dataDir, "pg_hba.conf"), "hostssl all all 127.0.0.1/32 scram-sha-256\nhostssl all all ::1/128 scram-sha-256\nhostnossl all all 0.0.0.0/0 reject\nhostnossl all all ::/0 reject\n");
{
  const c = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/postgres`, ssl: { ca, rejectUnauthorized: true } });
  await c.connect();
  await c.query("select pg_reload_conf()");
  await c.end();
}

const HOST = "ops.rehearsal.invalid";
const PORT = 3300 + randomInt(0, 200);
const tokens = { worker: secret(), monitor: secret() };
const env = {
  ...process.env,
  NODE_ENV: "production",
  FLIGHT_DECK_MODE: "production",
  FLIGHT_DECK_DIST_DIR: "",
  FLIGHT_DECK_DATABASE_URL: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal?sslmode=verify-full`,
  FLIGHT_DECK_DATABASE_CA_PEM: ca,
  FLIGHT_DECK_EMAIL_HASH_PEPPER: secret(),
  FLIGHT_DECK_SESSION_SECRET: secret(),
  FLIGHT_DECK_WORKER_TOKEN: tokens.worker,
  FLIGHT_DECK_MONITOR_TOKEN: tokens.monitor,
  FLIGHT_DECK_COGNITO_REGION: "eu-west-2",
  FLIGHT_DECK_COGNITO_USER_POOL_ID: "eu-west-2_Rehearsal01",
  FLIGHT_DECK_COGNITO_CLIENT_ID: "rehearsalclientid0000000001",
  FLIGHT_DECK_COGNITO_CLIENT_SECRET: secret(),
  FLIGHT_DECK_COGNITO_DOMAIN: "https://tiro-rehearsal.auth.eu-west-2.amazoncognito.com",
  FLIGHT_DECK_PUBLIC_ORIGIN: `https://${HOST}`,
  // Deliberately ON, to prove it opens nothing by itself.
  FLIGHT_DECK_PUBLIC_FORM_ENABLED: "true",
  FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED: "true",
};
delete env.FLIGHT_DECK_DIST_DIR;

const tsx = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
function admin(...args) {
  try {
    const out = execFileSync(process.execPath, [tsx, "--import", "./scripts/test/server-only-hook.mjs", "scripts/flight-deck/admin.ts", ...args], { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
}

function request(method, pathname, { host = HOST, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path: pathname, headers: { Host: host, ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

let next = null;
try {
  // Plain TCP without TLS is refused by the database itself.
  const plain = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal` });
  const refused = await plain.connect().then(() => false, () => true);
  await plain.end().catch(() => undefined);
  check("the database refuses connections without TLS", refused);

  check("admin: production configuration is complete", admin("check-config").ok);
  const migrated = admin("migrate");
  check("admin: migrations apply over verified TLS", migrated.ok && /applied: 0001/.test(migrated.out), migrated.out);
  check("admin: database marked as real data", admin("init", "--real").ok);
  check("admin: the console gate is refused before any founder exists", !admin("record-gate", "console", "--by", "Rehearsal").ok);
  const added = admin("add-operator", "--email", "founder@rehearsal.invalid", "--name", "Rehearsal Founder", "--role", "founder");
  check("admin: named founder operator added", added.ok, added.out.replace(/usr_\w+/, "usr_…"));
  const formGate = admin("record-gate", "public-form", "--by", "Rehearsal", "--notice-version", "pilot-privacy-draft-0.2");
  check("admin: the public-form gate is refused while the privacy notice is a draft", !formGate.ok && /still a draft/.test(formGate.out));

  next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      await request("GET", "/");
      break;
    } catch {
      await sleep(500);
    }
  }

  // Before the console gate: nothing private exists.
  check("before the console gate, /flight-deck is 404", (await request("GET", "/flight-deck/sign-in")).status === 404);
  check("a request on any other host is 404", (await request("GET", "/flight-deck/sign-in", { host: "localhost" })).status === 404);
  check("machine endpoints are 404 before the gate", (await request("POST", "/flight-deck/internal/worker", { headers: { Authorization: `Bearer ${tokens.worker}` } })).status === 404);
  const pilot = await request("GET", "/pilot");
  check("/pilot form stays closed in production with its flag on (draft notice, no gate)", pilot.status === 200 && pilot.body.includes("Form not yet open") && !/name="email"/.test(pilot.body));

  check("admin: console gate recorded with a founder present", admin("record-gate", "console", "--by", "Rehearsal Founder").ok);
  await sleep(31_000); // gate cache: 30 s

  const signIn = await request("GET", "/flight-deck/sign-in");
  check("after the gate, sign-in offers Cognito only (no test identities)", signIn.status === 200 && signIn.body.includes("Continue to sign in") && !signIn.body.includes("Demo Founder"));
  const root = await request("GET", "/flight-deck");
  check("no session: the console redirects to sign-in", root.status === 307 && /\/flight-deck\/sign-in/.test(root.headers.location ?? ""));
  const forged = await request("GET", "/flight-deck/relationships", { headers: { Cookie: "__Host-fd_session=forged-token-value-that-does-not-exist-anywhere" } });
  check("a forged session cookie is refused", forged.status === 307);
  const demoCookie = await request("GET", "/flight-deck", { headers: { Cookie: "fd_session=anything" } });
  check("a local-demo session cookie means nothing in production", demoCookie.status === 307);

  const login = await request("GET", "/flight-deck/auth/login");
  const loc = new URL(login.headers.location ?? "https://none.invalid");
  const setCookie = String(login.headers["set-cookie"] ?? "");
  check(
    "login redirects to Cognito with PKCE S256, state and nonce",
    login.status === 303 && loc.origin === env.FLIGHT_DECK_COGNITO_DOMAIN && loc.searchParams.get("code_challenge_method") === "S256" && !!loc.searchParams.get("state") && !!loc.searchParams.get("nonce") && loc.searchParams.get("redirect_uri") === `https://${HOST}/flight-deck/auth/callback`,
  );
  check("the sign-in transaction cookie is __Host-, Secure, HttpOnly", /__Host-fd_login=/.test(setCookie) && /Secure/i.test(setCookie) && /HttpOnly/i.test(setCookie) && /Path=\//.test(setCookie));
  const cb = await request("GET", "/flight-deck/auth/callback?code=abc&state=forged");
  check("a callback without the matching transaction is refused", cb.status === 303 && /error=sign-in-failed/.test(cb.headers.location ?? ""));

  check("status without a token is 401", (await request("GET", "/flight-deck/internal/status")).status === 401);
  const status1 = await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } });
  const s1 = JSON.parse(status1.body);
  check("status before any worker run reports an action-level alert (503)", status1.status === 503 && s1.alerts.some((a) => a.key === "worker-stale"), status1.body);
  check("worker with no token or the monitor token is 401", (await request("POST", "/flight-deck/internal/worker")).status === 401 && (await request("POST", "/flight-deck/internal/worker", { headers: { Authorization: `Bearer ${tokens.monitor}` } })).status === 401);
  const tick = await request("POST", "/flight-deck/internal/worker", { headers: { Authorization: `Bearer ${tokens.worker}` } });
  const t = JSON.parse(tick.body);
  check("a scheduled worker tick runs against the production database", tick.status === 200 && t.outcome === "ok", tick.body);
  const status2 = await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } });
  const s2 = JSON.parse(status2.body);
  check("status after the tick is healthy (200); the missing ledger is a warning", status2.status === 200 && s2.worker?.lastOutcome === "ok" && s2.alerts.some((a) => a.key === "ledger-missing" && a.severity === "warning"), status2.body);
  check("the status body carries no names, addresses, or ids", !/@|prs_|usr_|Rehearsal/.test(status2.body));

  // Database-side facts.
  const db = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal`, ssl: { ca, rejectUnauthorized: true } });
  await db.connect();
  const meta = (await db.query("select value from fd_meta where key = 'synthetic'")).rows[0].value;
  const runs = (await db.query("select count(*)::int n from fd_worker_runs")).rows[0].n;
  const audit = JSON.stringify((await db.query("select doc from fd_audit")).rows);
  const sslInUse = (await db.query("select ssl from pg_stat_ssl where pid = pg_backend_pid()")).rows[0].ssl;
  await db.end();
  check("the database is marked real, holds one worker run, and its connections use TLS", meta === false && runs === 1 && sslInUse === true);
  check("no audit event contains an address or a name", !/@|Rehearsal Founder/.test(audit));
} catch (e) {
  check("rehearsal completed", false, e instanceof Error ? e.message : String(e));
} finally {
  next?.kill();
  await sleep(500);
  await server.stop().catch(() => undefined);
  fs.rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Results: ${path.relative(ROOT, OUT)}`);
process.exit(failed.length ? 1 : 0);
