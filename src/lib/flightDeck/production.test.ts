// Flight Deck 0.2 tests that need no database: exceptions, the worker,
// the restore ledger, identity and permission changes, OIDC token
// verification, and production configuration gating. Postgres-backed
// tests are in postgres/postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { AccessDenied, SYSTEM } from "./access";
import { decide, GateError, payloadFor, submitForReview } from "./approvals";
import { completeStep, openCase, redactField, resolveCase } from "./cases";
import { decideMode, privacyNoticeIsDraft, productionConfig, productionConfigProblems, requestMode } from "./config";
import { queueDispatch } from "./dispatch";
import { createOutreachDraft } from "./drafts";
import { DEMO_IDENTITIES } from "./identities";
import { MemoryIdentityStore, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, signInOperator, SignInRefused } from "./identity";
import { recordInterest } from "./intake";
import { buildLedger, replayLedger } from "./ledger";
import { authorizeUrl, exchangeCode, issuerFor, JwksCache, newLoginTransaction, OidcError, openTransaction, pkceChallenge, sealTransaction, verifyIdToken, type CognitoConfig } from "./oidc";
import { contactEligibility } from "./permissions";
import { eraseProspect, recordInteraction } from "./prospects";
import { DisabledEmailProvider, DisabledSocialPublisher } from "./providers";
import { MemoryOperationsStore, StoreError, type OpsTx } from "./store";
import { computeAlerts, runWorkerTick } from "./worker";

const [FOUNDER, OPERATOR, REVIEWER] = DEMO_IDENTITIES;
const T0 = Date.parse("2026-10-17T09:00:00.000Z");
const providers = { email: new DisabledEmailProvider(), social: new DisabledSocialPublisher() };

function storeAt(start = T0) {
  let now = start;
  const store = new MemoryOperationsStore(() => new Date(now));
  return { store, advance: (ms: number) => (now += ms), get now() { return now; } };
}

function inquiry(tx: OpsTx, n = 1) {
  return recordInterest(tx, { displayName: `Synthetic Person ${n}`, email: `p${n}@example.invalid`, category: "community-partner", organization: "Example Org (synthetic)", region: null, topics: ["community-consultation"], updatesOptIn: null, referral: null });
}

function approvedReply(tx: OpsTx, prospectId: string) {
  const d = createOutreachDraft(tx, OPERATOR, { prospectId, purpose: "reply", subject: "Re: your inquiry", body: "Thank you.", campaignId: null, followUpOf: null, scheduledFor: null });
  submitForReview(tx, OPERATOR, "outreach", d.id);
  decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
  return d.id;
}

// ---------- Exceptions ----------

test("cases: an opt-out case suppresses immediately and stops queued work", async () => {
  const h = storeAt();
  const { prospectId, draftId } = await h.store.transaction((tx) => {
    const { prospectId } = inquiry(tx);
    const draftId = approvedReply(tx, prospectId);
    queueDispatch(tx, FOUNDER, "outreach", draftId);
    return { prospectId, draftId };
  });
  const c = await h.store.transaction((tx) => openCase(tx, OPERATOR, { kind: "opt-out", prospectId, receivedVia: "email", summary: "Asked by email to stop all contact.", optOutScope: "all", pauseOutbound: null }));
  const s = await h.store.read((tx) => ({
    sup: tx.list("suppressions"),
    jobs: tx.list("jobs", (j) => j.subjectId === draftId),
    draft: tx.require("outreach", draftId),
    elig: contactEligibility(tx, tx.require("prospects", prospectId), "reply"),
  }));
  assert.equal(s.sup.length, 1);
  assert.ok(s.jobs.every((j) => j.status === "cancelled"));
  assert.equal(s.draft.status, "held");
  assert.equal(s.elig.ok, false);
  assert.ok(c.steps.find((x) => x.key === "suppression-applied")?.doneAt, "automatic step recorded");
  await assert.rejects(h.store.transaction((tx) => completeStep(tx, OPERATOR, c.id, tx.require("cases", c.id).version, "suppression-applied")), (e) => e instanceof GateError && e.code === "step-is-automatic");
});

