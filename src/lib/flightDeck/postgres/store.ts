// PostgresOperationsStore: the production candidate for the Flight Deck
// OperationsStore contract (../store.ts).
//
// How a transaction runs:
//   1. BEGIN ISOLATION LEVEL SERIALIZABLE.
//   2. Run the domain function against an empty working state. When it
//      touches a collection that is not loaded, makeTx throws
//      NeedCollection; that table is loaded inside this same database
//      transaction (one consistent snapshot) and the function runs again
//      from the start. Domain functions are pure over the transaction, so
//      re-running them is safe.
//   3. Write the difference: inserts, version-checked updates
//      (`where id = $1 and version = $2`), version-checked deletes, audit
//      appends, and atomic counter increments.
//   4. COMMIT. A serialization failure, deadlock, or lost version check
//      rolls back and retries the whole transaction (bounded, with jitter);
//      the domain function then re-checks the user's expected versions
//      against fresh data, so a real conflict surfaces as
//      "changed since you opened it".
//
// Any connection or server failure surfaces as StoreUnavailable, and the
// database guarantees nothing from that transaction was committed.
//
// Scale: a transaction loads every table it touches in full. That is the
// right trade for an operations CRM of hundreds to a few thousand records
// (simple, provably consistent, one round trip per table). The audit trail
// is never loaded by ordinary transactions: appends need no read, and
// pages use auditPage()/auditSince(). Revisit (repository-style queries)
// if prospects pass roughly 5,000 or transactions exceed ~200 ms.
import { randomInt } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { must } from "../schema";
import { SettingsSchema, type AuditEvent, type FunnelCount, type Settings } from "../types";
import {
  COLLECTIONS,
  DEFS,
  NeedCollection,
  StoreError,
  StoreUnavailable,
  makeTx,
  type AuditPage,
  type Clock,
  type CollectionName,
  type OperationsStore,
  type OpsState,
  type OpsTx,
  type WorkingState,
  deriveProtective,
  ReplayOutOfOrder,
  type TxOptions,
} from "../store";
import type { JournalHead, ProtectiveSink } from "../protective";
import { appendWithinTransaction, readHead, setHead } from "./journal";

const TABLE: Record<CollectionName, string> = {
  prospects: "fd_prospects",
  submissions: "fd_submissions",
  permissions: "fd_permissions",
  organizations: "fd_organizations",
  affiliations: "fd_affiliations",
  interactions: "fd_interactions",
  tasks: "fd_tasks",
  campaigns: "fd_campaigns",
  content: "fd_content",
  outreach: "fd_outreach",
  approvals: "fd_approvals",
  jobs: "fd_jobs",
  receipts: "fd_receipts",
  suppressions: "fd_suppressions",
  cases: "fd_cases",
  erasures: "fd_erasures",
  workerRuns: "fd_worker_runs",
  audit: "fd_audit",
  funnel: "fd_funnel",
};

const snake = (field: string) => field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

// The real columns each table carries besides id/version/doc: every
// foreign key and unique field the domain declares, plus the suppression
// key (indexed for lookups).
export function extractedFields(c: CollectionName): string[] {
  const def = DEFS[c];
  const fields = [...Object.keys(def.foreignKeys ?? {}), ...(def.unique ?? [])];
  if (c === "suppressions") {
    fields.push("emailKey");
  }
  return [...new Set(fields)];
}

const RETRYABLE = new Set(["40001", "40P01"]);
const MAX_ATTEMPTS = 8;
const MAX_RELOADS = 40;

class LostVersionCheck extends Error {}

type Snapshot = { collections: Partial<Record<CollectionName, Record<string, Record<string, unknown>>>>; settings?: Settings };

function pgCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

