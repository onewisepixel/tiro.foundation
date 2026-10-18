// Monitoring endpoint for an external uptime check. Counts, codes and ages
// only: no names, addresses, ids, or content. Responds 200 when nothing
// needs a person, 503 when something does (so a plain HTTP monitor can
// alert on status alone).
import { computeAlerts } from "@/lib/flightDeck/worker";
import { checkRecovery } from "@/lib/flightDeck/recovery";
import { getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { bearerOk, NO_STORE } from "../auth";

export async function GET(request: Request) {
  let rt;
  try {
    rt = await getConsoleRuntime();
  } catch {
    return new Response(JSON.stringify({ ok: false, store: "unavailable" }), { status: 503, headers: NO_STORE });
  }
  if (!rt) {
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: NO_STORE });
  }
  if (!bearerOk(request, rt, "monitor")) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: NO_STORE });
  }
  try {
    // Detects a restored or inconsistent database (and locks contact) even
    // when nobody is using the console.
    const recovery = await checkRecovery(rt.store);
    const body = await rt.store.read((tx) => {
      const runs = tx.list("workerRuns").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const alerts = computeAlerts(tx, { expectWorker: rt.mode === "production", logConfigured: !!rt.store.protectiveSink });
      return {
        ok: recovery.ok && !alerts.some((a) => a.severity === "action"),
        mode: rt.mode,
        store: "ok",
        worker: runs[0] ? { lastOutcome: runs[0].outcome, lastStartedAgoSeconds: Math.round((tx.now.getTime() - Date.parse(runs[0].startedAt)) / 1000) } : null,
        alerts: alerts.map((a) => ({ key: a.key, severity: a.severity })),
        counts: {
          queuedJobs: tx.list("jobs", (j) => j.status === "queued").length,
          failedJobs: tx.list("jobs", (j) => j.status === "failed" || j.status === "dead").length,
          openCases: tx.list("cases", (c) => c.status !== "resolved").length,
        },
        outboundPaused: tx.settings().allOutboundPaused,
        recovery: recovery.ok ? "verified" : recovery.reason,
      };
    });
    return new Response(JSON.stringify(body), { status: body.ok ? 200 : 503, headers: NO_STORE });
  } catch {
    return new Response(JSON.stringify({ ok: false, store: "unavailable" }), { status: 503, headers: NO_STORE });
  }
}
