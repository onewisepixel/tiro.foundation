// Flight Deck 0.2.1: protective events, the recovery gate, and launch-gate
// attribution. In-process stores; the Postgres versions are in
// postgres/recovery.test.ts and the S3 adapter in s3Sink.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SYSTEM } from "./access";
import { FormTokens, InMemoryRateLimiter } from "./abuse";
import { decide, GateError, payloadFor, submitForReview } from "./approvals";
import { PRIVACY_NOTICE_VERSION } from "./config";
import { queueDispatch, recordManualSend, runDueJobs } from "./dispatch";
import { createOutreachDraft } from "./drafts";
import { approveGate, signGate, verifyGate, type GateApproval } from "./gates";
import { DEMO_IDENTITIES } from "./identities";
import { MemoryIdentityStore, type SessionActor } from "./identity";
import { processInterest, recordInterest } from "./intake";
import { liftSuppression } from "./permissions";
import { chainEvents, EMPTY_HEAD, LocalFileProtectiveSink, MemoryProtectiveSink, SinkUnavailable, verifyChain, type ProtectiveEvent } from "./protective";
import { eraseProspect, withdraw } from "./prospects";
import { DisabledEmailProvider, DisabledSocialPublisher, type EmailMessage, type EmailProvider, type ProviderResult } from "./providers";
import { buildLedger, replayLedger } from "./ledger";
import { checkRecovery, markRestored, reconcile } from "./recovery";
import { MemoryOperationsStore, ProtectiveWriteFailed, type OpsState, type OpsTx } from "./store";
import { runWorkerTick } from "./worker";

const [FOUNDER, OPERATOR] = DEMO_IDENTITIES;
const T0 = Date.parse("2026-10-18T09:00:00.000Z");

class CountingProvider implements EmailProvider {
  readonly name = "counting";
  readonly live = false;
  calls: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<ProviderResult> {
    this.calls.push(m);
    return { kind: "confirmed", providerName: this.name, providerMessageId: `m-${this.calls.length}`, requestId: `r-${this.calls.length}` };
  }
}

function world(sink = new MemoryProtectiveSink()) {
  let now = T0;
  const store = new MemoryOperationsStore(() => new Date(now), undefined, { sink, requireJournal: true });
  return { store, sink, clock: () => new Date(now), advance: (ms: number) => (now += ms) };
}

const restoreFrom = (backup: OpsState, w: ReturnType<typeof world>) => new MemoryOperationsStore(w.clock, structuredClone(backup), { sink: w.sink, requireJournal: true });

const person = (tx: OpsTx, n: number) =>
  recordInterest(tx, { displayName: `Synthetic Person ${n}`, email: `p${n}@example.invalid`, category: "community-partner", organization: null, region: null, topics: ["how-a-pilot-works"], updatesOptIn: null, referral: null }).prospectId;

function approvedReply(tx: OpsTx, prospectId: string) {
  const d = createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "reply", subject: "Re: your inquiry", body: "Thank you.", campaignId: null, followUpOf: null, scheduledFor: null });
  submitForReview(tx, OPERATOR, "outreach", d.id);
  decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
  return d.id;
}

const providers = (email: EmailProvider = new DisabledEmailProvider()) => ({ email, social: new DisabledSocialPublisher() });

// ---------- Durability of the decision itself ----------

test("an opt-out is written to the log before it commits; a log failure changes nothing and says so", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  w.sink.beforeAppend = () => {
    throw new SinkUnavailable();
  };
  await assert.rejects(w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all")), ProtectiveWriteFailed);
  const s = await w.store.read((tx) => ({ sups: tx.list("suppressions").length, stage: tx.require("prospects", id).stage }));
  assert.deepEqual(s, { sups: 0, stage: "received" }, "nothing committed");
  assert.equal(w.sink.objects.size, 0);
  // While the log is unreachable, contact is blocked too.
  w.sink.listAfter = async () => {
    throw new SinkUnavailable();
  };
  assert.equal((await checkRecovery(w.store)).ok, false);
});

