// Relationships: prospects, organizations, interactions, tasks, permission
// review, withdrawal, erasure, and export.
import { audit, requireCapability, type Actor } from "./access";
import { GateError, invalidateApprovals } from "./approvals";
import { EMAIL_PATTERN, emailKey, newId, normalizeEmail } from "./ids";
import { applySuppression } from "./permissions";
import { markAutomaticStep } from "./cases";
import { isoDate, must, nullable, obj, oneOf, str } from "./schema";
import { StoreError, type OpsTx } from "./store";
import { BLOCK_REASONS, PARTICIPATION_INTERESTS, PRIORITIES, STAGES, TASK_TYPES, type Stage, type SuppressionScope } from "./types";
import { canTransition, requiresFounder } from "./workflow";

const base = (tx: OpsTx) => ({ createdAt: tx.nowIso, updatedAt: tx.nowIso, version: 1, synthetic: tx.synthetic });
const https = str({ max: 500, pattern: /^https:\/\/[^\s]+$/, code: "https-url-required" });

// ---------- Manually researched or referred prospects ----------

const ManualProspectInput = obj({
  kind: oneOf(["person", "organization"] as const),
  displayName: str({ min: 1, max: 120 }),
  email: nullable(str({ max: 254, pattern: EMAIL_PATTERN, code: "invalid-email" })),
  organizationName: nullable(str({ max: 160 })),
  region: nullable(str({ max: 80 })),
  participationInterest: oneOf(PARTICIPATION_INTERESTS),
  source: oneOf(["referral", "manual-research"] as const),
  // How the public business contact was found, when, and why contact is
  // legitimate. Required: there is no anonymous lead.
  sourceEvidenceUrl: https,
  sourceObservedOn: isoDate,
  contactReason: str({ min: 10, max: 500, multiline: true }),
  priority: oneOf(PRIORITIES),
});

export function createManualProspect(tx: OpsTx, actor: Actor, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(ManualProspectInput, input);
  const email = v.email ? normalizeEmail(v.email) : null;
  const key = email ? emailKey(email, tx.pepper) : null;
  if (key && tx.list("prospects", (p) => p.emailKey === key).length) {
    throw new GateError("already-known");
  }
  if (key && tx.list("suppressions", (s) => s.emailKey === key && s.liftedAt === null).length) {
    throw new GateError("address-suppressed");
  }
  const prospect = tx.insert("prospects", {
    id: newId("prs"),
    kind: v.kind,
    displayName: v.displayName,
    email,
    emailKey: key,
    organizationId: null,
    organizationName: v.organizationName,
    region: v.region,
    participationInterest: v.participationInterest,
    source: v.source,
    sourceEvidenceUrl: v.sourceEvidenceUrl,
    sourceObservedOn: v.sourceObservedOn,
    contactReason: v.contactReason,
    stage: "triage-ready",
    blockedReason: null,
    ownerId: actor.id === "system" ? null : actor.id,
    nextAction: "Review the contact basis before any first message",
    nextActionDue: null,
    priority: v.priority,
    authorityStatus: "unverified",
    retentionClass: "inquiry-12m",
    retainUntil: new Date(tx.now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10),
    lastInboundAt: null,
    lastOutboundAt: null,
    ...base(tx),
  });
  if (email) {
    // A documented basis awaiting a person's review, never an opt-in.
    tx.insert("permissions", {
      id: newId("perm"),
      prospectId: prospect.id,
      purpose: "pilot-follow-up",
      basis: v.source === "referral" ? "referral-introduction" : "documented-public-business-contact",
      capturedWording: null,
      wordingVersion: null,
      captureChannel: "manual-record",
      capturedAt: tx.nowIso,
      state: "pending-review",
      reviewedBy: null,
      reviewedAt: null,
      withdrawnAt: null,
      expiresAt: null,
      ...base(tx),
    });
  }
  tx.insert("tasks", {
    id: newId("tsk"),
    type: "permission-review",
    title: "Review the basis for contacting this prospect",
    dueOn: null,
    ownerId: null,
    prospectId: prospect.id,
    status: "open",
    priority: v.priority,
    resolution: null,
    createdBy: actor.id,
    dedupeKey: `basis:${prospect.id}`,
    ...base(tx),
  });
  audit(tx, actor, "prospect-created", "prospect", prospect.id, v.source);
  return prospect;
}

