// Flight Deck 0.1 domain tests. Numbers in test names refer to the
// acceptance list in docs/flight-deck/acceptance.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AccessDenied, SYSTEM } from "./access";
import { FormTokens, InMemoryRateLimiter, MIN_FILL_MS } from "./abuse";
import { decide, GateError, payloadFor, submitForReview } from "./approvals";
import { decideMode, isLoopbackHost, localDemoActive, publicFormOpen, PRIVACY_NOTICE_VERSION } from "./config";
import { queueDispatch, recordManualPublication, recordManualSend, retryJob, runDueJobs } from "./dispatch";
import { createContentDraft, createOutreachDraft, editContentDraft, editOutreachDraft, setCampaignState } from "./drafts";
import { DEMO_IDENTITIES } from "./identities";
import { processInterest, type IntakeContext } from "./intake";
import { contactEligibility } from "./permissions";
import { createManualProspect, editProspect, eraseProspect, exportProspect, recordInteraction, reviewPermissionBasis, transitionStage, withdraw } from "./prospects";
import { DisabledEmailProvider, DisabledSocialPublisher, LocalOutboxEmailProvider, LocalOutboxSocialPublisher, type EmailMessage, type EmailProvider, type ProviderResult, type Providers } from "./providers";
import { buildSeedState } from "./seed";
import { COLLECTIONS, LocalFileOperationsStore, MemoryOperationsStore, StoreError, type OpsTx } from "./store";
import { buildBriefing, digestText } from "./briefing";
import { ValidationError } from "./schema";

const [FOUNDER, OPERATOR, REVIEWER] = DEMO_IDENTITIES;

function harness(start = Date.parse("2026-10-16T09:00:00.000Z")) {
  let now = start;
  const store = new MemoryOperationsStore(() => new Date(now));
  const tokens = new FormTokens("test-secret");
  const limiter = new InMemoryRateLimiter();
  const advance = (ms: number) => (now += ms);
  const ctx = (client = "client-a"): IntakeContext => ({ store, tokens, limiter, clientKey: client, now });
  // A token issued 10 s before "now", as a person filling the form would have.
  const token = () => tokens.issue(now - 10_000);
  return { store, tokens, limiter, advance, ctx, token, get now() { return now; } };
}

function form(token: string, overrides: Record<string, string | Blob> = {}): [string, string | Blob][] {
  const fields: Record<string, string | Blob> = {
    displayName: "Test Person (synthetic)",
    email: "Person@Example.invalid",
    category: "interested-contributor",
    organization: "",
    region: "",
    note: "Synthetic note.",
    noticeAck: "yes",
    replyConsent: "yes",
    noticeVersion: PRIVACY_NOTICE_VERSION,
    formToken: token,
    website: "",
    ...overrides,
  };
  return Object.entries(fields);
}

const read = <T>(store: MemoryOperationsStore, fn: (tx: OpsTx) => T) => store.transaction(fn);

class ConfirmingProvider implements EmailProvider {
  readonly name = "test-confirming";
  readonly live = false;
  calls: EmailMessage[] = [];
  constructor(private queue: ProviderResult[] = []) {}
  async send(m: EmailMessage): Promise<ProviderResult> {
    this.calls.push(m);
    const queued = m.purpose === "outreach" ? this.queue.shift() : undefined;
    return queued ?? { kind: "confirmed", providerName: this.name, providerMessageId: `msg-${m.idempotencyKey}`, requestId: `req-${this.calls.length}` };
  }
}

const providers = (email: EmailProvider = new DisabledEmailProvider()): Providers => ({ email, social: new DisabledSocialPublisher() });

// ---------- Mode and flags (5, 6, 15) ----------

test("6: local demo cannot be enabled on a real deployment", async (t) => {
  await t.test("off unless explicitly requested", () => {
    assert.equal(decideMode({}).mode, "disabled");
    assert.equal(decideMode({ FLIGHT_DECK_MODE: "production" }).mode, "disabled");
    assert.equal(decideMode({ FLIGHT_DECK_MODE: "true" }).mode, "disabled");
  });
  await t.test("refused in any production build, even if requested", () => {
    assert.equal(decideMode({ FLIGHT_DECK_MODE: "local-demo", NODE_ENV: "production" }).mode, "disabled");
  });
  await t.test("refused when a hosting platform marker is present", () => {
    for (const marker of ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY", "K_SERVICE", "AMPLIFY_APP_ID"]) {
      assert.equal(decideMode({ FLIGHT_DECK_MODE: "local-demo", NODE_ENV: "development", [marker]: "1" }).mode, "disabled", marker);
    }
  });
  await t.test("refused for a non-loopback Host even in development", () => {
    const env = { FLIGHT_DECK_MODE: "local-demo", NODE_ENV: "development" };
    assert.equal(localDemoActive(env, "localhost:3000"), true);
    assert.equal(localDemoActive(env, "127.0.0.1:3000"), true);
    assert.equal(localDemoActive(env, "[::1]:3000"), true);
    for (const host of ["tiro.foundation", "localhost.evil.example", "127.0.0.1.nip.io", "10.0.0.5:3000", "", null]) {
      assert.equal(localDemoActive(env, host), false, String(host));
    }
    assert.equal(isLoopbackHost("LOCALHOST"), true);
  });
  await t.test("15: the public form is closed unless demo AND its own flag are on", () => {
    const env = { FLIGHT_DECK_MODE: "local-demo", NODE_ENV: "development" };
    assert.equal(publicFormOpen(env, "localhost"), false);
    assert.equal(publicFormOpen({ ...env, FLIGHT_DECK_PUBLIC_FORM_ENABLED: "true" }, "localhost"), true);
    assert.equal(publicFormOpen({ FLIGHT_DECK_PUBLIC_FORM_ENABLED: "true", NODE_ENV: "production" }, "tiro.foundation"), false);
  });
});

