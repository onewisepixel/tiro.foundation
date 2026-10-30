import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig, { ADOPTED_PREVIEWS } from "../../next.config";

// Milestone 3.0 Phase 3a: the adopted previews' old addresses.
test("the adopted previews redirect to their production pages, temporarily", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  const find = (source: string) => redirects.find((r) => r.source === source);
  for (const [source, destination] of [
    ["/preview/home-v5", "/"],
    ["/preview/memory-v1", "/memory-project"],
    ["/preview/memory-v1/records/:id", "/memory-project/records/:id"],
  ]) {
    const r = find(source);
    assert.ok(r, `no redirect from ${source}`);
    assert.equal(r.destination, destination);
    assert.equal(r.permanent, false, `${source} must stay temporary until Phase 5`);
  }
});

test("record redirects are by pattern only, so they reveal no record id", () => {
  for (const r of ADOPTED_PREVIEWS) {
    assert.doesNotMatch(r.source + r.destination, /DEMO-/);
  }
});

test("the earlier explorations are not redirected (Phase 5)", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  for (const v of ["home-v2", "home-v3", "home-v3-1", "home-v4"]) {
    assert.ok(!redirects.some((r) => r.source.startsWith(`/preview/${v}`)), v);
  }
});
