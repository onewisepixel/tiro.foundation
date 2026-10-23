// Flight Deck 0.2: integration tests against a real PostgreSQL 17 server
// (embedded, temporary, local; see testDb.ts). Covers the store contract,
// concurrency, duplicate requests, revocation and suppression races,
// worker retries and locking, restore, storage failure, operator access,
// permission changes, durable rate limiting, and database-level guards.
//
//   npm run test:flight-deck-pg
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { SYSTEM } from "../access";
import { decide, GateError, payloadFor, submitForReview } from "../approvals";
import { DEFAULT_SETTINGS, SettingsSchema } from "../types";
import { must } from "../schema";
import { queueDispatch, recordManualPublication, recordManualSend, runDueJobs } from "../dispatch";
import { createContentDraft, createOutreachDraft, editContentDraft, editOutreachDraft } from "../drafts";
import { DEMO_IDENTITIES } from "../identities";
import { PostgresIdentityStore, signInOperator } from "../identity";
import { recordInterest } from "../intake";
import { buildLedger, replayLedger } from "../ledger";
import { withdraw } from "../prospects";
import type { EmailMessage, EmailProvider, ProviderResult } from "../providers";
import { DisabledSocialPublisher } from "../providers";
import { buildSeedState } from "../seed";
import { StoreError, StoreUnavailable, type OpsTx } from "../store";
import { buildBriefing } from "../briefing";
import { runWorkerTick } from "../worker";
import { wipeSyntheticDatabase } from "./admin";
import { checksum, migrate, MIGRATIONS } from "./migrations";
import { PostgresRateLimiter } from "./rateLimiter";
import { extractedFields, PostgresOperationsStore } from "./store";
import { startTestServer, type TestServer } from "./testDb";
import { COLLECTIONS } from "../store";

const [FOUNDER, OPERATOR] = DEMO_IDENTITIES;
const PEPPER = "test-pepper-0123456789-0123456789-0123456789";
let server: TestServer;

before(async () => {
  server = await startTestServer();
});
after(async () => {
  await server?.stop();
});

async function fresh(opts: { synthetic?: boolean; beforeWrite?: Parameters<typeof PostgresOperationsStore.open>[0]["beforeWrite"] } = {}) {
  const db = await server.newDatabase({ synthetic: opts.synthetic ?? true });
  const store = await PostgresOperationsStore.open({ pool: db.pool, pepper: PEPPER, synthetic: opts.synthetic ?? true, beforeWrite: opts.beforeWrite });
  return { ...db, store };
}

const interest = (tx: OpsTx, n: number | string) =>
  recordInterest(tx, { displayName: `Synthetic Person ${n}`, email: `p${n}@example.invalid`, category: "community-partner", organization: null, region: null, topics: ["how-a-pilot-works"], updatesOptIn: null, referral: null });

function approvedReply(tx: OpsTx, prospectId: string) {
  const d = createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "reply", subject: "Re: your inquiry", body: "Thank you.", campaignId: null, followUpOf: null, scheduledFor: null });
  submitForReview(tx, OPERATOR, "outreach", d.id);
  decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
  return d.id;
}

class CountingProvider implements EmailProvider {
  readonly name = "test-counting";
  readonly live = false;
  calls: EmailMessage[] = [];
  constructor(private script: ProviderResult[] = []) {}
  async send(m: EmailMessage): Promise<ProviderResult> {
    this.calls.push(m);
    return this.script.shift() ?? { kind: "confirmed", providerName: this.name, providerMessageId: `m-${m.idempotencyKey}`, requestId: `r-${this.calls.length}` };
  }
}

// ---------- Schema ----------

