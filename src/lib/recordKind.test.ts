import { test } from "node:test";
import assert from "node:assert/strict";
import { countByDemo, formatRecordCountLabel, getConnectionsNotice } from "./recordKind";
import { getRecordKindNotice } from "@/data/recordNotices";
import type { MemoryRecord } from "@/data/memories";

function demo(id: string): Pick<MemoryRecord, "id" | "recordKind"> {
  return { id, recordKind: "demo" };
}

function collection(id: string): Pick<MemoryRecord, "id" | "recordKind"> {
  return { id, recordKind: "collection" };
}

type MinimalRecord = Pick<MemoryRecord, "id" | "recordKind">;

const allDemo: MinimalRecord[] = [demo("a"), demo("b"), demo("c")];
const mixed: MinimalRecord[] = [demo("a"), demo("b"), collection("c")];
const noDemo: MinimalRecord[] = [collection("a"), collection("b")];
const empty: MinimalRecord[] = [];

test("countByDemo", async (t) => {
  await t.test("all-demo", () => {
    assert.deepEqual(countByDemo(allDemo as MemoryRecord[]), { total: 3, demo: 3 });
  });
  await t.test("mixed", () => {
    assert.deepEqual(countByDemo(mixed as MemoryRecord[]), { total: 3, demo: 2 });
  });
  await t.test("no-demo", () => {
    assert.deepEqual(countByDemo(noDemo as MemoryRecord[]), { total: 2, demo: 0 });
  });
  await t.test("empty", () => {
    assert.deepEqual(countByDemo(empty as MemoryRecord[]), { total: 0, demo: 0 });
  });
});

test("formatRecordCountLabel", async (t) => {
  await t.test("all-demo, plural", () => {
    assert.equal(formatRecordCountLabel(allDemo as MemoryRecord[]), "3 Demonstration Records");
  });
  await t.test("all-demo, singular", () => {
    assert.equal(formatRecordCountLabel([demo("a")] as MemoryRecord[]), "1 Demonstration Record");
  });
  await t.test("mixed, plural demo count", () => {
    assert.equal(formatRecordCountLabel(mixed as MemoryRecord[]), "3 Records · 2 Demonstration Records");
  });
  await t.test("mixed, singular demo count", () => {
    assert.equal(
      formatRecordCountLabel([demo("a"), collection("b")] as MemoryRecord[]),
      "2 Records · 1 Demonstration Record",
    );
  });
  await t.test("no-demo, plural", () => {
    assert.equal(formatRecordCountLabel(noDemo as MemoryRecord[]), "2 Records");
  });
  await t.test("no-demo, singular", () => {
    assert.equal(formatRecordCountLabel([collection("a")] as MemoryRecord[]), "1 Record");
  });
  await t.test("empty", () => {
    assert.equal(formatRecordCountLabel(empty as MemoryRecord[]), "0 Records");
  });
});

test("getConnectionsNotice", async (t) => {
  await t.test("all-demo returns the full demo notice", () => {
    const notice = getConnectionsNotice(allDemo as MemoryRecord[]);
    assert.match(notice ?? "", /not collected archival testimony/);
  });
  await t.test("mixed returns the mixed notice and names no specific category as evidenced", () => {
    const notice = getConnectionsNotice(mixed as MemoryRecord[]);
    assert.match(notice ?? "", /labeled individually/);
    assert.doesNotMatch(notice ?? "", /evidenced/i);
  });
  await t.test("no-demo returns null", () => {
    assert.equal(getConnectionsNotice(noDemo as MemoryRecord[]), null);
  });
  await t.test("empty returns null", () => {
    assert.equal(getConnectionsNotice(empty as MemoryRecord[]), null);
  });
});

test("getRecordKindNotice", async (t) => {
  await t.test("demo has a full and short notice", () => {
    const notice = getRecordKindNotice("demo");
    assert.ok(notice);
    assert.match(notice.full, /not collected archival testimony/);
    assert.match(notice.short, /not collected archival testimony/);
  });
  await t.test("pilot has no sanctioned notice yet", () => {
    assert.equal(getRecordKindNotice("pilot"), null);
  });
  await t.test("collection has no notice and is not implicitly asserted as evidenced", () => {
    assert.equal(getRecordKindNotice("collection"), null);
  });
});
