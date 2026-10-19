// Server-only wiring for Flight Deck. Every page, action and route handler
// goes through here, and every one of them fails closed: when a request is
// not a local-demo request or an activated production request, there is no
// store, no provider, and no actor, so there is nothing to read or write.
import "server-only";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type pg from "pg";
import { createPool } from "./postgres/pool";
import { FormTokens, InMemoryRateLimiter, clientKey, type RateLimiter } from "./abuse";
import type { Actor } from "./access";
import { channelFlags, decideMode, privacyNoticeIsDraft, productionConfig, publicFormOpen, PRIVACY_NOTICE_VERSION, requestMode, type ChannelFlags, type ProductionConfig } from "./config";
import { PostgresIdentityStore, type GateRecord, type IdentityStore, type SessionActor } from "./identity";
import type { CognitoConfig } from "./oidc";
import { initializeDatabase, migrate } from "./postgres/migrations";
import { PostgresRateLimiter } from "./postgres/rateLimiter";
import { PostgresOperationsStore } from "./postgres/store";
import { wipeSyntheticDatabase } from "./postgres/admin";
import { FileLedgerSink, type LedgerSink } from "./ledger";
import { LocalFileProtectiveSink } from "./protective";
import { S3ProtectiveSink } from "./s3Sink";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { verifyGate } from "./gates";
import fs from "node:fs";
import { DisabledEmailProvider, DisabledSocialPublisher, LocalOutboxEmailProvider, LocalOutboxSocialPublisher, type Providers } from "./providers";
import { buildSeedState } from "./seed";
import { LocalFileOperationsStore, type OperationsStore } from "./store";
import { readSession, SESSION_COOKIE } from "./session";

export type Runtime = {
  mode: "local-demo" | "production";
  store: OperationsStore;
  storeLabel: string;
  providers: Providers;
  flags: ChannelFlags;
  tokens: FormTokens;
  limiter: RateLimiter;
  limiterLabel: string;
  // Keys the rate limiter; client addresses are never stored.
  clientSecret: string;
  identity: IdentityStore | null;
  cognito: CognitoConfig | null;
  config: ProductionConfig | null;
  purgeRateLimits?: (cutoff: Date) => Promise<number>;
  acquireWorkerLock?: () => Promise<(() => Promise<void>) | null>;
  ledgerSink?: LedgerSink;
  // Local demo only: replace everything with fresh synthetic fixtures.
  resetToSeed?: () => Promise<void>;
};

const LOCAL_DIR = path.join(process.cwd(), ".flight-deck");
// The local demo's synthetic pepper. Never used for real data: production
// requires FLIGHT_DECK_EMAIL_HASH_PEPPER from the secret manager.
const DEMO_PEPPER = "flight-deck-local-demo-pepper-synthetic-only-0001";

type Cached = { runtime: Promise<Omit<Runtime, "flags" | "providers">>; providers?: Providers; providersFor?: string; gates?: { at: number; records: GateRecord[] } };
const g = globalThis as unknown as { __flightDeck2?: Record<string, Cached> };
const cache = () => (g.__flightDeck2 ??= {});

async function host(): Promise<string | null> {
  return (await headers()).get("host");
}

const derive = (secret: string, purpose: string) => createHmac("sha256", secret).update(`flight-deck:${purpose}`).digest("hex");

function poolFor(url: string, production: ProductionConfig | null): pg.Pool {
  return createPool(url, { ca: production?.databaseCa ?? null });
}

function advisoryLock(pool: pg.Pool) {
  return async () => {
    const client = await pool.connect();
    // On serverless hosts a function can be frozen or killed while holding
    // the lock. The lock's connection stays idle for the whole tick, so the
    // server closes it (releasing the lock) once it has been idle longer
    // than any tick may run (the worker route's maxDuration is 120 s).
    await client.query("set idle_session_timeout = '150s'");
    const { rows } = await client.query("select pg_try_advisory_lock(hashtext('flight-deck-worker')) as ok");
    if (!rows[0].ok) {
      await client.query("reset idle_session_timeout").catch(() => undefined);
      client.release();
      return null;
    }
    return async () => {
      await client.query("select pg_advisory_unlock(hashtext('flight-deck-worker'))").catch(() => undefined);
      await client.query("reset idle_session_timeout").catch(() => undefined);
      client.release();
    };
  };
}