test("migrations: apply once, re-run as a no-op, refuse a changed migration; defaults and columns line up", async () => {
  const db = await server.newDatabase({ migrateIt: false });
  const client = await db.pool.connect();
  try {
    const first = await migrate(client);
    const second = await migrate(client);
    assert.deepEqual(first.applied, MIGRATIONS.map((m) => m.id));
    assert.deepEqual(second.applied, []);
    const tampered = MIGRATIONS.map((m, i) => (i === 0 ? { ...m, sql: `${m.sql}\n-- edited` } : m));
    await assert.rejects(migrate(client, tampered), /has changed since it was applied/);
    assert.notEqual(checksum(MIGRATIONS[0].sql), checksum(tampered[0].sql));
    const { rows } = await client.query("select doc from fd_settings where id = 1");
    // The frozen 0001 literal predates later settings fields; read through
    // the schema (missing nullish fields become null) it must still equal
    // today's defaults.
    assert.deepEqual(must(SettingsSchema, rows[0].doc), DEFAULT_SETTINGS, "the frozen settings literal still equals DEFAULT_SETTINGS");
    // Every foreign key and unique field the domain declares is a real column.
    const cols = await client.query("select table_name, column_name from information_schema.columns where table_name like 'fd_%'");
    const have = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const table = (c: string) => `fd_${c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`;
    for (const c of COLLECTIONS.filter((c) => c !== "audit" && c !== "funnel")) {
      for (const f of extractedFields(c)) {
        assert.ok(have.has(`${table(c)}.${f.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`), `${c}.${f}`);
      }
    }
  } finally {
    client.release();
  }
});

test("database guards: the audit trail cannot be edited, deleted or truncated, even with direct SQL", async () => {
  const { store, pool } = await fresh();
  await store.transaction((tx) => interest(tx, 1));
  await assert.rejects(pool.query("update fd_audit set doc = '{}'::jsonb"), /append-only/);
  await assert.rejects(pool.query("delete from fd_audit"), /append-only/);
  await assert.rejects(pool.query("truncate fd_audit"), /append-only/);
  await assert.rejects(pool.query("insert into fd_prospects (id, version, doc, organization_id) values ('prs_x', 1, '{}'::jsonb, 'org_missing')"), /foreign key/);
});

test("store identity: a synthetic database refuses a real-data store and vice versa; a wipe refuses real data", async () => {
  const syn = await server.newDatabase({ synthetic: true });
  await assert.rejects(PostgresOperationsStore.open({ pool: syn.pool, pepper: PEPPER, synthetic: false }), /refusing/);
  const real = await server.newDatabase({ synthetic: false });
  await assert.rejects(PostgresOperationsStore.open({ pool: real.pool, pepper: PEPPER, synthetic: true }), /refusing/);
  await assert.rejects(wipeSyntheticDatabase(real.pool), /not marked synthetic/);
  const store = await PostgresOperationsStore.open({ pool: real.pool, pepper: PEPPER, synthetic: false });
  await store.transaction((tx) => interest(tx, 1));
  const rows = await store.read((tx) => tx.list("prospects"));
  assert.equal(rows[0].synthetic, false, "real store writes real rows");
  await assert.rejects(PostgresOperationsStore.open({ pool: real.pool, pepper: "short", synthetic: false }), /pepper/);
});

// ---------- Contract parity ----------

test("contract: validation, versions, FKs, uniqueness and rollback behave as in the in-process store", async () => {
  const { store } = await fresh();
  const { prospectId } = await store.transaction((tx) => interest(tx, 1));
  const p = await store.read((tx) => tx.require("prospects", prospectId));
  await assert.rejects(store.transaction((tx) => tx.update("prospects", p.id, p.version + 3, { priority: "high" })), (e) => e instanceof StoreError && e.code === "version-conflict");
  await assert.rejects(store.transaction((tx) => tx.update("prospects", p.id, p.version, { organizationId: "org_doesnotexist1" })), (e) => e instanceof StoreError && e.code === "foreign-key");
  await assert.rejects(
    store.transaction((tx) => {
      tx.update("prospects", p.id, p.version, { priority: "high" });
      throw new Error("boom");
    }),
  );
  assert.equal((await store.read((tx) => tx.require("prospects", p.id))).priority, "normal", "rolled back");
  await store.transaction((tx) => tx.update("prospects", p.id, p.version, { priority: "high" }));
  assert.equal((await store.read((tx) => tx.require("prospects", p.id))).version, p.version + 1);
  const page = await store.auditPage(0, 10);
  assert.ok(page.total >= 1 && page.events[0].action);
});