test("cases: a deletion request holds outreach until resolved; erasure completes its step and keeps the case anonymously", async () => {
  const h = storeAt();
  const { prospectId, draftId } = await h.store.transaction((tx) => {
    const { prospectId } = inquiry(tx);
    return { prospectId, draftId: approvedReply(tx, prospectId) };
  });
  const c = await h.store.transaction((tx) => openCase(tx, FOUNDER, { kind: "deletion-request", prospectId, receivedVia: "email", summary: "Requested deletion by email from the address on record.", optOutScope: null, pauseOutbound: null }));
  const during = await h.store.read((tx) => ({ elig: contactEligibility(tx, tx.require("prospects", prospectId), "reply"), draft: tx.require("outreach", draftId) }));
  assert.deepEqual(during.elig, { ok: false, reason: "case-open" });
  assert.equal(during.draft.status, "held");
  await assert.rejects(h.store.transaction((tx) => resolveCase(tx, FOUNDER, c.id, tx.require("cases", c.id).version, "erased")), (e) => e instanceof GateError && e.code === "case-steps-incomplete");
  await h.store.transaction((tx) => {
    for (const key of ["verify-requester", "export-if-asked"]) {
      completeStep(tx, FOUNDER, c.id, tx.require("cases", c.id).version, key);
    }
    eraseProspect(tx, FOUNDER, prospectId, true);
    completeStep(tx, FOUNDER, c.id, tx.require("cases", c.id).version, "confirm-deletion");
    resolveCase(tx, FOUNDER, c.id, tx.require("cases", c.id).version, "erased");
  });
  const after = await h.store.read((tx) => ({ c: tx.require("cases", c.id), erasures: tx.list("erasures") }));
  assert.equal(after.c.prospectId, null);
  assert.equal(after.c.status, "resolved");
  assert.ok(after.c.steps.every((s) => s.doneAt));
  assert.equal(after.erasures.length, 1);
});

test("cases: sensitive material is redacted, the audit records that and not the content; founder resolves", async () => {
  const h = storeAt();
  const { prospectId, interactionId } = await h.store.transaction((tx) => {
    const { prospectId } = inquiry(tx);
    const i = recordInteraction(tx, FOUNDER, prospectId, { channel: "email", direction: "inbound", summary: "SENSITIVE-CANARY account pasted by mistake", sourceIntegrity: "verified-sender", needsResponse: "no" });
    return { prospectId, interactionId: i.id };
  });
  const c = await h.store.transaction((tx) => openCase(tx, OPERATOR, { kind: "sensitive-disclosure", prospectId, receivedVia: "email", summary: "Material received by email; removed, not read further.", optOutScope: null, pauseOutbound: null }));
  await h.store.transaction((tx) => redactField(tx, OPERATOR, c.id, "interaction", interactionId, "summary"));
  await h.store.transaction((tx) => redactField(tx, OPERATOR, c.id, "prospect", prospectId, "organizationName"));
  const snap = JSON.stringify(h.store.snapshot().collections);
  assert.doesNotMatch(snap, /SENSITIVE-CANARY|Example Org/);
  assert.ok(Object.values(h.store.snapshot().collections.audit).some((e) => e.action === "field-redacted"));
  await h.store.transaction((tx) => {
    for (const s of tx.require("cases", c.id).steps) {
      completeStep(tx, OPERATOR, c.id, tx.require("cases", c.id).version, s.key);
    }
  });
  await assert.rejects(h.store.transaction((tx) => resolveCase(tx, OPERATOR, c.id, tx.require("cases", c.id).version, "material-removed")), (e) => e instanceof GateError && e.code === "founder-required");
  await h.store.transaction((tx) => resolveCase(tx, FOUNDER, c.id, tx.require("cases", c.id).version, "material-removed"));
  assert.equal((await h.store.read((tx) => contactEligibility(tx, tx.require("prospects", prospectId), "reply"))).ok, true, "outreach resumes once resolved");
});

test("cases: an incident can pause everything at once; kinds that need a person refuse without one; reviewers cannot open them", async () => {
  const h = storeAt();
  await h.store.transaction((tx) => openCase(tx, REVIEWER, { kind: "incident", prospectId: null, receivedVia: "internal", summary: "Suspected message sent in error.", optOutScope: null, pauseOutbound: "yes" }));
  assert.equal((await h.store.read((tx) => tx.settings())).allOutboundPaused, true);
  await assert.rejects(h.store.transaction((tx) => openCase(tx, FOUNDER, { kind: "deletion-request", prospectId: null, receivedVia: "email", summary: "x", optOutScope: null, pauseOutbound: null })), (e) => e instanceof GateError && e.code === "case-needs-prospect");
  await assert.rejects(h.store.transaction((tx) => openCase(tx, REVIEWER, { kind: "complaint", prospectId: null, receivedVia: "email", summary: "x", optOutScope: null, pauseOutbound: null })), AccessDenied);
});

