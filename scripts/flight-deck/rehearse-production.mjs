// Production-mode rehearsal on one machine.
//
// Runs the PRODUCTION BUILD (`next start`, NODE_ENV=production,
// FLIGHT_DECK_MODE=production) against a throwaway PostgreSQL that only
// accepts TLS, with certificate and hostname verification against a
// self-signed CA, then probes it over HTTP with the configured Host header.
// The Cognito settings are well-formed but fictitious: no probe reaches
// Cognito. The protective event log is the real S3 adapter pointed at a
// local S3-compatible test server (fake-s3.mjs). No network service outside
// this machine is contacted. Requires `npm run build` first and `openssl`
// on PATH.
//
// The one step a rehearsal cannot perform is a Cognito sign-in with MFA, so
// the console gate is approved by rehearse-approve-gate.ts, which binds a
// fictitious subject and then runs the console's own approval code.
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

const { startFakeS3 } = await import("./fake-s3.mjs");
const s3 = await startFakeS3();
const BUCKET = "fd-rehearsal-protective-log";
const s3Keys = (part) => [...s3.objects.keys()].filter((k) => k.startsWith(`${BUCKET}/flight-deck/${part}`));

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
  FLIGHT_DECK_PROTECTIVE_BUCKET: BUCKET,
  FLIGHT_DECK_PROTECTIVE_REGION: "eu-west-2",
  FLIGHT_DECK_PROTECTIVE_ENDPOINT: s3.endpoint,
  // The test server does not check signatures; these are not credentials.
  AWS_ACCESS_KEY_ID: "rehearsal",
  AWS_SECRET_ACCESS_KEY: "rehearsal",
  // Deliberately ON, to prove it opens nothing by itself.
  FLIGHT_DECK_PUBLIC_FORM_ENABLED: "true",
  FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED: "true",
};
delete env.FLIGHT_DECK_DIST_DIR;

