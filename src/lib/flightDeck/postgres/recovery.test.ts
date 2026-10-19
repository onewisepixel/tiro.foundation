// Flight Deck 0.2.1 (with the 0.2.1 review corrections): protective events
// and recovery against a real
// PostgreSQL 17 (embedded, temporary, local). Restores are full-database
// clones taken at a chosen moment (CREATE DATABASE ... TEMPLATE), the
// closest local stand-in for a provider snapshot or point-in-time restore.
//
//   npm run test:flight-deck-pg
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM } from "../access";
import { approveGate, signGate, verifyGate } from "../gates";
import { DEMO_IDENTITIES } from "../identities";
import { PostgresIdentityStore, type IdentityStore, type SessionActor } from "../identity";
import { queueDispatch } from "../dispatch";
import { createOutreachDraft } from "../drafts";
import { decide, payloadFor, submitForReview } from "../approvals";
import { recordInterest } from "../intake";
import { MemoryProtectiveSink, SinkUnavailable, verifyChain, EMPTY_HEAD, type ProtectiveEvent } from "../protective";
import { eraseProspect, withdraw } from "../prospects";
import { DisabledEmailProvider, DisabledSocialPublisher } from "../providers";
import { checkRecovery, reconcile } from "../recovery";
import { ProtectiveWriteFailed, type OperationsStore, type OpsTx } from "../store";
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

async function open(pool: import("pg").Pool, sink: MemoryProtectiveSink, extra: Partial<Parameters<typeof PostgresOperationsStore.open>[0]> = {}, identityCrash?: { armed: boolean }) {
  const store = await PostgresOperationsStore.open({ pool, pepper: PEPPER, synthetic: true, sink, requireJournal: true, ...extra });
  const identity = new PostgresIdentityStore(pool, {
    sink,
    requireJournal: true,
    synthetic: true,
    afterLog: async () => {
      if (identityCrash?.armed) {
        identityCrash.armed = false;
        throw new Error("simulated crash after the log write, before COMMIT");
      }
    },
  });
  return { store, identity };
}

