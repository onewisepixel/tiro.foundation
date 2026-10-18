// Subject-access style export of everything held about one prospect.
// Same gates as every Flight Deck page: no runtime -> 404, no session or no
// export capability -> 403. The export itself is audited (no contents).
import { AccessDenied, can } from "@/lib/flightDeck/access";
import { exportProspect } from "@/lib/flightDeck/prospects";
import { getActor, getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { StoreError } from "@/lib/flightDeck/store";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rt = await getConsoleRuntime();
  if (!rt) {
    return new Response("Not found", { status: 404, headers: HEADERS });
  }
  const actor = await getActor(rt);
  if (!actor || !can(actor, "export")) {
    return new Response("Forbidden", { status: 403, headers: HEADERS });
  }
  const { id } = await params;
  try {
    const data = await rt.store.transaction((tx) => exportProspect(tx, actor, id));
    return new Response(JSON.stringify({ notice: `${rt.store.synthetic ? "SYNTHETIC DEMO DATA. " : "CONFIDENTIAL. "}Operational contact record only; not an archival record.`, ...data }, null, 2), {
      headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="flight-deck-${id}.json"` },
    });
  } catch (e) {
    if (e instanceof StoreError && e.code === "not-found") {
      return new Response("Not found", { status: 404, headers: HEADERS });
    }
    if (e instanceof AccessDenied) {
      return new Response("Forbidden", { status: 403, headers: HEADERS });
    }
    throw e;
  }
}
