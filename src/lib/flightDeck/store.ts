// OperationsStore: the persistence contract for the Flight Deck operations
// domain, and its in-process adapters.
//
//   MemoryOperationsStore     in-process only; tests and seeding.
//   LocalFileOperationsStore  one JSON file on this machine; local demo.
//   PostgresOperationsStore   postgres/store.ts; the production candidate.
//
// The domain runs synchronous transaction functions against an OpsTx.
// Every adapter gives the same guarantees: all-or-nothing transactions run
// one at a time (or serializably), optimistic version checks, the declared
// foreign keys and unique keys, an insert-only audit trail, and schema
// validation on every write. This store never reads from or writes to
// backend/ or any archival fixture store.
//
// Demand loading: makeTx() asks its state for a collection only when a
// transaction touches it. The in-process stores always have everything
// loaded. The Postgres adapter starts empty, and when a transaction
// touches a collection it has not loaded, makeTx throws NeedCollection; the
// adapter loads that table inside the same database transaction and runs
// the (pure, re-runnable) function again from the start.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { must, type Schema } from "./schema";
import {
  AffiliationSchema,
  ApprovalSchema,
  AuditEventSchema,
  CampaignSchema,
  CommunicationPermissionSchema,
  ContentDraftSchema,
  DEFAULT_SETTINGS,
  DeliveryReceiptSchema,
  DispatchJobSchema,
  FunnelCountSchema,
  InteractionSchema,
  InterestSubmissionSchema,
  OpsCaseSchema,
  ErasureSchema,
  OpsTaskSchema,
  OrganizationSchema,
  OutreachDraftSchema,
  ProspectSchema,
  SettingsSchema,
  SuppressionSchema,
  WorkerRunSchema,
  type Affiliation,
  type Approval,
  type AuditEvent,
  type Campaign,
  type CommunicationPermission,
  type ContentDraft,
  type DeliveryReceipt,
  type DispatchJob,
  type FunnelCount,
  type Interaction,
  type InterestSubmission,
  type OpsCase,
  type Erasure,
  type OpsTask,
  type Organization,
  type OutreachDraft,
  type Prospect,
  type Settings,
  type Suppression,
  type WorkerRun,
} from "./types";

export type CollectionMap = {
  prospects: Prospect;
  submissions: InterestSubmission;
  permissions: CommunicationPermission;
  organizations: Organization;
  affiliations: Affiliation;
  interactions: Interaction;
  tasks: OpsTask;
  campaigns: Campaign;
  content: ContentDraft;
  outreach: OutreachDraft;
  approvals: Approval;
  jobs: DispatchJob;
  receipts: DeliveryReceipt;
  suppressions: Suppression;
  cases: OpsCase;
  erasures: Erasure;
  workerRuns: WorkerRun;
  audit: AuditEvent;
  funnel: FunnelCount;
};
export type CollectionName = keyof CollectionMap;
type Row<C extends CollectionName> = CollectionMap[C];

export type CollectionDef = {
  schema: Schema<unknown>;
  versioned: boolean;
  insertOnly?: boolean;
  // field -> referenced collection. Checked on every insert and update.
  foreignKeys?: Record<string, CollectionName>;
  unique?: string[];
};

export const DEFS: Record<CollectionName, CollectionDef> = {
  prospects: { schema: ProspectSchema, versioned: true, foreignKeys: { organizationId: "organizations" }, unique: ["emailKey"] },
  submissions: { schema: InterestSubmissionSchema, versioned: true, foreignKeys: { prospectId: "prospects" } },
  permissions: { schema: CommunicationPermissionSchema, versioned: true, foreignKeys: { prospectId: "prospects" } },
  organizations: { schema: OrganizationSchema, versioned: true },
  affiliations: { schema: AffiliationSchema, versioned: true, foreignKeys: { prospectId: "prospects", organizationId: "organizations" } },
  interactions: { schema: InteractionSchema, versioned: true, foreignKeys: { prospectId: "prospects", outreachDraftId: "outreach" } },
  tasks: { schema: OpsTaskSchema, versioned: true, foreignKeys: { prospectId: "prospects" }, unique: ["dedupeKey"] },
  campaigns: { schema: CampaignSchema, versioned: true },
  content: { schema: ContentDraftSchema, versioned: true, foreignKeys: { campaignId: "campaigns" } },
  outreach: { schema: OutreachDraftSchema, versioned: true, foreignKeys: { prospectId: "prospects", campaignId: "campaigns", permissionId: "permissions", followUpOf: "outreach" } },
  // Approvals, jobs and receipts reference their subject weakly (by id
  // only) so an audit trail survives deletion of the draft it describes.
  approvals: { schema: ApprovalSchema, versioned: true },
  jobs: { schema: DispatchJobSchema, versioned: true, foreignKeys: { approvalId: "approvals" }, unique: ["idempotencyKey"] },
  receipts: { schema: DeliveryReceiptSchema, versioned: true, foreignKeys: { jobId: "jobs" } },
  suppressions: { schema: SuppressionSchema, versioned: true },
  cases: { schema: OpsCaseSchema, versioned: true, foreignKeys: { prospectId: "prospects" } },
  erasures: { schema: ErasureSchema, versioned: true },
  workerRuns: { schema: WorkerRunSchema, versioned: true },
  audit: { schema: AuditEventSchema, versioned: false, insertOnly: true },
  funnel: { schema: FunnelCountSchema, versioned: false },
};