// ---------- Public intake (1, 2, 3, 4) ----------

test("1: the public form refuses files, unknown fields, oversized bodies and links", async () => {
  const h = harness();
  const file = new Blob(["fake audio"], { type: "audio/mpeg" });
  for (const entries of [
    [...form(h.token()), ["attachment", file]] as [string, string | Blob][],
    form(h.token(), { note: file }),
    [...form(h.token()), ["story", "A long story"]] as [string, string | Blob][],
    [...form(h.token()), ["recordId", "DEMO-MEM-0001"]] as [string, string | Blob][],
    form(h.token(), { note: "x".repeat(5000) }),
  ]) {
    const r = await processInterest(entries as never, h.ctx());
    assert.ok(r.status === "refused" || r.status === "invalid", JSON.stringify(r));
  }
  const tooLong = await processInterest(form(h.token(), { note: "y".repeat(501) }), h.ctx());
  assert.equal(tooLong.status, "invalid");
  const link = await processInterest(form(h.token(), { note: "See https://drive.example/recording" }), h.ctx());
  assert.equal(link.status, "invalid");
  assert.equal((await read(h.store, (tx) => tx.list("prospects"))).length, 0, "nothing stored");
});

test("4: no submission without the privacy acknowledgement; the exact notice version is stored", async () => {
  const h = harness();
  assert.equal((await processInterest(form(h.token(), { noticeAck: "" }), h.ctx())).status, "invalid");
  assert.equal((await processInterest(form(h.token(), { replyConsent: "" }), h.ctx())).status, "invalid");
  assert.equal((await processInterest(form(h.token(), { noticeVersion: "pilot-privacy-draft-0.0" }), h.ctx())).status, "refused");
  assert.equal((await read(h.store, (tx) => tx.list("submissions"))).length, 0);

  assert.deepEqual(await processInterest(form(h.token()), h.ctx()), { status: "received" });
  const [sub] = await read(h.store, (tx) => tx.list("submissions"));
  assert.equal(sub.noticeVersion, PRIVACY_NOTICE_VERSION);
  const [perm] = await read(h.store, (tx) => tx.list("permissions"));
  assert.equal(perm.wordingVersion, PRIVACY_NOTICE_VERSION);
  assert.match(perm.capturedWording ?? "", /reply to me by email/);
});

test("2: interest is not consent to updates, collection, naming, or preservation", async () => {
  const h = harness();
  await processInterest(form(h.token()), h.ctx());
  const state = await read(h.store, (tx) => ({ prospects: tx.list("prospects"), perms: tx.list("permissions") }));
  assert.equal(state.prospects[0].authorityStatus, "unverified");
  assert.deepEqual(state.perms.map((p) => p.purpose), ["direct-response"], "no newsletter without the separate opt-in");
  assert.equal(state.prospects[0].email, "person@example.invalid", "normalized");

  await processInterest(form(h.token(), { email: "other@example.invalid", updatesOptIn: "yes" }), h.ctx("client-b"));
  const perms = await read(h.store, (tx) => tx.list("permissions", (p) => p.purpose === "newsletter"));
  assert.equal(perms.length, 1);
  assert.equal(perms[0].basis, "form-opt-in");
  // The vocabulary itself has no consent-to-collect, preservation, or
  // public-naming purpose, and no "verified" authority value.
  await assert.rejects(h.store.transaction((tx) => tx.update("prospects", state.prospects[0].id, state.prospects[0].version, { authorityStatus: "verified" as never })), ValidationError);
});