// Crash injection for recovery itself, without production hooks.
// An identity store whose replay applies the change and then "crashes"
// before the head can advance.
function crashAfterReplay(identity: IdentityStore, times = 1): IdentityStore {
  let left = times;
  return new Proxy(identity, {
    get(target, key) {
      if (key === "replay") {
        return async (...args: Parameters<IdentityStore["replay"]>) => {
          await target.replay(...args);
          if (left-- > 0) {
            throw new Error("simulated crash after an identity replay, before the head advanced");
          }
        };
      }
      const v = (target as unknown as Record<PropertyKey, unknown>)[key];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
// A store whose next head-advancing (replay) transaction does its work and
// then fails before COMMIT.
function crashInsideReplayTx(store: OperationsStore): OperationsStore {
  let armed = true;
  return new Proxy(store, {
    get(target, key) {
      if (key === "transaction") {
        return (fn: (tx: OpsTx) => unknown, o?: { replayHead?: unknown }) =>
          target.transaction((tx) => {
            const r = fn(tx);
            if (o?.replayHead && armed) {
              armed = false;
              throw new Error("simulated crash inside the head-advancing transaction");
            }
            return r;
          }, o as never);
      }
      const v = (target as unknown as Record<PropertyKey, unknown>)[key];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

const tasksLike = (store: OperationsStore, prefix: string) => store.read((tx) => tx.list("tasks", (t) => (t.dedupeKey ?? "").startsWith(prefix)).length);

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

test("full restore from before an opt-out, an erasure, a deactivation, a demotion, an elevation and a gate approval: reductions re-applied, increases left to the founder", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const ids = await A.store.transaction((tx) => [person(tx, 1), person(tx, 2)]);
  const founder = await A.identity.addOperator({ email: "f@example.invalid", displayName: "F", role: "founder" }, new Date());
  await A.identity.bindSub(founder.id, "sub-f");
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "operator" }, new Date());
  const rev = await A.identity.addOperator({ email: "r@example.invalid", displayName: "R", role: "reviewer" }, new Date());
  const f2 = await A.identity.addOperator({ email: "f2@example.invalid", displayName: "F2", role: "founder" }, new Date());
  const opSession = await A.identity.createSession(op.id, new Date());
  const f2Session = await A.identity.createSession(f2.id, new Date());

  const backup = await server.cloneDatabase(a.name); // "Monday's backup"

  await A.store.transaction((tx) => withdraw(tx, FOUNDER, ids[0], "all"));
  await A.store.transaction((tx) => eraseProspect(tx, FOUNDER, ids[1], false));
  await A.identity.deactivateOperator(op.id, new Date(), founder.id);
  await A.identity.setRole(rev.id, "operator", founder.id); // lateral: adds editing
  await A.identity.setRole(f2.id, "reviewer", founder.id); // demotion
  const record = signGate(SECRET, { v: 1, gate: "console", operatorId: founder.id, providerSubject: "sub-f", authTime: new Date().toISOString(), approvedAt: new Date().toISOString(), statement: "x", noticeVersion: null, writtenApprovalRef: null });
  await A.identity.recordGate("console", founder.id, record, new Date());
  assert.equal(sink.objects.size, 6);

  // Restore Monday's backup.
  const B = await open(backup.pool, sink);
  assert.equal((await B.identity.findOperator(op.id))?.active, true, "the restore re-activated the operator");
  assert.ok(await B.identity.resolveSession(opSession, new Date()), "and revived their session");
  const before = await checkRecovery(B.store);
  assert.equal(before.ok, false);
  const report = await reconcile(B.store, SYSTEM, { identity: B.identity });
  assert.equal(report.ok, true);
  assert.equal(report.applied, 6, "every event passed, so the head reached the end of the log");
  assert.deepEqual(report.notReapplied.sort(), ["gate:console", `role:${logEvents(sink)[3].body.id}`].sort());

  assert.equal((await B.store.read((tx) => tx.get("prospects", ids[1]))), null, "erasure re-applied");
  assert.equal((await B.store.read((tx) => tx.list("suppressions", (s) => !s.liftedAt).length)), 1, "opt-out re-applied");
  assert.equal((await B.identity.findOperator(op.id))?.active, false, "deactivation re-applied");
  assert.equal(await B.identity.resolveSession(opSession, new Date()), null, "revived session ended");
  assert.equal(await B.identity.resolveSession(f2Session, new Date()), null, "every revived session ended");
  assert.equal(report.sessionsEnded > 0, true);
  assert.equal((await B.identity.findOperator(f2.id))?.role, "reviewer", "demotion re-applied");
  assert.equal((await B.identity.findOperator(rev.id))?.role, "reviewer", "a change that adds capabilities is NOT re-applied");
  assert.equal((await B.identity.gates()).length, 0, "a gate approval is NOT re-applied from the log");
  assert.equal(await tasksLike(B.store, "role-confirm:"), 1, "the founder is asked about the role change");
  assert.equal(await tasksLike(B.store, "gate-confirm:"), 1, "and about the gate");
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

// ---------- 0.2.1 review corrections: nothing that increases access is
// re-applied from the log; recovery is interrupt-safe; restored copies are
// fenced ----------

test("crash injection: a role elevation that failed to commit never takes effect", async () => {
  const sink = new MemoryProtectiveSink();
  const crash = { armed: false };
  const db = await server.newDatabase();
  const A = await open(db.pool, sink, {}, crash);
  const founder = await A.identity.addOperator({ email: "f@example.invalid", displayName: "F", role: "founder" }, new Date());
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "operator" }, new Date());
  crash.armed = true;
  await assert.rejects(A.identity.setRole(op.id, "founder", founder.id), /simulated crash/);
  assert.equal((await A.identity.findOperator(op.id))?.role, "operator", "not committed");
  assert.equal(sink.objects.size, 1, "but the event is in the log");
  const locked = await checkRecovery(A.store);
  assert.equal(!locked.ok && locked.reason, "journal-ahead", "contact and the console stop");

  const tick = await runWorkerTick({ store: A.store, providers, identity: A.identity });
  assert.equal(tick.outcome, "ok");
  assert.equal((await A.identity.findOperator(op.id))?.role, "operator", "recovery did not elevate");
  assert.equal(await tasksLike(A.store, "role-confirm:"), 1);
  assert.deepEqual(await A.store.protectiveHead(), { seq: 1, hash: logEvents(sink)[0].hash }, "the head moved past it exactly once");
  assert.equal((await checkRecovery(A.store)).ok, true);
});

test("crash injection: a gate approval that failed to commit never opens the console or the public form", async () => {
  const sink = new MemoryProtectiveSink();
  const crash = { armed: false };
  const db = await server.newDatabase();
  const A = await open(db.pool, sink, {}, crash);
  const op = await A.identity.addOperator({ email: "f@example.invalid", displayName: "F", role: "founder" }, new Date());
  await A.identity.bindSub(op.id, "sub-f");
  const now = new Date();
  const actor: SessionActor = { id: op.id, role: "founder", displayName: "F", providerSubject: "sub-f", authTime: now.toISOString() };
  crash.armed = true;
  await assert.rejects(approveGate({ identity: A.identity, sessionSecret: SECRET, now }, actor, { gate: "console", attest: true }), /simulated crash/);
  assert.equal((await A.identity.gates()).length, 0);
  // The log is now ahead: nothing protective is accepted until recovery.
  await assert.rejects(approveGate({ identity: A.identity, sessionSecret: SECRET, now }, actor, { gate: "console", attest: true }), /recovery verification is required/);
  const first = await reconcile(A.store, FOUNDER, { identity: A.identity });
  assert.deepEqual(first.notReapplied, ["gate:console"]);
  // The public form, recorded directly (its approval path also needs a
  // final privacy notice, which does not exist yet).
  const form = signGate(SECRET, { v: 1, gate: "public-form", operatorId: op.id, providerSubject: "sub-f", authTime: now.toISOString(), approvedAt: now.toISOString(), statement: "x", noticeVersion: "v", writtenApprovalRef: "written approval ref" });
  crash.armed = true;
  await assert.rejects(A.identity.recordGate("public-form", op.id, form, now), /simulated crash/);
  assert.equal((await A.identity.gates()).length, 0);
  assert.equal(sink.objects.size, 2);

  const report = await reconcile(A.store, FOUNDER, { identity: A.identity });
  assert.equal(report.ok, true);
  assert.deepEqual(report.notReapplied, ["gate:public-form"]);
  assert.equal((await A.identity.gates()).length, 0, "neither approval exists after recovery");
  assert.equal(await tasksLike(A.store, "gate-confirm:"), 2);
  assert.equal((await A.store.protectiveHead()).seq, 2);
  // Approving again, properly, works and is journaled as a new event.
  await approveGate({ identity: A.identity, sessionSecret: SECRET, now }, actor, { gate: "console", attest: true });
  const gate = (await A.identity.gates()).find((g) => g.gate === "console")!;
  assert.equal((await verifyGate(gate, SECRET, A.identity)).ok, true);
  assert.equal(sink.objects.size, 3);
});

test("crash injection: an interrupted identity replay re-applies idempotently and the head advances once per event", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const founder = await A.identity.addOperator({ email: "f@example.invalid", displayName: "F", role: "founder" }, new Date());
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "operator" }, new Date());
  const f2 = await A.identity.addOperator({ email: "f2@example.invalid", displayName: "F2", role: "founder" }, new Date());
  const backup = await server.cloneDatabase(a.name);
  await A.identity.deactivateOperator(op.id, new Date(), founder.id);
  await A.identity.setRole(f2.id, "operator", founder.id);

  const B = await open(backup.pool, sink);
  const start = await B.store.protectiveHead();
  // Crash after applying the deactivation, before its head move.
  await assert.rejects(reconcile(B.store, SYSTEM, { identity: crashAfterReplay(B.identity) }), /simulated crash after an identity replay/);
  assert.deepEqual(await B.store.protectiveHead(), start, "the head did not move");
  assert.equal((await B.identity.findOperator(op.id))?.active, false, "the change itself had applied");
  assert.equal((await checkRecovery(B.store)).ok, false, "still locked");
  // Crash after applying the demotion (second event), before its head move.
  const second = await reconcile(B.store, SYSTEM, { identity: crashAfterReplay(B.identity, 2) }).catch((e) => e);
  assert.match(String(second), /simulated crash/);
  assert.equal((await B.store.protectiveHead()).seq, start.seq, "re-applying the first was a no-op that still crashed before advancing");
  // Clean run.
  const done = await reconcile(B.store, SYSTEM, { identity: B.identity });
  assert.equal(done.ok, true);
  assert.equal(done.applied, 2);
  assert.deepEqual(await B.store.protectiveHead(), await A.store.protectiveHead());
  assert.equal((await B.identity.findOperator(op.id))?.active, false);
  assert.equal((await B.identity.findOperator(f2.id))?.role, "operator");
  // Running again changes nothing.
  const again = await reconcile(B.store, SYSTEM, { identity: B.identity });
  assert.equal(again.applied, 0);
});

test("crash injection: a crash inside the transaction that skips an access-increasing event leaves neither its task nor a head move", async () => {
  const sink = new MemoryProtectiveSink();
  const crash = { armed: false };
  const db = await server.newDatabase();
  const A = await open(db.pool, sink, {}, crash);
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "reviewer" }, new Date());
  crash.armed = true;
  await assert.rejects(A.identity.setRole(op.id, "founder"), /simulated crash/);
  await assert.rejects(reconcile(crashInsideReplayTx(A.store), SYSTEM, { identity: A.identity }), /inside the head-advancing transaction/);
  assert.equal((await A.store.protectiveHead()).seq, 0);
  assert.equal(await tasksLike(A.store, "role-confirm:"), 0, "the task rolled back with the head");
  const r = await reconcile(A.store, SYSTEM, { identity: A.identity });
  assert.equal(r.ok, true);
  assert.equal((await A.store.protectiveHead()).seq, 1);
  assert.equal(await tasksLike(A.store, "role-confirm:"), 1, "exactly one task");
  assert.equal((await A.identity.findOperator(op.id))?.role, "reviewer");
});

