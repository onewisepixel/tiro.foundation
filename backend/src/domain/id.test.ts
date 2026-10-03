import { test } from "node:test";
import assert from "node:assert/strict";
import { uuidv7 } from "./id";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uuidv7 produces correctly shaped, versioned, varianted IDs", () => {
  for (let i = 0; i < 50; i++) {
    const id = uuidv7();
    assert.match(id, UUID_SHAPE, `malformed UUID: ${id}`);
  }
});

test("uuidv7 IDs are unique across many calls", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
  assert.equal(ids.size, 1000);
});

test("uuidv7 IDs are lexicographically (roughly) time-ordered", async () => {
  const first = uuidv7();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = uuidv7();
  assert.ok(first < second, "later-generated UUIDv7 should sort after an earlier one");
});