test("3: repeat submissions make one record, one acknowledgement, and an identical response", async () => {
  const h = harness();
  const first = await processInterest(form(h.token()), h.ctx());
  h.advance(60_000);
  const second = await processInterest(form(h.token(), { email: "PERSON@example.invalid", displayName: "Different Name" }), h.ctx());
  h.advance(60_000);
  const third = await processInterest(form(h.token()), h.ctx());
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  const s = await read(h.store, (tx) => ({ p: tx.list("prospects"), sub: tx.list("submissions"), jobs: tx.list("jobs"), tasks: tx.list("tasks", (t) => t.status === "open") }));
  assert.equal(s.p.length, 1);
  assert.equal(s.p[0].displayName, "Test Person (synthetic)", "a repeat never overwrites details");
  assert.equal(s.sub.length, 3);
  assert.equal(s.jobs.filter((j) => j.kind === "send-acknowledgement").length, 1);
  assert.equal(s.tasks.length, 1, "one open task, not three");

  // Past the per-address limit: still "received", nothing more stored.
  const fourth = await processInterest(form(h.token()), h.ctx("client-c"));
  assert.deepEqual(fourth, first);
  assert.equal((await read(h.store, (tx) => tx.list("submissions"))).length, 3);
});

test("3: a suppressed address gets the same response and no acknowledgement", async () => {
  const h = harness();
  await processInterest(form(h.token()), h.ctx());
  const p = (await read(h.store, (tx) => tx.list("prospects")))[0];
  await h.store.transaction((tx) => withdraw(tx, FOUNDER, p.id, "all"));
  h.advance(3_600_000);
  const r = await processInterest(form(h.token()), h.ctx("client-z"));
  assert.deepEqual(r, { status: "received" });
  const s = await read(h.store, (tx) => ({ jobs: tx.list("jobs", (j) => j.status === "queued"), tasks: tx.list("tasks", (t) => t.type === "permission-review" && t.status === "open") }));
  assert.equal(s.jobs.length, 0, "the earlier acknowledgement was cancelled and no new one queued");
  assert.equal(s.tasks.length, 1);
});

test("1: bots: honeypot is silently dropped; too-fast and forged tokens are refused", async () => {
  const h = harness();
  assert.deepEqual(await processInterest(form(h.token(), { website: "spam" }), h.ctx()), { status: "received" });
  assert.equal((await processInterest(form(h.tokens.issue(h.now - MIN_FILL_MS + 500)), h.ctx())).status, "refused");
  assert.equal((await processInterest(form("1.abc.forged"), h.ctx())).status, "refused");
  assert.equal((await processInterest(form(h.tokens.issue(h.now - 3 * 3_600_000)), h.ctx())).status, "refused");
  assert.equal((await read(h.store, (tx) => tx.list("prospects"))).length, 0);
  const counters = await read(h.store, (tx) => tx.list("funnel"));
  assert.ok(counters.some((c) => c.event === "abuse-honeypot"));
});

test("1: per-client rate limit", async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) {
    assert.equal((await processInterest(form(h.token(), { email: `p${i}@example.invalid` }), h.ctx())).status, "received");
  }
  assert.equal((await processInterest(form(h.token(), { email: "p9@example.invalid" }), h.ctx())).status, "refused");
});

// ---------- Store contract ----------

test("store: validation, optimistic locking, foreign keys, append-only audit, rollback", async () => {
  const h = harness();
  await processInterest(form(h.token()), h.ctx());
  const p = (await read(h.store, (tx) => tx.list("prospects")))[0];
  await assert.rejects(h.store.transaction((tx) => tx.update("prospects", p.id, p.version + 5, { priority: "high" })), (e) => e instanceof StoreError && e.code === "version-conflict");
  await assert.rejects(h.store.transaction((tx) => tx.update("prospects", p.id, p.version, { organizationId: "org_doesnotexist1" })), (e) => e instanceof StoreError && e.code === "foreign-key");
  await assert.rejects(h.store.transaction((tx) => tx.update("prospects", p.id, p.version, { displayName: "" })), (e) => e instanceof ValidationError);
  const evt = (await read(h.store, (tx) => tx.list("audit")))[0];
  await assert.rejects(h.store.transaction((tx) => tx.update("audit", evt.id, 1, {})), (e) => e instanceof StoreError && e.code === "insert-only");
  await assert.rejects(h.store.transaction((tx) => tx.remove("audit", evt.id)), (e) => e instanceof StoreError && e.code === "insert-only");
  // A throwing transaction leaves no partial write.
  await assert.rejects(
    h.store.transaction((tx) => {
      tx.update("prospects", p.id, p.version, { priority: "high" });
      throw new Error("boom");
    }),
  );
  assert.equal((await read(h.store, (tx) => tx.require("prospects", p.id))).priority, "normal");
});

test("store: the local file adapter persists atomically and refuses foreign files", async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TEMP ?? "/tmp", "fd-test-"));
  const file = path.join(dir, "store.json");
  const a = new LocalFileOperationsStore(file);
  await a.transaction((tx) => tx.updateSettings(tx.settings().version, { followUpDelayDays: 12 }));
  const b = new LocalFileOperationsStore(file);
  assert.equal(await b.transaction((tx) => tx.settings().followUpDelayDays), 12);
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, synthetic: false }));
  await assert.rejects(new LocalFileOperationsStore(file).transaction((tx) => tx.settings()));
  fs.rmSync(dir, { recursive: true });
});