function isConnectionFailure(e: unknown): boolean {
  const code = pgCode(e);
  if (code && (/^08/.test(code) || code === "57P01" || code === "57P02" || code === "57P03" || code === "53300")) {
    return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(msg);
}

function mapError(e: unknown): Error {
  if (e instanceof StoreError || e instanceof StoreUnavailable || !(e instanceof Error)) {
    return e as Error;
  }
  const code = pgCode(e);
  if (code === "23505") {
    return new StoreError("unique", "a unique key would be duplicated");
  }
  if (code === "23503") {
    return new StoreError("foreign-key", "a referenced record does not exist");
  }
  if (isConnectionFailure(e)) {
    return new StoreUnavailable();
  }
  return e;
}

export type PostgresStoreOptions = {
  pool: Pool;
  pepper: string;
  synthetic: boolean;
  clock?: Clock;
  // Test hook: called after the domain function has run and before any
  // write, inside the open transaction. Used to simulate a crash or a
  // concurrent writer at the worst moment.
  beforeWrite?: (client: PoolClient, attempt: number) => Promise<void>;
  // Where protective events go (protective.ts). Production requires one.
  sink?: ProtectiveSink | null;
  requireJournal?: boolean;
  // Test hook: called after protective events were written to the log and
  // before COMMIT. Throwing simulates a crash at the worst moment.
  afterLog?: (client: PoolClient) => Promise<void>;
};

export class PostgresOperationsStore implements OperationsStore {
  readonly kind = "postgres" as const;
  readonly synthetic: boolean;
  private readonly pool: Pool;
  private readonly pepper: string;
  private readonly clock: Clock;
  private readonly beforeWrite?: PostgresStoreOptions["beforeWrite"];

  private constructor(opts: PostgresStoreOptions) {
    this.pool = opts.pool;
    // Idle clients can be dropped by the server or network at any time;
    // the pool discards them. Logged as a class only, never with data.
    if (this.pool.listenerCount("error") === 0) {
      this.pool.on("error", (e) => console.error("flight-deck postgres pool:", e instanceof Error ? e.name : "error"));
    }
    this.pepper = opts.pepper;
    this.synthetic = opts.synthetic;
    this.clock = opts.clock ?? (() => new Date());
    this.beforeWrite = opts.beforeWrite;
    this.protectiveSink = opts.sink ?? null;
    this.requireJournal = opts.requireJournal ?? false;
    this.afterLog = opts.afterLog;
  }

  readonly protectiveSink: ProtectiveSink | null;
  private readonly requireJournal: boolean;
  private readonly afterLog?: PostgresStoreOptions["afterLog"];

  async protectiveHead(): Promise<JournalHead> {
    try {
      return await readHead(this.pool);
    } catch (e) {
      throw mapError(e);
    }
  }

  async restoreFence(): Promise<number> {
    try {
      const { rows } = await this.pool.query("select fence from fd_protective_head where id = 1");
      return Number(rows[0].fence);
    } catch (e) {
      throw mapError(e);
    }
  }

  async raiseFence(to: number): Promise<number> {
    try {
      const { rows } = await this.pool.query("update fd_protective_head set fence = greatest(fence, $1) where id = 1 returning fence", [to]);
      return Number(rows[0].fence);
    } catch (e) {
      throw mapError(e);
    }
  }

  // Opens a migrated, initialized database, refusing one whose synthetic
  // marker does not match what the caller expects.
  static async open(opts: PostgresStoreOptions): Promise<PostgresOperationsStore> {
    if (!opts.pepper || opts.pepper.length < 32) {
      throw new Error("an email-hash pepper of at least 32 characters is required");
    }
    let rows: Record<string, unknown>[];
    try {
      rows = (await opts.pool.query("select value from fd_meta where key = 'synthetic'")).rows;
    } catch (e) {
      throw mapError(e);
    }
    if (!rows.length) {
      throw new Error("this database has not been initialized for Flight Deck (run the migrate script)");
    }
    if (rows[0].value !== opts.synthetic) {
      throw new Error(`database is marked synthetic=${String(rows[0].value)} but this store was opened with synthetic=${opts.synthetic}; refusing`);
    }
    return new PostgresOperationsStore(opts);
  }

  private async connect(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      // A connection killed mid-transaction emits "error" on the client.
      // Without a listener Node would crash the process; with one, the
      // failing query rejects and surfaces as StoreUnavailable.
      if (client.listenerCount("error") === 0) {
        client.on("error", () => undefined);
      }
      return client;
    } catch (e) {
      throw mapError(e) instanceof StoreUnavailable ? new StoreUnavailable() : mapError(e);
    }
  }

  private async load(client: PoolClient, what: CollectionName | "settings", snap: Snapshot) {
    if (what === "settings") {
      const { rows } = await client.query("select doc from fd_settings where id = 1");
      snap.settings = must(SettingsSchema, rows[0]?.doc);
      return;
    }
    const table = TABLE[what];
    const sql = what === "funnel" ? `select doc || jsonb_build_object('count', count) as doc from ${table}` : `select doc from ${table}`;
    const { rows } = await client.query(sql);
    const map: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      const d = r.doc as Record<string, unknown>;
      map[d.id as string] = d;
    }
    snap.collections[what] = map;
  }

  private working(snap: Snapshot): WorkingState {
    return {
      synthetic: this.synthetic,
      pepper: this.pepper,
      settings: snap.settings ? structuredClone(snap.settings) : undefined,
      collections: structuredClone(snap.collections) as WorkingState["collections"],
      appends: {},
      counterDeltas: [],
    };
  }

  // Runs fn to completion, loading whatever it touches. Returns the result
  // and the final working state.
  private async runLoaded<T>(client: PoolClient, fn: (tx: OpsTx) => T, now: Date): Promise<{ result: T; snap: Snapshot; working: WorkingState }> {
    const snap: Snapshot = { collections: {} };
    for (let i = 0; i < MAX_RELOADS; i++) {
      const working = this.working(snap);
      try {
        const result = fn(makeTx(working, now));
        if (result instanceof Promise) {
          throw new Error("transaction functions must be synchronous");
        }
        return { result, snap, working };
      } catch (e) {
        if (e instanceof NeedCollection) {
          await this.load(client, e.collection, snap);
          continue;
        }
        throw e;
      }
    }
    throw new Error("transaction touched too many collections");
  }

  private async write(client: PoolClient, snap: Snapshot, w: WorkingState) {
    for (const c of COLLECTIONS) {
      const before = snap.collections[c];
      const after = w.collections[c] as Record<string, Record<string, unknown>> | undefined;
      const appended = w.appends?.[c] as Record<string, Record<string, unknown>> | undefined;
      if (appended) {
        for (const row of Object.values(appended)) {
          await this.insertRow(client, c, row);
        }
      }
      if (!before || !after) {
        continue;
      }
      const def = DEFS[c];
      for (const [id, row] of Object.entries(after)) {
        const prior = before[id];
        if (!prior) {
          await this.insertRow(client, c, row);
        } else if (def.versioned && prior.version !== row.version) {
          await this.updateRow(client, c, row, prior.version as number);
        } else if (!def.versioned && c !== "funnel" && JSON.stringify(prior) !== JSON.stringify(row)) {
          throw new StoreError("insert-only", `${c} rows cannot change`);
        }
      }
      for (const [id, prior] of Object.entries(before)) {
        if (!after[id]) {
          const res = await client.query(`delete from ${TABLE[c]} where id = $1${def.versioned ? " and version = $2" : ""}`, def.versioned ? [id, prior.version] : [id]);
          if (res.rowCount !== 1) {
            throw new LostVersionCheck();
          }
        }
      }
    }
    if (snap.settings && w.settings && w.settings.version !== snap.settings.version) {
      const res = await client.query("update fd_settings set doc = $1, version = $2 where id = 1 and version = $3", [w.settings, w.settings.version, snap.settings.version]);
      if (res.rowCount !== 1) {
        throw new LostVersionCheck();
      }
    }
    for (const delta of w.counterDeltas ?? []) {
      await this.addCount(client, delta);
    }
  }

  private async insertRow(client: PoolClient, c: CollectionName, row: Record<string, unknown>) {
    if (c === "audit") {
      await client.query("insert into fd_audit (id, at, doc) values ($1, $2, $3)", [row.id, row.at, row]);
      return;
    }
    if (c === "funnel") {
      await this.addCount(client, row as unknown as FunnelCount);
      return;
    }
    const fields = extractedFields(c);
    const cols = ["id", "version", "doc", ...fields.map(snake)];
    const values = [row.id, row.version, row, ...fields.map((f) => row[f] ?? null)];
    await client.query(`insert into ${TABLE[c]} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, values);
  }

  private async updateRow(client: PoolClient, c: CollectionName, row: Record<string, unknown>, priorVersion: number) {
    const fields = extractedFields(c);
    const sets = ["version = $3", "doc = $4", ...fields.map((f, i) => `${snake(f)} = $${i + 5}`)];
    const res = await client.query(`update ${TABLE[c]} set ${sets.join(", ")} where id = $1 and version = $2`, [row.id, priorVersion, row.version, row, ...fields.map((f) => row[f] ?? null)]);
    if (res.rowCount !== 1) {
      throw new LostVersionCheck();
    }
  }

  private async addCount(client: PoolClient, row: FunnelCount) {
    await client.query(
      `insert into fd_funnel (id, count, doc) values ($1, $2, $3)
       on conflict (id) do update set count = fd_funnel.count + excluded.count`,
      [row.id, row.count, { ...row, count: 0 }],
    );
  }

  async transaction<T>(fn: (tx: OpsTx) => T, opts: TxOptions = {}): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const client = await this.connect();
      let broken = false;
      try {
        await client.query("begin isolation level serializable");
        const now = this.clock();
        const { result, snap, working } = await this.runLoaded(client, fn, now);
        await this.beforeWrite?.(client, attempt);
        // Protective events go to the external log before anything is
        // written here; a log failure rolls the whole transaction back.
        let logged = false;
        if (opts.replayHead) {
          const prior = await readHead(client, true);
          if (prior.seq !== opts.replayHead.seq - 1) {
            throw new ReplayOutOfOrder();
          }
          await setHead(client, opts.replayHead);
        } else {
          const bodies = deriveProtective(snap.collections as never, working.collections as never, working.appends as never, this.synthetic, now.toISOString());
          logged = (await appendWithinTransaction(client, this.protectiveSink, this.requireJournal, bodies)) !== null;
        }
        await this.write(client, snap, working);
        if (logged) {
          await this.afterLog?.(client);
        }
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => {
          broken = true;
        });
        const retryable = e instanceof LostVersionCheck || RETRYABLE.has(pgCode(e) ?? "");
        if (retryable && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, randomInt(5, 25 * attempt)));
          continue;
        }
        if (retryable) {
          throw new StoreError("version-conflict", "the record kept changing; try again");
        }
        if (isConnectionFailure(e)) {
          broken = true;
        }
        throw mapError(e);
      } finally {
        client.release(broken);
      }
    }
  }

  async read<T>(fn: (tx: OpsTx) => T): Promise<T> {
    const client = await this.connect();
    let broken = false;
    try {
      await client.query("begin isolation level repeatable read read only");
      const { result } = await this.runLoaded(client, fn, this.clock());
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {
        broken = true;
      });
      broken ||= isConnectionFailure(e);
      throw mapError(e);
    } finally {
      client.release(broken);
    }
  }

  async auditPage(offset: number, limit: number): Promise<AuditPage> {
    try {
      const [{ rows }, count] = await Promise.all([
        this.pool.query("select doc from fd_audit order by at desc, id desc limit $1 offset $2", [limit, offset]),
        this.pool.query("select count(*)::int as n from fd_audit"),
      ]);
      return { events: rows.map((r) => r.doc as AuditEvent), total: count.rows[0].n as number };
    } catch (e) {
      throw mapError(e);
    }
  }

  async auditSince(sinceIso: string): Promise<AuditEvent[]> {
    try {
      const { rows } = await this.pool.query("select doc from fd_audit where at > $1 order by at desc, id desc", [sinceIso]);
      return rows.map((r) => r.doc as AuditEvent);
    } catch (e) {
      throw mapError(e);
    }
  }

  // Liveness for monitoring: a trivial query with a short timeout.
  async ping(): Promise<boolean> {
    try {
      await this.pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Logical snapshot, for restore drills and seeding ----------

  // A complete, consistent copy of the operations data (not identity,
  // sessions, or rate limits). The email-hash pepper is NOT included: it
  // lives in the secret manager, never alongside the data.
  async exportSnapshot(): Promise<Omit<OpsState, "pepper">> {
    const client = await this.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const snap: Snapshot = { collections: {} };
      for (const c of COLLECTIONS) {
        await this.load(client, c, snap);
      }
      await this.load(client, "settings", snap);
      const meta = await client.query("select value from fd_meta where key = 'synthetic'");
      const head = await readHead(client);
      const fence = Number((await client.query("select fence from fd_protective_head where id = 1")).rows[0].fence);
      await client.query("commit");
      return {
        schemaVersion: 2,
        synthetic: meta.rows[0].value as boolean,
        createdAt: this.clock().toISOString(),
        settings: snap.settings!,
        collections: snap.collections as OpsState["collections"],
        protectiveHead: head,
        restoreFence: fence,
      };
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw mapError(e);
    } finally {
      client.release();
    }
  }

  // Loads a snapshot into an EMPTY database (a restore target or a demo
  // seed). Every row is validated again on the way in.
  // asRestore (default): the imported database is locked for contact
  // until the recovery gate has verified it against the protective log.
  // Only the local demo's seeding passes false.
  async importSnapshot(state: Omit<OpsState, "pepper">, opts: { asRestore?: boolean } = {}): Promise<void> {
    if (state.synthetic !== this.synthetic) {
      throw new StoreError("synthetic-mismatch", "snapshot and database disagree about synthetic data");
    }
    const client = await this.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query("select (select count(*) from fd_prospects) + (select count(*) from fd_audit) + (select count(*) from fd_suppressions) as n");
      if (Number(rows[0].n) > 0) {
        throw new Error("importSnapshot requires an empty operations database");
      }
      for (const c of COLLECTIONS) {
        for (const row of Object.values(state.collections[c] ?? {})) {
          const valid = must(DEFS[c].schema, row) as Record<string, unknown>;
          await this.insertRow(client, c, valid);
        }
      }
      // A restored database is locked for contact until the recovery gate
      // has compared it with the external log and replayed anything newer
      // (recovery.ts). Importing is a restore.
      const settings = must(SettingsSchema, { ...state.settings, recoveryLock: opts.asRestore === false ? null : { reason: "restore-in-progress", since: this.clock().toISOString() } });
      await client.query("update fd_settings set doc = $1, version = $2 where id = 1", [settings, settings.version]);
      await setHead(client, state.protectiveHead ?? { seq: 0, hash: "0".repeat(64) });
      await client.query("update fd_protective_head set fence = $1 where id = 1", [state.restoreFence ?? 0]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw mapError(e);
    } finally {
      client.release();
    }
  }
}
