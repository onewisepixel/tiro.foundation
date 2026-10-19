// The scheduled worker's entry point. Production: called every few minutes
// by an EventBridge rule through an API destination carrying the worker
// token (deploy/flight-deck/). Idempotent and single-runner, so a retried
// or overlapping call is harmless.
//
// EventBridge gives an API destination 5 seconds to answer, then retries.
// A tick (database, protective log, possibly a reconciliation) can take
// longer, so by default the call is accepted at once (202) and the tick
// runs after the response, within maxDuration. Its outcome is recorded as a
// worker run and judged by the status endpoint (a stale or failing worker
// is an alert), not by this response. `?wait=1` runs the tick before
// answering, for an operator or a rehearsal.
import { after } from "next/server";
import { getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { runWorkerTick } from "@/lib/flightDeck/worker";
import { bearerOk, NO_STORE } from "../auth";

export const maxDuration = 120;

export async function POST(request: Request) {
  const rt = await getConsoleRuntime().catch(() => null);
  if (!rt) {
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: NO_STORE });
  }
  if (!bearerOk(request, rt, "worker")) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: NO_STORE });
  }
  const tick = () => runWorkerTick({ store: rt.store, providers: rt.providers, purgeRateLimits: rt.purgeRateLimits, acquireLock: rt.acquireWorkerLock, ledgerSink: rt.ledgerSink, identity: rt.identity });
  if (new URL(request.url).searchParams.get("wait") !== "1") {
    after(async () => {
      await tick().catch(() => undefined); // failures are recorded as worker runs
    });
    return new Response(JSON.stringify({ ok: true, accepted: true }), { status: 202, headers: NO_STORE });
  }
  const summary = await tick();
  return new Response(JSON.stringify({ ok: summary.outcome !== "failed", ...summary }), { status: summary.outcome === "failed" ? 503 : 200, headers: NO_STORE });
}