// ---------- Authorization (5) ----------

test("5: authorization is enforced in the domain, not only in the UI", async () => {
  const h = harness();
  await processInterest(form(h.token()), h.ctx());
  const p = (await read(h.store, (tx) => tx.list("prospects")))[0];
  await assert.rejects(h.store.transaction((tx) => createOutreachDraft(tx, REVIEWER, { prospectId: p.id, purpose: "reply", subject: "s", body: "b", campaignId: null, followUpOf: null, scheduledFor: null })), AccessDenied);
  await assert.rejects(h.store.transaction((tx) => eraseProspect(tx, OPERATOR, p.id, true)), AccessDenied);
  await assert.rejects(h.store.transaction((tx) => exportProspect(tx, REVIEWER, p.id)), AccessDenied);
  const d = await h.store.transaction((tx) => {
    const d = createOutreachDraft(tx, OPERATOR, { prospectId: p.id, purpose: "reply", subject: "s", body: "b", campaignId: null, followUpOf: null, scheduledFor: null });
    submitForReview(tx, OPERATOR, "outreach", d.id);
    return d;
  });
  await assert.rejects(h.store.transaction((tx) => decide(tx, OPERATOR, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash)), AccessDenied);
  await assert.rejects(h.store.transaction((tx) => decide(tx, null as never, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash)), AccessDenied);
});

// ---------- Approval binding (7) ----------

async function approvedReply(h: ReturnType<typeof harness>, extra: { scheduledFor?: string | null } = {}) {
  await processInterest(form(h.token()), h.ctx());
  return h.store.transaction((tx) => {
    const p = tx.list("prospects")[0];
    const d = createOutreachDraft(tx, OPERATOR, { prospectId: p.id, purpose: "reply", subject: "Re: your interest", body: "Dear Test, thank you.", campaignId: null, followUpOf: null, scheduledFor: extra.scheduledFor ?? null });
    submitForReview(tx, OPERATOR, "outreach", d.id);
    decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
    return { draftId: d.id, prospectId: p.id };
  });
}

test("7: approval binds exact content, recipient, channel and schedule; edits revoke it", async (t) => {
  await t.test("editing the body revokes approval and blocks every send path", async () => {
    const h = harness();
    const { draftId } = await approvedReply(h);
    await h.store.transaction((tx) => {
      const d = tx.require("outreach", draftId);
      editOutreachDraft(tx, OPERATOR, draftId, d.version, { subject: "Re: your interest", body: "Dear Test, thank you!", scheduledFor: null });
    });
    await assert.rejects(h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId)), (e) => e instanceof GateError && e.code === "no-approval");
    await assert.rejects(h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), GateError);
    const s = await read(h.store, (tx) => ({ d: tx.require("outreach", draftId), a: tx.list("approvals") }));
    assert.equal(s.d.status, "draft");
    assert.equal(s.d.versions.length, 2, "the approved version is kept, immutable");
    assert.equal(s.a[0].state, "invalidated");
  });
  await t.test("changing the recipient address revokes approval", async () => {
    const h = harness();
    const { draftId, prospectId } = await approvedReply(h);
    await h.store.transaction((tx) => {
      const p = tx.require("prospects", prospectId);
      editProspect(tx, FOUNDER, p.id, p.version, { displayName: p.displayName, email: "new@example.invalid", organizationName: null, region: null, priority: "normal", nextAction: null, nextActionDue: null, ownerId: null });
    });
    await assert.rejects(h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), GateError);
  });
  await t.test("changing the schedule revokes approval", async () => {
    const h = harness();
    const { draftId } = await approvedReply(h);
    await h.store.transaction((tx) => {
      const d = tx.require("outreach", draftId);
      const v = d.versions[0];
      editOutreachDraft(tx, OPERATOR, draftId, d.version, { subject: v.subject, body: v.body, scheduledFor: "2026-10-20T09:00:00.000Z" });
    });
    await assert.rejects(h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId)), GateError);
  });
  await t.test("a reviewer cannot approve something that changed after they viewed it", async () => {
    const h = harness();
    await processInterest(form(h.token()), h.ctx());
    const { id, seenHash } = await h.store.transaction((tx) => {
      const p = tx.list("prospects")[0];
      const d = createOutreachDraft(tx, OPERATOR, { prospectId: p.id, purpose: "reply", subject: "s", body: "b", campaignId: null, followUpOf: null, scheduledFor: null });
      submitForReview(tx, OPERATOR, "outreach", d.id);
      return { id: d.id, seenHash: payloadFor(tx, "outreach", d.id).hash };
    });
    // The draft is edited (and resubmitted) between viewing and deciding.
    await h.store.transaction((tx) => {
      const d = tx.require("outreach", id);
      editOutreachDraft(tx, OPERATOR, id, d.version, { subject: "s", body: "b2", scheduledFor: null });
      submitForReview(tx, OPERATOR, "outreach", id);
    });
    await assert.rejects(h.store.transaction((tx) => decide(tx, REVIEWER, "outreach", id, "approved", seenHash)), (e) => e instanceof GateError && e.code === "content-changed-since-viewed");
  });
  await t.test("approvals expire", async () => {
    const h = harness();
    const { draftId } = await approvedReply(h);
    h.advance(15 * 86_400_000);
    await assert.rejects(h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), (e) => e instanceof GateError && e.code === "approval-expired");
  });
  await t.test("content: editing provenance details also revokes approval", async () => {
    const h = harness();
    const id = await h.store.transaction((tx) => {
      const c = createContentDraft(tx, FOUNDER, { campaignId: null, title: "T", channel: "linkedin", originCategory: "abstraction", sourceReference: "Manifesto v0.2", assetDescription: null, assetPermission: null, body: "Body", scheduledFor: null });
      submitForReview(tx, FOUNDER, "content", c.id);
      decide(tx, FOUNDER, "content", c.id, "approved", payloadFor(tx, "content", c.id).hash);
      const fresh = tx.require("content", c.id);
      editContentDraft(tx, FOUNDER, c.id, fresh.version, { title: "T", channel: "instagram", originCategory: "abstraction", sourceReference: "Manifesto v0.2", assetDescription: null, assetPermission: null, body: "Body", scheduledFor: null });
      return c.id;
    });
    await assert.rejects(h.store.transaction((tx) => recordManualPublication(tx, FOUNDER, id, null)), GateError);
  });
  await t.test("evidence content cannot go to review without recorded permission", async () => {
    const h = harness();
    await assert.rejects(
      h.store.transaction((tx) => {
        const c = createContentDraft(tx, FOUNDER, { campaignId: null, title: "T", channel: "linkedin", originCategory: "evidence", sourceReference: "x", assetDescription: "photo", assetPermission: null, body: "Body", scheduledFor: null });
        submitForReview(tx, FOUNDER, "content", c.id);
      }),
      (e) => e instanceof GateError && e.code === "evidence-needs-permission",
    );
  });
});

