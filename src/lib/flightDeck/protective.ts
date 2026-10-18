// Protective events: the durable, external record of decisions that must
// survive a database restore.
//
// Which decisions: opt-outs (suppression added), suppression lifts,
// erasures, operator deactivations and role changes, and launch-gate
// approvals. Each is written to an append-only log OUTSIDE the database,
// inside the database transaction and BEFORE it commits (store.ts,
// postgres/store.ts). If the log write fails, the transaction is rolled
// back and the action is reported as not done. If the commit fails after
// the log write, the log holds an event the database lacks; the recovery
// gate (recovery.ts) detects that and replays it before anyone can be
// contacted.
//
// The log is a hash chain: event n carries the hash of event n-1, so a
// missing, altered, reordered, or inserted event is detected. Objects are
// created with "if none match" and never overwritten; in production the
// bucket adds versioning and Object Lock (deploy/flight-deck).
//
// Data minimization: events carry opaque ids, keyed email hashes, codes,
// and timestamps. Never a name, an address, a note, or a message body.
import { canonicalJson, sha256 } from "./ids";
import { bool, isoInstant, must, obj, oneOf, opaqueId, str, type Infer } from "./schema";

export const GENESIS_HASH = "0".repeat(64);

const actorId = str({ max: 64, pattern: /^(usr_[A-Za-z0-9]{6,48}|system)$/ });
const hex64 = str({ max: 64, pattern: /^[a-f0-9]{64}$/ });

const SuppressionAdded = obj({ kind: oneOf(["suppression-added"] as const), id: opaqueId("pev"), at: isoInstant, actorId, synthetic: bool, suppressionId: opaqueId("sup"), emailKey: hex64, scope: oneOf(["all", "outreach", "newsletter"] as const), basis: oneOf(["unsubscribe", "withdrawal", "founder-hold", "bounce", "complaint"] as const), effectiveAt: isoInstant });
const SuppressionLifted = obj({ kind: oneOf(["suppression-lifted"] as const), id: opaqueId("pev"), at: isoInstant, actorId, synthetic: bool, suppressionId: opaqueId("sup"), liftedAt: isoInstant });
const Erasure = obj({ kind: oneOf(["erasure"] as const), id: opaqueId("pev"), at: isoInstant, actorId, synthetic: bool, erasureId: opaqueId("ers"), prospectId: opaqueId("prs"), erasedAt: isoInstant });
const OperatorDeactivated = obj({ kind: oneOf(["operator-deactivated"] as const), id: opaqueId("pev"), at: isoInstant, actorId, synthetic: bool, operatorId: opaqueId("usr") });
const OperatorRoleChanged = obj({ kind: oneOf(["operator-role-changed"] as const), id: opaqueId("pev"), at: isoInstant, actorId, synthetic: bool, operatorId: opaqueId("usr"), role: oneOf(["founder", "operator", "reviewer"] as const) });
const GateRecorded = obj({
  kind: oneOf(["gate-recorded"] as const),
  id: opaqueId("pev"),
  at: isoInstant,
  actorId,
  synthetic: bool,
  gate: oneOf(["console", "public-form"] as const),
  // The signed approval record (gates.ts), carried whole so a restore can
  // re-establish it. Contains opaque ids and a provider subject, no names.
  record: str({ min: 2, max: 4000 }),
});

export type ProtectiveBody =
  | Infer<typeof SuppressionAdded>
  | Infer<typeof SuppressionLifted>
  | Infer<typeof Erasure>
  | Infer<typeof OperatorDeactivated>
  | Infer<typeof OperatorRoleChanged>
  | Infer<typeof GateRecorded>;

const BODY_SCHEMAS = {
  "suppression-added": SuppressionAdded,
  "suppression-lifted": SuppressionLifted,
  erasure: Erasure,
  "operator-deactivated": OperatorDeactivated,
  "operator-role-changed": OperatorRoleChanged,
  "gate-recorded": GateRecorded,
} as const;

// Protection-increasing kinds replay automatically after a restore. A lift
// reduces protection, so it replays only when a founder confirms it.
export const AUTO_REPLAY: readonly ProtectiveBody["kind"][] = ["suppression-added", "erasure", "operator-deactivated", "operator-role-changed", "gate-recorded"];

export function validateBody(body: unknown): ProtectiveBody {
  const kind = (body as { kind?: unknown })?.kind;
  const schema = BODY_SCHEMAS[kind as keyof typeof BODY_SCHEMAS];
  if (!schema) {
    throw new JournalIntegrityError("unknown-kind", 0);
  }
  return must(schema as never, body) as ProtectiveBody;
}

export type ProtectiveEvent = { v: 1; seq: number; prevHash: string; hash: string; body: ProtectiveBody };
export type JournalHead = { seq: number; hash: string };
export const EMPTY_HEAD: JournalHead = { seq: 0, hash: GENESIS_HASH };

export function eventHash(v: 1, seq: number, prevHash: string, body: ProtectiveBody): string {
  return sha256(canonicalJson({ v, seq, prevHash, body }));
}

export function chainEvents(head: JournalHead, bodies: ProtectiveBody[]): ProtectiveEvent[] {
  const out: ProtectiveEvent[] = [];
  let prev = head;
  for (const b of bodies) {
    const body = validateBody(b);
    const seq = prev.seq + 1;
    const hash = eventHash(1, seq, prev.hash, body);
    out.push({ v: 1, seq, prevHash: prev.hash, hash, body });
    prev = { seq, hash };
  }
  return out;
}

