// Flight Deck operations schema, as ordered, checksummed migrations.
//
// This schema belongs to the operations domain only. It must live in its
// own database (or at least its own schema and role), separate from any
// archival system; nothing here references or is referenced by the
// synthetic preservation backend.
//
// Each operational record is stored as a validated JSON document with its
// version, plus real columns for every foreign key and unique key the
// domain declares (store.ts DEFS), so the database enforces them too.
// Foreign keys are DEFERRABLE INITIALLY DEFERRED: a transaction's writes
// are checked at commit, in any order.
//
// Applied migrations are recorded with a checksum; a changed migration is
// refused rather than silently re-run. Never edit a migration after it has
// been applied anywhere; add a new one.
import { createHash } from "node:crypto";

export type Migration = { id: string; sql: string };

const doc = (table: string, extra = "") => `create table ${table} (
  id text primary key,
  version integer not null check (version >= 1),
  doc jsonb not null${extra ? `,\n  ${extra}` : ""}
);`;

const fk = (table: string, column: string, target: string) =>
  `alter table ${table} add constraint ${table}_${column}_fk foreign key (${column}) references ${target}(id) deferrable initially deferred;`;

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_operations_core",
    sql: [
      doc("fd_organizations"),
      doc("fd_prospects", "email_key text unique,\n  organization_id text"),
      doc("fd_submissions", "prospect_id text not null"),
      doc("fd_permissions", "prospect_id text not null"),
      doc("fd_affiliations", "prospect_id text not null,\n  organization_id text not null"),
      doc("fd_outreach", "prospect_id text not null,\n  campaign_id text,\n  permission_id text,\n  follow_up_of text"),
      doc("fd_interactions", "prospect_id text not null,\n  outreach_draft_id text"),
      doc("fd_tasks", "prospect_id text,\n  dedupe_key text unique"),
      doc("fd_campaigns"),
      doc("fd_content", "campaign_id text"),
      doc("fd_approvals"),
      doc("fd_jobs", "approval_id text,\n  idempotency_key text not null unique"),
      doc("fd_receipts", "job_id text"),
      doc("fd_suppressions", "email_key text not null"),
      doc("fd_cases", "prospect_id text"),
      doc("fd_erasures"),
      doc("fd_worker_runs"),
      fk("fd_prospects", "organization_id", "fd_organizations"),
      fk("fd_submissions", "prospect_id", "fd_prospects"),
      fk("fd_permissions", "prospect_id", "fd_prospects"),
      fk("fd_affiliations", "prospect_id", "fd_prospects"),
      fk("fd_affiliations", "organization_id", "fd_organizations"),
      fk("fd_outreach", "prospect_id", "fd_prospects"),
      fk("fd_outreach", "campaign_id", "fd_campaigns"),
      fk("fd_outreach", "permission_id", "fd_permissions"),
      fk("fd_outreach", "follow_up_of", "fd_outreach"),
      fk("fd_interactions", "prospect_id", "fd_prospects"),
      fk("fd_interactions", "outreach_draft_id", "fd_outreach"),
      fk("fd_tasks", "prospect_id", "fd_prospects"),
      fk("fd_content", "campaign_id", "fd_campaigns"),
      fk("fd_jobs", "approval_id", "fd_approvals"),
      fk("fd_receipts", "job_id", "fd_jobs"),
      fk("fd_cases", "prospect_id", "fd_prospects"),
      "create index fd_suppressions_email_key_idx on fd_suppressions (email_key);",
      // The audit trail: insert-only, enforced by the database itself.
      `create table fd_audit (
  id text primary key,
  at timestamptz not null,
  doc jsonb not null
);`,
      "create index fd_audit_at_idx on fd_audit (at desc, id desc);",
      `create function fd_audit_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'fd_audit is append-only' using errcode = 'insufficient_privilege';
end
$$;`,
      "create trigger fd_audit_no_update_delete before update or delete on fd_audit for each row execute function fd_audit_is_append_only();",
      "create trigger fd_audit_no_truncate before truncate on fd_audit for each statement execute function fd_audit_is_append_only();",
      // Aggregate counters, incremented atomically.
      `create table fd_funnel (
  id text primary key,
  count integer not null check (count >= 0),
  doc jsonb not null
);`,
      `create table fd_settings (
  id smallint primary key check (id = 1),
  version integer not null,
  doc jsonb not null
);`,
      // Frozen literal (a migration must never change once applied); a test
      // checks it still equals DEFAULT_SETTINGS.
      `insert into fd_settings (id, version, doc) values (1, 1, '{"allOutboundPaused":false,"pausedAt":null,"pausedBy":null,"lastReviewAt":null,"followUpDelayDays":10,"maxFollowUps":1,"approvalValidityDays":14,"version":1}'::jsonb);`,
      // Store identity: whether this database holds synthetic or real data.
      // Written once (initializeDatabase) and checked on every open.
      `create table fd_meta (
  key text primary key,
  value jsonb not null
);`,
    ].join("\n\n"),
  },
  {
    id: "0002_rate_limits",
    sql: `create table fd_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null,
  primary key (key, window_start)
);
create index fd_rate_limits_window_idx on fd_rate_limits (window_start);`,
  },
  {
    id: "0003_identity_and_activation",
    sql: `create table fd_operators (
  id text primary key,
  cognito_sub text unique,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('founder', 'operator', 'reviewer')),
  active boolean not null default true,
  created_at timestamptz not null,
  deactivated_at timestamptz,
  version integer not null default 1
);

-- Server-side sessions. Only a hash of the session token is stored; the
-- token itself exists only in the operator's HttpOnly cookie.
create table fd_sessions (
  id_hash text primary key,
  operator_id text not null references fd_operators(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null,
  revoked_at timestamptz
);
create index fd_sessions_operator_idx on fd_sessions (operator_id);

-- Launch gates recorded by the founder. Production features check these;
-- an environment variable alone never opens anything.
create table fd_activation_gates (
  gate text primary key,
  approved_by text not null,
  approved_at timestamptz not null,
  detail jsonb not null
);`,
  },
  {
    id: "0004_protective_log_and_recovery",
    sql: `-- The last protective event (src/lib/flightDeck/protective.ts) this
-- database includes. Locked FOR UPDATE while an event is appended, so
-- concurrent writers get contiguous sequence numbers.
create table fd_protective_head (
  id smallint primary key check (id = 1),
  seq integer not null check (seq >= 0),
  hash text not null check (hash ~ '^[a-f0-9]{64}$')
);
insert into fd_protective_head (id, seq, hash) values (1, 0, '0000000000000000000000000000000000000000000000000000000000000000');

-- When the operator last proved their identity to the identity provider
-- (the ID token auth_time). Launch-gate approvals require it to be recent.
alter table fd_sessions add column auth_time timestamptz;`,
  },
];