// ---------- Suppression at dispatch (8) ----------

test("8: suppression overrides approved messages, queued jobs and retries", async () => {
  const h = harness();
  const { draftId, prospectId } = await approvedReply(h);
  const provider = new ConfirmingProvider([{ kind: "failed", retryable: true, code: "rate-limited" }]);
  await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  // Acknowledgement + reply run; the reply fails once and is scheduled to retry.
  await runDueJobs(h.store, providers(provider));
  const pending = await read(h.store, (tx) => tx.list("jobs", (j) => j.kind === "send-outreach")[0]);
  assert.equal(pending.status, "queued");
  // The person unsubscribes before the retry.
  await h.store.transaction((tx) => withdraw(tx, SYSTEM, prospectId, "all", "unsubscribe"));
  h.advance(10 * 60_000);
  await runDueJobs(h.store, providers(provider));
  const s = await read(h.store, (tx) => ({ job: tx.require("jobs", pending.id), d: tx.require("outreach", draftId), receipts: tx.list("receipts", (r) => r.subjectType === "outreach") }));
  assert.equal(s.job.status, "cancelled");
  assert.equal(s.job.holdReason, "suppressed");
  assert.equal(s.d.status, "held");
  assert.equal(s.receipts.length, 0);
  assert.equal(provider.calls.filter((c) => c.purpose === "outreach").length, 1, "only the failed first attempt ever reached the provider");
  await assert.rejects(h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), GateError);
});

test("8: a newsletter unsubscribe does not block a transactional reply", async () => {
  const h = harness();
  await processInterest(form(h.token(), { updatesOptIn: "yes" }), h.ctx());
  const r = await h.store.transaction((tx) => {
    const p = tx.list("prospects")[0];
    withdraw(tx, FOUNDER, p.id, "newsletter", "unsubscribe");
    return { reply: contactEligibility(tx, p, "reply"), news: contactEligibility(tx, tx.require("prospects", p.id), "newsletter") };
  });
  assert.equal(r.reply.ok, true);
  assert.equal(r.news.ok, false);
});

