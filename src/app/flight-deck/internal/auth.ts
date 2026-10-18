// Bearer-token checks for the machine endpoints (scheduler and monitor).
// Production: a constant-time comparison with a 32+ character secret from
// the secret manager. Local demo: loopback only (the mode itself already
// guarantees that), no token.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Runtime } from "@/lib/flightDeck/runtime";

const digest = (v: string) => createHash("sha256").update(v).digest();

export function bearerOk(request: Request, rt: Runtime, which: "worker" | "monitor"): boolean {
  if (rt.mode === "local-demo") {
    return true;
  }
  const expected = which === "worker" ? rt.config?.workerToken : rt.config?.monitorToken;
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{32,256})$/.exec(header);
  return !!expected && !!m && timingSafeEqual(digest(m[1]), digest(expected));
}

export const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