test("events carry no names, addresses, or notes", async () => {
  const w = world();
  await w.store.transaction((tx) => {
    const a = person(tx, 1);
    const b = person(tx, 2);
    withdraw(tx, FOUNDER, a, "all");
    eraseProspect(tx, FOUNDER, b, true);
  });
  const log = [...w.sink.objects.values()].join("\n");
  assert.ok(w.sink.objects.size >= 3);
  assert.doesNotMatch(log, /@|Synthetic Person|example\.invalid|how-a-pilot-works/);
  for (const raw of w.sink.objects.values()) {
    const e = JSON.parse(raw) as ProtectiveEvent;
    assert.deepEqual(Object.keys(e).sort(), ["body", "hash", "prevHash", "seq", "v"]);
  }
  verifyChain(EMPTY_HEAD, [...w.sink.objects.values()].map((r) => JSON.parse(r)));
});

test("a crash after the log write: the database is behind, contact stops, reconciliation restores the opt-out", async () => {
  const w = world();
  const { id, draftId } = await w.store.transaction((tx) => {
    const id = person(tx, 1);
    const draftId = approvedReply(tx, id);
    queueDispatch(tx, FOUNDER, "outreach", draftId);
    return { id, draftId };
  });
  w.store.failNextCommitAfterLog = true;
  await assert.rejects(w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all")));
  assert.equal((await w.store.read((tx) => tx.list("suppressions").length)), 0, "the database lost it");
  assert.equal(w.sink.objects.size, 1, "the log has it");

  const status = await checkRecovery(w.store);
  assert.deepEqual({ ok: status.ok, reason: !status.ok && status.reason }, { ok: false, reason: "journal-ahead" });
  const provider = new CountingProvider();
  const run = await runDueJobs(w.store, providers(provider));
  assert.equal(run.blocked, "recovery");
  assert.equal(provider.calls.length, 0, "nothing sent while unreconciled");
  await assert.rejects(w.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), (e) => e instanceof GateError && e.code === "recovery-unverified");
  const tokens = new FormTokens("t");
  const intake = await processInterest(
    [["displayName", "X"], ["email", "x@example.invalid"], ["category", "interested-contributor"], ["noticeAck", "yes"], ["replyConsent", "yes"], ["noticeVersion", PRIVACY_NOTICE_VERSION], ["formToken", tokens.issue(T0 - 10_000)]],
    { store: w.store, tokens, limiter: new InMemoryRateLimiter(), clientKey: "c", now: T0, recoveryOk: async () => (await checkRecovery(w.store)).ok },
  );
  assert.equal(intake.status, "refused", "intake takes nothing in either");

  const report = await reconcile(w.store, SYSTEM);
  assert.equal(report.ok, true);
  assert.equal(report.applied, 1);
  assert.equal((await checkRecovery(w.store)).ok, true);
  const after = await w.store.read((tx) => ({ sup: tx.list("suppressions").length, draft: tx.require("outreach", draftId).status }));
  assert.deepEqual(after, { sup: 1, draft: "held" }, "the opt-out is back and holds the queued message");
  await assert.rejects(w.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), GateError);
});

// ---------- Restores ----------

test("restore from a backup taken BEFORE an opt-out and an erasure: both are re-applied before any contact", async () => {
  const w = world();
  const ids = await w.store.transaction((tx) => [person(tx, 1), person(tx, 2)]);
  const backup = w.store.snapshot();
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, ids[0], "all"));
  await w.store.transaction((tx) => eraseProspect(tx, FOUNDER, ids[1], false));

  const restored = restoreFrom(backup, w);
  assert.equal((await checkRecovery(restored)).ok, false);
  const report = await reconcile(restored, FOUNDER);
  assert.equal(report.ok, true);
  const s = await restored.read((tx) => ({ p2: tx.get("prospects", ids[1]), sup: tx.list("suppressions", (x) => !x.liftedAt).length, erasures: tx.list("erasures").length, head: tx.settings().recoveryLock }));
  assert.equal(s.p2, null, "erased again");
  assert.equal(s.sup, 1, "opt-out in force");
  assert.equal(s.erasures, 1);
  assert.equal(s.head, null, "lock cleared");
  assert.deepEqual(await restored.protectiveHead(), await w.store.protectiveHead(), "same position as the log");
});

test("restore from a backup taken AFTER the decisions: verified immediately, nothing to replay", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const restored = restoreFrom(w.store.snapshot(), w);
  assert.equal((await checkRecovery(restored)).ok, true);
});

