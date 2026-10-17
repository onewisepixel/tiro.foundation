// Every Flight Deck page and action starts here. Outside a local-demo
// request there is no runtime, and the route does not exist (404). Without
// a valid session, pages go to sign-in and actions do nothing.
import "server-only";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, type Actor } from "@/lib/flightDeck/access";
import { GateError } from "@/lib/flightDeck/approvals";
import { getActor, getRuntime, type Runtime } from "@/lib/flightDeck/runtime";
import { ValidationError } from "@/lib/flightDeck/schema";
import { StoreError } from "@/lib/flightDeck/store";

export async function requirePage(): Promise<{ rt: Runtime; actor: Actor }> {
  const rt = await getRuntime();
  if (!rt) {
    notFound();
  }
  const actor = await getActor();
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  return { rt, actor };
}

export function errorCode(e: unknown): string {
  if (e instanceof AccessDenied) {
    return "access-denied";
  }
  if (e instanceof GateError) {
    return e.code;
  }
  if (e instanceof ValidationError) {
    return "validation-failed";
  }
  if (e instanceof StoreError) {
    return e.code;
  }
  return "error";
}

// Only same-app paths: never an open redirect.
export function safeReturn(value: FormDataEntryValue | null, fallback = "/flight-deck"): string {
  return typeof value === "string" && /^\/flight-deck(\/[A-Za-z0-9_\-/]*)?$/.test(value) ? value : fallback;
}

// Runs a mutation and redirects back with a notice or an error code.
// Works without client JavaScript (plain form posts). A result may name a
// notice code, or a notice and a different Flight Deck page to land on.
type Outcome = void | string | { notice: string; to: string };

export async function act(formData: FormData, fn: (ctx: { rt: Runtime; actor: Actor }) => Promise<Outcome>) {
  const rt = await getRuntime();
  if (!rt) {
    notFound();
  }
  const actor = await getActor();
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  const back = safeReturn(formData.get("returnTo"));
  let target: string;
  try {
    const r = await fn({ rt, actor });
    target = r && typeof r === "object" ? `${safeReturn(r.to)}?notice=${encodeURIComponent(r.notice)}` : `${back}?notice=${encodeURIComponent(r ?? "saved")}`;
  } catch (e) {
    if (!(e instanceof AccessDenied || e instanceof GateError || e instanceof ValidationError || e instanceof StoreError)) {
      // Unexpected: log the class only. Never log form contents.
      console.error("flight-deck action failed:", e instanceof Error ? e.name : "unknown");
    }
    target = `${back}?error=${encodeURIComponent(errorCode(e))}`;
  }
  redirect(target);
}
