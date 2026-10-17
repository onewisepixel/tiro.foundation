// Outreach drafts, content drafts, and campaigns. Every edit appends an
// immutable version; editing anything an approval covers revokes that
// approval and cancels any job queued against it.
import { audit, requireCapability, type Actor } from "./access";
import { currentApproval, GateError, invalidateApprovals } from "./approvals";
import { canonicalJson, newId, sha256 } from "./ids";
import { contactEligibility } from "./permissions";
import { must, nullable, obj, oneOf, str, isoInstant, opaqueId } from "./schema";
import type { OpsTx } from "./store";
import { CHANNELS_CONTENT, ORIGIN_CATEGORIES, OUTREACH_PURPOSES, type ApprovalSubject } from "./types";

const LOCKED = ["sent", "published", "archived"];

function cancelJobs(tx: OpsTx, actor: Actor, subjectId: string, reason: string) {
  for (const job of tx.list("jobs", (j) => j.subjectId === subjectId && (j.status === "queued" || j.status === "held" || j.status === "failed"))) {
    tx.update("jobs", job.id, job.version, { status: "cancelled", holdReason: reason, nextAttemptAt: null });
    audit(tx, actor, "job-cancelled", "job", job.id, reason);
  }
}

function contentHash(parts: Record<string, unknown>) {
  return sha256(canonicalJson(parts));
}

// ---------- Outreach ----------

export const OutreachInput = obj({
  prospectId: opaqueId("prs"),
  purpose: oneOf(OUTREACH_PURPOSES.filter((p) => p !== "acknowledgement") as ["first-contact", "follow-up", "reply"]),
  subject: str({ min: 1, max: 160 }),
  body: str({ min: 1, max: 4000, multiline: true }),
  campaignId: nullable(opaqueId("cmp")),
  followUpOf: nullable(opaqueId("out")),
  scheduledFor: nullable(isoInstant),
});

export function createOutreachDraft(tx: OpsTx, actor: Actor, input: unknown, origin: "template" | "human" = "human") {
  requireCapability(actor, "edit-drafts");
  const v = must(OutreachInput, input);
  const prospect = tx.require("prospects", v.prospectId);
  if (v.purpose === "follow-up") {
    // Bounded: at most maxFollowUps (default 1) follow-ups per prospect.
    // No sequences.
    const prior = tx.list("outreach", (d) => d.prospectId === prospect.id && d.purpose === "follow-up" && d.status !== "archived");
    if (prior.length >= tx.settings().maxFollowUps) {
      throw new GateError("follow-up-limit-reached");
    }
  }
  const eligibility = contactEligibility(tx, prospect, v.purpose);
  const draft = tx.insert("outreach", {
    id: newId("out"),
    prospectId: prospect.id,
    campaignId: v.campaignId,
    purpose: v.purpose,
    permissionId: eligibility.ok ? eligibility.permission.id : null,
    channel: "email",
    versions: [{ version: 1, subject: v.subject, body: v.body, editedAt: tx.nowIso, editedBy: actor.id, contentHash: contentHash({ subject: v.subject, body: v.body }) }],
    currentVersion: 1,
    status: "draft",
    scheduledFor: v.scheduledFor,
    followUpOf: v.followUpOf,
    origin,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: true,
  });
  audit(tx, actor, "draft-created", "outreach", draft.id, origin === "template" ? "from-template" : null);
  return draft;
}

const OutreachEdit = obj({
  subject: str({ min: 1, max: 160 }),
  body: str({ min: 1, max: 4000, multiline: true }),
  scheduledFor: nullable(isoInstant),
});