// ---------- Worker ----------

test("worker: a tick records a heartbeat, is idempotent, and creates housekeeping tasks once", async () => {
  const h = storeAt();
  await h.store.transaction((tx) => {
    const { prospectId } = inquiry(tx);
    const p = tx.require("prospects", prospectId);
    tx.update("prospects", p.id, p.version, { retainUntil: "2026-01-01" });
    const d = approvedReply(tx, prospectId);
    const a = tx.list("approvals", (x) => x.subjectId === d)[0];
    tx.update("approvals", a.id, a.version, { expiresAt: "2026-10-01T00:00:00.000Z" });
    openCase(tx, FOUNDER, { kind: "complaint", prospectId, receivedVia: "email", summary: "Complaint about contact frequency.", optOutScope: null, pauseOutbound: null });
  });
  h.advance(10 * 86_400_000); // complaint now overdue
  const first = await runWorkerTick({ store: h.store, providers });
  const second = await runWorkerTick({ store: h.store, providers });
  assert.equal(first.outcome, "ok");
  assert.equal(first.tasksCreated, 3, "retention, expired approval, overdue case");
  assert.equal(second.tasksCreated, 0, "idempotent");
  const s = await h.store.read((tx) => ({ runs: tx.list("workerRuns"), jobs: tx.list("jobs") }));
  assert.equal(s.runs.length, 2);
  assert.ok(s.runs.every((r) => r.outcome === "ok" && r.finishedAt));
  // The acknowledgement is cancelled, not sent: the open complaint holds
  // all contact with this person. Nothing is ever sent by the worker here.
  assert.ok(s.jobs.length > 0 && s.jobs.every((j) => (j.status === "cancelled" && j.holdReason === "case-open") || (j.status === "held" && j.holdReason === "provider-disabled")), JSON.stringify(s.jobs.map((j) => [j.status, j.holdReason])));
  assert.equal((await h.store.read((tx) => tx.list("receipts"))).length, 0);
});

