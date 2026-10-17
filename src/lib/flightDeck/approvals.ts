// Approval gates. An approval is bound to a hash of the exact payload that
// would leave TIRO: the content version, the recipient or destination, the
// channel, and the schedule. Any change to any of these produces a new
// hash, and an approval for the old hash no longer authorizes anything.
import { audit, requireCapability, type Actor } from "./access";
import { canonicalJson, newId, sha256 } from "./ids";
import { contactEligibility } from "./permissions";
import type { OpsTx } from "./store";
import type { Approval, ApprovalSubject } from "./types";

export class GateError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type Payload = { hash: string; version: number; payload: Record<string, unknown> };

export function payloadFor(tx: OpsTx, type: ApprovalSubject, id: string): Payload {
  if (type === "outreach") {
    const d = tx.require("outreach", id);
    const v = d.versions.find((x) => x.version === d.currentVersion)!;
    const prospect = tx.require("prospects", d.prospectId);
    const payload = {
      type,
      id: d.id,
      version: v.version,
      contentHash: v.contentHash,
      subject: v.subject,
      body: v.body,
      channel: d.channel,
      purpose: d.purpose,
      recipient: prospect.email,
      scheduledFor: d.scheduledFor,
    };
    return { hash: sha256(canonicalJson(payload)), version: v.version, payload };
  }
  if (type === "content") {
    const c = tx.require("content", id);
    const v = c.versions.find((x) => x.version === c.currentVersion)!;
    const payload = {
      type,
      id: c.id,
      version: v.version,
      contentHash: v.contentHash,
      title: c.title,
      body: v.body,
      channel: c.channel,
      originCategory: c.originCategory,
      sourceReference: c.sourceReference,
      assetDescription: c.assetDescription,
      assetPermission: c.assetPermission,
      publicationRoute: c.publicationRoute,
      scheduledFor: c.scheduledFor,
    };
    return { hash: sha256(canonicalJson(payload)), version: v.version, payload };
  }
  const c = tx.require("campaigns", id);
  const payload = {
    type,
    id: c.id,
    name: c.name,
    purpose: c.purpose,
    audience: c.audience,
    channels: c.channels,
    postsPerWeekCap: c.postsPerWeekCap,
    introductionsPerWeekCap: c.introductionsPerWeekCap,
    startsOn: c.startsOn,
    endsOn: c.endsOn,
    metricsDefinition: c.metricsDefinition,
  };
  return { hash: sha256(canonicalJson(payload)), version: c.version, payload };
}

function statusOf(tx: OpsTx, type: ApprovalSubject, id: string): string {
  return type === "outreach" ? tx.require("outreach", id).status : type === "content" ? tx.require("content", id).status : tx.require("campaigns", id).status;
}

function setStatus(tx: OpsTx, type: ApprovalSubject, id: string, status: string) {
  if (type === "outreach") {
    const d = tx.require("outreach", id);
    tx.update("outreach", id, d.version, { status: status as never });
  } else if (type === "content") {
    const c = tx.require("content", id);
    tx.update("content", id, c.version, { status: status as never });
  } else {
    const c = tx.require("campaigns", id);
    tx.update("campaigns", id, c.version, { status: status as never });
  }
}

// Pre-review checks that do not depend on who reviews.
const PLACEHOLDER = /\[[^\]\n]{1,200}\]/;

function readinessProblem(tx: OpsTx, type: ApprovalSubject, id: string): string | null {
  if (type === "outreach") {
    const d = tx.require("outreach", id);
    const v = d.versions.find((x) => x.version === d.currentVersion)!;
    if (PLACEHOLDER.test(v.subject) || PLACEHOLDER.test(v.body)) {
      return "unfilled-placeholders";
    }
    const eligibility = contactEligibility(tx, tx.require("prospects", d.prospectId), d.purpose);
    return eligibility.ok ? null : eligibility.reason;
  }
  if (type === "content") {
    const c = tx.require("content", id);
    if (PLACEHOLDER.test(c.versions.find((x) => x.version === c.currentVersion)!.body) || PLACEHOLDER.test(c.sourceReference)) {
      return "unfilled-placeholders";
    }
    if (c.originCategory === "evidence" && !c.assetPermission) {
      return "evidence-needs-permission";
    }
    return null;
  }
  const c = tx.require("campaigns", id);
  if (c.consentReviewStatus === "blocked" || c.legalReviewStatus === "blocked") {
    return "review-blocked";
  }
  return null;
}