test("8: researched contacts need a reviewed basis; opt-in is never manufactured", async () => {
  const h = harness();
  const p = await h.store.transaction((tx) =>
    createManualProspect(tx, OPERATOR, { kind: "organization", displayName: "Synthetic Archive", email: "info@example.invalid", organizationName: null, region: null, participationInterest: "institution", source: "manual-research", sourceEvidenceUrl: "https://example.org/contact", sourceObservedOn: "2026-10-10", contactReason: "Publishes guidance on consultation.", priority: "normal" }),
  );
  const before = await read(h.store, (tx) => ({ e: contactEligibility(tx, p, "first-contact"), perm: tx.list("permissions")[0] }));
  assert.deepEqual(before.e, { ok: false, reason: "permission-pending-review" });
  assert.equal(before.perm.capturedWording, null);
  assert.notEqual(before.perm.basis, "form-opt-in");
  await assert.rejects(
    h.store.transaction((tx) => {
      const d = createOutreachDraft(tx, OPERATOR, { prospectId: p.id, purpose: "first-contact", subject: "s", body: "b", campaignId: null, followUpOf: null, scheduledFor: null });
      submitForReview(tx, OPERATOR, "outreach", d.id);
    }),
    (e) => e instanceof GateError && e.code === "permission-pending-review",
  );
  await assert.rejects(h.store.transaction((tx) => createManualProspect(tx, OPERATOR, { kind: "person", displayName: "No evidence", email: null, organizationName: null, region: null, participationInterest: "institution", source: "manual-research", sourceEvidenceUrl: "", sourceObservedOn: "2026-10-10", contactReason: "x".repeat(20), priority: "normal" })), ValidationError);
  await h.store.transaction((tx) => reviewPermissionBasis(tx, FOUNDER, before.perm.id, "accept"));
  assert.equal((await read(h.store, (tx) => contactEligibility(tx, tx.require("prospects", p.id), "first-contact"))).ok, true);
});

// ---------- Truthful delivery state (9) and idempotency (10) ----------

test("9: with no provider, nothing is marked sent; the item becomes manual-ready", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  await runDueJobs(h.store, providers());
  const s = await read(h.store, (tx) => ({ d: tx.require("outreach", draftId), jobs: tx.list("jobs"), receipts: tx.list("receipts") }));
  assert.equal(s.d.status, "manual-ready");
  assert.ok(s.jobs.every((j) => j.status === "held" && j.holdReason === "provider-disabled"));
  assert.equal(s.receipts.length, 0);
  // Attested manual send: labeled as an attestation by a named person.
  const receipt = await h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId));
  assert.equal(receipt.route, "manual-attestation");
  assert.equal(receipt.result, "attested");
  assert.equal(receipt.attestedBy, FOUNDER.id);
  assert.equal(receipt.providerMessageId, null);
});

test("9: a dry run is 'simulated', never 'sent'", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  await runDueJobs(h.store, providers(new LocalOutboxEmailProvider(null)));
  const s = await read(h.store, (tx) => ({ d: tx.require("outreach", draftId), r: tx.list("receipts") }));
  assert.equal(s.d.status, "manual-ready");
  assert.ok(s.r.every((r) => r.result === "simulated" && r.route === "dry-run"));
});

test("9: 'sent' only with provider confirmation", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  await runDueJobs(h.store, providers(new ConfirmingProvider()));
  const s = await read(h.store, (tx) => ({ d: tx.require("outreach", draftId), p: tx.list("prospects")[0], r: tx.list("receipts", (r) => r.subjectType === "outreach") }));
  assert.equal(s.d.status, "sent");
  assert.equal(s.r[0].result, "confirmed");
  assert.ok(s.r[0].providerMessageId);
  assert.equal(s.p.stage, "contacted");
});

test("10: retries and repeated runs never duplicate a send, record, or job", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  const provider = new ConfirmingProvider([{ kind: "failed", retryable: true, code: "timeout" }]);
  const j1 = await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  const j2 = await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  assert.equal(j1.id, j2.id, "queuing twice is one job");
  await runDueJobs(h.store, providers(provider));
  await runDueJobs(h.store, providers(provider)); // not yet due: backoff
  h.advance(5 * 60_000);
  await runDueJobs(h.store, providers(provider));
  await runDueJobs(h.store, providers(provider));
  const outreachCalls = provider.calls.filter((c) => c.purpose === "outreach");
  assert.equal(outreachCalls.length, 2, "one failure, one success");
  assert.equal(new Set(outreachCalls.map((c) => c.idempotencyKey)).size, 1, "the same idempotency key both times");
  const receipts = await read(h.store, (tx) => tx.list("receipts", (r) => r.subjectType === "outreach"));
  assert.equal(receipts.length, 1);
  await assert.rejects(h.store.transaction((tx) => retryJob(tx, FOUNDER, j1.id)), GateError);
});

test("10: crash recovery: a running job that already has a receipt is settled, not resent", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  const provider = new ConfirmingProvider();
  const job = await h.store.transaction((tx) => queueDispatch(tx, FOUNDER, "outreach", draftId));
  await runDueJobs(h.store, providers(provider));
  const calls = provider.calls.length;
  // Simulate a crash after the provider call: force the job back to running.
  await h.store.transaction((tx) => {
    const j = tx.require("jobs", job.id);
    tx.update("jobs", j.id, j.version, { status: "running", nextAttemptAt: tx.nowIso });
  });
  await runDueJobs(h.store, providers(provider));
  assert.equal(provider.calls.length, calls);
  assert.equal((await read(h.store, (tx) => tx.require("jobs", job.id))).status, "succeeded");
});

