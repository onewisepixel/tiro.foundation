// Every Flight Deck page and action starts here. Outside a local-demo
// request or an activated production console (recorded "console" gate)
// there is no runtime, and the route does not exist (404). Without a valid
// session, pages go to sign-in and actions do nothing.
//
// Recovery isolation: while the database is not verified against the
// protective log (a restored or inconsistent copy, or a log that cannot be
// reached), no page or action that could show private data runs. Everything
// goes to /flight-deck/recovery, which shows only the recovery status. A
// restored copy may still hold people erased after its backup until the
// replay has run, so reads are blocked, not only contact.
import "server-only";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, type Actor } from "@/lib/flightDeck/access";
import { GateError } from "@/lib/flightDeck/approvals";
import { checkRecovery } from "@/lib/flightDeck/recovery";
import { getActor, getConsoleRuntime, type Runtime } from "@/lib/flightDeck/runtime";
import { ValidationError } from "@/lib/flightDeck/schema";
import { ProtectiveWriteFailed, RecoveryRequired, StoreError, StoreUnavailable } from "@/lib/flightDeck/store";

export async function requirePage(opts: { duringRecovery?: boolean } = {}): Promise<{ rt: Runtime; actor: Actor }> {
  const rt = await getConsoleRuntime();
  if (!rt) {
    notFound();
  }
  const actor = await getActor(rt);
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  if (!opts.duringRecovery && !(await recovered(rt))) {
    redirect("/flight-deck/recovery");
  }
  return { rt, actor };
}

// The same check as every contact path (recovery.ts), run on every request:
// it detects a restored copy (behind the log or behind the restore fence)
// and persists the lock. An unreachable log counts as unverified.
export async function recovered(rt: Runtime): Promise<boolean> {
  try {
    return (await checkRecovery(rt.store)).ok;
  } catch {
    return false;
  }
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
  if (e instanceof StoreUnavailable) {
    return "storage-unavailable";
  }
  if (e instanceof ProtectiveWriteFailed) {
    return "protective-log-unavailable";
  }
  if (e instanceof RecoveryRequired) {
    return "recovery-required";
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

export async function act(formData: FormData, fn: (ctx: { rt: Runtime; actor: Actor }) => Promise<Outcome>, opts: { duringRecovery?: boolean } = {}) {
  const rt = await getConsoleRuntime();
  if (!rt) {
    notFound();
  }
  const actor = await getActor(rt);
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  if (!opts.duringRecovery && !(await recovered(rt))) {
    redirect("/flight-deck/recovery?error=recovery-unverified");
  }
  const back = safeReturn(formData.get("returnTo"));
  let target: string;
  try {
    const r = await fn({ rt, actor });
    target = r && typeof r === "object" ? `${safeReturn(r.to)}?notice=${encodeURIComponent(r.notice)}` : `${back}?notice=${encodeURIComponent(r ?? "saved")}`;
  } catch (e) {
    if (!(e instanceof AccessDenied || e instanceof GateError || e instanceof ValidationError || e instanceof StoreError || e instanceof StoreUnavailable || e instanceof ProtectiveWriteFailed || e instanceof RecoveryRequired)) {
      // Unexpected: log the class only. Never log form contents.
      console.error("flight-deck action failed:", e instanceof Error ? e.name : "unknown");
    }
    target = `${back}?error=${encodeURIComponent(errorCode(e))}`;
  }
  redirect(target);
}