test("a lift made after the backup is NOT replayed automatically: the opt-out stays in force until a founder confirms", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "outreach", "unsubscribe"));
  const backup = w.store.snapshot();
  const supId = (await w.store.read((tx) => tx.list("suppressions")[0])).id;
  await w.store.transaction((tx) => liftSuppression(tx, FOUNDER, supId));

  const restored = restoreFrom(backup, w);
  const report = await reconcile(restored, FOUNDER);
  assert.equal(report.ok, true);
  assert.deepEqual(report.pendingLifts, [supId]);
  const s = await restored.read((tx) => ({ active: tx.list("suppressions", (x) => !x.liftedAt).length, task: tx.list("tasks", (t) => t.dedupeKey === `lift-confirm:${supId}`).length }));
  assert.deepEqual(s, { active: 1, task: 1 });
  // The founder confirms: a NEW lift event is journaled.
  const before = w.sink.objects.size;
  await restored.transaction((tx) => liftSuppression(tx, FOUNDER, supId));
  assert.equal(w.sink.objects.size, before + 1);
  assert.equal((await restored.read((tx) => tx.list("suppressions", (x) => !x.liftedAt).length)), 0);
});

test("ledger replay never re-applies a lift either: the opt-out stays in force and a founder is asked", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "outreach", "unsubscribe"));
  const backup = w.store.snapshot();
  const supId = (await w.store.read((tx) => tx.list("suppressions")[0])).id;
  await w.store.transaction((tx) => liftSuppression(tx, FOUNDER, supId));
  const ledger = await w.store.read((tx) => buildLedger(tx));

  const restored = new MemoryOperationsStore(w.clock, structuredClone(backup));
  const r1 = await restored.transaction((tx) => replayLedger(tx, FOUNDER, ledger));
  const r2 = await restored.transaction((tx) => replayLedger(tx, FOUNDER, ledger));
  assert.deepEqual(r1, { erased: 0, suppressionsRestored: 0, liftsToConfirm: 1 });
  assert.deepEqual(r2, { erased: 0, suppressionsRestored: 0, liftsToConfirm: 0 }, "asked once");
  const s = await restored.read((tx) => ({ active: tx.list("suppressions", (x) => !x.liftedAt).length, task: tx.list("tasks", (t) => t.dedupeKey === `lift-confirm:${supId}`).length }));
  assert.deepEqual(s, { active: 1, task: 1 });
});

