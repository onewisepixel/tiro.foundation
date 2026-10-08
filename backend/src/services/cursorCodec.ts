// Confidential, tamper-evident pagination cursors for the public listing
// route (services/publicView.ts's readPublicListing). A cursor built from a
// plain, reversible encoding of the real recordId it resumes from (e.g.
// base64) would hand an anonymous caller the literal backend id of
// whatever row a scan last examined — which can be a quarantined,
// restricted, or withdrawn record the caller was never shown and has no
// legitimate way to learn exists. AES-256-GCM closes this: the plaintext
// recordId is never visible in the cursor string, and any tampering (or
// garbage input) fails the auth tag check below rather than silently
// decoding to the wrong thing.
//
// The key only needs to be opaque to a public HTTP caller, who can read
// neither this source nor the Lambda's environment — it is not a secret
// held against colleagues with repository access, so a fixed,
// source-derived key (rather than a generated-and-stored secret, which
// would be new infrastructure this fixture-scale project doesn't need) is
// the right amount of mechanism here.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const CURSOR_KEY = createHash("sha256").update("tiro-fixture-backend-public-cursor-v1").digest();
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
// Comfortably covers a base64-encoded UUIDv7 recordId plus the fixed
// iv/authTag overhead — a bound checked BEFORE any decode/decrypt work, so
// an oversized or garbage client-supplied string is rejected cheaply.
const MAX_CURSOR_LENGTH = 512;

export class InvalidCursorError extends Error {
  constructor(reason: string) {
    super(`Invalid pagination cursor: ${reason}`);
    this.name = "InvalidCursorError";
  }
}

// resumeKey is the plain, unencrypted RestrictionRegisterStore resume key
// (this table's own recordId) — or null, meaning "resume from the very
// start of the table." null is encoded as the empty plaintext rather than
// refused, so a cursor can faithfully represent "there IS more to read,
// but nothing has been examined yet" (e.g. a budget exhausted before the
// very first row of the very first page) distinctly from "no cursor was
// ever returned" — collapsing that distinction to a bare null elsewhere
// would wrongly read as "fully exhausted" to a caller paginating with it.
export function encodePublicCursor(resumeKey: string | null): string {
  const plaintext = resumeKey ?? "";
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", CURSOR_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decodePublicCursor(cursor: string): string | null {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new InvalidCursorError("cursor is missing, empty, or exceeds the maximum length.");
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(cursor, "base64url");
  } catch {
    throw new InvalidCursorError("cursor is not valid base64url.");
  }
  // Exactly iv+authTag with a ZERO-length ciphertext is a legitimate
  // envelope — it's how encodePublicCursor(null) ("resume from the start")
  // encodes, so this must reject strictly less than that, never <=.
  if (raw.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new InvalidCursorError("cursor is too short to contain a valid envelope.");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + AUTH_TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", CURSOR_KEY, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const recordId = plaintext.toString("utf8");
    return recordId.length === 0 ? null : recordId;
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw error;
    }
    throw new InvalidCursorError("cursor failed authentication (tampered or malformed).");
  }
}
