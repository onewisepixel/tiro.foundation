// The scheduled worker: everything Flight Deck should keep doing when no
// one is looking at it. One tick is idempotent and safe to run as often as
// every few minutes; running it twice in a row changes nothing the second
// time.
//
// A tick:
//   1. takes the single-runner lock (Postgres advisory lock in production;
//      a second concurrent tick exits immediately);
//   2. records a WorkerRun (the heartbeat that monitoring watches);
//   3. runs due dispatch jobs, which re-check every gate and honour the
//      global pause (dispatch.ts);
//   4. opens a retention-review task for each record past its review date
//      (never deletes anything by itself: erasure is a human decision);
//   5. opens a re-review task for approvals that expired unused;
//   6. escalates overdue exception cases to the founder's Now board;
//   7. purges expired rate-limit windows and old worker runs;
//   8. closes the WorkerRun with counts, or with an error code.
//
// It never sends anything by itself: with no provider configured, due jobs
// are held as "provider-disabled", exactly as when a person runs them.
import { audit, SYSTEM } from "./access";
import { runDueJobs } from "./dispatch";
import { buildLedger, type LedgerSink } from "./ledger";
import { newId } from "./ids";
import type { Providers } from "./providers";
import type { OperationsStore, OpsTx } from "./store";
import type { WorkerRun } from "./types";

export type WorkerDeps = {
  store: OperationsStore;
  providers: Providers;
  purgeRateLimits?: (cutoff: Date) => Promise<number>;
  // Returns a release function, or null if another tick holds the lock.
  acquireLock?: () => Promise<(() => Promise<void>) | null>;
  // Where the restore-safety ledger goes (ledger.ts). Absent: an alert.
  ledgerSink?: LedgerSink;
};

export type TickSummary = {
  outcome: "ok" | "paused" | "failed" | "skipped-locked";
  runId: string | null;
  jobsClaimed: number;
  tasksCreated: number;
  errorCode: string | null;
};

const RUN_RETENTION_DAYS = 30;