test("worker: a held lock skips the tick; a paused deck reports paused; a store failure is recorded, not thrown", async () => {
  const h = storeAt();
  assert.equal((await runWorkerTick({ store: h.store, providers, acquireLock: async () => null })).outcome, "skipped-locked");
  await h.store.transaction((tx) => tx.updateSettings(tx.settings().version, { allOutboundPaused: true }));
  assert.equal((await runWorkerTick({ store: h.store, providers })).outcome, "paused");
  const broken = Object.create(h.store) as MemoryOperationsStore;
  let n = 0;
  broken.transaction = (async (fn: (tx: OpsTx) => unknown) => {
    if (++n === 2) {
      throw Object.assign(new Error("db gone"), { code: "storage-unavailable" });
    }
    return h.store.transaction(fn);
  }) as MemoryOperationsStore["transaction"];
  const r = await runWorkerTick({ store: broken, providers });
  assert.equal(r.outcome, "failed");
  assert.equal(r.errorCode, "storage-unavailable");
  const runs = await h.store.read((tx) => tx.list("workerRuns").sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
  assert.equal(runs.at(-1)!.outcome, "failed");
});

test("alerts: stale worker, repeated failures, overdue cases, missing ledger", async () => {
  const h = storeAt();
  const none = await h.store.read((tx) => computeAlerts(tx, { expectWorker: true, logConfigured: false }));
  assert.deepEqual(none.map((a) => a.key).sort(), ["protective-log-missing", "worker-stale"]);
  await runWorkerTick({ store: h.store, providers });
  assert.equal((await h.store.read((tx) => computeAlerts(tx, { expectWorker: true }))).length, 0);
  h.advance(30 * 60_000);
  assert.ok((await h.store.read((tx) => computeAlerts(tx, { expectWorker: true }))).some((a) => a.key === "worker-stale"));
});

// ---------- Restore ledger ----------

test("restore: replaying the ledger re-erases and re-suppresses after restoring an older backup", async () => {
  const h = storeAt();
  const ids = await h.store.transaction((tx) => [inquiry(tx, 1).prospectId, inquiry(tx, 2).prospectId]);
  const backup = h.store.snapshot(); // "Monday's backup"
  // After the backup: person 1 is erased, person 2 opts out and has a queued reply.
  const draft2 = await h.store.transaction((tx) => {
    eraseProspect(tx, FOUNDER, ids[0], false);
    return approvedReply(tx, ids[1]);
  });
  await h.store.transaction((tx) => openCase(tx, FOUNDER, { kind: "opt-out", prospectId: ids[1], receivedVia: "email", summary: "Opted out.", optOutScope: "all", pauseOutbound: null }));
  const ledger = await h.store.read((tx) => buildLedger(tx));
  // Restore Monday's backup, with person 2's reply re-approved and queued in it.
  const restored = new MemoryOperationsStore(() => new Date(h.now), backup);
  await restored.transaction((tx) => {
    const d = approvedReply(tx, ids[1]);
    queueDispatch(tx, FOUNDER, "outreach", d);
  });
  const before = await restored.read((tx) => ({ p1: !!tx.get("prospects", ids[0]), sup: tx.list("suppressions").length }));
  assert.deepEqual(before, { p1: true, sup: 0 }, "the restore brought both back");
  const r1 = await restored.transaction((tx) => replayLedger(tx, FOUNDER, ledger));
  const r2 = await restored.transaction((tx) => replayLedger(tx, FOUNDER, ledger));
  assert.deepEqual(r1, { erased: 1, suppressionsRestored: 1, liftsToConfirm: 0 });
  assert.deepEqual(r2, { erased: 0, suppressionsRestored: 0, liftsToConfirm: 0 }, "idempotent");
  const after = await restored.read((tx) => ({ p1: tx.get("prospects", ids[0]), queued: tx.list("jobs", (j) => j.kind === "send-outreach" && j.status === "queued").length, elig: contactEligibility(tx, tx.require("prospects", ids[1]), "reply") }));
  assert.equal(after.p1, null);
  assert.equal(after.queued, 0, "the restored queued message was cancelled");
  assert.equal(after.elig.ok, false);
  void draft2;
});

// ---------- Identity, sessions, permission changes ----------

test("identity: only named, active operators get sessions; subjects bind once", async () => {
  const id = new MemoryIdentityStore();
  const now = new Date(T0);
  await assert.rejects(signInOperator(id, { sub: "sub-1", email: "stranger@example.invalid" }, now), (e) => e instanceof SignInRefused && e.code === "not-an-operator");
  const op = await id.addOperator({ email: "Founder@Example.invalid", displayName: "Founder", role: "founder" }, now);
  const { token } = await signInOperator(id, { sub: "sub-1", email: "founder@example.invalid" }, now);
  assert.deepEqual(await id.resolveSession(token, now), { id: op.id, role: "founder", displayName: "Founder", authTime: null, providerSubject: "sub-1" });
  // A different provider account with the same email cannot take over.
  await assert.rejects(signInOperator(id, { sub: "sub-ATTACKER", email: "founder@example.invalid" }, now), (e) => e instanceof SignInRefused && e.code === "subject-mismatch");
});

test("sessions: idle and absolute expiry; revocation and deactivation apply on the next request; role changes apply too", async () => {
  const id = new MemoryIdentityStore();
  let t = T0;
  const op = await id.addOperator({ email: "op@example.invalid", displayName: "Op", role: "operator" }, new Date(t));
  const s1 = (await signInOperator(id, { sub: "s", email: "op@example.invalid" }, new Date(t))).token;
  t += SESSION_IDLE_MS - 1000;
  assert.ok(await id.resolveSession(s1, new Date(t)), "activity keeps it alive");
  t += SESSION_IDLE_MS + 1;
  assert.equal(await id.resolveSession(s1, new Date(t)), null, "idle timeout");
  const s2 = (await signInOperator(id, { sub: "s", email: "op@example.invalid" }, new Date(t))).token;
  await id.setRole(op.id, "reviewer");
  assert.equal((await id.resolveSession(s2, new Date(t)))?.role, "reviewer", "role change on next request");
  await id.revokeSession(s2, new Date(t));
  assert.equal(await id.resolveSession(s2, new Date(t)), null);
  const s3 = (await signInOperator(id, { sub: "s", email: "op@example.invalid" }, new Date(t))).token;
  await id.deactivateOperator(op.id, new Date(t));
  assert.equal(await id.resolveSession(s3, new Date(t)), null, "deactivation revokes at once");
  await assert.rejects(signInOperator(id, { sub: "s", email: "op@example.invalid" }, new Date(t)), (e) => e instanceof SignInRefused && e.code === "operator-inactive");
  const op2 = await id.addOperator({ email: "x@example.invalid", displayName: "X", role: "founder" }, new Date(t));
  const s4 = (await signInOperator(id, { sub: "x", email: "x@example.invalid" }, new Date(t))).token;
  for (let i = 0; i < 9; i++) {
    t += SESSION_IDLE_MS - 1000;
    await id.resolveSession(s4, new Date(t));
  }
  assert.ok(t - T0 > SESSION_ABSOLUTE_MS);
  assert.equal(await id.resolveSession(s4, new Date(t)), null, "absolute lifetime");
  void op2;
});

// ---------- OIDC ----------

const COGNITO: CognitoConfig = {
  region: "eu-west-2",
  userPoolId: "eu-west-2_TestPool01",
  clientId: "abcdefghijklmnopqrstuvwxyz",
  clientSecret: "s".repeat(40),
  domain: "https://tiro-ops-test.auth.eu-west-2.amazoncognito.com",
  publicOrigin: "https://tiro.foundation",
  requiredGroup: "flight-deck",
};

function keypair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function jwt(privateKey: KeyObject, header: Record<string, unknown>, claims: Record<string, unknown>) {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const c = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createSign("RSA-SHA256").update(`${h}.${c}`).sign(privateKey).toString("base64url");
  return `${h}.${c}.${sig}`;
}

function jwksFetch(keys: { kid: string; publicKey: KeyObject }[]) {
  let calls = 0;
  const f = async () => {
    calls++;
    return new Response(JSON.stringify({ keys: keys.map((k) => ({ ...k.publicKey.export({ format: "jwk" }), kid: k.kid, alg: "RS256", use: "sig" })) }));
  };
  return { f, calls: () => calls };
}

test("oidc: a genuine ID token verifies; every forgery and mismatch is refused", async () => {
  const good = keypair();
  const other = keypair();
  const nowS = Math.floor(T0 / 1000);
  const claims = { iss: issuerFor(COGNITO), aud: COGNITO.clientId, token_use: "id", sub: "user-1", email: "Founder@Example.invalid", email_verified: true, "cognito:groups": ["flight-deck"], nonce: "n-123", iat: nowS - 5, exp: nowS + 3600, auth_time: nowS - 5 };
  const header = { alg: "RS256", kid: "k1" };
  const { f } = jwksFetch([{ kid: "k1", publicKey: good.publicKey }]);
  const jwks = new JwksCache("https://jwks.test", f);
  const ok = await verifyIdToken(jwt(good.privateKey, header, claims), COGNITO, jwks, { now: T0, nonce: "n-123" });
  assert.deepEqual(ok, { sub: "user-1", email: "founder@example.invalid", groups: ["flight-deck"], authTime: nowS - 5 });

  const bad = async (token: string, code: string, nonce = "n-123") => assert.rejects(verifyIdToken(token, COGNITO, jwks, { now: T0, nonce }), (e) => e instanceof OidcError && e.code === code, code);
  await bad(jwt(other.privateKey, header, claims), "bad-signature");
  const [h, c] = jwt(good.privateKey, header, claims).split(".");
  await bad(`${Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url")}.${c}.`, "bad-algorithm");
  await bad(`${Buffer.from(JSON.stringify({ alg: "HS256", kid: "k1" })).toString("base64url")}.${c}.x`, "bad-algorithm");
  await bad(`${h}.${Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url")}.${jwt(good.privateKey, header, claims).split(".")[2]}`, "bad-signature");
  await bad(jwt(good.privateKey, header, { ...claims, iss: "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_SyntheticStaff" }), "wrong-issuer");
  await bad(jwt(good.privateKey, header, { ...claims, aud: "another-client-id-000000" }), "wrong-audience");
  await bad(jwt(good.privateKey, header, { ...claims, token_use: "access" }), "wrong-token-use");
  await bad(jwt(good.privateKey, header, { ...claims, exp: nowS - 120 }), "expired");
  await bad(jwt(good.privateKey, header, { ...claims, iat: nowS + 600 }), "issued-in-future");
  await bad(jwt(good.privateKey, header, claims), "wrong-nonce", "n-999");
  await bad(jwt(good.privateKey, header, { ...claims, email_verified: false }), "email-not-verified");
  await bad(jwt(good.privateKey, header, { ...claims, "cognito:groups": ["staff"] }), "not-in-required-group");
  await bad(jwt(good.privateKey, { alg: "RS256", kid: "unknown" }, claims), "unknown-key");
});

test("oidc: key rotation refreshes JWKS at most once a minute; code exchange sends PKCE verifier and basic auth", async () => {
  const k1 = keypair();
  const k2 = keypair();
  const keys = [{ kid: "k1", publicKey: k1.publicKey }];
  const { f, calls } = jwksFetch(keys);
  const jwks = new JwksCache("https://jwks.test", f);
  assert.ok(await jwks.key("k1", T0));
  keys.push({ kid: "k2", publicKey: k2.publicKey });
  assert.equal(await jwks.key("k2", T0 + 10_000), null, "no refresh storm");
  assert.ok(await jwks.key("k2", T0 + 61_000), "refreshed after a minute");
  assert.equal(calls(), 2);

  let seen: { url: string; init?: RequestInit } | null = null;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id_token: "a.b.c" }));
  };
  assert.equal(await exchangeCode(COGNITO, "code-123", "verifier-xyz", fetchImpl), "a.b.c");
  const body = new URLSearchParams(String(seen!.init!.body));
  assert.equal(seen!.url, `${COGNITO.domain}/oauth2/token`);
  assert.equal(body.get("code_verifier"), "verifier-xyz");
  assert.equal(body.get("redirect_uri"), "https://tiro.foundation/flight-deck/auth/callback");
  assert.match(String((seen!.init!.headers as Record<string, string>).Authorization), /^Basic /);
  await assert.rejects(exchangeCode(COGNITO, "bad code!", "v", fetchImpl), OidcError);
});

