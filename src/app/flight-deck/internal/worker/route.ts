// The scheduled worker's entry point. Production: called every few minutes
// by an EventBridge rule through an API destination carrying the worker
// token (deploy/flight-deck/). Idempotent and single-runner, so a retried
// or overlapping call is harmless.
import { getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { runWorkerTick } from "@/lib/flightDeck/worker";
import { bearerOk, NO_STORE } from "../auth";

export async function POST(request: Request) {
  const rt = await getConsoleRuntime().catch(() => null);
  if (!rt) {
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: NO_STORE });
  }
  if (!bearerOk(request, rt, "worker")) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: NO_STORE });
  }
  const summary = await runWorkerTick({ store: rt.store, providers: rt.providers, purgeRateLimits: rt.purgeRateLimits, acquireLock: rt.acquireWorkerLock, ledgerSink: rt.ledgerSink });
  return new Response(JSON.stringify({ ok: summary.outcome !== "failed", ...summary }), { status: summary.outcome === "failed" ? 503 : 200, headers: NO_STORE });
}
