import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePublicCursor, encodePublicCursor, InvalidCursorError } from "./cursorCodec";

test("encodePublicCursor/decodePublicCursor round-trips a recordId", () => {
  const recordId = "0191a000-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
  const cursor = encodePublicCursor(recordId);
  assert.notEqual(cursor, recordId, "the cursor must never be a plain/reversible encoding of the recordId");
  assert.equal(decodePublicCursor(cursor), recordId);
});

test("encodePublicCursor never embeds the plaintext recordId as a visible substring", () => {
  const recordId = "0191a000-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
  const cursor = encodePublicCursor(recordId);
  assert.equal(cursor.includes(recordId), false);
  assert.equal(Buffer.from(cursor, "base64url").toString("utf8").includes(recordId), false);
});

test("decodePublicCursor rejects tampered ciphertext", () => {
  const cursor = encodePublicCursor("0191a000-cccc-7ccc-8ccc-cccccccccccc");
  const raw = Buffer.from(cursor, "base64url");
  raw[raw.length - 1] ^= 0xff; // flip a byte inside the ciphertext
  const tampered = raw.toString("base64url");
  assert.throws(() => decodePublicCursor(tampered), InvalidCursorError);
});

test("decodePublicCursor rejects truncated input", () => {
  const cursor = encodePublicCursor("0191a000-dddd-7ddd-8ddd-dddddddddddd");
  const truncated = cursor.slice(0, 10);
  assert.throws(() => decodePublicCursor(truncated), InvalidCursorError);
});

test("decodePublicCursor rejects non-base64url input", () => {
  assert.throws(() => decodePublicCursor("not valid base64url!!! ***"), InvalidCursorError);
});

test("decodePublicCursor rejects an over-length string before attempting to decode", () => {
  const huge = "A".repeat(10_000);
  assert.throws(() => decodePublicCursor(huge), InvalidCursorError);
});

test("decodePublicCursor rejects empty input", () => {
  assert.throws(() => decodePublicCursor(""), InvalidCursorError);
});

test("two cursors for the same recordId are not identical (random IV per encoding)", () => {
  const recordId = "0191a000-eeee-7eee-8eee-eeeeeeeeeeee";
  const a = encodePublicCursor(recordId);
  const b = encodePublicCursor(recordId);
  assert.notEqual(a, b);
  assert.equal(decodePublicCursor(a), recordId);
  assert.equal(decodePublicCursor(b), recordId);
});