test("contract: the whole synthetic seed round-trips through Postgres and briefs identically", async () => {
  const { store } = await fresh();
  const now = new Date("2026-10-17T09:00:00.000Z");
  const seed = await buildSeedState(now, { pepper: PEPPER });
  await store.importSnapshot(seed);
  const exported = await store.exportSnapshot();
  for (const c of COLLECTIONS) {
    const a = Object.keys(seed.collections[c]).sort();
    const b = Object.keys(exported.collections[c]).sort();
    assert.deepEqual(b, a, c);
  }
  // An import is a restore: it arrives locked until the recovery gate has
  // checked it against the protective log.
  assert.equal(exported.settings.recoveryLock?.reason, "restore-in-progress");
  assert.deepEqual({ ...exported.settings, recoveryLock: null }, seed.settings);
  const briefing = await store.read((tx) => buildBriefing(tx));
  assert.ok(briefing.nextActions.length > 0 && briefing.newInquiries.length >= 2);
});

// ---------- Concurrency and duplicate requests ----------

test("concurrency: 12 people submitting at once all land; the same person 8 times at once lands once with one acknowledgement", async () => {
  const { store } = await fresh();
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.transaction((tx) => interest(tx, i))));
  await Promise.all(Array.from({ length: 8 }, () => store.transaction((tx) => interest(tx, "same"))));
  const s = await store.read((tx) => ({
    people: tx.list("prospects").length,
    same: tx.list("prospects", (p) => p.displayName === "Synthetic Person same").length,
    subs: tx.list("submissions").length,
    acks: tx.list("jobs", (j) => j.kind === "send-acknowledgement").length,
    triage: tx.list("tasks", (t) => t.type === "triage" && t.status === "open").length,
  }));
  assert.equal(s.people, 13);
  assert.equal(s.same, 1);
  assert.equal(s.subs, 20);
  assert.equal(s.acks, 13, "one acknowledgement per person, never per submission");
  assert.equal(s.triage, 13, "one open triage task per person");
});

test("concurrency: two people editing the same draft from the same version: exactly one wins", async () => {
  const { store } = await fresh();
  const draftId = await store.transaction((tx) => {
    const { prospectId } = interest(tx, 1);
    return createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "reply", subject: "s", body: "b", campaignId: null, followUpOf: null, scheduledFor: null }).id;
  });
  const version = (await store.read((tx) => tx.require("outreach", draftId))).version;
  const results = await Promise.allSettled(["edit A", "edit B", "edit C"].map((body) => store.transaction((tx) => editOutreachDraft(tx, OPERATOR, draftId, version, { subject: "s", body, scheduledFor: null }))));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results.filter((r) => r.status === "rejected")) {
    assert.ok((r as PromiseRejectedResult).reason instanceof StoreError && (r as PromiseRejectedResult).reason.code === "version-conflict");
  }
  assert.equal((await store.read((tx) => tx.require("outreach", draftId))).versions.length, 2);
});

test("duplicate requests: queuing the same approved message from two requests at once makes one job; two runners send it once", async () => {
  const { store } = await fresh();
  const draftId = await store.transaction((tx) => approvedReply(tx, interest(tx, 1).prospectId));
  const jobs = await Promise.all([1, 2, 3].map(() => store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId).id).catch((e) => e)));
  const ids = new Set(jobs.filter((j) => typeof j === "string"));
  assert.equal(ids.size, 1);
  assert.equal((await store.read((tx) => tx.list("jobs", (j) => j.kind === "send-outreach"))).length, 1);
  const provider = new CountingProvider();
  await Promise.all([runDueJobs(store, { email: provider, social: new DisabledSocialPublisher() }), runDueJobs(store, { email: provider, social: new DisabledSocialPublisher() })]);
  assert.equal(provider.calls.filter((c) => c.purpose === "outreach").length, 1, "claimed by exactly one runner");
  assert.equal((await store.read((tx) => tx.list("receipts", (r) => r.subjectType === "outreach"))).length, 1);
});