test("oidc: login transaction is signed, expires, and carries an S256 challenge", () => {
  const t = newLoginTransaction(T0);
  const sealed = sealTransaction(t, "x".repeat(40));
  assert.deepEqual(openTransaction(sealed, "x".repeat(40), T0 + 1000), t);
  assert.equal(openTransaction(sealed, "y".repeat(40), T0 + 1000), null, "wrong key");
  assert.equal(openTransaction(sealed, "x".repeat(40), T0 + 11 * 60_000), null, "expired");
  assert.equal(openTransaction(`${sealed.split(".")[0]}x.${sealed.split(".")[1]}`, "x".repeat(40), T0), null, "tampered");
  const u = new URL(authorizeUrl(COGNITO, t));
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("code_challenge"), pkceChallenge(t.verifier));
  assert.notEqual(u.searchParams.get("code_challenge"), t.verifier);
  assert.equal(u.searchParams.get("response_type"), "code");
});

// ---------- Production configuration ----------

const PROD_ENV = {
  NODE_ENV: "production",
  FLIGHT_DECK_MODE: "production",
  FLIGHT_DECK_DATABASE_URL: "postgresql://fd_app@db.internal:5432/flightdeck?sslmode=verify-full",
  FLIGHT_DECK_EMAIL_HASH_PEPPER: "p".repeat(20) + "1".repeat(20),
  FLIGHT_DECK_SESSION_SECRET: "s".repeat(20) + "2".repeat(20),
  FLIGHT_DECK_WORKER_TOKEN: "w".repeat(20) + "3".repeat(20),
  FLIGHT_DECK_MONITOR_TOKEN: "m".repeat(20) + "4".repeat(20),
  FLIGHT_DECK_COGNITO_REGION: "eu-west-2",
  FLIGHT_DECK_COGNITO_USER_POOL_ID: "eu-west-2_AbCdEf123",
  FLIGHT_DECK_COGNITO_CLIENT_ID: "abcdefghijklmnopqrstuvwxyz",
  FLIGHT_DECK_COGNITO_CLIENT_SECRET: "c".repeat(40),
  FLIGHT_DECK_COGNITO_DOMAIN: "https://tiro-ops.auth.eu-west-2.amazoncognito.com",
  FLIGHT_DECK_PUBLIC_ORIGIN: "https://tiro.foundation",
  FLIGHT_DECK_PROTECTIVE_BUCKET: "tiro-flight-deck-protective-log",
  FLIGHT_DECK_PROTECTIVE_REGION: "eu-west-2",
};

