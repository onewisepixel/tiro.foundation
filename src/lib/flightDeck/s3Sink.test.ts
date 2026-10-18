// The S3 protective-log adapter, driven by the real AWS SDK against a
// local S3-compatible fake (scripts/flight-deck/fake-s3.mjs). No AWS
// account or credentials are used: the client is given dummy ones.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_IDENTITIES } from "./identities";
import { recordInterest } from "./intake";
import { chainEvents, EMPTY_HEAD, SinkConflict, SinkUnavailable, type ProtectiveBody } from "./protective";
import { withdraw } from "./prospects";
import { checkRecovery, reconcile } from "./recovery";
import { S3_CALL_TIMEOUT_MS, S3ProtectiveSink } from "./s3Sink";
import { MemoryOperationsStore } from "./store";
// A plain ES module, shared with the production rehearsal script.
import { startFakeS3 } from "../../../scripts/flight-deck/fake-s3.mjs";

const [FOUNDER] = DEMO_IDENTITIES;
type Fake = { endpoint: string; objects: Map<string, Buffer>; requests: { method: string; key: string; ifNoneMatch: string | null; checksum: string | null; authorized: boolean }[]; stop: () => Promise<void> };
let fake: Fake;

before(async () => {
  fake = await startFakeS3();
});
after(async () => {
  await fake.stop();
});

const sinkFor = (bucket: string) =>
  new S3ProtectiveSink({ bucket, region: "eu-west-2", endpoint: fake.endpoint }, { credentials: { accessKeyId: "TESTKEY", secretAccessKey: "testsecret" } });

const body = (n: number): ProtectiveBody => ({
  kind: "suppression-added",
  id: `pev_${"A".repeat(15)}${n}`,
  at: "2026-10-18T09:00:00.000Z",
  actorId: "system",
  synthetic: true,
  suppressionId: `sup_${"B".repeat(15)}${n}`,
  emailKey: "a".repeat(64),
  scope: "all",
  basis: "withdrawal",
  effectiveAt: "2026-10-18T09:00:00.000Z",
});

test("s3: events are created conditionally, read back, listed in order, and never overwritten", async () => {
  const sink = sinkFor("log-a");
  const events = chainEvents(EMPTY_HEAD, [body(1), body(2), body(3)]);
  for (const e of events) {
    await sink.append(e);
  }
  const puts = fake.requests.filter((r) => r.method === "PUT" && r.key.startsWith("flight-deck/events/"));
  assert.equal(puts.length, 3);
  assert.ok(puts.every((r) => r.ifNoneMatch === "*"), "If-None-Match: * on every event write");
  assert.ok(puts.every((r) => r.checksum), "a checksum is sent (required by Object Lock buckets)");
  assert.ok(puts.every((r) => r.authorized), "requests are SigV4-signed");
  assert.deepEqual(await sink.read(2), events[1]);
  assert.equal(await sink.read(9), null);
  assert.deepEqual((await sink.listAfter(1, 10)).map((e) => e.seq), [2, 3]);
  await assert.rejects(sink.append(events[1]), (e) => e instanceof SinkConflict && e.seq === 2);
  assert.deepEqual(JSON.parse(fake.objects.get("log-a/flight-deck/events/000000000002.json")!.toString()), events[1], "the original is untouched");
});

test("s3: an unreachable endpoint is SinkUnavailable, never success", async () => {
  const dead = new S3ProtectiveSink({ bucket: "x", region: "eu-west-2", endpoint: "http://127.0.0.1:1" }, { credentials: { accessKeyId: "K", secretAccessKey: "S" }, maxAttempts: 1 });
  await assert.rejects(dead.append(chainEvents(EMPTY_HEAD, [body(1)])[0]), SinkUnavailable);
  await assert.rejects(dead.listAfter(0, 1), SinkUnavailable);
});

test("s3: an endpoint that accepts but never answers is SinkUnavailable within the call bound", async () => {
  const http = await import("node:http");
  const sockets = new Set<import("node:net").Socket>();
  const silent = http.createServer(() => undefined);
  silent.on("connection", (s) => sockets.add(s));
  await new Promise<void>((r) => silent.listen(0, "127.0.0.1", r));
  const port = (silent.address() as { port: number }).port;
  try {
    const hung = new S3ProtectiveSink({ bucket: "x", region: "eu-west-2", endpoint: `http://127.0.0.1:${port}` }, { credentials: { accessKeyId: "K", secretAccessKey: "S" } });
    const started = Date.now();
    await assert.rejects(hung.append(chainEvents(EMPTY_HEAD, [body(1)])[0]), SinkUnavailable);
    const took = Date.now() - started;
    assert.ok(took >= S3_CALL_TIMEOUT_MS - 200 && took < 14_000, `bounded below the database's 15 s transaction limit (took ${took} ms)`);
  } finally {
    sockets.forEach((s) => s.destroy());
    await new Promise((r) => silent.close(r));
  }
});

test("s3: a store journals through S3, and a restore reconciles from it", async () => {
  const sink = sinkFor("log-b");
  let now = Date.parse("2026-10-18T09:00:00.000Z");
  const store = new MemoryOperationsStore(() => new Date(now), undefined, { sink, requireJournal: true });
  const id = await store.transaction((tx) => recordInterest(tx, { displayName: "Synthetic", email: "s@example.invalid", category: "community-partner", organization: null, region: null, topics: [], updatesOptIn: null, referral: null }).prospectId);
  const backup = store.snapshot();
  await store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  now += 1000;
  const restored = new MemoryOperationsStore(() => new Date(now), backup, { sink, requireJournal: true });
  assert.equal((await checkRecovery(restored)).ok, false);
  assert.equal((await reconcile(restored, FOUNDER)).ok, true);
  assert.equal((await restored.read((tx) => tx.list("suppressions").length)), 1);
  await sink.writeCheckpoint("000000000001.json", JSON.stringify({ head: await restored.protectiveHead() }));
  assert.ok(fake.objects.has("log-b/flight-deck/checkpoints/000000000001.json"));
});
