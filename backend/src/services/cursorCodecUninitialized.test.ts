// Deliberately its OWN file, separate from cursorCodec.test.ts — that file
// calls setCursorSecretKey() at import time (as every other cursorCodec-
// touching test file must), which would make an "uninitialized" check
// meaningless if it ran in the same module instance. Node's test runner
// executes each file passed on the command line in its own process, so
// this file's module registry never sees that call.
//
// Proves the "required at startup" half of the reviewer-caught finding:
// encoding or decoding a cursor before setCursorSecretKey() has ever been
// called must fail loudly, never silently produce something insecure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePublicCursor, encodePublicCursor } from "./cursorCodec";

test("encodePublicCursor throws if setCursorSecretKey was never called", () => {
  assert.throws(() => encodePublicCursor("some-record-id"), /not initialized/);
});

test("decodePublicCursor throws if setCursorSecretKey was never called", () => {
  assert.throws(() => decodePublicCursor("anything"), /not initialized/);
});