const tsx = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const admin = (...args) => runTs("scripts/flight-deck/admin.ts", ...args);
function runTs(script, ...args) {
  try {
    const out = execFileSync(process.execPath, [tsx, "--import", "./scripts/test/server-only-hook.mjs", script, ...args], { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
}

// Asynchronous, for scripts that call the in-process S3 test server (a
// synchronous child would block this process and so that server).
function runTsAsync(script, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsx, "--import", "./scripts/test/server-only-hook.mjs", script, ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("close", (code) => resolve({ ok: code === 0, out: out.trim() }));
  });
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
  const scripted = admin("record-gate", "console", "--by", "Rehearsal");
  check("admin: a gate cannot be recorded from the script (console approval only)", !scripted.ok && /use \/flight-deck\/gates/.test(scripted.out));
  const added = admin("add-operator", "--email", "founder@rehearsal.invalid", "--name", "Rehearsal Founder", "--role", "founder");
  check("admin: named founder operator added", added.ok, added.out.replace(/usr_\w+/, "usr_…"));
  // A gate row written straight into the database, as the 0.2 script did
  // (a free-text name, no signature), must open nothing.
  {
    const c = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal`, ssl: { ca, rejectUnauthorized: true } });
    await c.connect();
    await c.query("insert into fd_activation_gates (gate, approved_by, approved_at, detail) values ('console', 'Rehearsal Founder', now(), '{}')");
    await c.end();
  }
  const listed = admin("list-gates");
  check("admin: list-gates reports the unsigned row as not valid", listed.ok && /NOT VALID \(unsigned\)/.test(listed.out), listed.out);

  next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      await request("GET", "/");
      break;
    } catch {
      await sleep(500);
    }
  }

  // Before a valid console gate: only sign-in and the gates page exist, so
  // a founder can approve; the console and machine endpoints do not.
  const boot = await request("GET", "/flight-deck/sign-in");
  check("before the console gate, sign-in is reachable (bootstrap) and offers Cognito only", boot.status === 200 && boot.body.includes("Continue to sign in") && !boot.body.includes("Demo Founder"));
  check("before the console gate, the console is 404 even with an unsigned gate row", (await request("GET", "/flight-deck")).status === 404 && (await request("GET", "/flight-deck/relationships")).status === 404);
  check("before the console gate, the gates page requires a session", (await request("GET", "/flight-deck/gates")).status === 307);
  check("a request on any other host is 404", (await request("GET", "/flight-deck/sign-in", { host: "localhost" })).status === 404);
  check("machine endpoints are 404 before the gate", (await request("POST", "/flight-deck/internal/worker", { headers: { Authorization: `Bearer ${tokens.worker}` } })).status === 404);
  const pilot = await request("GET", "/pilot");
  check("/pilot form stays closed in production with its flag on (draft notice, no gate)", pilot.status === 200 && pilot.body.includes("Form not yet open") && !/name="email"/.test(pilot.body));

  const approved = await runTsAsync("scripts/flight-deck/rehearse-approve-gate.ts", "founder@rehearsal.invalid", "rehearsal-subject-0001");
  check("console gate approved through the console's approval code (signed, journaled)", approved.ok, approved.out.replace(/"session":"[^"]+"/, '"session":"…"'));
  const minted = (() => {
    try {
      return JSON.parse(approved.out.split("\n").pop());
    } catch {
      return {};
    }
  })();
  const ev1 = s3.objects.get(`${BUCKET}/flight-deck/events/000000000001.json`)?.toString("utf8") ?? "";
  check("the approval is event 1 in the protective log (S3, conditional write)", /"kind":"gate-recorded"/.test(ev1) && s3.requests.some((r) => r.method === "PUT" && r.ifNoneMatch === "*"));
  check("the protective log holds no address or name", !/@|Rehearsal Founder/.test(JSON.stringify([...s3.objects.values()].map(String))));
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
  const tick = await request("POST", "/flight-deck/internal/worker?wait=1", { headers: { Authorization: `Bearer ${tokens.worker}` } });
  const t = JSON.parse(tick.body);
  check("a scheduled worker tick runs against the production database", tick.status === 200 && t.outcome === "ok", tick.body);
  check("the tick wrote a reconciliation checkpoint and the restore fence to the protective log", s3Keys("checkpoints/0").length === 1 && s3.objects.get(`${BUCKET}/flight-deck/checkpoints/fence.json`)?.toString("utf8") === "{\"fence\":1}", s3Keys("checkpoints/").join(","));
  const status2 = await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } });
  const s2 = JSON.parse(status2.body);
  check("status after the tick is healthy (200) with recovery verified and no alerts", status2.status === 200 && s2.worker?.lastOutcome === "ok" && s2.recovery === "verified" && s2.alerts.length === 0, status2.body);
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

  // ---------- Recovery isolation (0.2.1 review correction) ----------
  // A copy restored from before the last healthy worker run, with no
  // protective event missing, simulated by putting the database's restore
  // fence behind the bucket's. Nobody runs mark-restored.
  const asFounder = { Cookie: `__Host-fd_session=${minted.session}` };
  const live = await request("GET", "/flight-deck/relationships", { headers: asFounder });
  check("while verified, a signed-in founder sees the test relationship", live.status === 200 && live.body.includes("Rehearsal Person"), String(live.status));
  {
    const c = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal`, ssl: { ca, rejectUnauthorized: true } });
    await c.connect();
    await c.query("update fd_protective_head set fence = 0 where id = 1");
    await c.end();
  }
  const blocked = await Promise.all(["/flight-deck", "/flight-deck/relationships", `/flight-deck/relationships/${minted.prospectId}`, "/flight-deck/health"].map((u) => request("GET", u, { headers: asFounder })));
  check(
    "a restored copy serves no private page: every page redirects to the recovery page",
    blocked.every((r) => r.status === 307 && /\/flight-deck\/recovery/.test(r.headers.location ?? "")),
    blocked.map((r) => `${r.status} ${r.headers.location ?? ""}`).join(", "),
  );
  const exp = await request("GET", `/flight-deck/export/${minted.prospectId}`, { headers: asFounder });
  check("a restored copy refuses a record export (503)", exp.status === 503 && !exp.body.includes("Rehearsal Person"));
  const rec = await request("GET", "/flight-deck/recovery", { headers: asFounder });
  check("the recovery page shows the status and no record", rec.status === 200 && rec.body.includes("restored copy") && !/Rehearsal Person|person@rehearsal/.test(rec.body));
  const status4 = JSON.parse((await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } })).body);
  check("the monitor reports the restored copy without anyone telling it", status4.recovery === "restore-in-progress" && status4.ok === false, JSON.stringify(status4));
  const tick3 = JSON.parse((await request("POST", "/flight-deck/internal/worker?wait=1", { headers: { Authorization: `Bearer ${tokens.worker}` } })).body);
  check("the scheduled worker verifies the copy by itself", tick3.outcome === "ok", JSON.stringify(tick3));
  const after = await request("GET", "/flight-deck/relationships", { headers: asFounder });
  check("verification ended every session, so the copied one no longer works", after.status === 307 && /\/flight-deck\/sign-in/.test(after.headers.location ?? ""), String(after.status));
  const status5 = JSON.parse((await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } })).body);
  check("status is verified again", status5.recovery === "verified", JSON.stringify(status5));

  // EventBridge waits at most 5 seconds for an API destination. The
  // default (scheduled) call is accepted at once and the tick runs after
  // the response.
  const runsBefore = await (async () => {
    const c = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal`, ssl: { ca, rejectUnauthorized: true } });
    await c.connect();
    const n = (await c.query("select count(*)::int n from fd_worker_runs")).rows[0].n;
    await c.end();
    return n;
  })();
  const t0 = Date.now();
  const accepted = await request("POST", "/flight-deck/internal/worker", { headers: { Authorization: `Bearer ${tokens.worker}` } });
  const answeredMs = Date.now() - t0;
  let runsAfter = runsBefore;
  for (let i = 0; i < 40 && runsAfter === runsBefore; i++) {
    await sleep(250);
    const c = new pg.Client({ connectionString: `postgresql://fd_owner:${pgPassword}@localhost:${pgPort}/flight_deck_rehearsal`, ssl: { ca, rejectUnauthorized: true } });
    await c.connect();
    runsAfter = (await c.query("select count(*)::int n from fd_worker_runs where doc->>'outcome' <> 'running'")).rows[0].n;
    await c.end();
  }
  check("a scheduled call is accepted at once (202, well under 5 s) and the tick completes after the response", accepted.status === 202 && answeredMs < 2000 && runsAfter === runsBefore + 1, `${accepted.status} in ${answeredMs} ms; runs ${runsBefore} -> ${runsAfter}`);

  // The protective log becomes unreachable: contact must stop and the
  // monitor must say so.
  await s3.stop();
  const status3 = await request("GET", "/flight-deck/internal/status", { headers: { Authorization: `Bearer ${tokens.monitor}` } });
  const s3body = JSON.parse(status3.body);
  check("with the protective log unreachable, status is 503 and reports it", status3.status === 503 && s3body.recovery === "sink-unavailable", status3.body);
  const tick2 = JSON.parse((await request("POST", "/flight-deck/internal/worker?wait=1", { headers: { Authorization: `Bearer ${tokens.worker}` } })).body);
  check("with the protective log unreachable, the worker dispatches nothing", tick2.outcome !== "ok" && tick2.jobsClaimed === 0, JSON.stringify(tick2));
} catch (e) {
  check("rehearsal completed", false, e instanceof Error ? e.message : String(e));
} finally {
  next?.kill();
  await s3.stop().catch(() => undefined);
  await sleep(500);
  await server.stop().catch(() => undefined);
  fs.rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Results: ${path.relative(ROOT, OUT)}`);
process.exit(failed.length ? 1 : 0);
