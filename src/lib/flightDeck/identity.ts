// Named operators, server-side sessions, and recorded launch gates.
//
// Identity is separate from the operations data: a person proves who they
// are to the identity provider (Cognito, oidc.ts), and Flight Deck then
// decides what they may do from its own operator table. Being in the user
// pool is not enough; an operator must be named here and active.
//
// Sessions are server-side: the browser holds a random token in an
// HttpOnly cookie and the store keeps only its SHA-256 hash, so a database
// leak does not leak live sessions. Every request re-reads the session and
// the operator, so deactivating an operator or revoking a session takes
// effect on their very next request.
//
// 0.2.1: deactivations, role changes, and gate approvals are protective
// events (protective.ts). The Postgres store writes each to the external
// log inside its transaction, before committing, so a database restore
// cannot quietly re-activate an operator or drop an approval: the recovery
// gate replays them (recovery.ts).
import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { Actor } from "./access";
import { newId } from "./ids";
import type { ProtectiveBody, ProtectiveSink } from "./protective";
import { appendWithinTransaction } from "./postgres/journal";
import type { Role } from "./types";

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 60 * 60 * 1000;

export type Operator = {
  id: string;
  cognitoSub: string | null;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  deactivatedAt: string | null;
};

export const GATES = ["console", "public-form"] as const;
export type Gate = (typeof GATES)[number];
// detail.record holds the signed approval (gates.ts).
export type GateRecord = { gate: Gate; approvedBy: string; approvedAt: string; detail: Record<string, unknown> };

// A signed-in operator, plus when they last proved their identity to the
// identity provider (launch-gate approvals require that to be recent).
export type SessionActor = Extract<Actor, { role: Role }> & { authTime: string | null; providerSubject: string | null };

export interface IdentityStore {
  findOperatorBySub(sub: string): Promise<Operator | null>;
  findOperatorByEmail(email: string): Promise<Operator | null>;
  findOperator(id: string): Promise<Operator | null>;
  bindSub(operatorId: string, sub: string): Promise<void>;
  listOperators(): Promise<Operator[]>;
  addOperator(input: { email: string; displayName: string; role: Role }, now: Date): Promise<Operator>;
  // Protective: journaled before commit where a log is configured.
  deactivateOperator(id: string, now: Date, actorId?: string): Promise<void>;
  // Takes effect on the operator's next request (sessions re-read it).
  setRole(id: string, role: Role, actorId?: string): Promise<void>;
  createSession(operatorId: string, now: Date, authTime?: Date | null): Promise<string>;
  // The actor for a session token, or null if unknown, expired, idle too
  // long, revoked, or its operator is inactive.
  resolveSession(token: string, now: Date): Promise<SessionActor | null>;
  revokeSession(token: string, now: Date): Promise<void>;
  revokeAllSessions(operatorId: string, now: Date): Promise<number>;
  // Every operator's sessions: after a recovery, so a session signed out
  // after the restored backup cannot come back.
  revokeEverySession(now: Date): Promise<number>;
  gates(): Promise<GateRecord[]>;
  recordGate(gate: Gate, operatorId: string, record: string, now: Date): Promise<void>;
  // Recovery only: re-apply an identity event already in the log, without
  // writing it again. Only access-REDUCING events are ever passed here: a
  // deactivation, or a role change to a role whose capabilities are a subset
  // of the current one (recovery.ts decides). A role change applies only if
  // the operator still holds `fromRole` (compare-and-set), so a re-run after
  // an interruption, or a concurrent change, is a no-op. Gate approvals are
  // never replayed. Idempotent.
  replay(body: Extract<ProtectiveBody, { kind: "operator-deactivated" | "operator-role-changed" }>, now: Date, fromRole?: Role): Promise<void>;
}

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

function toActor(op: Operator, authTime: string | null): SessionActor {
  return { id: op.id, role: op.role, displayName: op.displayName, authTime, providerSubject: op.cognitoSub };
}

export class SignInRefused extends Error {
  constructor(readonly code: "not-an-operator" | "operator-inactive" | "subject-mismatch") {
    super(code);
  }
}