// The founder or a reviewer confirms (or rejects) that a researched
// contact may be written to once, individually. Applicable communications
// law is part of this review (docs/flight-deck/operations.md).
export function reviewPermissionBasis(tx: OpsTx, actor: Actor, permissionId: string, decision: "accept" | "reject") {
  requireCapability(actor, "approve");
  const p = tx.require("permissions", permissionId);
  if (p.state !== "pending-review") {
    throw new GateError("not-pending-review");
  }
  tx.update("permissions", p.id, p.version, decision === "accept" ? { state: "active", reviewedBy: actor.id, reviewedAt: tx.nowIso } : { state: "expired", reviewedBy: actor.id, reviewedAt: tx.nowIso });
  for (const t of tx.list("tasks", (t) => t.prospectId === p.prospectId && t.type === "permission-review" && t.status === "open")) {
    tx.update("tasks", t.id, t.version, { status: "done", resolution: decision === "accept" ? "Contact basis accepted." : "Contact basis rejected; do not contact." });
  }
  audit(tx, actor, decision === "accept" ? "basis-accepted" : "basis-rejected", "permission", p.id, null);
}

// ---------- Details, stage, ownership ----------

const ProspectEdit = obj({
  displayName: str({ min: 1, max: 120 }),
  email: nullable(str({ max: 254, pattern: EMAIL_PATTERN, code: "invalid-email" })),
  organizationName: nullable(str({ max: 160 })),
  region: nullable(str({ max: 80 })),
  priority: oneOf(PRIORITIES),
  nextAction: nullable(str({ max: 200 })),
  nextActionDue: nullable(isoDate),
  ownerId: nullable(str({ max: 64, pattern: /^usr_[A-Za-z0-9]{6,48}$/ })),
});

export function editProspect(tx: OpsTx, actor: Actor, id: string, expectedVersion: number, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(ProspectEdit, input);
  const p = tx.require("prospects", id);
  const email = v.email ? normalizeEmail(v.email) : null;
  const key = email ? emailKey(email, tx.pepper) : null;
  if (key && key !== p.emailKey && tx.list("prospects", (o) => o.emailKey === key).length) {
    throw new GateError("already-known");
  }
  const updated = tx.update("prospects", id, expectedVersion, { ...v, email, emailKey: key });
  if (key !== p.emailKey) {
    // A new recipient: every approval for this person's drafts is void.
    for (const d of tx.list("outreach", (d) => d.prospectId === id)) {
      invalidateApprovals(tx, actor, "outreach", d.id, "recipient-changed");
      if (["approved", "scheduled", "manual-ready"].includes(d.status)) {
        tx.update("outreach", d.id, d.version, { status: "draft" });
      }
    }
  }
  audit(tx, actor, "prospect-edited", "prospect", id, key !== p.emailKey ? "address-changed" : null);
  return updated;
}

const TransitionInput = obj({
  to: oneOf(STAGES),
  blockedReason: nullable(oneOf(BLOCK_REASONS)),
});

export function transitionStage(tx: OpsTx, actor: Actor, id: string, expectedVersion: number, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(TransitionInput, input);
  const p = tx.require("prospects", id);
  if (p.version !== expectedVersion) {
    throw new StoreError("version-conflict", "prospects row changed since it was read");
  }
  if (!canTransition(p.stage, v.to)) {
    throw new GateError("transition-not-allowed");
  }
  if (requiresFounder(p.stage) && actor.role !== "founder") {
    throw new GateError("founder-required");
  }
  if (v.to === "needs-review" && !v.blockedReason) {
    throw new GateError("block-reason-required");
  }
  if (v.to === "withdrawn" || v.to === "suppressed") {
    // Routed through withdrawal so suppression is applied atomically.
    withdraw(tx, actor, id, "all", v.to === "withdrawn" ? "withdrawal" : "founder-hold");
    return tx.require("prospects", id);
  }
  const updated = tx.update("prospects", id, expectedVersion, {
    stage: v.to,
    blockedReason: v.to === "needs-review" ? v.blockedReason : null,
    retentionClass: (["conversation-scheduled", "consultation-underway", "pilot-candidate"] as Stage[]).includes(v.to) ? "active-relationship" : p.retentionClass,
  });
  audit(tx, actor, "stage-changed", "prospect", id, v.to);
  return updated;
}

// ---------- Withdrawal and suppression ----------