export class JournalIntegrityError extends Error {
  constructor(
    readonly code: "gap" | "out-of-order" | "hash-mismatch" | "chain-break" | "unknown-kind" | "malformed" | "head-mismatch" | "head-missing",
    readonly seq: number,
  ) {
    super(`protective log integrity failure: ${code} at ${seq}`);
  }
}

// Verifies events that continue from `from`: contiguous sequence numbers,
// each linked to the previous hash, each hash recomputed from its content.
export function verifyChain(from: JournalHead, events: ProtectiveEvent[]): JournalHead {
  let prev = from;
  for (const e of events) {
    if (typeof e !== "object" || e === null || e.v !== 1 || typeof e.seq !== "number") {
      throw new JournalIntegrityError("malformed", prev.seq + 1);
    }
    if (e.seq !== prev.seq + 1) {
      throw new JournalIntegrityError(e.seq > prev.seq + 1 ? "gap" : "out-of-order", e.seq);
    }
    if (e.prevHash !== prev.hash) {
      throw new JournalIntegrityError("chain-break", e.seq);
    }
    let body: ProtectiveBody;
    try {
      body = validateBody(e.body);
    } catch (err) {
      throw err instanceof JournalIntegrityError ? new JournalIntegrityError(err.code, e.seq) : new JournalIntegrityError("malformed", e.seq);
    }
    if (eventHash(1, e.seq, e.prevHash, body) !== e.hash) {
      throw new JournalIntegrityError("hash-mismatch", e.seq);
    }
    prev = { seq: e.seq, hash: e.hash };
  }
  return prev;
}

// ---------- Sinks ----------

export class SinkConflict extends Error {
  constructor(readonly seq: number) {
    super(`protective log already has an event at ${seq}`);
  }
}
export class SinkUnavailable extends Error {
  readonly code = "protective-log-unavailable";
  constructor(message = "protective log unavailable") {
    super(message);
  }
}

export interface ProtectiveSink {
  readonly label: string;
  // Creates the object for event.seq; never overwrites. SinkConflict if
  // one exists, SinkUnavailable on any other failure.
  append(event: ProtectiveEvent): Promise<void>;
  read(seq: number): Promise<ProtectiveEvent | null>;
  // Events with seq > after, ascending, at most `limit`.
  listAfter(after: number, limit: number): Promise<ProtectiveEvent[]>;
  writeCheckpoint?(name: string, body: string): Promise<void>;
}

export const eventKey = (seq: number) => `events/${String(seq).padStart(12, "0")}.json`;

export class MemoryProtectiveSink implements ProtectiveSink {
  readonly label = "memory";
  readonly objects = new Map<number, string>();
  // Test hook: called before each append; throw to simulate failures.
  beforeAppend?: (e: ProtectiveEvent) => void;

  async append(e: ProtectiveEvent) {
    this.beforeAppend?.(e);
    if (this.objects.has(e.seq)) {
      throw new SinkConflict(e.seq);
    }
    this.objects.set(e.seq, JSON.stringify(e));
  }
  async read(seq: number) {
    const s = this.objects.get(seq);
    return s ? (JSON.parse(s) as ProtectiveEvent) : null;
  }
  async listAfter(after: number, limit: number) {
    return [...this.objects.keys()]
      .filter((k) => k > after)
      .sort((a, b) => a - b)
      .slice(0, limit)
      .map((k) => JSON.parse(this.objects.get(k)!) as ProtectiveEvent);
  }
}

// Local demo and drills: one file per event, created exclusively ("wx"),
// then made read-only.
export class LocalFileProtectiveSink implements ProtectiveSink {
  readonly label: string;
  constructor(private readonly dir: string) {
    this.label = `local files (${dir.split(/[\\/]/).slice(-2).join("/")})`;
  }
  private async fs() {
    return import("node:fs");
  }
  private path(key: string) {
    return `${this.dir}/${key}`;
  }
  async append(e: ProtectiveEvent) {
    const fs = await this.fs();
    try {
      fs.mkdirSync(`${this.dir}/events`, { recursive: true });
      fs.writeFileSync(this.path(eventKey(e.seq)), JSON.stringify(e), { flag: "wx", mode: 0o444 });
    } catch (err) {
      if ((err as { code?: string }).code === "EEXIST") {
        throw new SinkConflict(e.seq);
      }
      throw new SinkUnavailable();
    }
  }
  async read(seq: number) {
    const fs = await this.fs();
    const p = this.path(eventKey(seq));
    return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as ProtectiveEvent) : null;
  }
  async listAfter(after: number, limit: number) {
    const fs = await this.fs();
    const dir = `${this.dir}/events`;
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{12}\.json$/.test(f))
      .map((f) => Number(f.slice(0, 12)))
      .filter((n) => n > after)
      .sort((a, b) => a - b)
      .slice(0, limit)
      .map((n) => JSON.parse(fs.readFileSync(this.path(eventKey(n)), "utf8")) as ProtectiveEvent);
  }
  async writeCheckpoint(name: string, body: string) {
    const fs = await this.fs();
    fs.mkdirSync(`${this.dir}/checkpoints`, { recursive: true });
    fs.writeFileSync(`${this.dir}/checkpoints/${name}`, body, { mode: 0o600 });
  }
}

// Appends events in order; translates unexpected errors into
// SinkUnavailable so callers never mistake a failure for success.
export async function appendAll(sink: ProtectiveSink, events: ProtectiveEvent[]) {
  for (const e of events) {
    try {
      await sink.append(e);
    } catch (err) {
      if (err instanceof SinkConflict || err instanceof SinkUnavailable) {
        throw err;
      }
      throw new SinkUnavailable();
    }
  }
}