test("config: production mode exists only with complete, well-formed, distinct secrets in a production build", () => {
  assert.deepEqual(productionConfigProblems(PROD_ENV), []);
  assert.equal(decideMode(PROD_ENV).mode, "production");
  assert.equal(decideMode({ ...PROD_ENV, NODE_ENV: "development" }).mode, "disabled");
  for (const [k, v] of Object.entries({
    FLIGHT_DECK_DATABASE_URL: "postgresql://fd_app@db.internal:5432/flightdeck",
    FLIGHT_DECK_EMAIL_HASH_PEPPER: "<placeholder-pepper-value-32-chars-long>",
    FLIGHT_DECK_SESSION_SECRET: "short",
    FLIGHT_DECK_COGNITO_USER_POOL_ID: "us-east-1_AbCdEf123",
    FLIGHT_DECK_COGNITO_DOMAIN: "http://tiro-ops.auth.eu-west-2.amazoncognito.com",
    FLIGHT_DECK_PUBLIC_ORIGIN: "https://tiro.foundation/path",
    FLIGHT_DECK_WORKER_TOKEN: PROD_ENV.FLIGHT_DECK_MONITOR_TOKEN,
  })) {
    const env = { ...PROD_ENV, [k]: v };
    assert.ok(productionConfigProblems(env).length > 0, k);
    assert.equal(decideMode(env).mode, "disabled", k);
  }
  const problems = productionConfigProblems({ ...PROD_ENV, FLIGHT_DECK_SESSION_SECRET: "top-secret-value-that-is-too-short" });
  assert.ok(problems.every((p) => !p.includes("top-secret")), "problems never echo values");
});

