// OperationsStore: the persistence contract for the Flight Deck operations
// domain, and its two development adapters.
//
//   MemoryOperationsStore   in-process only; tests.
//   LocalFileOperationsStore one JSON file on this machine; local demo.
//
// NEITHER IS PRODUCTION PERSISTENCE. They hold synthetic fixtures for one
// developer. A production adapter (a separately provisioned relational
// database; see docs/flight-deck/integrations.md) must implement the same
// contract: serializable transactions, optimistic version checks, the
// declared foreign keys and unique keys, an insert-only audit table, and
// schema validation on write. This store never reads from or writes to
// backend/ or any archival fixture store.
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
  OpsTaskSchema,
  OrganizationSchema,
  OutreachDraftSchema,
  ProspectSchema,
  SettingsSchema,
  SuppressionSchema,
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
  type OpsTask,
  type Organization,
  type OutreachDraft,
  type Prospect,
  type Settings,
  type Suppression,
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
  audit: AuditEvent;
  funnel: FunnelCount;
};
export type CollectionName = keyof CollectionMap;
type Row<C extends CollectionName> = CollectionMap[C];

type CollectionDef = {
  schema: Schema<unknown>;
  versioned: boolean;
  insertOnly?: boolean;
  // field -> referenced collection. Checked on every insert and update.
  foreignKeys?: Record<string, CollectionName>;
  unique?: string[];
};

const DEFS: Record<CollectionName, CollectionDef> = {
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
  audit: { schema: AuditEventSchema, versioned: false, insertOnly: true },
  funnel: { schema: FunnelCountSchema, versioned: false },
};

export const COLLECTIONS = Object.keys(DEFS) as CollectionName[];

export type OpsState = {
  schemaVersion: 1;
  // Every row in a development store is synthetic. A store whose flag is
  // false would be a production store, which 0.1 never constructs.
  synthetic: true;
  createdAt: string;
  pepper: string;
  settings: Settings;
  collections: { [C in CollectionName]: Record<string, Row<C>> };
};

export class StoreError extends Error {
  constructor(
    readonly code: "not-found" | "version-conflict" | "foreign-key" | "unique" | "insert-only" | "referenced",
    message: string,
  ) {
    super(message);
  }
}

export interface OpsTx {
  readonly now: Date;
  readonly nowIso: string;
  readonly pepper: string;
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

export interface OperationsStore {
  readonly kind: "memory" | "local-file";
  readonly synthetic: true;
  transaction<T>(fn: (tx: OpsTx) => T): Promise<T>;
  // A consistent snapshot read. Any write attempted inside is discarded.
  read<T>(fn: (tx: OpsTx) => T): Promise<T>;
}

export type Clock = () => Date;

export function emptyState(now: Date): OpsState {
  const collections = Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as OpsState["collections"];
  return {
    schemaVersion: 1,
    synthetic: true,
    createdAt: now.toISOString(),
    pepper: randomBytes(32).toString("hex"),
    settings: { ...DEFAULT_SETTINGS },
    collections,
  };
}

function makeTx(state: OpsState, now: Date): OpsTx {
  const nowIso = now.toISOString();
  const table = <C extends CollectionName>(c: C) => state.collections[c] as Record<string, Row<C>>;

  function checkConstraints<C extends CollectionName>(c: C, row: Row<C>) {
    const def = DEFS[c];
    for (const [field, target] of Object.entries(def.foreignKeys ?? {})) {
      const ref = (row as Record<string, unknown>)[field];
      if (ref !== null && ref !== undefined && !state.collections[target][ref as string]) {
        throw new StoreError("foreign-key", `${c}.${field} references a missing ${target} row`);
      }
    }
    for (const field of def.unique ?? []) {
      const value = (row as Record<string, unknown>)[field];
      if (value === null || value === undefined) {
        continue;
      }
      const clash = Object.values(table(c)).find((other) => (other as Record<string, unknown>).id !== (row as Record<string, unknown>).id && (other as Record<string, unknown>)[field] === value);
      if (clash) {
        throw new StoreError("unique", `${c}.${field} must be unique`);
      }
    }
  }

  function isReferenced(c: CollectionName, id: string): boolean {
    for (const [other, def] of Object.entries(DEFS) as [CollectionName, CollectionDef][]) {
      for (const [field, target] of Object.entries(def.foreignKeys ?? {})) {
        if (target === c && Object.values(state.collections[other]).some((r) => (r as Record<string, unknown>)[field] === id)) {
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
      const existing = state.collections.funnel[row.id];
      const merged = existing ? { ...existing, count: existing.count + row.count } : row;
      state.collections.funnel[row.id] = must(FunnelCountSchema, merged);
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
      return state.settings;
    },
    updateSettings(expectedVersion, patch) {
      if (state.settings.version !== expectedVersion) {
        throw new StoreError("version-conflict", "settings changed since they were read");
      }
      state.settings = must(SettingsSchema, { ...state.settings, ...patch, version: state.settings.version + 1 });
      return state.settings;
    },
  };
}

// Serializes transactions; each runs on a deep copy that replaces the
// committed state only if the function returns without throwing.
abstract class SerializedStore implements OperationsStore {
  abstract readonly kind: "memory" | "local-file";
  readonly synthetic = true as const;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(protected readonly clock: Clock) {}

  protected abstract load(): OpsState;
  protected abstract commit(state: OpsState): void;

  // Every operation runs alone, in submission order.
  protected exclusive<T>(fn: () => T): Promise<T> {
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
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as OpsState;
      if (parsed.schemaVersion !== 1 || parsed.synthetic !== true) {
        throw new Error("local Flight Deck store has an unexpected format; refusing to load it");
      }
      for (const c of COLLECTIONS) {
        parsed.collections[c] ??= {};
      }
      this.cached = parsed;
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
    return this.exclusive(() => this.commit(structuredClone(state)));
  }
}