test("stale content approval: Postgres refuses both dispatch paths without writing jobs or receipts", async () => {
  // Recreate the staging sequence entirely in a disposable synthetic database.
  // No identity session, provider, network dispatch, or cloud staging access is involved.
  const { store, pool } = await fresh();
  const contentId = await store.transaction((tx) => {
    const c = createContentDraft(tx, FOUNDER, {
      campaignId: null,
      title: "TIRO TEST — Approval Versioning Fixture",
      channel: "linkedin",
      originCategory: "abstraction",
      sourceReference: "Internal synthetic QA",
      assetDescription: null,
      assetPermission: null,
      body: "SYNTHETIC STAGING TEST — version A. DO NOT PUBLISH.",
      scheduledFor: null,
    });
    submitForReview(tx, FOUNDER, "content", c.id);
    decide(tx, FOUNDER, "content", c.id, "approved", payloadFor(tx, "content", c.id).hash);
    return c.id;
  });

  await store.transaction((tx) => {
    const c = tx.require("content", contentId);
    editContentDraft(tx, FOUNDER, c.id, c.version, {
      title: c.title,
      channel: c.channel,
      originCategory: c.originCategory,
      sourceReference: c.sourceReference,
      assetDescription: c.assetDescription,
      assetPermission: c.assetPermission,
      body: "SYNTHETIC STAGING TEST — version B, edited after approval. DO NOT PUBLISH.",
      scheduledFor: c.scheduledFor,
    });
  });

  const state = await store.read((tx) => ({
    version: tx.require("content", contentId).currentVersion,
    status: tx.require("content", contentId).status,
    approvals: tx.list("approvals", (a) => a.subjectId === contentId).map((a) => ({
      version: a.subjectVersion,
      state: a.state,
      reason: a.invalidatedReason,
    })),
  }));
  assert.deepEqual(state, {
    version: 2,
    status: "draft",
    approvals: [{ version: 1, state: "invalidated", reason: "content-edited" }],
  });

  // Count physical PostgreSQL rows before and after both rejected attempts.
  const counts = "SELECT (SELECT count(*)::int FROM fd_jobs) AS jobs, (SELECT count(*)::int FROM fd_receipts) AS receipts, (SELECT count(*)::int FROM fd_audit) AS audit_events";
  const before = (await pool.query(counts)).rows[0];
  assert.equal(before.jobs, 0);
  assert.equal(before.receipts, 0);

  await assert.rejects(
    store.transaction((tx) => queueDispatch(tx, FOUNDER, "content", contentId)),
    (e) => e instanceof GateError && e.code === "no-approval",
  );
  await assert.rejects(
    store.transaction((tx) => recordManualPublication(tx, FOUNDER, contentId, null)),
    (e) => e instanceof GateError && e.code === "no-approval",
  );

  const after = (await pool.query(counts)).rows[0];
  assert.deepEqual(after, before, "blocked actions create neither dispatch, receipt nor audit side effects");
  assert.equal((await store.read((tx) => tx.require("content", contentId))).status, "draft");
});

// ---------- Races ----------

test("race: an opt-out committed while a dispatch is being prepared wins; nothing is sent", async () => {
  let other: PostgresOperationsStore | null = null;
  let fired = false;
  const { store, pool } = await fresh({
    beforeWrite: async () => {
      // The worst moment: the dispatcher has read approval and permission
      // and is about to write. Another request now commits the opt-out.
      if (armed && !fired) {
        fired = true;
        await other!.transaction((tx) => withdraw(tx, SYSTEM, prospectId, "all", "unsubscribe"));
      }
    },
  });
  other = await PostgresOperationsStore.open({ pool, pepper: PEPPER, synthetic: true });
  let armed = false;
  let prospectId = "";
  const draftId = await store.transaction((tx) => {
    prospectId = interest(tx, 1).prospectId;
    const d = approvedReply(tx, prospectId);
    queueDispatch(tx, FOUNDER, "outreach", d);
    return d;
  });
  const provider = new CountingProvider();
  armed = true;
  await runDueJobs(store, { email: provider, social: new DisabledSocialPublisher() });
  assert.ok(fired, "the race was actually staged");
  assert.equal(provider.calls.filter((c) => c.purpose === "outreach").length, 0, "the suppression won");
  const s = await store.read((tx) => ({ job: tx.list("jobs", (j) => j.subjectId === draftId)[0], receipts: tx.list("receipts").length }));
  assert.equal(s.job.status, "cancelled");
  assert.equal(s.receipts, 0);
});