test("pause: a global pause stops all dispatch and manual attestations", async () => {
  const h = harness();
  const { draftId } = await approvedReply(h);
  await h.store.transaction((tx) => {
    queueDispatch(tx, FOUNDER, "outreach", draftId);
    tx.updateSettings(tx.settings().version, { allOutboundPaused: true });
  });
  const provider = new ConfirmingProvider();
  const summary = await runDueJobs(h.store, providers(provider));
  assert.equal(summary.paused, true);
  assert.equal(provider.calls.length, 0);
  await assert.rejects(h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId)), (e) => e instanceof GateError && e.code === "outbound-paused");
});

test("follow-ups are bounded to one; campaigns need cleared review and approval to activate", async () => {
  const h = harness();
  const { prospectId, draftId } = await approvedReply(h);
  await h.store.transaction((tx) => recordManualSend(tx, FOUNDER, draftId));
  await h.store.transaction((tx) => createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "follow-up", subject: "f", body: "f", campaignId: null, followUpOf: draftId, scheduledFor: null }));
  await assert.rejects(h.store.transaction((tx) => createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "follow-up", subject: "f2", body: "f2", campaignId: null, followUpOf: draftId, scheduledFor: null })), (e) => e instanceof GateError && e.code === "follow-up-limit-reached");

  const seed = await buildSeedState(new Date(h.now));
  const store = new MemoryOperationsStore(() => new Date(h.now), seed);
  const c = await store.transaction((tx) => tx.list("campaigns")[0]);
  await assert.rejects(store.transaction((tx) => setCampaignState(tx, FOUNDER, c.id, "active")), (e) => e instanceof GateError && e.code === "reviews-not-cleared");
  await assert.rejects(store.transaction((tx) => setCampaignState(tx, OPERATOR, c.id, "active")), AccessDenied);
});

test("campaign-linked posts need an active campaign and respect its weekly limit", async () => {
  const h = harness();
  const seed = await buildSeedState(new Date(h.now));
  const store = new MemoryOperationsStore(() => new Date(h.now), seed);
  const { campaignId, ids } = await store.transaction((tx) => {
    const c = tx.list("campaigns")[0];
    const ids = tx.list("content", (x) => x.campaignId === c.id && x.status === "needs-review").map((x) => x.id);
    for (const id of ids) {
      decide(tx, FOUNDER, "content", id, "approved", payloadFor(tx, "content", id).hash);
    }
    return { campaignId: c.id, ids };
  });
  assert.ok(ids.length >= 2);
  await assert.rejects(store.transaction((tx) => recordManualPublication(tx, FOUNDER, ids[0], null)), (e) => e instanceof GateError && e.code === "campaign-not-active");
  await store.transaction((tx) => {
    const c = tx.require("campaigns", campaignId);
    tx.update("campaigns", c.id, c.version, { consentReviewStatus: "cleared", legalReviewStatus: "cleared", postsPerWeekCap: 1, status: "needs-review" });
    decide(tx, FOUNDER, "campaign", campaignId, "approved", payloadFor(tx, "campaign", campaignId).hash);
    setCampaignState(tx, FOUNDER, campaignId, "active");
  });
  await store.transaction((tx) => recordManualPublication(tx, FOUNDER, ids[0], null));
  await assert.rejects(store.transaction((tx) => recordManualPublication(tx, FOUNDER, ids[1], null)), (e) => e instanceof GateError && e.code === "weekly-cap-reached");
});

// ---------- Safe audit (11), erasure, export ----------

test("11: audit events and counters contain no personal text, addresses, or notes", async () => {
  const seed = await buildSeedState(new Date("2026-10-16T09:00:00.000Z"));
  const audit = JSON.stringify(seed.collections.audit) + JSON.stringify(seed.collections.funnel) + JSON.stringify(Object.values(seed.collections.jobs).map((j) => ({ ...j, idempotencyKey: undefined })));
  assert.ok(Object.keys(seed.collections.audit).length > 20);
  assert.doesNotMatch(audit, /@/, "no email address");
  assert.doesNotMatch(audit, /Synthetic note|Synthetic Prospect|Dear /, "no names, notes, or message bodies");
  for (const e of Object.values(seed.collections.audit)) {
    assert.deepEqual(Object.keys(e).sort(), ["action", "actorId", "actorRole", "at", "id", "objectId", "objectType", "reason", "synthetic"]);
  }
});

