import { test } from "node:test";
import assert from "node:assert/strict";
import { cubic, r2 } from "./geometry";

test("r2 rounds to hundredths and prints at most two decimals", () => {
  assert.equal(r2(147.91999999999999), 147.92);
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(r2(-73.955), -73.95);
  for (let i = 0; i < 2000; i++) {
    const n = (i * 7.3) / 3 - 900;
    assert.match(String(r2(n)), /^-?\d+(\.\d{1,2})?$/, `r2(${n}) printed ${r2(n)}`);
  }
});

test("cubic matches the Bernstein form at its ends and its midpoint", () => {
  const p = [10, 140, 260, 380] as const;
  assert.equal(cubic(p, 0), 10);
  assert.equal(cubic(p, 1), 380);
  assert.equal(cubic(p, 0.5), r2((p[0] + 3 * p[1] + 3 * p[2] + p[3]) / 8));
});

test("cubic never prints more than two decimals (hydration-safe)", () => {
  for (let i = 0; i <= 100; i++) {
    const v = cubic([70, 200, 315.4, 435.4], i / 100);
    assert.match(String(v), /^-?\d+(\.\d{1,2})?$/);
  }
});