test("race: an edit committed while a manual send is being recorded revokes it; the send is refused", async () => {
  let fired = false;
  let other: PostgresOperationsStore | null = null;
  let draftId = "";
  let armed = false;
  const { store, pool } = await fresh({
    beforeWrite: async () => {
      if (armed && !fired) {
        fired = true;
        await other!.transaction((tx) => {
          const d = tx.require("outreach", draftId);
          editOutreachDraft(tx, OPERATOR, draftId, d.version, { subject: "Re: your inquiry", body: "Thank you, edited.", scheduledFor: null });
        });
      }
    },
  });
  other = await PostgresOperationsStore.open({ pool, pepper: PEPPER, synthetic: true });
  draftId = await store.transaction((tx) => approvedReply(tx, interest(tx, 1).prospectId));
  armed = true;
  await assert.rejects(store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), (e) => e instanceof GateError && (e.code === "no-approval" || e.code === "approval-does-not-match-content"));
  assert.ok(fired);
  assert.equal((await store.read((tx) => tx.list("receipts").length)), 0);
});

// ---------- Worker ----------

test("worker: retries a failed send with the same key and records one receipt; a second concurrent tick is locked out", async () => {
  const { store, pool } = await fresh();
  await store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", approvedReply(tx, interest(tx, 1).prospectId)));
  const provider = new CountingProvider([{ kind: "confirmed", providerName: "t", providerMessageId: "ack", requestId: "r0" }, { kind: "failed", retryable: true, code: "timeout" }]);
  const providers = { email: provider, social: new DisabledSocialPublisher() };
  const lock = async () => {
    const c = await pool.connect();
    const { rows } = await c.query("select pg_try_advisory_lock(hashtext('flight-deck-worker')) as ok");
    if (!rows[0].ok) {
      c.release();
      return null;
    }
    return async () => {
      await c.query("select pg_advisory_unlock(hashtext('flight-deck-worker'))");
      c.release();
    };
  };
  const [a, b] = await Promise.all([runWorkerTick({ store, providers, acquireLock: lock }), runWorkerTick({ store, providers, acquireLock: lock })]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ["ok", "skipped-locked"]);
  // Make the retry due, then tick again.
  await pool.query("update fd_jobs set doc = jsonb_set(doc, '{nextAttemptAt}', to_jsonb('2000-01-01T00:00:00.000Z'::text)) where doc->>'status' = 'queued'");
  await runWorkerTick({ store, providers, acquireLock: lock });
  const outreachCalls = provider.calls.filter((c) => c.purpose === "outreach");
  assert.equal(outreachCalls.length, 2);
  assert.equal(new Set(outreachCalls.map((c) => c.idempotencyKey)).size, 1);
  assert.equal((await store.read((tx) => tx.list("receipts", (r) => r.subjectType === "outreach"))).length, 1);
});

// ---------- Restore ----------