export function editOutreachDraft(tx: OpsTx, actor: Actor, id: string, expectedVersion: number, input: unknown) {
  requireCapability(actor, "edit-drafts");
  const v = must(OutreachEdit, input);
  const draft = tx.require("outreach", id);
  if (LOCKED.includes(draft.status)) {
    throw new GateError("draft-locked");
  }
  const current = draft.versions.find((x) => x.version === draft.currentVersion)!;
  const textChanged = current.subject !== v.subject || current.body !== v.body;
  const scheduleChanged = draft.scheduledFor !== v.scheduledFor;
  if (!textChanged && !scheduleChanged) {
    return draft;
  }
  const versions = textChanged
    ? [...draft.versions, { version: draft.currentVersion + 1, subject: v.subject, body: v.body, editedAt: tx.nowIso, editedBy: actor.id, contentHash: contentHash({ subject: v.subject, body: v.body }) }]
    : draft.versions;
  const updated = tx.update("outreach", id, expectedVersion, {
    versions,
    currentVersion: textChanged ? draft.currentVersion + 1 : draft.currentVersion,
    scheduledFor: v.scheduledFor,
    status: "draft",
  });
  invalidateApprovals(tx, actor, "outreach", id, textChanged ? "content-edited" : "schedule-changed");
  cancelJobs(tx, actor, id, "edited-after-approval");
  audit(tx, actor, "draft-edited", "outreach", id, textChanged ? "content" : "schedule");
  return updated;
}

// ---------- Content ----------

export const ContentInput = obj({
  campaignId: nullable(opaqueId("cmp")),
  title: str({ min: 1, max: 160 }),
  channel: oneOf(CHANNELS_CONTENT),
  originCategory: oneOf(ORIGIN_CATEGORIES),
  sourceReference: str({ min: 1, max: 200 }),
  assetDescription: nullable(str({ max: 300 })),
  assetPermission: nullable(str({ max: 300 })),
  body: str({ min: 1, max: 3000, multiline: true }),
  scheduledFor: nullable(isoInstant),
});

export function createContentDraft(tx: OpsTx, actor: Actor, input: unknown, origin: "template" | "human" = "human") {
  requireCapability(actor, "edit-drafts");
  const v = must(ContentInput, input);
  const draft = tx.insert("content", {
    id: newId("cnt"),
    campaignId: v.campaignId,
    title: v.title,
    channel: v.channel,
    originCategory: v.originCategory,
    sourceReference: v.sourceReference,
    assetDescription: v.assetDescription,
    assetPermission: v.assetPermission,
    versions: [{ version: 1, body: v.body, editedAt: tx.nowIso, editedBy: actor.id, contentHash: contentHash({ body: v.body }) }],
    currentVersion: 1,
    status: "draft",
    scheduledFor: v.scheduledFor,
    publicationRoute: "manual",
    origin,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: true,
  });
  audit(tx, actor, "draft-created", "content", draft.id, origin === "template" ? "from-template" : null);
  return draft;
}

const ContentEdit = obj({
  title: str({ min: 1, max: 160 }),
  channel: oneOf(CHANNELS_CONTENT),
  originCategory: oneOf(ORIGIN_CATEGORIES),
  sourceReference: str({ min: 1, max: 200 }),
  assetDescription: nullable(str({ max: 300 })),
  assetPermission: nullable(str({ max: 300 })),
  body: str({ min: 1, max: 3000, multiline: true }),
  scheduledFor: nullable(isoInstant),
});

export function editContentDraft(tx: OpsTx, actor: Actor, id: string, expectedVersion: number, input: unknown) {
  requireCapability(actor, "edit-drafts");
  const v = must(ContentEdit, input);
  const draft = tx.require("content", id);
  if (LOCKED.includes(draft.status)) {
    throw new GateError("draft-locked");
  }
  const current = draft.versions.find((x) => x.version === draft.currentVersion)!;
  const bodyChanged = current.body !== v.body;
  const metaChanged =
    draft.title !== v.title ||
    draft.channel !== v.channel ||
    draft.originCategory !== v.originCategory ||
    draft.sourceReference !== v.sourceReference ||
    draft.assetDescription !== v.assetDescription ||
    draft.assetPermission !== v.assetPermission ||
    draft.scheduledFor !== v.scheduledFor;
  if (!bodyChanged && !metaChanged) {
    return draft;
  }
  const updated = tx.update("content", id, expectedVersion, {
    title: v.title,
    channel: v.channel,
    originCategory: v.originCategory,
    sourceReference: v.sourceReference,
    assetDescription: v.assetDescription,
    assetPermission: v.assetPermission,
    scheduledFor: v.scheduledFor,
    versions: bodyChanged ? [...draft.versions, { version: draft.currentVersion + 1, body: v.body, editedAt: tx.nowIso, editedBy: actor.id, contentHash: contentHash({ body: v.body }) }] : draft.versions,
    currentVersion: bodyChanged ? draft.currentVersion + 1 : draft.currentVersion,
    status: "draft",
  });
  invalidateApprovals(tx, actor, "content", id, bodyChanged ? "content-edited" : "details-changed");
  cancelJobs(tx, actor, id, "edited-after-approval");
  audit(tx, actor, "draft-edited", "content", id, bodyChanged ? "content" : "details");
  return updated;
}