export function submitForReview(tx: OpsTx, actor: Actor, type: ApprovalSubject, id: string) {
  requireCapability(actor, type === "campaign" ? "edit-relationships" : "edit-drafts");
  const status = statusOf(tx, type, id);
  if (!["draft", "held", "failed"].includes(status)) {
    throw new GateError("not-in-draft");
  }
  const problem = readinessProblem(tx, type, id);
  if (problem) {
    throw new GateError(problem);
  }
  setStatus(tx, type, id, "needs-review");
  audit(tx, actor, "review-requested", type, id, null);
}

export function activeApprovals(tx: OpsTx, type: ApprovalSubject, id: string): Approval[] {
  return tx.list("approvals", (a) => a.subjectType === type && a.subjectId === id && a.state === "active");
}

// Decide on exactly what the reviewer saw: expectedHash is the hash shown
// on the review screen. If the draft changed in between, nothing is
// approved.
export function decide(
  tx: OpsTx,
  actor: Actor,
  type: ApprovalSubject,
  id: string,
  outcome: "approved" | "rejected" | "revision-requested",
  expectedHash: string,
  opts: { secondReviewerId?: string | null } = {},
): Approval {
  requireCapability(actor, "approve");
  if (statusOf(tx, type, id) !== "needs-review") {
    throw new GateError("not-awaiting-review");
  }
  const current = payloadFor(tx, type, id);
  if (current.hash !== expectedHash) {
    throw new GateError("content-changed-since-viewed");
  }
  if (outcome === "approved") {
    const problem = readinessProblem(tx, type, id);
    if (problem) {
      throw new GateError(problem);
    }
  }
  for (const prior of activeApprovals(tx, type, id)) {
    tx.update("approvals", prior.id, prior.version, { state: "closed", invalidatedAt: tx.nowIso, invalidatedReason: "superseded" });
  }
  const validityDays = tx.settings().approvalValidityDays;
  const approval = tx.insert("approvals", {
    id: newId("apr"),
    subjectType: type,
    subjectId: id,
    subjectVersion: current.version,
    payloadHash: current.hash,
    outcome,
    state: outcome === "approved" ? "active" : "closed",
    approverId: actor.id,
    approverRole: actor.role as "founder" | "operator" | "reviewer",
    secondReviewerId: opts.secondReviewerId ?? null,
    decidedAt: tx.nowIso,
    expiresAt: outcome === "approved" ? new Date(tx.now.getTime() + validityDays * 86_400_000).toISOString() : null,
    invalidatedAt: null,
    invalidatedReason: null,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: true,
  });
  if (outcome === "approved") {
    setStatus(tx, type, id, type === "campaign" ? "approved" : statusAfterApproval(tx, type, id));
  } else {
    setStatus(tx, type, id, "draft");
  }
  audit(tx, actor, `approval-${outcome}`, type, id, null);
  return approval;
}

function statusAfterApproval(tx: OpsTx, type: ApprovalSubject, id: string) {
  const scheduled = type === "outreach" ? tx.require("outreach", id).scheduledFor : tx.require("content", id).scheduledFor;
  return scheduled ? "scheduled" : "approved";
}

export function invalidateApprovals(tx: OpsTx, actor: Actor, type: ApprovalSubject, id: string, reason: string) {
  for (const a of activeApprovals(tx, type, id)) {
    tx.update("approvals", a.id, a.version, { state: "invalidated", invalidatedAt: tx.nowIso, invalidatedReason: reason });
    audit(tx, actor, "approval-invalidated", type, id, reason);
  }
}

export type ApprovalCheck = { ok: true; approval: Approval; payload: Payload } | { ok: false; reason: string };

// The only question a dispatcher asks: does an unexpired approval exist
// for exactly what is about to leave?
export function currentApproval(tx: OpsTx, type: ApprovalSubject, id: string): ApprovalCheck {
  const payload = payloadFor(tx, type, id);
  const active = activeApprovals(tx, type, id);
  if (active.length === 0) {
    return { ok: false, reason: "no-approval" };
  }
  // Drafts bind to their immutable content version as well as the hash. A
  // campaign has no content versions (its row version changes with its
  // status), so its approval binds to the scope hash alone.
  const match = active.find((a) => a.payloadHash === payload.hash && (type === "campaign" || a.subjectVersion === payload.version));
  if (!match) {
    return { ok: false, reason: "approval-does-not-match-content" };
  }
  if (match.expiresAt && match.expiresAt <= tx.nowIso) {
    tx.update("approvals", match.id, match.version, { state: "expired", invalidatedAt: tx.nowIso, invalidatedReason: "expired" });
    return { ok: false, reason: "approval-expired" };
  }
  return { ok: true, approval: match, payload };
}

export function consumeApproval(tx: OpsTx, approval: Approval) {
  const fresh = tx.require("approvals", approval.id);
  tx.update("approvals", fresh.id, fresh.version, { state: "consumed" });
}