export const COLLECTIONS = Object.keys(DEFS) as CollectionName[];

export const STATE_SCHEMA_VERSION = 2;

export type OpsState = {
  schemaVersion: 2;
  // True for every development store. A production store is false, and a
  // store refuses any row whose own flag does not match: synthetic and
  // real records can never be mixed in one store.
  synthetic: boolean;
  createdAt: string;
  pepper: string;
  settings: Settings;
  collections: { [C in CollectionName]: Record<string, Row<C>> };
};

export class StoreError extends Error {
  constructor(
    readonly code: "not-found" | "version-conflict" | "foreign-key" | "unique" | "insert-only" | "referenced" | "synthetic-mismatch",
    message: string,
  ) {
    super(message);
  }
}

// The store could not be reached or failed mid-transaction. Nothing from
// the transaction was committed.
export class StoreUnavailable extends Error {
  readonly code = "storage-unavailable";
  constructor(message = "operations store unavailable") {
    super(message);
  }
}

// Internal to adapters: "load this collection and run the function again".
export class NeedCollection extends Error {
  constructor(readonly collection: CollectionName | "settings") {
    super(`need ${collection}`);
  }
}

export interface OpsTx {
  readonly now: Date;
  readonly nowIso: string;
  readonly pepper: string;
  readonly synthetic: boolean;
  get<C extends CollectionName>(c: C, id: string): Row<C> | null;
  require<C extends CollectionName>(c: C, id: string): Row<C>;
  list<C extends CollectionName>(c: C, predicate?: (row: Row<C>) => boolean): Row<C>[];
  insert<C extends CollectionName>(c: C, row: Row<C>): Row<C>;
  // Optimistic: fails with version-conflict unless the stored version is
  // expectedVersion. Bumps version and updatedAt.
  update<C extends CollectionName>(c: C, id: string, expectedVersion: number, patch: Partial<Row<C>>): Row<C>;
  upsertCounter(row: FunnelCount): void;
  remove<C extends CollectionName>(c: C, id: string): void;
  settings(): Settings;
  updateSettings(expectedVersion: number, patch: Partial<Omit<Settings, "version">>): Settings;
}

export type AuditPage = { events: AuditEvent[]; total: number };

export interface OperationsStore {
  readonly kind: "memory" | "local-file" | "postgres";
  readonly synthetic: boolean;
  transaction<T>(fn: (tx: OpsTx) => T): Promise<T>;
  // A consistent snapshot read. Any write attempted inside is discarded.
  read<T>(fn: (tx: OpsTx) => T): Promise<T>;
  // The audit trail grows without bound, so it is read in pages and ranges
  // outside transactions rather than loaded whole.
  auditPage(offset: number, limit: number): Promise<AuditPage>;
  auditSince(sinceIso: string): Promise<AuditEvent[]>;
}

export type Clock = () => Date;

export function emptyState(now: Date, opts: { synthetic?: boolean; pepper?: string } = {}): OpsState {
  const collections = Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as OpsState["collections"];
  return {
    schemaVersion: 2,
    synthetic: opts.synthetic ?? true,
    createdAt: now.toISOString(),
    pepper: opts.pepper ?? randomBytes(32).toString("hex"),
    settings: { ...DEFAULT_SETTINGS },
    collections,
  };
}

// The working state a transaction runs against. In-process stores pass a
// full OpsState. The Postgres adapter passes partially loaded state:
// absent collections (or settings) throw NeedCollection when touched,
// insert-only rows for unloaded tables go to `appends`, and counter
// increments go to `counterDeltas` so they can be applied with an atomic
// SQL upsert instead of a read-modify-write.
export type WorkingState = {
  synthetic: boolean;
  pepper: string;
  settings: Settings | undefined;
  collections: Partial<{ [C in CollectionName]: Record<string, Row<C>> }>;
  appends?: Partial<Record<CollectionName, Record<string, unknown>>>;
  counterDeltas?: FunnelCount[];
};

