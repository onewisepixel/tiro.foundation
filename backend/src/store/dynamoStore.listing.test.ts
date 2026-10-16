// The real DynamoDB adapter must write or delete a record's LISTING item in
// the SAME TransactWriteItems as every write or delete of its canonical
// RECORD item. No DynamoDB is involved: an SDK middleware captures each
// command before it is sent and short-circuits it, so these tests assert
// exactly what the adapter would send.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { buildSeedFixtures } from "../fixtures/seed";
import type { Correction, CustodyCopy, Redaction } from "../domain/types";
import { deriveListingItem } from "../services/publicListingItem";
import { DynamoCustodyCopyCommitter, DynamoFixtureStore, DynamoIntakeRegisterCommitter } from "./dynamoStore";

type Sent = { cmd: string; input: Record<string, unknown> };

function capturingClient() {
  const client = new DynamoDBClient({ region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  const sent: Sent[] = [];
  client.middlewareStack.add(
    (_next, ctx) => async (args) => {
      sent.push({ cmd: ctx.commandName ?? "unknown", input: structuredClone(args.input) as Record<string, unknown> });
      return { output: { $metadata: {} }, response: {} } as never;
    },
    { step: "initialize", priority: "high", name: "captureAndShortCircuit" },
  );
  return { client, sent };
}

type TransactItem = { Put?: { Item: Record<string, unknown> }; Delete?: { Key: Record<string, unknown> }; ConditionCheck?: unknown; Update?: unknown };

// Exactly one TransactWriteItems carrying the RECORD op and its LISTING op
// for the same partition, with the listing derived from the record at the
// version being persisted.
function assertRecordAndListingTogether(sent: Sent[], expectedVersion: number): void {
  assert.equal(sent.length, 1, "one request");
  assert.equal(sent[0].cmd, "TransactWriteItemsCommand");
  const items = sent[0].input.TransactItems as TransactItem[];
  const recordPut = items.find((i) => i.Put?.Item.SK === "RECORD");
  const listingPut = items.find((i) => i.Put?.Item.SK === "LISTING");
  assert.ok(recordPut, "RECORD Put present");
  assert.ok(listingPut, "LISTING Put present in the same transaction");
  assert.equal(listingPut!.Put!.Item.PK, recordPut!.Put!.Item.PK);
  assert.equal(recordPut!.Put!.Item.version, expectedVersion);
  const withoutKeys = (item: Record<string, unknown>) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== "PK" && k !== "SK"));
  assert.deepEqual(withoutKeys(listingPut!.Put!.Item), deriveListingItem(withoutKeys(recordPut!.Put!.Item) as never, expectedVersion));
}

const [fixture] = buildSeedFixtures();
const record = fixture.record;
const copy: CustodyCopy = fixture.custodyCopies[0];

test("getListingItem is a strongly consistent GetItem of the LISTING sort key", async () => {
  const { client, sent } = capturingClient();
  await new DynamoFixtureStore({ client, primaryTableName: "T", statusIndexName: "I" }).getListingItem(record.recordId);
  assert.equal(sent[0].cmd, "GetItemCommand");
  assert.deepEqual(sent[0].input.Key, { PK: `ENTITY#${record.recordId}`, SK: "LISTING" });
  assert.equal(sent[0].input.ConsistentRead, true);
});

test("putRecord writes RECORD and LISTING in one transaction", async () => {
  const { client, sent } = capturingClient();
  await new DynamoFixtureStore({ client, primaryTableName: "T", statusIndexName: "I" }).putRecord(record, 4);
  assertRecordAndListingTogether(sent, 5);
});

test("putRecord for a new record writes LISTING at version 1", async () => {
  const { client, sent } = capturingClient();
  await new DynamoFixtureStore({ client, primaryTableName: "T", statusIndexName: "I" }).putRecord(record, undefined);
  assertRecordAndListingTogether(sent, 1);
});

test("deleteRecord deletes RECORD and LISTING in one transaction", async () => {
  const { client, sent } = capturingClient();
  await new DynamoFixtureStore({ client, primaryTableName: "T", statusIndexName: "I" }).deleteRecord(record.recordId, 3);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].cmd, "TransactWriteItemsCommand");
  const items = sent[0].input.TransactItems as TransactItem[];
  assert.deepEqual(items.map((i) => i.Delete?.Key.SK).sort(), ["LISTING", "RECORD"]);
});

test("putRecordWithCorrection, putRecordWithRedaction and putRecordWithCustodyCopy each carry the LISTING Put", async () => {
  const correction = { recordId: record.recordId, correctionId: "c1" } as unknown as Correction;
  const redaction = { recordId: record.recordId, redactionId: "r1" } as unknown as Redaction;
  for (const write of [
    (s: DynamoFixtureStore) => s.putRecordWithCorrection(record, 2, correction),
    (s: DynamoFixtureStore) => s.putRecordWithRedaction(record, 2, redaction),
    (s: DynamoFixtureStore) => s.putRecordWithCustodyCopy(record, 2, copy),
  ]) {
    const { client, sent } = capturingClient();
    await write(new DynamoFixtureStore({ client, primaryTableName: "T", statusIndexName: "I" }));
    assertRecordAndListingTogether(sent, 3);
    // The LISTING Put is appended last, so the cancellation-reason indices
    // the error mapping relies on ([0] record, [1] history) are unchanged.
    const items = sent[0].input.TransactItems as TransactItem[];
    assert.equal(items[0].Put?.Item.SK, "RECORD");
    assert.equal(items[items.length - 1].Put?.Item.SK, "LISTING");
  }
});

test("the custody-copy committer and the intake committer's record writes carry the LISTING Put", async () => {
  {
    const { client, sent } = capturingClient();
    await new DynamoCustodyCopyCommitter({ client, primaryTableName: "T", registerTableName: "R" }).commitIfNotDeleting(record, 6, copy);
    assertRecordAndListingTogether(sent, 7);
  }
  {
    const { client, sent } = capturingClient();
    await new DynamoIntakeRegisterCommitter({ client, primaryTableName: "T", registerTableName: "R" }).commitCreateSubmission(record);
    assertRecordAndListingTogether(sent, 1);
  }
  {
    const { client, sent } = capturingClient();
    await new DynamoIntakeRegisterCommitter({ client, primaryTableName: "T", registerTableName: "R" }).commitMediaAdd(record.recordId, 9, record, 2, copy);
    assertRecordAndListingTogether(sent, 3);
  }
});