test("erasure removes the person and keeps only a keyed suppression; export is complete", async () => {
  const h = harness();
  const { prospectId, draftId } = await approvedReply(h);
  await h.store.transaction((tx) => recordInteraction(tx, FOUNDER, prospectId, { channel: "email", direction: "inbound", summary: "Synthetic summary", sourceIntegrity: "verified-sender", needsResponse: "yes" }));
  const exported = await h.store.transaction((tx) => exportProspect(tx, FOUNDER, prospectId));
  assert.equal(exported.submissions.length, 1);
  assert.equal(exported.outreach[0].id, draftId);
  assert.ok(!("emailKey" in exported.prospect));
  await h.store.transaction((tx) => eraseProspect(tx, FOUNDER, prospectId, true));
  const snap = h.store.snapshot();
  const remaining = JSON.stringify(snap.collections);
  assert.doesNotMatch(remaining, /person@example\.invalid|Test Person|Synthetic summary|Synthetic note/);
  assert.equal(Object.values(snap.collections.suppressions).length, 1);
  // The same person writing again is recognized as opted out.
  const r = await processInterest(form(h.token()), h.ctx("client-q"));
  assert.deepEqual(r, { status: "received" });
  assert.equal((await read(h.store, (tx) => tx.list("jobs", (j) => j.status === "queued"))).length, 0);
});

// ---------- Stage machine ----------

test("stage machine: no skipping, blocked states need a reason, withdrawn is final", async () => {
  const h = harness();
  await processInterest(form(h.token()), h.ctx());
  const id = (await read(h.store, (tx) => tx.list("prospects")[0])).id;
  const go = (to: string, blockedReason: string | null = null) =>
    h.store.transaction((tx) => {
      const p = tx.require("prospects", id);
      return transitionStage(tx, OPERATOR, id, p.version, { to, blockedReason });
    });
  await assert.rejects(go("pilot-candidate"), (e) => e instanceof GateError && e.code === "transition-not-allowed");
  await assert.rejects(go("needs-review"), (e) => e instanceof GateError && e.code === "block-reason-required");
  await go("needs-review", "privacy");
  await go("triage-ready");
  await go("withdrawn");
  await assert.rejects(go("triage-ready"), GateError);
  assert.equal((await read(h.store, (tx) => tx.list("suppressions"))).length, 1);
});

// ---------- Seed, briefing, digest (16 data) ----------

test("seed: synthetic, schema-valid, and produced by real code paths", async () => {
  const state = await buildSeedState(new Date("2026-10-16T09:00:00.000Z"));
  const store = new MemoryOperationsStore(() => new Date("2026-10-16T09:00:00.000Z"), state);
  assert.equal(state.synthetic, true);
  for (const p of Object.values(state.collections.prospects)) {
    assert.match(p.displayName, /^Synthetic /);
    if (p.email) {
      assert.match(p.email, /@example\.invalid$/);
    }
    assert.equal(p.synthetic, true);
    assert.equal(p.authorityStatus, "unverified");
  }
  for (const c of COLLECTIONS) {
    assert.ok(state.collections[c], c);
  }
  const b = await store.transaction((tx) => buildBriefing(tx));
  assert.ok(b.nextActions.length > 0 && b.nextActions.length <= 5);
  assert.ok(b.newInquiries.length >= 2);
  assert.ok(b.pendingApprovals.outreach >= 1);
  assert.ok(b.blockers.some((x) => x.kind === "relationship"));
  const text = digestText(b);
  assert.match(text, /SYNTHETIC LOCAL DEMO DATA/);
  assert.doesNotMatch(text, /@|Synthetic note/);
});

test("social dry run is simulated and manual publication is attested", async () => {
  const h = harness();
  const id = await h.store.transaction((tx) => {
    const c = createContentDraft(tx, FOUNDER, { campaignId: null, title: "T", channel: "linkedin", originCategory: "abstraction", sourceReference: "Manifesto v0.2", assetDescription: null, assetPermission: null, body: "Body", scheduledFor: null });
    submitForReview(tx, FOUNDER, "content", c.id);
    decide(tx, FOUNDER, "content", c.id, "approved", payloadFor(tx, "content", c.id).hash);
    queueDispatch(tx, FOUNDER, "content", c.id);
    return c.id;
  });
  await runDueJobs(h.store, { email: new DisabledEmailProvider(), social: new LocalOutboxSocialPublisher(null) });
  assert.equal((await read(h.store, (tx) => tx.require("content", id))).status, "manual-ready");
  const r = await h.store.transaction((tx) => recordManualPublication(tx, FOUNDER, id, "https://www.linkedin.com/feed/update/synthetic"));
  assert.equal(r.result, "attested");
  assert.equal((await read(h.store, (tx) => tx.require("content", id))).status, "published");
});

// ---------- Separation from the archive (12) ----------

test("12: the operations domain imports nothing from backend/ or the archive data", () => {
  const roots = ["src/lib/flightDeck", "src/app/flight-deck", "src/app/pilot", "src/components/flight-deck"];
  const files = roots.flatMap((r) => (fs.existsSync(r) ? fs.readdirSync(r, { recursive: true }).map((f) => path.join(r, String(f))) : [])).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length > 10);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.doesNotMatch(spec, /backend|infra|@\/data|publicMemoryApi|livingTrace|recordKind/, `${f} imports ${spec}`);
    }
  }
});