export function withdraw(
  tx: OpsTx,
  actor: Actor,
  prospectId: string,
  scope: SuppressionScope,
  basis: "unsubscribe" | "withdrawal" | "founder-hold" = "withdrawal",
) {
  requireCapability(actor, "manage-suppression");
  const p = tx.require("prospects", prospectId);
  const purposes = scope === "newsletter" ? ["newsletter"] : scope === "outreach" ? ["pilot-follow-up", "newsletter"] : ["direct-response", "pilot-follow-up", "newsletter"];
  for (const perm of tx.list("permissions", (x) => x.prospectId === p.id && purposes.includes(x.purpose) && x.state !== "withdrawn")) {
    tx.update("permissions", perm.id, perm.version, { state: "withdrawn", withdrawnAt: tx.nowIso });
  }
  if (p.emailKey) {
    applySuppression(tx, actor, p.emailKey, scope, basis);
  }
  if (scope !== "newsletter") {
    // Nothing left to reply to or follow up on.
    for (const t of tx.list("tasks", (t) => t.prospectId === p.id && t.status === "open" && ["triage", "reply", "follow-up", "schedule-conversation"].includes(t.type))) {
      tx.update("tasks", t.id, t.version, { status: "cancelled", resolution: "Contact withdrawn." });
    }
  }
  const fresh = tx.require("prospects", p.id);
  if (scope === "all") {
    tx.update("prospects", p.id, fresh.version, {
      stage: basis === "founder-hold" ? "suppressed" : "withdrawn",
      nextAction: "Review retention and deletion",
      retentionClass: "suppression-only",
    });
    audit(tx, actor, "stage-changed", "prospect", p.id, basis === "founder-hold" ? "suppressed" : "withdrawn");
  }
  // Stopping contact is immediate; deletion is a separate, reviewed step.
  const key = `retention:${p.id}:${scope}`;
  if (!tx.list("tasks", (t) => t.dedupeKey === key).length) {
    tx.insert("tasks", {
      id: newId("tsk"),
      type: "retention-review",
      title: scope === "newsletter" ? "Unsubscribed from updates: confirm nothing else changes" : "Opted out: review retention and whether to erase",
      dueOn: new Date(tx.now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10),
      ownerId: null,
      prospectId: p.id,
      status: "open",
      priority: "high",
      resolution: null,
      createdBy: actor.id,
      dedupeKey: key,
      ...base(tx),
    });
  }
  audit(tx, actor, "contact-withdrawn", "prospect", p.id, scope);
}

// ---------- Interactions and tasks ----------

const InteractionInput = obj({
  channel: oneOf(["email", "call", "video", "meeting", "letter", "other"] as const),
  direction: oneOf(["inbound", "outbound", "internal-note"] as const),
  summary: str({ min: 1, max: 600, multiline: true }),
  sourceIntegrity: oneOf(["verified-sender", "unverified", "not-applicable"] as const),
  needsResponse: oneOf(["yes", "no"] as const),
});

export function recordInteraction(tx: OpsTx, actor: Actor, prospectId: string, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(InteractionInput, input);
  const p = tx.require("prospects", prospectId);
  const interaction = tx.insert("interactions", {
    id: newId("int"),
    prospectId: p.id,
    channel: v.channel,
    direction: v.direction,
    occurredAt: tx.nowIso,
    summary: v.summary,
    sourceIntegrity: v.sourceIntegrity,
    outreachDraftId: null,
    needsResponse: v.needsResponse === "yes",
    actorId: actor.id,
    ...base(tx),
  });
  if (v.direction === "inbound") {
    if (v.sourceIntegrity === "verified-sender") {
      tx.update("prospects", p.id, p.version, { lastInboundAt: tx.nowIso });
    }
    // A reply never commits TIRO to anything; it becomes an action item.
    tx.insert("tasks", {
      id: newId("tsk"),
      type: v.sourceIntegrity === "verified-sender" ? "reply" : "permission-review",
      title: v.sourceIntegrity === "verified-sender" ? "Respond to their message" : "Confirm the sender is this prospect before acting on it",
      dueOn: new Date(tx.now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10),
      ownerId: p.ownerId,
      prospectId: p.id,
      status: "open",
      priority: "high",
      resolution: null,
      createdBy: actor.id,
      dedupeKey: `inbound:${interaction.id}`,
      ...base(tx),
    });
  }
  audit(tx, actor, "interaction-recorded", "prospect", p.id, v.direction);
  return interaction;
}

const TaskInput = obj({
  type: oneOf(TASK_TYPES),
  title: str({ min: 1, max: 160 }),
  dueOn: nullable(isoDate),
  priority: oneOf(PRIORITIES),
});

export function createTask(tx: OpsTx, actor: Actor, prospectId: string | null, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(TaskInput, input);
  if (prospectId) {
    tx.require("prospects", prospectId);
  }
  const task = tx.insert("tasks", {
    id: newId("tsk"),
    ...v,
    ownerId: actor.id === "system" ? null : actor.id,
    prospectId,
    status: "open",
    resolution: null,
    createdBy: actor.id,
    dedupeKey: null,
    ...base(tx),
  });
  audit(tx, actor, "task-created", "task", task.id, v.type);
  return task;
}