test("a provider restore with nothing to replay is still locked until verified; an integrity lock is never downgraded", async () => {
  const w = world();
  const [id, other] = await w.store.transaction((tx) => [person(tx, 1), person(tx, 2)]);
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const restored = restoreFrom(w.store.snapshot(), w);
  assert.equal((await checkRecovery(restored)).ok, true, "detection alone sees nothing missing");
  await markRestored(restored);
  assert.deepEqual(await checkRecovery(restored).then((r) => (r.ok ? "ok" : r.reason)), "restore-in-progress");
  await assert.rejects(restored.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", approvedReply(tx, other))), /recovery-unverified/);
  const tick = await runWorkerTick({ store: restored, providers: providers() });
  assert.equal(tick.outcome, "ok", "the worker verifies a restore with an intact log and carries on");
  assert.equal((await checkRecovery(restored)).ok, true);

  await restored.transaction((tx) => tx.updateSettings(tx.settings().version, { recoveryLock: { reason: "journal-integrity", since: tx.nowIso } }));
  await markRestored(restored);
  assert.equal((await restored.read((tx) => tx.settings().recoveryLock?.reason)), "journal-integrity");
});

// ---------- Recovery under failure ----------

test("an interrupted recovery stays locked and resumes where it stopped", async () => {
  const w = world();
  const ids = await w.store.transaction((tx) => [person(tx, 1), person(tx, 2), person(tx, 3)]);
  const backup = w.store.snapshot();
  for (const id of ids) {
    await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  }
  const restored = restoreFrom(backup, w);
  const first = await reconcile(restored, FOUNDER, { failAfter: 1 });
  assert.equal(first.interrupted, true);
  assert.equal(first.applied, 1);
  assert.equal((await checkRecovery(restored)).ok, false, "still locked");
  const second = await reconcile(restored, FOUNDER);
  assert.equal(second.ok, true);
  assert.equal(second.applied, 2, "only the remainder");
  assert.equal((await restored.read((tx) => tx.list("suppressions").length)), 3);
});

test("a missing event locks contact for a founder; the worker cannot clear it", async () => {
  const w = world();
  const ids = await w.store.transaction((tx) => [person(tx, 1), person(tx, 2), person(tx, 3)]);
  const backup = w.store.snapshot();
  for (const id of ids) {
    await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  }
  w.sink.objects.delete(2);
  const restored = restoreFrom(backup, w);
  const r = await reconcile(restored, FOUNDER);
  assert.equal(r.ok, false);
  assert.deepEqual(r.integrity, { code: "gap", seq: 3 });
  assert.equal((await restored.read((tx) => tx.list("suppressions").length)), 0, "nothing applied from a broken history");
  assert.equal((await restored.read((tx) => tx.settings().recoveryLock?.reason)), "journal-integrity");
  const tick = await runWorkerTick({ store: restored, providers: providers() });
  assert.equal(tick.outcome, "recovery-locked");
  assert.equal((await reconcile(restored, SYSTEM)).integrity?.code, "founder-required");
});

test("tampered, re-chained, and reordered history is detected", async () => {
  const build = async () => {
    const w = world();
    const ids = await w.store.transaction((tx) => [person(tx, 1), person(tx, 2), person(tx, 3)]);
    const backup = w.store.snapshot();
    for (const id of ids) {
      await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
    }
    return { w, backup };
  };
  // Content altered, hash left alone.
  {
    const { w, backup } = await build();
    const e = JSON.parse(w.sink.objects.get(2)!) as ProtectiveEvent;
    (e.body as { scope: string }).scope = "newsletter";
    w.sink.objects.set(2, JSON.stringify(e));
    assert.equal((await reconcile(restoreFrom(backup, w), FOUNDER)).integrity?.code, "hash-mismatch");
  }
  // Content altered and its own hash recomputed: the next link breaks.
  {
    const { w, backup } = await build();
    const e2 = JSON.parse(w.sink.objects.get(2)!) as ProtectiveEvent;
    (e2.body as { scope: string }).scope = "newsletter";
    const [forged] = chainEvents({ seq: 1, hash: e2.prevHash }, [e2.body]);
    w.sink.objects.set(2, JSON.stringify(forged));
    assert.equal((await reconcile(restoreFrom(backup, w), FOUNDER)).integrity?.code, "chain-break");
  }
  // Two events swapped.
  {
    const { w, backup } = await build();
    const a = w.sink.objects.get(2)!;
    w.sink.objects.set(2, w.sink.objects.get(3)!);
    w.sink.objects.set(3, a);
    assert.ok((await reconcile(restoreFrom(backup, w), FOUNDER)).integrity, "reordering detected");
  }
});

test("duplicate events are applied once", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  const backup = w.store.snapshot();
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  // The same decision appears again later in the log (e.g. a retried write).
  const e1 = JSON.parse(w.sink.objects.get(1)!) as ProtectiveEvent;
  const [dup] = chainEvents({ seq: e1.seq, hash: e1.hash }, [e1.body]);
  await w.sink.append(dup);
  const restored = restoreFrom(backup, w);
  const r = await reconcile(restored, FOUNDER);
  assert.equal(r.ok, true);
  assert.equal(r.applied, 2);
  assert.equal((await restored.read((tx) => tx.list("suppressions").length)), 1);
});

test("a database whose head disagrees with the log is locked (journal-mismatch)", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const snap = w.store.snapshot();
  snap.protectiveHead = { seq: 1, hash: "f".repeat(64) };
  const odd = restoreFrom(snap, w);
  const s = await checkRecovery(odd);
  assert.equal(!s.ok && s.reason, "journal-mismatch");
  assert.equal((await odd.read((tx) => tx.settings().recoveryLock?.reason)), "journal-mismatch");
});

test("the worker reconciles a database that is merely behind, then carries on", async () => {
  const w = world();
  const id = await w.store.transaction((tx) => person(tx, 1));
  const backup = w.store.snapshot();
  await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
  const restored = restoreFrom(backup, w);
  const tick = await runWorkerTick({ store: restored, providers: providers() });
  assert.equal(tick.outcome, "ok");
  assert.equal((await restored.read((tx) => tx.list("suppressions").length)), 1);
});