// After the identity provider has proven who someone is: are they a named,
// active Flight Deck operator? The first sign-in binds their provider
// subject to the operator record (matched by verified email); afterwards a
// different subject for the same email is refused, so re-creating a
// Cognito user cannot take over an operator.
export async function signInOperator(identity: IdentityStore, claims: { sub: string; email: string; authTime?: number | null }, now: Date): Promise<{ token: string; operator: Operator }> {
  let op = await identity.findOperatorBySub(claims.sub);
  if (!op) {
    const byEmail = await identity.findOperatorByEmail(claims.email);
    if (!byEmail) {
      throw new SignInRefused("not-an-operator");
    }
    if (byEmail.cognitoSub && byEmail.cognitoSub !== claims.sub) {
      throw new SignInRefused("subject-mismatch");
    }
    await identity.bindSub(byEmail.id, claims.sub);
    op = (await identity.findOperatorBySub(claims.sub)) ?? null;
    if (!op) {
      throw new SignInRefused("subject-mismatch");
    }
  }
  if (!op.active) {
    throw new SignInRefused("operator-inactive");
  }
  const authTime = typeof claims.authTime === "number" ? new Date(claims.authTime * 1000) : null;
  return { token: await identity.createSession(op.id, now, authTime), operator: op };
}

const pev = () => newId("pev");

// ---------- In-memory (tests) ----------

type MemSession = { operatorId: string; createdAt: number; expiresAt: number; lastSeenAt: number; revokedAt: number | null; authTime: number | null };

export class MemoryIdentityStore implements IdentityStore {
  private operators = new Map<string, Operator>();
  private sessions = new Map<string, MemSession>();
  private gateRecords = new Map<Gate, GateRecord>();

  async findOperatorBySub(sub: string) {
    return [...this.operators.values()].find((o) => o.cognitoSub === sub) ?? null;
  }
  async findOperatorByEmail(email: string) {
    return [...this.operators.values()].find((o) => o.email === email.toLowerCase()) ?? null;
  }
  async findOperator(id: string) {
    const op = this.operators.get(id);
    return op ? { ...op } : null;
  }
  async bindSub(operatorId: string, sub: string) {
    const op = this.operators.get(operatorId);
    if (op && !op.cognitoSub) {
      op.cognitoSub = sub;
    }
  }
  async listOperators() {
    return [...this.operators.values()].map((o) => ({ ...o }));
  }
  async addOperator(input: { email: string; displayName: string; role: Role }, now: Date) {
    const op: Operator = { id: newId("usr"), cognitoSub: null, email: input.email.toLowerCase(), displayName: input.displayName, role: input.role, active: true, createdAt: now.toISOString(), deactivatedAt: null };
    this.operators.set(op.id, op);
    return { ...op };
  }
  async deactivateOperator(id: string, now: Date) {
    const op = this.operators.get(id);
    if (op) {
      op.active = false;
      op.deactivatedAt ??= now.toISOString();
      await this.revokeAllSessions(id, now);
    }
  }
  async setRole(id: string, role: Role) {
    const op = this.operators.get(id);
    if (op) {
      op.role = role;
    }
  }
  async createSession(operatorId: string, now: Date, authTime: Date | null = null) {
    const token = newToken();
    const t = now.getTime();
    this.sessions.set(hashToken(token), { operatorId, createdAt: t, expiresAt: t + SESSION_ABSOLUTE_MS, lastSeenAt: t, revokedAt: null, authTime: authTime?.getTime() ?? null });
    return token;
  }
  async resolveSession(token: string, now: Date) {
    const s = this.sessions.get(hashToken(token));
    const t = now.getTime();
    if (!s || s.revokedAt !== null || s.expiresAt <= t || t - s.lastSeenAt > SESSION_IDLE_MS) {
      return null;
    }
    const op = this.operators.get(s.operatorId);
    if (!op || !op.active) {
      return null;
    }
    s.lastSeenAt = t;
    return toActor(op, s.authTime ? new Date(s.authTime).toISOString() : null);
  }
  async revokeSession(token: string, now: Date) {
    const s = this.sessions.get(hashToken(token));
    if (s && s.revokedAt === null) {
      s.revokedAt = now.getTime();
    }
  }
  async revokeAllSessions(operatorId: string, now: Date) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.operatorId === operatorId && s.revokedAt === null) {
        s.revokedAt = now.getTime();
        n++;
      }
    }
    return n;
  }
  async gates() {
    return [...this.gateRecords.values()];
  }
  async recordGate(gate: Gate, operatorId: string, record: string, now: Date) {
    this.gateRecords.set(gate, { gate, approvedBy: operatorId, approvedAt: now.toISOString(), detail: { record } });
  }
  async replay(body: Extract<ProtectiveBody, { kind: "operator-deactivated" | "operator-role-changed" }>, now: Date, fromRole?: Role) {
    if (body.kind === "operator-deactivated") {
      await this.deactivateOperator(body.operatorId, now);
    } else {
      const op = this.operators.get(body.operatorId);
      if (op && fromRole && op.role === fromRole) {
        op.role = body.role;
      }
    }
  }
  async revokeEverySession(now: Date) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.revokedAt === null) {
        s.revokedAt = now.getTime();
        n++;
      }
    }
    return n;
  }
}