export function resolveTask(tx: OpsTx, actor: Actor, taskId: string, expectedVersion: number, outcome: "done" | "cancelled" | "escalated") {
  requireCapability(actor, "edit-relationships");
  const t = tx.require("tasks", taskId);
  if (t.status !== "open" && t.status !== "escalated") {
    throw new GateError("task-closed");
  }
  tx.update("tasks", taskId, expectedVersion, { status: outcome, resolution: outcome === "escalated" ? "Escalated to founder." : null, priority: outcome === "escalated" ? "high" : t.priority });
  audit(tx, actor, `task-${outcome}`, "task", taskId, null);
}

// ---------- Erasure and export ----------

// Removes the person's operational record entirely. Suppression (a keyed
// hash, no address) survives if requested, so they are never contacted
// again. Approvals, jobs and receipts keep only opaque ids.
export function eraseProspect(tx: OpsTx, actor: Actor, prospectId: string, keepSuppression: boolean) {
  requireCapability(actor, "delete-records");
  const p = tx.require("prospects", prospectId);
  if (keepSuppression && p.emailKey) {
    applySuppression(tx, actor, p.emailKey, "all", "withdrawal");
  }
  for (const i of tx.list("interactions", (i) => i.prospectId === p.id)) {
    tx.remove("interactions", i.id);
  }
  const drafts = tx.list("outreach", (d) => d.prospectId === p.id).sort((a, b) => (a.followUpOf ? 0 : 1) - (b.followUpOf ? 0 : 1));
  for (const d of drafts) {
    invalidateApprovals(tx, actor, "outreach", d.id, "subject-erased");
    for (const j of tx.list("jobs", (j) => j.subjectId === d.id && ["queued", "held", "failed", "running"].includes(j.status))) {
      tx.update("jobs", j.id, j.version, { status: "cancelled", holdReason: "subject-erased", nextAttemptAt: null });
    }
    tx.remove("outreach", d.id);
  }
  for (const s of tx.list("submissions", (s) => s.prospectId === p.id)) {
    for (const j of tx.list("jobs", (j) => j.subjectId === s.id && ["queued", "held", "running"].includes(j.status))) {
      tx.update("jobs", j.id, j.version, { status: "cancelled", holdReason: "subject-erased", nextAttemptAt: null });
    }
    tx.remove("submissions", s.id);
  }
  // Cases stay as accountability records, without the person: the link
  // is cleared and any "erase" step is marked done.
  for (const c of tx.list("cases", (x) => x.prospectId === p.id)) {
    markAutomaticStep(tx, actor, c, "erase-record");
    const fresh = tx.require("cases", c.id);
    tx.update("cases", c.id, fresh.version, { prospectId: null });
  }
  for (const c of ["tasks", "affiliations", "permissions"] as const) {
    for (const row of tx.list(c, (r) => (r as { prospectId: string | null }).prospectId === p.id)) {
      tx.remove(c, (row as { id: string }).id);
    }
  }
  tx.remove("prospects", p.id);
  tx.insert("erasures", { id: newId("ers"), prospectId: p.id, erasedAt: tx.nowIso, ...base(tx) });
  audit(tx, actor, "prospect-erased", "prospect", p.id, keepSuppression ? "suppression-kept" : null);
}

// Everything held about one person, for a subject-access response or the
// founder's printable summary. Permission-bound; the act is audited.
export function exportProspect(tx: OpsTx, actor: Actor, prospectId: string) {
  requireCapability(actor, "export");
  const p = tx.require("prospects", prospectId);
  audit(tx, actor, "export-generated", "prospect", p.id, null);
  const { emailKey: _key, ...prospect } = p;
  void _key;
  return {
    generatedAt: tx.nowIso,
    synthetic: p.synthetic,
    prospect,
    organization: p.organizationId ? tx.get("organizations", p.organizationId) : null,
    submissions: tx.list("submissions", (s) => s.prospectId === p.id),
    permissions: tx.list("permissions", (x) => x.prospectId === p.id),
    interactions: tx.list("interactions", (i) => i.prospectId === p.id),
    tasks: tx.list("tasks", (t) => t.prospectId === p.id),
    outreach: tx.list("outreach", (d) => d.prospectId === p.id).map((d) => ({ id: d.id, purpose: d.purpose, status: d.status, current: d.versions.find((v) => v.version === d.currentVersion) })),
  };
}