export function makeTx(state: WorkingState, now: Date): OpsTx {
  const nowIso = now.toISOString();
  const table = <C extends CollectionName>(c: C): Record<string, Row<C>> => {
    const t = state.collections[c];
    if (!t) {
      throw new NeedCollection(c);
    }
    return t as Record<string, Row<C>>;
  };
  const settings = (): Settings => {
    if (!state.settings) {
      throw new NeedCollection("settings");
    }
    return state.settings;
  };

  function checkConstraints<C extends CollectionName>(c: C, row: Row<C>) {
    const def = DEFS[c];
    const rec = row as Record<string, unknown>;
    if ("synthetic" in rec && rec.synthetic !== state.synthetic) {
      throw new StoreError("synthetic-mismatch", `${c} row synthetic flag does not match this store`);
    }
    for (const [field, target] of Object.entries(def.foreignKeys ?? {})) {
      const ref = rec[field];
      if (ref !== null && ref !== undefined && !table(target)[ref as string]) {
        throw new StoreError("foreign-key", `${c}.${field} references a missing ${target} row`);
      }
    }
    for (const field of def.unique ?? []) {
      const value = rec[field];
      if (value === null || value === undefined) {
        continue;
      }
      const clash = Object.values(table(c)).find((other) => (other as Record<string, unknown>).id !== rec.id && (other as Record<string, unknown>)[field] === value);
      if (clash) {
        throw new StoreError("unique", `${c}.${field} must be unique`);
      }
    }
  }

  function isReferenced(c: CollectionName, id: string): boolean {
    for (const [other, def] of Object.entries(DEFS) as [CollectionName, CollectionDef][]) {
      for (const [field, target] of Object.entries(def.foreignKeys ?? {})) {
        if (target === c && Object.values(table(other)).some((r) => (r as Record<string, unknown>)[field] === id)) {
          return true;
        }
      }
    }
    return false;
  }

  return {
    now,
    nowIso,
    pepper: state.pepper,
    synthetic: state.synthetic,
    get(c, id) {
      return table(c)[id] ?? null;
    },
    require(c, id) {
      const row = table(c)[id];
      if (!row) {
        throw new StoreError("not-found", `${c} row not found`);
      }
      return row;
    },
    list(c, predicate) {
      const rows = Object.values(table(c));
      return predicate ? rows.filter(predicate) : rows;
    },
    insert(c, row) {
      const def = DEFS[c];
      const valid = must(def.schema, row) as Row<typeof c>;
      const id = (valid as { id: string }).id;
      // Insert-only rows (the audit trail) can be appended without loading
      // the table: their ids are random and the database enforces the key.
      if (def.insertOnly && !state.collections[c]) {
        checkConstraints(c, valid);
        const appends = (state.appends ??= {});
        ((appends[c] ??= {}) as Record<string, unknown>)[id] = valid;
        return valid;
      }
      if (table(c)[id]) {
        throw new StoreError("unique", `${c} id already exists`);
      }
      checkConstraints(c, valid);
      table(c)[id] = valid;
      return valid;
    },
    update(c, id, expectedVersion, patch) {
      const def = DEFS[c];
      if (def.insertOnly) {
        throw new StoreError("insert-only", `${c} is append-only`);
      }
      const current = table(c)[id];
      if (!current) {
        throw new StoreError("not-found", `${c} row not found`);
      }
      const currentVersion = (current as { version?: number }).version;
      if (def.versioned && currentVersion !== expectedVersion) {
        throw new StoreError("version-conflict", `${c} row changed since it was read`);
      }
      const next = { ...current, ...patch, id } as Row<typeof c>;
      if (def.versioned) {
        Object.assign(next, { version: (currentVersion ?? 0) + 1, updatedAt: nowIso });
      }
      const valid = must(def.schema, next) as Row<typeof c>;
      checkConstraints(c, valid);
      table(c)[id] = valid;
      return valid;
    },
    upsertCounter(row) {
      const valid = must(FunnelCountSchema, row);
      if (state.counterDeltas) {
        state.counterDeltas.push(valid);
        return;
      }
      const t = table("funnel");
      const existing = t[valid.id];
      t[valid.id] = must(FunnelCountSchema, existing ? { ...existing, count: existing.count + valid.count } : valid);
    },
    remove(c, id) {
      if (DEFS[c].insertOnly) {
        throw new StoreError("insert-only", `${c} is append-only`);
      }
      if (!table(c)[id]) {
        throw new StoreError("not-found", `${c} row not found`);
      }
      if (isReferenced(c, id)) {
        throw new StoreError("referenced", `${c} row is still referenced`);
      }
      delete table(c)[id];
    },
    settings() {
      return settings();
    },
    updateSettings(expectedVersion, patch) {
      const current = settings();
      if (current.version !== expectedVersion) {
        throw new StoreError("version-conflict", "settings changed since they were read");
      }
      state.settings = must(SettingsSchema, { ...current, ...patch, version: current.version + 1 });
      return state.settings;
    },
  };
}