async function buildLocalDemo(): Promise<Omit<Runtime, "flags" | "providers">> {
  const tokens = new FormTokens(randomBytes(32).toString("hex"));
  const clientSecret = randomBytes(32).toString("hex");
  const dbUrl = process.env.FLIGHT_DECK_DATABASE_URL;
  if (dbUrl) {
    // Local demo over a local Postgres: the same adapter production uses,
    // holding synthetic data only (the database is marked synthetic).
    const pool = poolFor(dbUrl, null);
    const client = await pool.connect();
    try {
      await migrate(client);
      await initializeDatabase(client, { synthetic: true });
    } finally {
      client.release();
    }
    const pepper = process.env.FLIGHT_DECK_EMAIL_HASH_PEPPER || DEMO_PEPPER;
    // The demo's protective log: local files beside the demo database.
    const logDir = path.join(LOCAL_DIR, "protective-pg");
    const sink = new LocalFileProtectiveSink(logDir);
    const store = await PostgresOperationsStore.open({ pool, pepper, synthetic: true, sink, requireJournal: true });
    const limiter = new PostgresRateLimiter(pool);
    // A reset starts a new synthetic world: database AND its log.
    const resetToSeed = async () => {
      await wipeSyntheticDatabase(pool);
      fs.rmSync(logDir, { recursive: true, force: true });
      await store.importSnapshot(await buildSeedState(new Date(), { pepper }), { asRestore: false });
    };
    if ((await store.read((tx) => tx.list("prospects").length)) === 0 && (await store.auditPage(0, 1)).total === 0) {
      fs.rmSync(logDir, { recursive: true, force: true });
      await store.importSnapshot(await buildSeedState(new Date(), { pepper }), { asRestore: false });
    }
    return {
      mode: "local-demo",
      store,
      storeLabel: "Local PostgreSQL (synthetic)",
      tokens,
      limiter,
      limiterLabel: "PostgreSQL (shared, durable)",
      clientSecret,
      identity: null,
      cognito: null,
      config: null,
      purgeRateLimits: (cutoff) => limiter.purgeOlderThan(cutoff),
      acquireWorkerLock: advisoryLock(pool),
      ledgerSink: new FileLedgerSink(path.join(LOCAL_DIR, "ledger-pg.json")),
      resetToSeed,
    };
  }
  const fileLogDir = path.join(LOCAL_DIR, "protective-file");
  const store = new LocalFileOperationsStore(process.env.FLIGHT_DECK_LOCAL_STORE_PATH ? path.resolve(process.env.FLIGHT_DECK_LOCAL_STORE_PATH) : path.join(LOCAL_DIR, "local-store.json"), undefined, {
    sink: new LocalFileProtectiveSink(fileLogDir),
    requireJournal: true,
  });
  if ((await store.read((tx) => tx.list("prospects").length)) === 0 && (await store.auditPage(0, 1)).total === 0) {
    fs.rmSync(fileLogDir, { recursive: true, force: true });
    await store.replace(await buildSeedState());
  }
  const limiter = new InMemoryRateLimiter();
  return {
    mode: "local-demo",
    store,
    storeLabel: "Local JSON file (synthetic)",
    tokens,
    limiter,
    limiterLabel: "In-memory (this process only)",
    clientSecret,
    identity: null,
    cognito: null,
    config: null,
    ledgerSink: new FileLedgerSink(path.join(LOCAL_DIR, "ledger-file.json")),
    resetToSeed: async () => {
      fs.rmSync(fileLogDir, { recursive: true, force: true });
      await store.replace(await buildSeedState());
      limiter.clear();
    },
  };
}

async function buildProduction(config: ProductionConfig): Promise<Omit<Runtime, "flags" | "providers">> {
  const pool = poolFor(config.databaseUrl, config);
  // Production never migrates or initializes on request: the migrate
  // script does that, deliberately, before deploy. Opening refuses a
  // database that is uninitialized or marked synthetic.
  // The protective log is mandatory in production: a protective change
  // that cannot be journaled is refused (requireJournal).
  // On Vercel (roleArn set), S3 credentials come from Vercel OIDC
  // federation: the function's OIDC token for this exact project and
  // environment is exchanged with STS for one-hour credentials to the
  // staging role, which can only append to and read the log. No AWS key
  // is stored anywhere. Elsewhere, the default AWS credential chain.
  const sink = new S3ProtectiveSink(
    config.protective,
    config.protective.roleArn ? { credentials: awsCredentialsProvider({ roleArn: config.protective.roleArn, roleSessionName: "flight-deck" }) } : {},
  );
  // Staging opens only a database marked synthetic; production only one
  // marked real (the store refuses a mismatch), so the two cannot be
  // pointed at each other's data by a configuration mistake.
  const synthetic = config.deployment === "staging";
  const store = await PostgresOperationsStore.open({ pool, pepper: config.pepper, synthetic, sink, requireJournal: true });
  const limiter = new PostgresRateLimiter(pool);
  return {
    mode: "production",
    store,
    storeLabel: "PostgreSQL",
    // Derived, not random: every instance must accept every other
    // instance's form tokens and agree on rate-limit keys.
    tokens: new FormTokens(derive(config.sessionSecret, "form-tokens")),
    limiter,
    limiterLabel: "PostgreSQL (shared, durable)",
    clientSecret: derive(config.sessionSecret, "client-keys"),
    identity: new PostgresIdentityStore(pool, { sink, requireJournal: true, synthetic }),
    cognito: config.cognito,
    config,
    purgeRateLimits: (cutoff) => limiter.purgeOlderThan(cutoff),
    acquireWorkerLock: advisoryLock(pool),
  };
}