test("restore: a logical backup restores into a fresh database, and the ledger replays later erasures and opt-outs", async () => {
  const src = await fresh();
  const ids = await src.store.transaction((tx) => [interest(tx, 1).prospectId, interest(tx, 2).prospectId]);
  const backup = await src.store.exportSnapshot();
  await src.store.transaction((tx) => {
    withdraw(tx, FOUNDER, ids[1], "all");
  });
  const { eraseProspect } = await import("../prospects");
  await src.store.transaction((tx) => eraseProspect(tx, FOUNDER, ids[0], false));
  const ledger = await src.store.read((tx) => buildLedger(tx));

  const target = await fresh();
  await target.store.importSnapshot(backup);
  assert.equal((await target.store.read((tx) => tx.list("prospects").length)), 2, "backup restored as it was");
  const r = await target.store.transaction((tx) => replayLedger(tx, FOUNDER, ledger));
  assert.deepEqual(r, { erased: 1, suppressionsRestored: 1, liftsToConfirm: 0 });
  const s = await target.store.read((tx) => ({ p1: tx.get("prospects", ids[0]), sup: tx.list("suppressions").length }));
  assert.equal(s.p1, null);
  assert.equal(s.sup, 1);
  await assert.rejects(target.store.importSnapshot(backup), /empty/, "never imports over existing data");
});

// ---------- Storage failure ----------

test("storage failure: an unreachable database and a connection killed mid-write both surface as unavailable, with nothing committed", async () => {
  const dead = new pg.Pool({ connectionString: `postgresql://fd_test:${server.password}@127.0.0.1:1/none`, connectionTimeoutMillis: 1500 });
  await assert.rejects(PostgresOperationsStore.open({ pool: dead, pepper: PEPPER, synthetic: true }), (e) => e instanceof StoreUnavailable);
  await dead.end();

  let kill = false;
  const { store } = await fresh({
    beforeWrite: async (client) => {
      if (kill) {
        kill = false;
        await client.query("select pg_terminate_backend(pg_backend_pid())").catch(() => undefined);
      }
    },
  });
  kill = true;
  await assert.rejects(store.transaction((tx) => interest(tx, 1)), (e) => e instanceof StoreUnavailable);
  assert.equal((await store.read((tx) => tx.list("prospects").length)), 0, "nothing half-written");
  await store.transaction((tx) => interest(tx, 1));
  assert.equal((await store.read((tx) => tx.list("prospects").length)), 1, "the pool recovers");
});

// ---------- Operator access and permission changes ----------

test("operators: sessions stored as hashes; deactivation and role changes apply on the next request", async () => {
  const { pool } = await fresh();
  const id = new PostgresIdentityStore(pool);
  const now = new Date();
  const op = await id.addOperator({ email: "op@example.invalid", displayName: "Op", role: "operator" }, now);
  const { token } = await signInOperator(id, { sub: "sub-op", email: "op@example.invalid" }, now);
  const raw = await pool.query("select id_hash from fd_sessions");
  assert.ok(raw.rows.every((r) => r.id_hash !== token && /^[a-f0-9]{64}$/.test(r.id_hash)), "only hashes stored");
  assert.equal((await id.resolveSession(token, now))?.role, "operator");
  await id.setRole(op.id, "reviewer");
  assert.equal((await id.resolveSession(token, now))?.role, "reviewer");
  await id.deactivateOperator(op.id, now);
  assert.equal(await id.resolveSession(token, now), null);
  assert.equal((await pool.query("select count(*)::int n from fd_sessions where revoked_at is null")).rows[0].n, 0);
  await id.recordGate("console", op.id, JSON.stringify({ note: "test" }), now);
  assert.equal((await id.gates())[0].gate, "console");
});

// ---------- Durable rate limiting ----------

test("rate limits: counted exactly under concurrency and shared between server instances", async () => {
  const { url } = await server.newDatabase();
  const a = new pg.Pool({ connectionString: url, max: 5 });
  const b = new pg.Pool({ connectionString: url, max: 5 });
  try {
    const la = new PostgresRateLimiter(a);
    const lb = new PostgresRateLimiter(b);
    const now = Date.parse("2026-10-17T09:10:00.000Z");
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? la : lb).hit("client:abc", 5, 3_600_000, now)));
    assert.equal(results.filter(Boolean).length, 5, "exactly the limit, across two instances");
    assert.equal(await la.hit("client:abc", 5, 3_600_000, now + 3_600_000), true, "a new window");
    assert.equal(await la.purgeOlderThan(new Date("2026-10-17T10:00:00.000Z")), 1, "only the expired window");
  } finally {
    await a.end();
    await b.end();
  }
});
