// Administrative operations on a Flight Deck database. Not reachable from
// the public site; used by scripts, the local demo, and tests.
import type { Pool } from "pg";
import { MIGRATIONS } from "./migrations";

const OPS_TABLES = [
  "fd_receipts",
  "fd_jobs",
  "fd_approvals",
  "fd_interactions",
  "fd_outreach",
  "fd_content",
  "fd_campaigns",
  "fd_tasks",
  "fd_cases",
  "fd_affiliations",
  "fd_permissions",
  "fd_submissions",
  "fd_prospects",
  "fd_organizations",
  "fd_suppressions",
  "fd_erasures",
  "fd_worker_runs",
  "fd_funnel",
  "fd_rate_limits",
];

// Empties a SYNTHETIC database (the demo's "reset to seed"). Refuses a
// database marked as holding real data: there is no code path that wipes
// production. Temporarily lifts the audit trail's truncate guard, which
// only the table owner can do.
export async function wipeSyntheticDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select value from fd_meta where key = 'synthetic'");
    if (rows[0]?.value !== true) {
      throw new Error("refusing to wipe a database that is not marked synthetic");
    }
    await client.query(`truncate ${OPS_TABLES.join(", ")}`);
    await client.query("alter table fd_audit disable trigger fd_audit_no_truncate");
    await client.query("truncate fd_audit");
    await client.query("alter table fd_audit enable trigger fd_audit_no_truncate");
    await client.query(
      `update fd_settings set version = 1, doc = '{"allOutboundPaused":false,"pausedAt":null,"pausedBy":null,"lastReviewAt":null,"followUpDelayDays":10,"maxFollowUps":1,"approvalValidityDays":14,"version":1}'::jsonb where id = 1`,
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function appliedMigrations(pool: Pool): Promise<{ applied: string[]; pending: string[] }> {
  const { rows } = await pool.query("select id from fd_schema_migrations order by id").catch(() => ({ rows: [] as { id: string }[] }));
  const applied = rows.map((r) => String(r.id));
  return { applied, pending: MIGRATIONS.map((m) => m.id).filter((id) => !applied.includes(id)) };
}