// ---------- Postgres ----------

type OperatorRow = { id: string; cognito_sub: string | null; email: string; display_name: string; role: Role; active: boolean; created_at: Date; deactivated_at: Date | null };

const fromRow = (r: OperatorRow): Operator => ({
  id: r.id,
  cognitoSub: r.cognito_sub,
  email: r.email,
  displayName: r.display_name,
  role: r.role,
  active: r.active,
  createdAt: new Date(r.created_at).toISOString(),
  deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at).toISOString() : null,
});

export type PostgresIdentityOptions = {
  sink?: ProtectiveSink | null;
  requireJournal?: boolean;
  synthetic?: boolean;
  // Test hook: runs after the log write and the change, just before COMMIT
  // (throw to simulate a crash between the two).
  afterLog?: () => Promise<void>;
};

export class PostgresIdentityStore implements IdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly opts: PostgresIdentityOptions = {},
  ) {}

  // Runs fn in a transaction after appending the protective event, so the
  // event is in the external log before the change commits. A log failure
  // rolls everything back.
  private async journaled(body: ProtectiveBody, fn: (q: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<void>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await appendWithinTransaction(client, this.opts.sink ?? null, this.opts.requireJournal ?? false, [body]);
      await fn((text, params) => client.query(text, params));
      await this.opts.afterLog?.();
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  private base(actorId: string | undefined, now: Date) {
    return { id: pev(), at: now.toISOString(), actorId: actorId && /^usr_/.test(actorId) ? actorId : "system", synthetic: this.opts.synthetic ?? false };
  }

  async findOperatorBySub(sub: string) {
    const { rows } = await this.pool.query<OperatorRow>("select * from fd_operators where cognito_sub = $1", [sub]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async findOperatorByEmail(email: string) {
    const { rows } = await this.pool.query<OperatorRow>("select * from fd_operators where email = $1", [email.toLowerCase()]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async findOperator(id: string) {
    const { rows } = await this.pool.query<OperatorRow>("select * from fd_operators where id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async bindSub(operatorId: string, sub: string) {
    // Binds only once: a later login with a different subject for the same
    // email is refused by the caller, not silently rebound.
    await this.pool.query("update fd_operators set cognito_sub = $2, version = version + 1 where id = $1 and cognito_sub is null", [operatorId, sub]);
  }
  async listOperators() {
    const { rows } = await this.pool.query<OperatorRow>("select * from fd_operators order by created_at");
    return rows.map(fromRow);
  }
  async addOperator(input: { email: string; displayName: string; role: Role }, now: Date) {
    const { rows } = await this.pool.query<OperatorRow>(
      "insert into fd_operators (id, email, display_name, role, active, created_at) values ($1, $2, $3, $4, true, $5) returning *",
      [newId("usr"), input.email.toLowerCase(), input.displayName, input.role, now],
    );
    return fromRow(rows[0]);
  }
  async deactivateOperator(id: string, now: Date, actorId?: string) {
    await this.journaled({ kind: "operator-deactivated", ...this.base(actorId, now), operatorId: id }, async (q) => {
      await q("update fd_operators set active = false, deactivated_at = coalesce(deactivated_at, $2), version = version + 1 where id = $1", [id, now]);
      await q("update fd_sessions set revoked_at = $2 where operator_id = $1 and revoked_at is null", [id, now]);
    });
  }
  async setRole(id: string, role: Role, actorId?: string) {
    await this.journaled({ kind: "operator-role-changed", ...this.base(actorId, now()), operatorId: id, role }, async (q) => {
      await q("update fd_operators set role = $2, version = version + 1 where id = $1", [id, role]);
    });
  }
  async createSession(operatorId: string, now: Date, authTime: Date | null = null) {
    const token = newToken();
    await this.pool.query("insert into fd_sessions (id_hash, operator_id, created_at, expires_at, last_seen_at, auth_time) values ($1, $2, $3, $4, $3, $5)", [
      hashToken(token),
      operatorId,
      now,
      new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      authTime,
    ]);
    return token;
  }
  async resolveSession(token: string, now: Date) {
    // One statement: the session must be live, the operator active, and
    // the idle window not exceeded; touching last_seen extends it.
    const { rows } = await this.pool.query<OperatorRow & { auth_time: Date | null }>(
      `with s as (
         update fd_sessions set last_seen_at = $2
         where id_hash = $1 and revoked_at is null and expires_at > $2 and last_seen_at > $3
         returning operator_id, auth_time
       )
       select o.*, s.auth_time from fd_operators o join s on s.operator_id = o.id where o.active`,
      [hashToken(token), now, new Date(now.getTime() - SESSION_IDLE_MS)],
    );
    return rows[0] ? toActor(fromRow(rows[0]), rows[0].auth_time ? new Date(rows[0].auth_time).toISOString() : null) : null;
  }
  async revokeSession(token: string, now: Date) {
    await this.pool.query("update fd_sessions set revoked_at = $2 where id_hash = $1 and revoked_at is null", [hashToken(token), now]);
  }
  async revokeAllSessions(operatorId: string, now: Date) {
    const res = await this.pool.query("update fd_sessions set revoked_at = $2 where operator_id = $1 and revoked_at is null", [operatorId, now]);
    return res.rowCount ?? 0;
  }
  async gates() {
    const { rows } = await this.pool.query("select gate, approved_by, approved_at, detail from fd_activation_gates");
    return rows.map((r) => ({ gate: r.gate as Gate, approvedBy: r.approved_by as string, approvedAt: new Date(r.approved_at as Date).toISOString(), detail: r.detail as Record<string, unknown> }));
  }
  async recordGate(gate: Gate, operatorId: string, record: string, now: Date) {
    await this.journaled({ kind: "gate-recorded", ...this.base(operatorId, now), gate, record }, async (q) => {
      await q(
        `insert into fd_activation_gates (gate, approved_by, approved_at, detail) values ($1, $2, $3, $4)
         on conflict (gate) do update set approved_by = excluded.approved_by, approved_at = excluded.approved_at, detail = excluded.detail`,
        [gate, operatorId, now, { record }],
      );
    });
  }
  async replay(body: Extract<ProtectiveBody, { kind: "operator-deactivated" | "operator-role-changed" }>, now: Date, fromRole?: Role) {
    if (body.kind === "operator-deactivated") {
      // One statement-pair transaction; both halves are idempotent.
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("update fd_operators set active = false, deactivated_at = coalesce(deactivated_at, $2), version = version + 1 where id = $1 and active", [body.operatorId, now]);
        await client.query("update fd_sessions set revoked_at = $2 where operator_id = $1 and revoked_at is null", [body.operatorId, now]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    } else if (fromRole) {
      await this.pool.query("update fd_operators set role = $2, version = version + 1 where id = $1 and role = $3 and role <> $2", [body.operatorId, body.role, fromRole]);
    }
  }
  async revokeEverySession(now: Date) {
    const res = await this.pool.query("update fd_sessions set revoked_at = $1 where revoked_at is null", [now]);
    return res.rowCount ?? 0;
  }
}

const now = () => new Date();
