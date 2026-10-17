// Abuse controls for the public interest form, chosen so none of them is
// an accessibility barrier (no CAPTCHA):
//
//   - a honeypot field hidden from people and assistive technology;
//   - a signed form token: submissions faster than a person could fill the
//     form, or from a stale page, are refused;
//   - rate limits per client (hashed, never stored) and per address.
//
// The in-memory limiter below protects one local process only. A
// distributed deployment must supply a durable RateLimiter (a shared
// counter store or the hosting edge's rate limiting); in-memory counters
// do not protect several instances. See docs/flight-deck/architecture.md.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HONEYPOT_FIELD = "website";
export const MIN_FILL_MS = 2500;
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;

export type TokenCheck = "ok" | "too-fast" | "expired" | "invalid";

export class FormTokens {
  constructor(private readonly secret: string) {}

  issue(now: number): string {
    const payload = `${now}.${randomBytes(6).toString("hex")}`;
    return `${payload}.${this.sign(payload)}`;
  }

  check(token: unknown, now: number): TokenCheck {
    if (typeof token !== "string" || token.length > 120) {
      return "invalid";
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      return "invalid";
    }
    const payload = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(parts[2]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return "invalid";
    }
    const issuedAt = Number(parts[0]);
    if (!Number.isFinite(issuedAt)) {
      return "invalid";
    }
    const age = now - issuedAt;
    if (age < MIN_FILL_MS) {
      return "too-fast";
    }
    return age > MAX_TOKEN_AGE_MS ? "expired" : "ok";
  }

  private sign(payload: string) {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}

export interface RateLimiter {
  // Records one hit and reports whether it is within the limit.
  hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number, now: number) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        if (times.every((t) => now - t >= windowMs)) {
          this.hits.delete(k);
        }
      }
    }
    return recent.length <= limit;
  }

  // Local demo "reset to seed" only.
  clear() {
    this.hits.clear();
  }
}

export const LIMITS = {
  perClientPerHour: 5,
  perAddressPerDay: 3,
};

export function clientKey(forwardedFor: string | null, realIp: string | null, secret: string): string {
  const ip = (forwardedFor?.split(",")[0] ?? realIp ?? "unknown").trim();
  return createHmac("sha256", secret).update(`client:${ip}`).digest("hex");
}
