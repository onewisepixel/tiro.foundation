// Local-demo session: an HMAC-signed, HttpOnly, SameSite=Strict cookie
// naming one of the test identities. The signing key is random per server
// process, so sessions end when the dev server restarts, and no key exists
// on disk or in the client bundle.
//
// This is NOT production authentication. Production requires a selected
// identity provider with MFA and server-side sessions
// (docs/flight-deck/integrations.md §Identity). Nothing here is reachable
// unless config.localDemoActive() holds for the request.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor } from "./access";
import { demoIdentity } from "./identities";

export const SESSION_COOKIE = "fd_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const globalKey = globalThis as unknown as { __flightDeckSessionKey?: Buffer };
const key = () => (globalKey.__flightDeckSessionKey ??= randomBytes(32));

function sign(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function issueSession(userId: string, now: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: now + SESSION_TTL_MS, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(value: string | undefined, now: number): Actor | null {
  if (!value || value.length > 512) {
    return null;
  }
  const [payload, sig] = value.split(".");
  if (!payload || !sig) {
    return null;
  }
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof data.sub !== "string" || typeof data.exp !== "number" || data.exp <= now) {
      return null;
    }
    return demoIdentity(data.sub);
  } catch {
    return null;
  }
}