test("config: staging deployment, Vercel OIDC role, and the direct database endpoint", () => {
  const staging = productionConfig({ ...PROD_ENV, FLIGHT_DECK_DEPLOYMENT: "staging", FLIGHT_DECK_AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/flight-deck-staging-app" });
  assert.equal(staging?.deployment, "staging");
  assert.equal(staging?.protective.roleArn, "arn:aws:iam::123456789012:role/flight-deck-staging-app");
  assert.equal(productionConfig(PROD_ENV)?.deployment, "production", "production is the default");
  assert.equal(productionConfig(PROD_ENV)?.protective.roleArn, undefined);
  for (const [k, v] of Object.entries({
    FLIGHT_DECK_DEPLOYMENT: "prod",
    FLIGHT_DECK_AWS_ROLE_ARN: "arn:aws:iam::123:user/someone",
    // Neon's pooled endpoint: the worker's session advisory lock would not hold.
    FLIGHT_DECK_DATABASE_URL: "postgresql://fd_app@ep-quiet-sun-123456-pooler.eu-west-2.aws.neon.tech/flightdeck?sslmode=verify-full",
  })) {
    assert.ok(productionConfigProblems({ ...PROD_ENV, [k]: v }).length > 0, k);
  }
  assert.deepEqual(productionConfigProblems({ ...PROD_ENV, FLIGHT_DECK_DATABASE_URL: "postgresql://fd_app@ep-quiet-sun-123456.eu-west-2.aws.neon.tech/flightdeck?sslmode=verify-full" }), [], "the direct endpoint is fine");
});

test("config: production requests must arrive on the configured host; the form cannot open with a draft notice", () => {
  assert.equal(requestMode(PROD_ENV, "tiro.foundation"), "production");
  assert.equal(requestMode(PROD_ENV, "evil.example"), null);
  assert.equal(requestMode(PROD_ENV, "localhost:3000"), null);
  assert.equal(requestMode({ ...PROD_ENV, FLIGHT_DECK_MODE: "local-demo" }, "localhost"), null, "no local demo in a production build");
  assert.equal(privacyNoticeIsDraft(), true, "0.2 ships a draft notice, so the production form cannot open");
});

test("store: rows must match the store's synthetic flag", async () => {
  const h = storeAt();
  await assert.rejects(
    h.store.transaction((tx) => tx.insert("audit", { id: "evt_AAAAAAAAAAAAAAAA", at: tx.nowIso, actorId: "system", actorRole: "system", action: "x", objectType: "x", objectId: null, reason: null, synthetic: false })),
    (e) => e instanceof StoreError && e.code === "synthetic-mismatch",
  );
  void SYSTEM;
});
