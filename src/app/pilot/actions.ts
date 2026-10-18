"use server";

// The /pilot expression-of-interest action. Server Actions are POST-only
// and Next.js rejects a mismatched Origin/Host (CSRF); the body is capped
// by serverActions.bodySizeLimit in next.config.ts. Everything else is
// checked in src/lib/flightDeck/intake.ts.
import { processInterest, type IntakeResult } from "@/lib/flightDeck/intake";
import { getRuntime, isPublicFormOpen, requestClientKey } from "@/lib/flightDeck/runtime";

// What the person typed, echoed back (never stored) so a validation error
// does not wipe their entries: React resets a form after its action runs.
export type EchoedValues = Partial<Record<"displayName" | "email" | "category" | "organization" | "region" | "noticeAck" | "replyConsent" | "updatesOptIn", string>> & { topics?: string[] };

export type PilotFormState = (IntakeResult & { values?: EchoedValues; attempt?: string }) | { status: "idle" };

const ECHO = ["displayName", "email", "category", "organization", "region", "noticeAck", "replyConsent", "updatesOptIn"] as const;

function echo(formData: FormData): EchoedValues {
  const out: EchoedValues = {};
  for (const key of ECHO) {
    const v = formData.get(key);
    if (typeof v === "string") {
      out[key] = v.slice(0, 300);
    }
  }
  out.topics = formData.getAll("topics").filter((t): t is string => typeof t === "string").slice(0, 8);
  return out;
}

export async function submitInterest(_prev: PilotFormState, formData: FormData): Promise<PilotFormState> {
  const runtime = await getRuntime();
  // Closed unless a safe store exists for this request. Nothing is
  // accepted that cannot be persisted safely.
  if (!runtime || !(await isPublicFormOpen())) {
    return { status: "closed" };
  }
  const result = await processInterest(formData.entries(), {
    store: runtime.store,
    tokens: runtime.tokens,
    limiter: runtime.limiter,
    clientKey: await requestClientKey(runtime.clientSecret),
    now: Date.now(),
  });
  return result.status === "invalid" || result.status === "refused" ? { ...result, values: echo(formData), attempt: crypto.randomUUID() } : result;
}