export function archiveDraft(tx: OpsTx, actor: Actor, type: Exclude<ApprovalSubject, "campaign">, id: string) {
  requireCapability(actor, "edit-drafts");
  const row = type === "outreach" ? tx.require("outreach", id) : tx.require("content", id);
  if (row.status === "sent" || row.status === "published") {
    throw new GateError("draft-locked");
  }
  if (type === "outreach") {
    tx.update("outreach", id, row.version, { status: "archived" });
  } else {
    tx.update("content", id, row.version, { status: "archived" });
  }
  invalidateApprovals(tx, actor, type, id, "archived");
  cancelJobs(tx, actor, id, "archived");
  audit(tx, actor, "draft-archived", type, id, null);
}

// ---------- Campaigns ----------

const CampaignEdit = obj({
  name: str({ min: 1, max: 120 }),
  purpose: str({ max: 500, multiline: true }),
  audience: str({ max: 300, multiline: true }),
  postsPerWeekCap: oneOf(["0", "1", "2", "3", "4", "5", "6", "7"] as const),
  introductionsPerWeekCap: oneOf(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const),
  metricsDefinition: str({ max: 600, multiline: true }),
  consentReviewStatus: oneOf(["not-started", "in-review", "cleared", "blocked"] as const),
  legalReviewStatus: oneOf(["not-started", "in-review", "cleared", "blocked"] as const),
});

export function editCampaign(tx: OpsTx, actor: Actor, id: string, expectedVersion: number, input: unknown) {
  requireCapability(actor, "edit-relationships");
  const v = must(CampaignEdit, input);
  const c = tx.require("campaigns", id);
  if (c.status === "closed") {
    throw new GateError("campaign-closed");
  }
  const scopeChanged =
    c.name !== v.name ||
    c.purpose !== v.purpose ||
    c.audience !== v.audience ||
    String(c.postsPerWeekCap) !== v.postsPerWeekCap ||
    String(c.introductionsPerWeekCap) !== v.introductionsPerWeekCap ||
    c.metricsDefinition !== v.metricsDefinition;
  const updated = tx.update("campaigns", id, expectedVersion, {
    name: v.name,
    purpose: v.purpose,
    audience: v.audience,
    postsPerWeekCap: Number(v.postsPerWeekCap),
    introductionsPerWeekCap: Number(v.introductionsPerWeekCap),
    metricsDefinition: v.metricsDefinition,
    consentReviewStatus: v.consentReviewStatus,
    legalReviewStatus: v.legalReviewStatus,
    // Changing what a campaign is for, or its limits, returns it to draft.
    status: scopeChanged ? "draft" : c.status,
  });
  if (scopeChanged) {
    invalidateApprovals(tx, actor, "campaign", id, "scope-changed");
  }
  audit(tx, actor, "campaign-edited", "campaign", id, scopeChanged ? "scope" : "review-status");
  return updated;
}

export function setCampaignState(tx: OpsTx, actor: Actor, id: string, next: "active" | "paused" | "closed") {
  const c = tx.require("campaigns", id);
  if (next === "paused") {
    requireCapability(actor, "pause");
  } else {
    requireCapability(actor, "resume");
  }
  if (next === "active") {
    // Activation needs the approval for exactly this scope, and cleared
    // consent and legal review. Approval of a campaign never makes any
    // particular recipient eligible: each message is still approved alone.
    if (c.consentReviewStatus !== "cleared" || c.legalReviewStatus !== "cleared") {
      throw new GateError("reviews-not-cleared");
    }
    const check = currentApproval(tx, "campaign", id);
    if (!check.ok) {
      throw new GateError(check.reason);
    }
    if (c.status !== "approved" && c.status !== "paused") {
      throw new GateError("campaign-not-approved");
    }
  }
  tx.update("campaigns", id, c.version, { status: next });
  audit(tx, actor, `campaign-${next}`, "campaign", id, null);
}