export function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export type SqlRunner = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };

export type MigrationResult = { applied: string[]; alreadyApplied: string[] };

// Applies pending migrations in one transaction under an advisory lock, so
// two deploys cannot race. Refuses if an applied migration has changed.
export async function migrate(client: SqlRunner, migrations: Migration[] = MIGRATIONS): Promise<MigrationResult> {
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('flight-deck-migrations'))");
    await client.query(`create table if not exists fd_schema_migrations (
  id text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)`);
    const { rows } = await client.query("select id, checksum from fd_schema_migrations");
    const applied = new Map(rows.map((r) => [String(r.id), String(r.checksum)]));
    const result: MigrationResult = { applied: [], alreadyApplied: [] };
    for (const m of migrations) {
      const sum = checksum(m.sql);
      const prior = applied.get(m.id);
      if (prior) {
        if (prior !== sum) {
          throw new Error(`migration ${m.id} has changed since it was applied; refusing to continue`);
        }
        result.alreadyApplied.push(m.id);
        continue;
      }
      await client.query(m.sql);
      await client.query("insert into fd_schema_migrations (id, checksum) values ($1, $2)", [m.id, sum]);
      result.applied.push(m.id);
    }
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  }
}

// Marks a freshly migrated database as holding synthetic or real data.
// Once set it cannot be changed through Flight Deck.
export async function initializeDatabase(client: SqlRunner, opts: { synthetic: boolean }) {
  const { rows } = await client.query("select value from fd_meta where key = 'synthetic'");
  if (rows.length) {
    if (rows[0].value !== opts.synthetic) {
      throw new Error(`this database is marked synthetic=${String(rows[0].value)}; refusing to mark it synthetic=${opts.synthetic}`);
    }
    return;
  }
  await client.query("insert into fd_meta (key, value) values ('synthetic', $1::jsonb)", [JSON.stringify(opts.synthetic)]);
}
