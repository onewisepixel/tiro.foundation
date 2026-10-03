// Minimal UUIDv7 generator (RFC 9562). No dependency — start from 16 random
// bytes and overwrite exactly the bits the spec reserves (48-bit timestamp,
// 4-bit version, 2-bit variant); everything else stays random. Buffer-based
// rather than hex-string slicing, so the byte accounting can't drift.

import { randomBytes } from "node:crypto";

export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());

  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // Version nibble (0111 = 7); low nibble of byte 6 stays random (rand_a).
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant bits (10); low 6 bits of byte 8 stay random (rand_b).
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
