// Flight Deck 0.2.1: protective events and recovery against a real
// PostgreSQL 17 (embedded, temporary, local). Restores are full-database
// clones taken at a chosen moment (CREATE DATABASE ... TEMPLATE), the
// closest local stand-in for a provider snapshot or point-in-time restore.
//
//   npm run test:flight-deck-pg
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM } from "../access";
import { signGate, verifyGate } from "../gates";
import { DEMO_IDENTITIES } from "../identities";
import { PostgresIdentityStore } from "../identity";
import { recordInterest } from "../intake";
import { MemoryProtectiveSink, SinkUnavailable, verifyChain, EMPTY_HEAD, type ProtectiveEvent } from "../protective";
import { eraseProspect, withdraw } from "../prospects";
import { DisabledEmailProvider, DisabledSocialPublisher } from "../providers";
import { checkRecovery, reconcile } from "../recovery";
import { ProtectiveWriteFailed, type OpsTx } from "../store";
import { runWorkerTick } from "../worker";
import { PostgresOperationsStore } from "./store";
import { startTestServer, type TestServer } from "./testDb";

const [FOUNDER] = DEMO_IDENTITIES;
const PEPPER = "test-pepper-0123456789-0123456789-0123456789";
const SECRET = "x".repeat(48);
let server: TestServer;

before(async () => {
  server = await startTestServer();
});
after(async () => {
  await server?.stop();
});

const person = (tx: OpsTx, n: number) =>
  recordInterest(tx, { displayName: `Synthetic Person ${n}`, email: `p${n}@example.invalid`, category: "community-partner", organization: null, region: null, topics: [], updatesOptIn: null, referral: null }).prospectId;

async function open(pool: import("pg").Pool, sink: MemoryProtectiveSink, extra: Partial<Parameters<typeof PostgresOperationsStore.open>[0]> = {}) {
  const store = await PostgresOperationsStore.open({ pool, pepper: PEPPER, synthetic: true, sink, requireJournal: true, ...extra });
  const identity = new PostgresIdentityStore(pool, { sink, requireJournal: true, synthetic: true });
  return { store, identity };
}

const providers = { email: new DisabledEmailProvider(), social: new DisabledSocialPublisher() };
const logEvents = (sink: MemoryProtectiveSink) => [...sink.objects.keys()].sort((a, b) => a - b).map((k) => JSON.parse(sink.objects.get(k)!) as ProtectiveEvent);

