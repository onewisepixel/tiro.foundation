// Tests only the pure request-parsing logic (extractCallerIdentity,
// parseBody) — never the handler() function itself, which constructs a real
// DynamoDBClient and is exercised by the manual real-AWS scripts, not here.
//
// The module-level requireEnv() calls in handler.ts need these env vars set
// BEFORE that module's body ever runs. A static `import` won't do: ES
// modules hoist and evaluate imports in dependency order before the
// importing file's own top-level statements, regardless of source-line
// order — so a `process.env...` assignment textually above a static
// `import "./handler"` still runs AFTER handler.ts's top level, not before.
// A dynamic `import()` is not hoisted and runs exactly where it's awaited,
// which is what makes the ordering below actually work.
process.env.TIRO_PRIMARY_TABLE ??= "test-primary-table";
process.env.TIRO_REGISTER_TABLE ??= "test-register-table";

import { test } from "node:test";
import assert from "node:assert/strict";
import type { HttpApiEvent } from "./handler";

const { extractCallerIdentity, parseBody } = await import("./handler");

function baseEvent(overrides: Partial<HttpApiEvent> = {}): HttpApiEvent {
  return {
    requestContext: { http: { method: "GET", path: "/records/x" } },
    rawPath: "/records/x",
    ...overrides,
  };
}

test("extractCallerIdentity prefers the email claim", () => {
  const event = baseEvent({
    requestContext: {
      http: { method: "GET", path: "/" },
      authorizer: { jwt: { claims: { email: "steward@example.invalid", sub: "abc-123" } } },
    },
  });
  assert.equal(extractCallerIdentity(event), "staff:steward@example.invalid");
});

test("extractCallerIdentity falls back to sub when email is absent", () => {
  const event = baseEvent({
    requestContext: {
      http: { method: "GET", path: "/" },
      authorizer: { jwt: { claims: { sub: "abc-123" } } },
    },
  });
  assert.equal(extractCallerIdentity(event), "staff:abc-123");
});

test("extractCallerIdentity throws rather than proceeding with no identity", () => {
  const event = baseEvent({ requestContext: { http: { method: "GET", path: "/" } } });
  assert.throws(() => extractCallerIdentity(event), /No authenticated caller identity/);
});

test("parseBody returns undefined when there is no body", () => {
  assert.equal(parseBody(baseEvent({ body: null })), undefined);
  assert.equal(parseBody(baseEvent({ body: undefined })), undefined);
});

test("parseBody parses a plain JSON body", () => {
  assert.deepEqual(parseBody(baseEvent({ body: '{"reason":"test"}' })), { reason: "test" });
});

test("parseBody decodes a base64-encoded JSON body", () => {
  const encoded = Buffer.from('{"reason":"test"}', "utf8").toString("base64");
  assert.deepEqual(parseBody(baseEvent({ body: encoded, isBase64Encoded: true })), { reason: "test" });
});

test("parseBody returns undefined (not a throw) for malformed JSON", () => {
  assert.equal(parseBody(baseEvent({ body: "{not valid json" })), undefined);
});