// The runtime for this request's mode, or null. Does NOT check the console
// gate; use getConsoleRuntime() for anything private.
export async function getRuntime(): Promise<Runtime | null> {
  const mode = requestMode(process.env, await host());
  if (!mode) {
    return null;
  }
  const config = mode === "production" ? productionConfig(process.env) : null;
  const key = mode === "production" ? "production" : `local-demo:${process.env.FLIGHT_DECK_DATABASE_URL ? "pg" : "file"}`;
  const entry = (cache()[key] ??= { runtime: mode === "production" ? buildProduction(config!) : buildLocalDemo() });
  let base: Omit<Runtime, "flags" | "providers">;
  try {
    base = await entry.runtime;
  } catch (e) {
    // A failed start (database unreachable, uninitialized) is not cached:
    // the next request tries again. Callers treat this as unavailable.
    delete cache()[key];
    throw e;
  }
  const flags = channelFlags(process.env);
  const signature = mode === "production" ? "production" : `${flags.outboundEmail}:${flags.socialPublishing}`;
  if (!entry.providers || entry.providersFor !== signature) {
    // Production: no live provider exists, so both stay disabled whatever
    // the flags say. Local demo: a flag selects only the dry-run outbox.
    entry.providers =
      mode === "production"
        ? { email: new DisabledEmailProvider(), social: new DisabledSocialPublisher() }
        : {
            email: flags.outboundEmail ? new LocalOutboxEmailProvider(path.join(LOCAL_DIR, "outbox")) : new DisabledEmailProvider(),
            social: flags.socialPublishing ? new LocalOutboxSocialPublisher(path.join(LOCAL_DIR, "outbox")) : new DisabledSocialPublisher(),
          };
    entry.providersFor = signature;
  }
  return { ...base, flags, providers: entry.providers };
}

async function gateRecords(rt: Runtime): Promise<GateRecord[]> {
  if (!rt.identity) {
    return [];
  }
  const entry = cache().production;
  const now = Date.now();
  if (entry?.gates && now - entry.gates.at < 30_000) {
    return entry.gates.records;
  }
  const records = await rt.identity.gates();
  if (entry) {
    entry.gates = { at: now, records };
  }
  return records;
}

// A gate counts only if its signed approval verifies against the server
// key AND its approver is still an active founder with the same provider
// subject (gates.ts). An unsigned or altered row opens nothing.
export async function gateRecorded(rt: Runtime, gate: "console" | "public-form"): Promise<GateRecord | null> {
  const record = (await gateRecords(rt)).find((r) => r.gate === gate) ?? null;
  if (!record || !rt.identity || !rt.config) {
    return null;
  }
  return (await verifyGate(record, rt.config.sessionSecret, rt.identity)).ok ? record : null;
}

export function forgetGateCache() {
  const entry = cache().production;
  if (entry) {
    entry.gates = undefined;
  }
}

// The private console: local demo, or production with a verified console
// gate. Anything else: null (404).
export async function getConsoleRuntime(): Promise<Runtime | null> {
  const rt = await getRuntime();
  if (!rt) {
    return null;
  }
  if (rt.mode === "production" && !(await gateRecorded(rt, "console"))) {
    return null;
  }
  return rt;
}

// Sign-in, the auth routes, and the gate-approval page also exist before
// the console gate, so that a founder can approve it with a verified,
// fresh sign-in. Nothing else of the console does.
export async function getBootstrapRuntime(): Promise<Runtime | null> {
  return getRuntime();
}

export const PROD_SESSION_COOKIE = "__Host-fd_session";
export const PROD_LOGIN_COOKIE = "__Host-fd_login";

export async function getActor(rt?: Runtime | null): Promise<Actor | SessionActor | null> {
  const runtime = rt === undefined ? await getConsoleRuntime() : rt;
  if (!runtime) {
    return null;
  }
  const jar = await cookies();
  if (runtime.mode === "local-demo") {
    return readSession(jar.get(SESSION_COOKIE)?.value, Date.now());
  }
  const token = jar.get(PROD_SESSION_COOKIE)?.value;
  return token && runtime.identity ? runtime.identity.resolveSession(token, new Date()) : null;
}

export async function isPublicFormOpen(): Promise<boolean> {
  const mode = requestMode(process.env, await host());
  if (mode === "local-demo") {
    return publicFormOpen(process.env, await host());
  }
  // Never on the staging deployment, whatever the flag says.
  if (mode !== "production" || process.env.FLIGHT_DECK_DEPLOYMENT === "staging" || !channelFlags(process.env).publicForm || privacyNoticeIsDraft()) {
    return false;
  }
  const rt = await getRuntime().catch(() => null);
  const gate = rt ? await gateRecorded(rt, "public-form") : null;
  return !!gate && gate.detail.noticeVersion === PRIVACY_NOTICE_VERSION;
}

export async function requestClientKey(secret: string): Promise<string> {
  const h = await headers();
  return clientKey(h.get("x-forwarded-for"), h.get("x-real-ip"), secret);
}

export function modeReason(): string {
  const d = decideMode(process.env);
  return d.mode === "disabled" ? d.reason : d.mode;
}

// Issued at render time; the server refuses it if submitted implausibly
// fast or after it expires (abuse.ts).
export function issueFormToken(runtime: Runtime): string {
  return runtime.tokens.issue(Date.now());
}
