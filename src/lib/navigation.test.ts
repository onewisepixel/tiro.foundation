import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isActiveGroup, NAV_GROUPS } from "./navigation";

const APP = path.resolve(import.meta.dirname, "../app");
const allLinks = NAV_GROUPS.flatMap((g) => g.links);

test("every destination of the previous navigation keeps a place (decision 42)", () => {
  // TopNav and Footer before Milestone 3.0 Phase 3a, and /pilot.
  for (const href of ["/manifesto", "/about", "/memory-project", "/nodes", "/community-rights", "/contact", "/pilot"]) {
    assert.ok(
      allLinks.some((l) => l.href === href),
      `${href} is missing from the navigation`,
    );
  }
});

test("there are four groups, each opening on one of its own pages", () => {
  assert.deepEqual(
    NAV_GROUPS.map((g) => g.label),
    ["Purpose", "Memory Project", "Principles", "Get involved"],
  );
  for (const g of NAV_GROUPS) {
    assert.ok(g.links.some((l) => l.href === g.href), `${g.label} opens on a page outside the group`);
  }
});

test("every navigation link is a production page, never a preview", () => {
  for (const l of allLinks) {
    assert.ok(!l.href.startsWith("/preview"), l.href);
    assert.ok(fs.existsSync(path.join(APP, l.href, "page.tsx")), `no page for ${l.href}`);
  }
});

test("operational pages stay out of the navigation (decisions 43, 44) and Flight Deck is never linked", () => {
  for (const l of allLinks) {
    assert.ok(!["/living-trace", "/memories", "/flight-deck"].some((p) => l.href === p || l.href.startsWith(`${p}/`)), l.href);
  }
});

test("the current group follows the visitor into a section", () => {
  const current = (p: string) => NAV_GROUPS.filter((g) => isActiveGroup(p, g)).map((g) => g.label);
  assert.deepEqual(current("/memory-project/records/DEMO-LT-0001"), ["Memory Project"]);
  assert.deepEqual(current("/nodes/lagos"), ["Get involved"]);
  assert.deepEqual(current("/about"), ["Purpose"]);
  assert.deepEqual(current("/memories"), []);
  assert.deepEqual(current("/"), []);
});