test("concurrent opt-outs get contiguous, chained log entries matching the database head", async () => {
  const sink = new MemoryProtectiveSink();
  const db = await server.newDatabase();
  const { store } = await open(db.pool, sink);
  const ids = await store.transaction((tx) => Array.from({ length: 10 }, (_, i) => person(tx, i)));
  await Promise.all(ids.map((id) => store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"))));
  const events = logEvents(sink);
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const end = verifyChain(EMPTY_HEAD, events);
  assert.deepEqual(await store.protectiveHead(), end);
  assert.equal((await store.read((tx) => tx.list("suppressions").length)), 10);
});

test("a log failure rolls the database back: opt-outs and operator deactivations alike", async () => {
  const sink = new MemoryProtectiveSink();
  const db = await server.newDatabase();
  const { store, identity } = await open(db.pool, sink);
  const id = await store.transaction((tx) => person(tx, 1));
  const op = await identity.addOperator({ email: "op@example.invalid", displayName: "Op", role: "operator" }, new Date());
  sink.beforeAppend = () => {
    throw new SinkUnavailable();
  };
  await assert.rejects(store.transaction((tx) => withdraw(tx, FOUNDER, id, "all")), ProtectiveWriteFailed);
  await assert.rejects(identity.deactivateOperator(op.id, new Date(), FOUNDER.id), ProtectiveWriteFailed);
  assert.equal((await store.read((tx) => tx.list("suppressions").length)), 0);
  assert.equal((await identity.findOperator(op.id))?.active, true, "not deactivated without a durable record");
  assert.equal(sink.objects.size, 0);
});

test("a crash between the log write and the commit is detected and repaired by the worker", async () => {
  const sink = new MemoryProtectiveSink();
  const db = await server.newDatabase();
  let crash = false;
  const { store } = await open(db.pool, sink, {
    afterLog: async () => {
      if (crash) {
        crash = false;
        throw new Error("simulated crash before commit");
      }
    },
  });
  const id = await store.transaction((tx) => person(tx, 1));
  crash = true;
  await assert.rejects(store.transaction((tx) => withdraw(tx, FOUNDER, id, "all")));
  assert.equal(sink.objects.size, 1);
  assert.equal((await store.read((tx) => tx.list("suppressions").length)), 0);
  assert.equal((await checkRecovery(store)).ok, false);
  const tick = await runWorkerTick({ store, providers });
  assert.equal(tick.outcome, "ok");
  assert.equal((await store.read((tx) => tx.list("suppressions").length)), 1);
  assert.equal((await checkRecovery(store)).ok, true);
});

test("full restore from before an opt-out, an erasure, a deactivation, a role change and a gate approval: all re-applied", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const ids = await A.store.transaction((tx) => [person(tx, 1), person(tx, 2)]);
  const founder = await A.identity.addOperator({ email: "f@example.invalid", displayName: "F", role: "founder" }, new Date());
  await A.identity.bindSub(founder.id, "sub-f");
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "operator" }, new Date());
  const rev = await A.identity.addOperator({ email: "r@example.invalid", displayName: "R", role: "reviewer" }, new Date());
  const opSession = await A.identity.createSession(op.id, new Date());

  const backup = await server.cloneDatabase(a.name); // "Monday's backup"

  await A.store.transaction((tx) => withdraw(tx, FOUNDER, ids[0], "all"));
  await A.store.transaction((tx) => eraseProspect(tx, FOUNDER, ids[1], false));
  await A.identity.deactivateOperator(op.id, new Date(), founder.id);
  await A.identity.setRole(rev.id, "operator", founder.id);
  const record = signGate(SECRET, { v: 1, gate: "console", operatorId: founder.id, providerSubject: "sub-f", authTime: new Date().toISOString(), approvedAt: new Date().toISOString(), statement: "x", noticeVersion: null, writtenApprovalRef: null });
  await A.identity.recordGate("console", founder.id, record, new Date());
  assert.equal(sink.objects.size, 5);

  // Restore Monday's backup.
  const B = await open(backup.pool, sink);
  assert.equal((await B.identity.findOperator(op.id))?.active, true, "the restore re-activated the operator");
  assert.ok(await B.identity.resolveSession(opSession, new Date()), "and revived their session");
  const before = await checkRecovery(B.store);
  assert.equal(before.ok, false);
  const report = await reconcile(B.store, SYSTEM, { identity: B.identity });
  assert.equal(report.ok, true);
  assert.equal(report.applied, 5);

  assert.equal((await B.store.read((tx) => tx.get("prospects", ids[1]))), null, "erasure re-applied");
  assert.equal((await B.store.read((tx) => tx.list("suppressions", (s) => !s.liftedAt).length)), 1, "opt-out re-applied");
  assert.equal((await B.identity.findOperator(op.id))?.active, false, "deactivation re-applied");
  assert.equal(await B.identity.resolveSession(opSession, new Date()), null, "revived session ended");
  assert.equal((await B.identity.findOperator(rev.id))?.role, "operator", "role change re-applied");
  const gate = (await B.identity.gates()).find((g) => g.gate === "console")!;
  assert.equal((await verifyGate(gate, SECRET, B.identity)).ok, true, "gate approval re-established and still verifies");
  assert.deepEqual(await B.store.protectiveHead(), await A.store.protectiveHead());
  assert.equal((await checkRecovery(B.store)).ok, true);
});

test("full restore from AFTER the decisions verifies at once", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const id = await A.store.transaction((tx) => person(tx, 1));
  await A.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const backup = await server.cloneDatabase(a.name);
  const B = await open(backup.pool, sink);
  assert.equal((await checkRecovery(B.store)).ok, true);
});

test("two reconcilers at once apply each event exactly once", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const ids = await A.store.transaction((tx) => Array.from({ length: 6 }, (_, i) => person(tx, i)));
  const backup = await server.cloneDatabase(a.name);
  for (const id of ids) {
    await A.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  }
  const B = await open(backup.pool, sink);
  await checkRecovery(B.store);
  const reports = await Promise.allSettled([reconcile(B.store, SYSTEM), reconcile(B.store, FOUNDER)]);
  const applied = reports.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.applied : 0), 0);
  assert.equal(applied, 6, JSON.stringify(reports.map((r) => (r.status === "fulfilled" ? r.value : String(r.reason)))));
  assert.equal((await B.store.read((tx) => tx.list("suppressions").length)), 6);
  await reconcile(B.store, FOUNDER);
  assert.equal((await checkRecovery(B.store)).ok, true);
});

test("an imported snapshot (restore drill) is locked until verified, even with nothing to replay", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const id = await A.store.transaction((tx) => person(tx, 1));
  await A.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const snap = await A.store.exportSnapshot();
  const b = await server.newDatabase();
  const B = await open(b.pool, sink);
  await B.store.importSnapshot(snap);
  const s = await checkRecovery(B.store);
  assert.equal(!s.ok && s.reason, "restore-in-progress");
  assert.equal((await reconcile(B.store, FOUNDER)).ok, true);
  assert.equal((await checkRecovery(B.store)).ok, true);
});