const day = (tx: OpsTx) => tx.nowIso.slice(0, 10);
const plusDays = (tx: OpsTx, n: number) => new Date(tx.now.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function ensureTask(tx: OpsTx, key: string, task: { type: "retention-review" | "approval" | "operations"; title: string; prospectId: string | null; dueOn: string; priority: "high" | "normal" }): boolean {
  if (tx.list("tasks", (t) => t.dedupeKey === key).length) {
    return false;
  }
  tx.insert("tasks", {
    id: newId("tsk"),
    type: task.type,
    title: task.title,
    dueOn: task.dueOn,
    ownerId: null,
    prospectId: task.prospectId,
    status: "open",
    priority: task.priority,
    resolution: null,
    createdBy: "system",
    dedupeKey: key,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: tx.synthetic,
  });
  return true;
}

// Housekeeping that creates tasks. Pure over the transaction.
export function housekeeping(tx: OpsTx): number {
  let created = 0;
  const today = day(tx);
  for (const p of tx.list("prospects", (p) => !!p.retainUntil && p.retainUntil < today)) {
    if (ensureTask(tx, `retention-due:${p.id}:${p.retainUntil}`, { type: "retention-review", title: "Retention period reached: keep (with a reason) or erase", prospectId: p.id, dueOn: plusDays(tx, 14), priority: "normal" })) {
      created++;
    }
  }
  for (const a of tx.list("approvals", (a) => a.state === "active" && !!a.expiresAt && a.expiresAt <= tx.nowIso)) {
    tx.update("approvals", a.id, a.version, { state: "expired", invalidatedAt: tx.nowIso, invalidatedReason: "expired" });
    audit(tx, SYSTEM, "approval-expired", a.subjectType, a.subjectId, null);
    const prospectId = a.subjectType === "outreach" ? (tx.get("outreach", a.subjectId)?.prospectId ?? null) : null;
    if (ensureTask(tx, `approval-expired:${a.id}`, { type: "approval", title: `An approved ${a.subjectType} item expired unused: review it again or archive it`, prospectId, dueOn: plusDays(tx, 7), priority: "normal" })) {
      created++;
    }
  }
  for (const c of tx.list("cases", (c) => c.status !== "resolved" && c.dueOn < today)) {
    if (ensureTask(tx, `case-overdue:${c.id}:${c.dueOn}`, { type: "operations", title: "An exception case is past its deadline", prospectId: c.prospectId, dueOn: today, priority: "high" })) {
      created++;
    }
  }
  const cutoff = new Date(tx.now.getTime() - RUN_RETENTION_DAYS * 86_400_000).toISOString();
  for (const r of tx.list("workerRuns", (r) => r.startedAt < cutoff)) {
    tx.remove("workerRuns", r.id);
  }
  return created;
}

export async function runWorkerTick(deps: WorkerDeps): Promise<TickSummary> {
  const release = deps.acquireLock ? await deps.acquireLock() : async () => undefined;
  if (!release) {
    return { outcome: "skipped-locked", runId: null, jobsClaimed: 0, tasksCreated: 0, errorCode: null };
  }
  let run: WorkerRun | null = null;
  try {
    run = await deps.store.transaction((tx) =>
      tx.insert("workerRuns", {
        id: newId("run"),
        startedAt: tx.nowIso,
        finishedAt: null,
        outcome: "running",
        jobsClaimed: 0,
        tasksCreated: 0,
        errorCode: null,
        createdAt: tx.nowIso,
        updatedAt: tx.nowIso,
        version: 1,
        synthetic: tx.synthetic,
      }),
    );
    const jobs = await runDueJobs(deps.store, deps.providers, SYSTEM);
    const tasksCreated = await deps.store.transaction((tx) => housekeeping(tx));
    if (deps.purgeRateLimits) {
      await deps.purgeRateLimits(new Date(Date.now() - 2 * 86_400_000));
    }
    if (deps.ledgerSink) {
      await deps.ledgerSink.write(await deps.store.read((tx) => buildLedger(tx)));
    }
    const outcome = jobs.paused ? "paused" : "ok";
    const id = run.id;
    await deps.store.transaction((tx) => {
      const r = tx.require("workerRuns", id);
      tx.update("workerRuns", id, r.version, { finishedAt: tx.nowIso, outcome, jobsClaimed: jobs.claimed, tasksCreated });
    });
    return { outcome, runId: id, jobsClaimed: jobs.claimed, tasksCreated, errorCode: null };
  } catch (e) {
    const errorCode = typeof e === "object" && e && "code" in e && typeof (e as { code: unknown }).code === "string" && /^[a-z0-9-]{1,40}$/.test((e as { code: string }).code) ? (e as { code: string }).code : "tick-failed";
    if (run) {
      const id = run.id;
      await deps.store
        .transaction((tx) => {
          const r = tx.require("workerRuns", id);
          tx.update("workerRuns", id, r.version, { finishedAt: tx.nowIso, outcome: "failed", errorCode });
        })
        .catch(() => undefined); // the store itself may be what failed
    }
    return { outcome: "failed", runId: run?.id ?? null, jobsClaimed: 0, tasksCreated: 0, errorCode };
  } finally {
    await release();
  }
}

// ---------- Alerts: what needs a person, computed from state ----------

export type Alert = { key: string; severity: "action" | "warning"; message: string; href: string };

export const WORKER_STALE_MS = 20 * 60 * 1000;

export function computeAlerts(tx: OpsTx, opts: { expectWorker: boolean; ledgerConfigured?: boolean }): Alert[] {
  const alerts: Alert[] = [];
  if (opts.ledgerConfigured === false) {
    alerts.push({ key: "ledger-missing", severity: "warning", message: "No restore-safety ledger is configured: a restore could undo recent erasures or opt-outs.", href: "/flight-deck/health" });
  }
  const runs = tx.list("workerRuns").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const lastOk = runs.find((r) => r.outcome === "ok" || r.outcome === "paused");
  if (opts.expectWorker && (!lastOk || tx.now.getTime() - Date.parse(lastOk.startedAt) > WORKER_STALE_MS)) {
    alerts.push({ key: "worker-stale", severity: "action", message: lastOk ? "The scheduled worker has not completed a run in over 20 minutes." : "The scheduled worker has never completed a run.", href: "/flight-deck/health" });
  }
  if (runs.slice(0, 3).length === 3 && runs.slice(0, 3).every((r) => r.outcome === "failed")) {
    alerts.push({ key: "worker-failing", severity: "action", message: "The last three worker runs failed.", href: "/flight-deck/health" });
  }
  const dead = tx.list("jobs", (j) => j.status === "dead" || j.status === "failed").length;
  if (dead) {
    alerts.push({ key: "jobs-failed", severity: "action", message: `${dead} dispatch job${dead === 1 ? "" : "s"} failed and need a decision.`, href: "/flight-deck/health" });
  }
  const dayAgo = new Date(tx.now.getTime() - 86_400_000).toISOString();
  const stuck = tx.list("jobs", (j) => j.status === "held" && j.holdReason !== "provider-disabled" && j.updatedAt < dayAgo).length;
  if (stuck) {
    alerts.push({ key: "jobs-held", severity: "warning", message: `${stuck} job${stuck === 1 ? " has" : "s have"} been held for over a day.`, href: "/flight-deck/health" });
  }
  const today = tx.nowIso.slice(0, 10);
  const overdue = tx.list("cases", (c) => c.status !== "resolved" && c.dueOn < today).length;
  if (overdue) {
    alerts.push({ key: "cases-overdue", severity: "action", message: `${overdue} exception case${overdue === 1 ? " is" : "s are"} past the deadline.`, href: "/flight-deck/cases" });
  }
  const s = tx.settings();
  if (s.allOutboundPaused && s.pausedAt && s.pausedAt < dayAgo) {
    alerts.push({ key: "paused-long", severity: "warning", message: "Outbound activity has been paused for more than a day.", href: "/flight-deck/health" });
  }
  return alerts;
}