test("the local file log refuses to overwrite and survives a process restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-plog-"));
  try {
    const sink = new LocalFileProtectiveSink(dir);
    const w = world(sink as unknown as MemoryProtectiveSink);
    const id = await w.store.transaction((tx) => person(tx, 1));
    await w.store.transaction((tx) => withdraw(tx, FOUNDER, id, "all"));
    const again = new LocalFileProtectiveSink(dir);
    const events = await again.listAfter(0, 10);
    assert.equal(events.length, 1);
    await assert.rejects(again.append(events[0]), /already has an event/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Launch-gate attribution ----------

const SECRET = "s".repeat(48);

async function founderSetup() {
  const identity = new MemoryIdentityStore();
  const op = await identity.addOperator({ email: "founder@example.invalid", displayName: "Founder", role: "founder" }, new Date(T0));
  await identity.bindSub(op.id, "sub-founder");
  const actor: SessionActor = { id: op.id, role: "founder", displayName: "Founder", authTime: new Date(T0 - 60_000).toISOString(), providerSubject: "sub-founder" };
  return { identity, op, actor };
}

test("gates: a fresh, verified founder approval is signed and verifies; stale or non-founder approvals are refused", async () => {
  const { identity, op, actor } = await founderSetup();
  const now = new Date(T0);
  await assert.rejects(approveGate({ identity, sessionSecret: SECRET, now }, { ...actor, authTime: new Date(T0 - 11 * 60_000).toISOString() }, { gate: "console", attest: true }), (e) => e instanceof GateError && e.code === "reauth-required");
  await assert.rejects(approveGate({ identity, sessionSecret: SECRET, now }, { ...actor, providerSubject: null }, { gate: "console", attest: true }), (e) => e instanceof GateError && e.code === "reauth-required");
  await assert.rejects(approveGate({ identity, sessionSecret: SECRET, now }, { ...actor, role: "operator" }, { gate: "console", attest: true }), (e) => e instanceof GateError && e.code === "founder-required");
  await assert.rejects(approveGate({ identity, sessionSecret: SECRET, now }, actor, { gate: "console", attest: false }), (e) => e instanceof GateError && e.code === "confirm-required");
  const approval = await approveGate({ identity, sessionSecret: SECRET, now }, actor, { gate: "console", attest: true });
  assert.equal(approval.operatorId, op.id);
  assert.equal(approval.providerSubject, "sub-founder");
  const [record] = await identity.gates();
  assert.deepEqual(await verifyGate(record, SECRET, identity), { ok: true, approval });
  // The public form: never while the notice is a draft.
  await assert.rejects(approveGate({ identity, sessionSecret: SECRET, now }, actor, { gate: "public-form", attest: true, writtenApprovalRef: "Signed letter, 2026-10-18", noticeVersion: PRIVACY_NOTICE_VERSION }), (e) => e instanceof GateError && e.code === "notice-is-draft");
});

test("gates: a typed name, an altered record, a wrong key, or a since-demoted approver opens nothing", async () => {
  const { identity, op, actor } = await founderSetup();
  const now = new Date(T0);
  const cases: [string, Parameters<typeof verifyGate>[0], string][] = [];
  cases.push(["0.2-style free-text row", { gate: "console", approvedBy: "Founder Name", approvedAt: now.toISOString(), detail: { recordedWith: "flight-deck-admin" } }, "unsigned"]);
  const good: GateApproval = { v: 1, gate: "console", operatorId: op.id, providerSubject: "sub-founder", authTime: actor.authTime!, approvedAt: now.toISOString(), statement: "x", noticeVersion: null, writtenApprovalRef: null };
  const signed = JSON.parse(signGate(SECRET, good));
  cases.push(["altered approval", { gate: "console", approvedBy: op.id, approvedAt: now.toISOString(), detail: { record: JSON.stringify({ ...signed, approval: { ...good, operatorId: "usr_someoneelse1" } }) } }, "bad-signature"]);
  cases.push(["signed with another key", { gate: "console", approvedBy: op.id, approvedAt: now.toISOString(), detail: { record: signGate("k".repeat(48), good) } }, "bad-signature"]);
  cases.push(["filed under another gate", { gate: "public-form", approvedBy: op.id, approvedAt: now.toISOString(), detail: { record: signGate(SECRET, good) } }, "wrong-gate"]);
  for (const [name, rec, reason] of cases) {
    const r = await verifyGate(rec, SECRET, identity);
    assert.equal(!r.ok && r.reason, reason, name);
  }
  const valid = { gate: "console" as const, approvedBy: op.id, approvedAt: now.toISOString(), detail: { record: signGate(SECRET, good) } };
  assert.equal((await verifyGate(valid, SECRET, identity)).ok, true);
  await identity.setRole(op.id, "operator");
  assert.equal((await verifyGate(valid, SECRET, identity)).ok, false, "demoted approver");
  await identity.setRole(op.id, "founder");
  await identity.deactivateOperator(op.id, now);
  assert.equal((await verifyGate(valid, SECRET, identity)).ok, false, "deactivated approver");
});