function sortedAudit(state: OpsState) {
  return Object.values(state.collections.audit).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

// Serializes transactions; each runs on a deep copy that replaces the
// committed state only if the function returns without throwing.
abstract class SerializedStore implements OperationsStore {
  abstract readonly kind: "memory" | "local-file";
  private queue: Promise<unknown> = Promise.resolve();

  constructor(protected readonly clock: Clock) {}

  protected abstract load(): OpsState;
  protected abstract commit(state: OpsState): void;

  get synthetic(): boolean {
    return this.load().synthetic;
  }

  // Every operation runs alone, in submission order.
  protected exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  transaction<T>(fn: (tx: OpsTx) => T): Promise<T> {
    return this.exclusive(() => {
      const working = structuredClone(this.load());
      const result = fn(makeTx(working, this.clock()));
      if (result instanceof Promise) {
        throw new Error("transaction functions must be synchronous");
      }
      this.commit(working);
      return result;
    });
  }

  read<T>(fn: (tx: OpsTx) => T): Promise<T> {
    return this.exclusive(() => fn(makeTx(structuredClone(this.load()), this.clock())));
  }

  auditPage(offset: number, limit: number): Promise<AuditPage> {
    return this.exclusive(() => {
      const all = sortedAudit(this.load());
      return { events: structuredClone(all.slice(offset, offset + limit)), total: all.length };
    });
  }

  auditSince(sinceIso: string): Promise<AuditEvent[]> {
    return this.exclusive(() => structuredClone(sortedAudit(this.load()).filter((e) => e.at > sinceIso)));
  }
}

export class MemoryOperationsStore extends SerializedStore {
  readonly kind = "memory" as const;
  private state: OpsState;

  constructor(clock: Clock = () => new Date(), initial?: OpsState) {
    super(clock);
    this.state = initial ?? emptyState(clock());
  }

  protected load() {
    return this.state;
  }

  protected commit(state: OpsState) {
    this.state = state;
  }

  snapshot(): OpsState {
    return structuredClone(this.state);
  }
}

// 0.1 local stores (schemaVersion 1) held a free-text note on each
// submission and had no cases or worker runs. The note is dropped, not
// carried forward: 0.2 deliberately keeps no free text from the form.
export function upgradeLocalState(raw: Record<string, unknown>): OpsState {
  const state = raw as unknown as Omit<OpsState, "schemaVersion"> & { schemaVersion: number };
  if (state.schemaVersion === 1) {
    const submissions = (state.collections.submissions ?? {}) as Record<string, Record<string, unknown>>;
    for (const sub of Object.values(submissions)) {
      delete sub.note;
      sub.topics ??= [];
    }
    state.schemaVersion = 2;
  }
  for (const c of COLLECTIONS) {
    (state.collections as Record<string, unknown>)[c] ??= {};
  }
  return state as unknown as OpsState;
}

export class LocalFileOperationsStore extends SerializedStore {
  readonly kind = "local-file" as const;
  private cached: OpsState | null = null;

  constructor(
    readonly filePath: string,
    clock: Clock = () => new Date(),
  ) {
    super(clock);
  }

  protected load(): OpsState {
    if (this.cached) {
      return this.cached;
    }
    if (fs.existsSync(this.filePath)) {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Record<string, unknown>;
      if ((parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) || parsed.synthetic !== true) {
        throw new Error("local Flight Deck store has an unexpected format; refusing to load it");
      }
      this.cached = upgradeLocalState(parsed);
    } else {
      this.cached = emptyState(this.clock());
    }
    return this.cached;
  }

  // Write-then-rename, so a crash mid-write never leaves a torn file.
  protected commit(state: OpsState) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.cached = state;
  }

  // Replaces the whole store with a fresh synthetic state (the demo's
  // "reset to seed"). Serialized behind any running transaction.
  replace(state: OpsState): Promise<void> {
    if (!state.synthetic) {
      return Promise.reject(new Error("the local store holds synthetic data only"));
    }
    return this.exclusive(() => this.commit(structuredClone(state)));
  }
}
