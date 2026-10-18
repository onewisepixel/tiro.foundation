"use server";

// Launch-gate approval (production only). Not routed through act():
// it must work BEFORE the console gate exists, for a founder who has just
// signed in. Every check is in approveGate() (gates.ts).
import { notFound, redirect } from "next/navigation";
import { audit } from "@/lib/flightDeck/access";
import { GateError } from "@/lib/flightDeck/approvals";
import { approveGate } from "@/lib/flightDeck/gates";
import type { SessionActor } from "@/lib/flightDeck/identity";
import { forgetGateCache, getActor, getBootstrapRuntime } from "@/lib/flightDeck/runtime";
import { ProtectiveWriteFailed, RecoveryRequired } from "@/lib/flightDeck/store";

export async function approveGateAction(formData: FormData) {
  const rt = await getBootstrapRuntime();
  if (!rt || rt.mode !== "production" || !rt.identity || !rt.config) {
    notFound();
  }
  const actor = (await getActor(rt)) as SessionActor | null;
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  const gate = formData.get("gate");
  if (gate !== "console" && gate !== "public-form") {
    redirect("/flight-deck/gates?error=validation-failed");
  }
  let target = "/flight-deck/gates?notice=gate-approved";
  try {
    await approveGate({ identity: rt.identity, sessionSecret: rt.config.sessionSecret, now: new Date() }, actor, {
      gate,
      attest: formData.get("attest") === "yes",
      writtenApprovalRef: typeof formData.get("writtenApprovalRef") === "string" ? (formData.get("writtenApprovalRef") as string) : null,
      noticeVersion: typeof formData.get("noticeVersion") === "string" ? (formData.get("noticeVersion") as string) : null,
    });
    await rt.store.transaction((tx) => audit(tx, actor, "gate-approved", "settings", null, gate));
    forgetGateCache();
  } catch (e) {
    const code = e instanceof GateError ? e.code : e instanceof ProtectiveWriteFailed ? "protective-log-unavailable" : e instanceof RecoveryRequired ? "recovery-required" : "error";
    target = code === "reauth-required" ? "/flight-deck/auth/login?reauth=1" : `/flight-deck/gates?error=${code}`;
  }
  redirect(target);
}
