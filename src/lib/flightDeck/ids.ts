// Opaque identifiers, content hashes, and keyed email hashes.
import { createHash, createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function newId(prefix: string, length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Deterministic JSON: object keys sorted at every level, so the same
// payload always hashes the same regardless of property order.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Keyed (HMAC) rather than plain hash, so a leaked suppression list cannot
// be reversed by hashing a list of known addresses without the key.
export function emailKey(email: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeEmail(email), "utf8").digest("hex");
}

// Practical, conservative address check: one @, a dotted domain, no
// whitespace or angle brackets. Deliverability is a provider's job.
export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