test("restore fence: a copy restored from before the last healthy run is locked with nothing to replay, refuses contact, ends sessions, then resumes; the old database then fences itself", async () => {
  const sink = new MemoryProtectiveSink();
  const a = await server.newDatabase();
  const A = await open(a.pool, sink);
  const [p1, p2] = await A.store.transaction((tx) => [person(tx, 1), person(tx, 2)]);
  const draft = await A.store.transaction((tx) => {
    const d = createOutreachDraft(tx, FOUNDER, { prospectId: p2, purpose: "reply", subject: "Re", body: "Thanks.", campaignId: null, followUpOf: null, scheduledFor: null });
    submitForReview(tx, FOUNDER, "outreach", d.id);
    decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
    return d.id;
  });
  const op = await A.identity.addOperator({ email: "o@example.invalid", displayName: "O", role: "founder" }, new Date());
  const token = await A.identity.createSession(op.id, new Date());
  assert.equal((await runWorkerTick({ store: A.store, providers, identity: A.identity })).outcome, "ok");
  const backup = await server.cloneDatabase(a.name);
  assert.equal((await runWorkerTick({ store: A.store, providers, identity: A.identity })).outcome, "ok");
  assert.equal(sink.objects.size, 0, "no protective event at all");
  assert.equal(sink.fence, 2);
  void p1;

  const B = await open(backup.pool, sink);
  const s = await checkRecovery(B.store);
  assert.equal(!s.ok && s.reason, "restore-in-progress", "detected without anyone running mark-restored");
  await assert.rejects(B.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draft)), /recovery-unverified/);
  assert.ok(await B.identity.resolveSession(token, new Date()), "the copied session exists until recovery");

  const tick = await runWorkerTick({ store: B.store, providers, identity: B.identity });
  assert.equal(tick.outcome, "ok", "the worker verifies the copy by itself");
  assert.equal(await B.identity.resolveSession(token, new Date()), null, "every session ended");
  assert.equal((await checkRecovery(B.store)).ok, true);
  assert.equal(sink.fence, 3);
  // The old database (still running after a cut-over) is now behind the
  // bucket and locks itself instead of carrying on beside the new one.
  const old = await checkRecovery(A.store);
  assert.equal(!old.ok && old.reason, "restore-in-progress");
});
