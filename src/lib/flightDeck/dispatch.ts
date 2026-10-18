// Dispatch: the only path by which anything could leave TIRO.
//
// Order of checks, re-run at the moment of dispatch, not at queue time:
//   global pause -> approval for exactly this payload -> suppression ->
//   communication permission -> campaign state and weekly cap -> provider.
// A failure at any step holds or cancels the job; nothing is sent.
//
// Status is only ever "sent" or "published" with a provider confirmation
// or a named person's manual attestation. A dry run is "simulated". A job
// carries one idempotency key for its whole life, so a retry after a crash
// or a failure cannot produce a second message.
import { audit, requireCapability, SYSTEM, type Actor } from "./access";
import { consumeApproval, currentApproval, GateError } from "./approvals";
import { newId } from "./ids";
import { contactEligibility } from "./permissions";
import type { ProviderResult, Providers } from "./providers";
import type { OperationsStore, OpsTx } from "./store";
import { acknowledgementMessage } from "./templates";
import type { DispatchJob, OutreachDraft } from "./types";

const LEASE_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 60 * 1000;

const base = (tx: OpsTx) => ({ createdAt: tx.nowIso, updatedAt: tx.nowIso, version: 1, synthetic: tx.synthetic });

function weekAgo(tx: OpsTx) {
  return new Date(tx.now.getTime() - 7 * 86_400_000).toISOString();
}

function campaignGate(tx: OpsTx, draft: OutreachDraft): string | null {
  if (!draft.campaignId) {
    return null;
  }
  const campaign = tx.require("campaigns", draft.campaignId);
  if (campaign.status !== "active") {
    return "campaign-not-active";
  }
  if (draft.purpose === "first-contact") {
    const ids = new Set(tx.list("outreach", (d) => d.campaignId === campaign.id && d.purpose === "first-contact").map((d) => d.id));
    const recent = tx.list("receipts", (r) => r.subjectType === "outreach" && ids.has(r.subjectId) && r.result !== "simulated" && r.at >= weekAgo(tx));
    if (recent.length >= campaign.introductionsPerWeekCap) {
      return "weekly-cap-reached";
    }
  }
  return null;
}

// Content linked to a campaign publishes only while the campaign is
// active, and within its weekly post limit.
function contentGate(tx: OpsTx, contentId: string): string | null {
  const content = tx.require("content", contentId);
  if (!content.campaignId) {
    return null;
  }
  const campaign = tx.require("campaigns", content.campaignId);
  if (campaign.status !== "active") {
    return "campaign-not-active";
  }
  const ids = new Set(tx.list("content", (c) => c.campaignId === campaign.id).map((c) => c.id));
  const recent = tx.list("receipts", (r) => r.subjectType === "content" && ids.has(r.subjectId) && r.result !== "simulated" && r.at >= weekAgo(tx));
  return recent.length >= campaign.postsPerWeekCap ? "weekly-cap-reached" : null;
}

function outreachGate(tx: OpsTx, draft: OutreachDraft) {
  const approval = currentApproval(tx, "outreach", draft.id);
  if (!approval.ok) {
    return { ok: false as const, reason: approval.reason, cancel: false };
  }
  const prospect = tx.require("prospects", draft.prospectId);
  const eligibility = contactEligibility(tx, prospect, draft.purpose);
  if (!eligibility.ok) {
    return { ok: false as const, reason: eligibility.reason, cancel: eligibility.reason === "suppressed" || eligibility.reason === "withdrawn" };
  }
  const campaign = campaignGate(tx, draft);
  if (campaign) {
    return { ok: false as const, reason: campaign, cancel: false };
  }
  return { ok: true as const, approval: approval.approval, prospect };
}

// ---------- Queueing ----------

export function queueDispatch(tx: OpsTx, actor: Actor, type: "outreach" | "content", id: string): DispatchJob {
  requireCapability(actor, "dispatch");
  const check = currentApproval(tx, type, id);
  if (!check.ok) {
    throw new GateError(check.reason);
  }
  if (type === "outreach") {
    const gate = outreachGate(tx, tx.require("outreach", id));
    if (!gate.ok) {
      throw new GateError(gate.reason);
    }
  } else {
    const gate = contentGate(tx, id);
    if (gate) {
      throw new GateError(gate);
    }
  }
  const row = type === "outreach" ? tx.require("outreach", id) : tx.require("content", id);
  const key = `${type}:${id}:v${row.currentVersion}:${check.approval.id}`;
  const existing = tx.list("jobs", (j) => j.idempotencyKey === key)[0];
  if (existing) {
    return existing; // queuing twice is a no-op, never a second job
  }
  const job = tx.insert("jobs", {
    id: newId("job"),
    kind: type === "outreach" ? "send-outreach" : "publish-content",
    subjectId: id,
    subjectVersion: row.currentVersion,
    approvalId: check.approval.id,
    idempotencyKey: key,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: row.scheduledFor && row.scheduledFor > tx.nowIso ? row.scheduledFor : tx.nowIso,
    lastErrorCode: null,
    holdReason: null,
    ...base(tx),
  });
  if (type === "outreach") {
    tx.update("outreach", id, row.version, { status: "scheduled" });
  } else {
    tx.update("content", id, row.version, { status: "scheduled" });
  }
  audit(tx, actor, "dispatch-queued", "job", job.id, null);
  return job;
}

export function retryJob(tx: OpsTx, actor: Actor, jobId: string) {
  requireCapability(actor, "dispatch");
  const job = tx.require("jobs", jobId);
  if (!["failed", "dead", "held"].includes(job.status)) {
    throw new GateError("job-not-retryable");
  }
  tx.update("jobs", job.id, job.version, { status: "queued", attempts: 0, nextAttemptAt: tx.nowIso, holdReason: null });
  audit(tx, actor, "job-retried", "job", job.id, null);
}

// ---------- Running ----------

type Prepared =
  | { kind: "skip" }
  | { kind: "email"; jobId: string; to: string; subject: string; body: string; purpose: "transactional" | "outreach"; key: string }
  | { kind: "social"; jobId: string; channel: string; body: string; key: string }
  | { kind: "newsletter"; jobId: string };

export type RunSummary = { paused: boolean; claimed: number; outcomes: Record<string, number> };

export async function runDueJobs(store: OperationsStore, providers: Providers, actor: Actor = SYSTEM): Promise<RunSummary> {
  requireCapability(actor, "dispatch");
  const claimed = await store.transaction((tx) => {
    if (tx.settings().allOutboundPaused) {
      return null;
    }
    const due = tx.list("jobs", (j) => (j.status === "queued" && (j.nextAttemptAt ?? "") <= tx.nowIso) || (j.status === "running" && (j.nextAttemptAt ?? "") <= tx.nowIso));
    for (const job of due) {
      tx.update("jobs", job.id, job.version, { status: "running", nextAttemptAt: new Date(tx.now.getTime() + LEASE_MS).toISOString() });
    }
    return due.map((j) => j.id);
  });
  if (claimed === null) {
    return { paused: true, claimed: 0, outcomes: {} };
  }
  const outcomes: Record<string, number> = {};
  const tally = (k: string) => (outcomes[k] = (outcomes[k] ?? 0) + 1);

  for (const jobId of claimed) {
    const prepared = await store.transaction((tx) => prepare(tx, jobId));
    if (prepared.kind === "skip") {
      tally("held-or-cancelled");
      continue;
    }
    let result: ProviderResult;
    try {
      result =
        prepared.kind === "email"
          ? await providers.email.send({ to: prepared.to, subject: prepared.subject, body: prepared.body, purpose: prepared.purpose, idempotencyKey: prepared.key })
          : prepared.kind === "social"
            ? await providers.social.publish({ channel: prepared.channel, body: prepared.body, idempotencyKey: prepared.key })
            : { kind: "unavailable", code: "newsletter-sending-not-built" };
    } catch {
      result = { kind: "failed", retryable: true, code: "provider-exception" };
    }
    await store.transaction((tx) => settle(tx, jobId, result));
    tally(result.kind);
  }
  return { paused: false, claimed: claimed.length, outcomes };
}

function hold(tx: OpsTx, job: DispatchJob, reason: string, cancel: boolean): Prepared {
  tx.update("jobs", job.id, job.version, { status: cancel ? "cancelled" : "held", holdReason: reason, nextAttemptAt: null });
  audit(tx, SYSTEM, cancel ? "job-cancelled" : "job-held", "job", job.id, reason);
  if (job.kind === "send-outreach") {
    const d = tx.get("outreach", job.subjectId);
    if (d && !["sent", "archived"].includes(d.status)) {
      tx.update("outreach", d.id, d.version, { status: "held" });
    }
  } else if (job.kind === "publish-content") {
    const c = tx.get("content", job.subjectId);
    if (c && !["published", "archived"].includes(c.status)) {
      tx.update("content", c.id, c.version, { status: "held" });
    }
  }
  return { kind: "skip" };
}

function prepare(tx: OpsTx, jobId: string): Prepared {
  const job = tx.require("jobs", jobId);
  if (job.status !== "running") {
    return { kind: "skip" };
  }
  // Crash recovery: a receipt already exists, so it went out. Settle,
  // never resend.
  const receipt = tx.list("receipts", (r) => r.jobId === job.id)[0];
  if (receipt) {
    tx.update("jobs", job.id, job.version, { status: receipt.result === "simulated" ? "simulated" : "succeeded", nextAttemptAt: null });
    return { kind: "skip" };
  }
  if (tx.settings().allOutboundPaused) {
    tx.update("jobs", job.id, job.version, { status: "queued", nextAttemptAt: tx.nowIso });
    return { kind: "skip" };
  }

  if (job.kind === "send-acknowledgement") {
    const submission = tx.get("submissions", job.subjectId);
    const prospect = submission ? tx.get("prospects", submission.prospectId) : null;
    if (!submission || !prospect) {
      return hold(tx, job, "subject-deleted", true);
    }
    const eligibility = contactEligibility(tx, prospect, "acknowledgement");
    if (!eligibility.ok) {
      return hold(tx, job, eligibility.reason, true);
    }
    const message = acknowledgementMessage(prospect.displayName);
    return { kind: "email", jobId, to: prospect.email!, subject: message.subject, body: message.body, purpose: "transactional", key: job.idempotencyKey };
  }

  if (job.kind === "send-outreach") {
    const draft = tx.get("outreach", job.subjectId);
    if (!draft || draft.status === "archived") {
      return hold(tx, job, "subject-deleted", true);
    }
    const gate = outreachGate(tx, draft);
    if (!gate.ok) {
      return hold(tx, job, gate.reason, gate.cancel);
    }
    if (gate.approval.id !== job.approvalId || draft.currentVersion !== job.subjectVersion) {
      return hold(tx, job, "approval-does-not-match-content", true);
    }
    const v = draft.versions.find((x) => x.version === draft.currentVersion)!;
    return { kind: "email", jobId, to: gate.prospect.email!, subject: v.subject, body: v.body, purpose: "outreach", key: job.idempotencyKey };
  }

  const content = tx.get("content", job.subjectId);
  if (!content || content.status === "archived") {
    return hold(tx, job, "subject-deleted", true);
  }
  const approval = currentApproval(tx, "content", content.id);
  if (!approval.ok) {
    return hold(tx, job, approval.reason, false);
  }
  if (approval.approval.id !== job.approvalId || content.currentVersion !== job.subjectVersion) {
    return hold(tx, job, "approval-does-not-match-content", true);
  }
  const campaignProblem = contentGate(tx, content.id);
  if (campaignProblem) {
    return hold(tx, job, campaignProblem, false);
  }
  if (content.channel === "newsletter") {
    return { kind: "newsletter", jobId };
  }
  const v = content.versions.find((x) => x.version === content.currentVersion)!;
  return { kind: "social", jobId, channel: content.channel, body: v.body, key: job.idempotencyKey };
}

function settle(tx: OpsTx, jobId: string, result: ProviderResult) {
  const job = tx.require("jobs", jobId);
  const subjectType = job.kind === "send-acknowledgement" ? "acknowledgement" : job.kind === "send-outreach" ? "outreach" : "content";

  if (result.kind === "confirmed" || result.kind === "simulated") {
    const receipt = tx.insert("receipts", {
      id: newId("rcp"),
      jobId: job.id,
      subjectType,
      subjectId: job.subjectId,
      subjectVersion: job.subjectVersion,
      route: result.kind === "confirmed" ? "provider" : "dry-run",
      providerName: result.providerName,
      providerMessageId: result.kind === "confirmed" ? result.providerMessageId : null,
      requestId: result.requestId,
      result: result.kind === "confirmed" ? "confirmed" : "simulated",
      externalUrl: result.kind === "confirmed" ? (result.externalUrl ?? null) : null,
      attestedBy: null,
      at: tx.nowIso,
      ...base(tx),
    });
    tx.update("jobs", job.id, job.version, { status: result.kind === "confirmed" ? "succeeded" : "simulated", attempts: job.attempts + 1, nextAttemptAt: null, lastErrorCode: null });
    audit(tx, SYSTEM, result.kind === "confirmed" ? "dispatch-confirmed" : "dispatch-simulated", "job", job.id, null);
    if (result.kind === "confirmed") {
      if (subjectType === "outreach") {
        const draft = tx.require("outreach", job.subjectId);
        tx.update("outreach", draft.id, draft.version, { status: "sent" });
        consumeApproval(tx, tx.require("approvals", job.approvalId!));
        afterOutreachSent(tx, SYSTEM, tx.require("outreach", draft.id), "provider");
      } else if (subjectType === "content") {
        const c = tx.require("content", job.subjectId);
        tx.update("content", c.id, c.version, { status: "published" });
        consumeApproval(tx, tx.require("approvals", job.approvalId!));
      }
    } else if (subjectType !== "acknowledgement") {
      // Dry run: nothing left the machine. The item is ready to be sent by
      // hand; its approval stays in force for that attestation.
      markManualReady(tx, subjectType, job.subjectId);
    }
    return receipt;
  }

  if (result.kind === "unavailable") {
    tx.update("jobs", job.id, job.version, { status: "held", holdReason: result.code, nextAttemptAt: null });
    audit(tx, SYSTEM, "job-held", "job", job.id, result.code);
    if (subjectType !== "acknowledgement") {
      markManualReady(tx, subjectType, job.subjectId);
    }
    return null;
  }

  const attempts = job.attempts + 1;
  const dead = !result.retryable || attempts >= job.maxAttempts;
  tx.update("jobs", job.id, job.version, {
    status: dead ? (result.retryable ? "dead" : "failed") : "queued",
    attempts,
    lastErrorCode: result.code,
    nextAttemptAt: dead ? null : new Date(tx.now.getTime() + BACKOFF_BASE_MS * 2 ** attempts).toISOString(),
  });
  audit(tx, SYSTEM, dead ? "job-failed" : "job-retry-scheduled", "job", job.id, result.code);
  if (dead && subjectType === "outreach") {
    const d = tx.require("outreach", job.subjectId);
    tx.update("outreach", d.id, d.version, { status: "failed" });
  } else if (dead && subjectType === "content") {
    const c = tx.require("content", job.subjectId);
    tx.update("content", c.id, c.version, { status: "failed" });
  }
  return null;
}

function markManualReady(tx: OpsTx, type: "outreach" | "content", id: string) {
  if (type === "outreach") {
    const d = tx.require("outreach", id);
    if (!["sent", "archived", "held"].includes(d.status)) {
      tx.update("outreach", id, d.version, { status: "manual-ready" });
    }
  } else {
    const c = tx.require("content", id);
    if (!["published", "archived", "held"].includes(c.status)) {
      tx.update("content", id, c.version, { status: "manual-ready" });
    }
  }
}

// ---------- Manual route ----------

// A named person states they sent the approved version by hand. All the
// dispatch-time gates still apply, and the result is labeled as an
// attestation, never as a provider confirmation.
export function recordManualSend(tx: OpsTx, actor: Actor, outreachId: string) {
  requireCapability(actor, "dispatch");
  if (tx.settings().allOutboundPaused) {
    throw new GateError("outbound-paused");
  }
  const draft = tx.require("outreach", outreachId);
  if (draft.status === "sent") {
    throw new GateError("already-sent");
  }
  const gate = outreachGate(tx, draft);
  if (!gate.ok) {
    throw new GateError(gate.reason);
  }
  const receipt = tx.insert("receipts", {
    id: newId("rcp"),
    jobId: null,
    subjectType: "outreach",
    subjectId: draft.id,
    subjectVersion: draft.currentVersion,
    route: "manual-attestation",
    providerName: null,
    providerMessageId: null,
    requestId: newId("man"),
    result: "attested",
    externalUrl: null,
    attestedBy: actor.id,
    at: tx.nowIso,
    ...base(tx),
  });
  tx.update("outreach", draft.id, draft.version, { status: "sent" });
  consumeApproval(tx, gate.approval);
  for (const job of tx.list("jobs", (j) => j.subjectId === draft.id && ["queued", "held", "failed"].includes(j.status))) {
    tx.update("jobs", job.id, job.version, { status: "cancelled", holdReason: "sent-manually", nextAttemptAt: null });
  }
  audit(tx, actor, "manual-send-attested", "outreach", draft.id, null);
  afterOutreachSent(tx, actor, tx.require("outreach", draft.id), "manual");
  return receipt;
}

export function recordManualPublication(tx: OpsTx, actor: Actor, contentId: string, externalUrl: string | null) {
  requireCapability(actor, "dispatch");
  if (tx.settings().allOutboundPaused) {
    throw new GateError("outbound-paused");
  }
  const content = tx.require("content", contentId);
  if (content.status === "published") {
    throw new GateError("already-published");
  }
  const check = currentApproval(tx, "content", contentId);
  if (!check.ok) {
    throw new GateError(check.reason);
  }
  const campaignProblem = contentGate(tx, contentId);
  if (campaignProblem) {
    throw new GateError(campaignProblem);
  }
  const receipt = tx.insert("receipts", {
    id: newId("rcp"),
    jobId: null,
    subjectType: "content",
    subjectId: content.id,
    subjectVersion: content.currentVersion,
    route: "manual-attestation",
    providerName: null,
    providerMessageId: null,
    requestId: newId("man"),
    result: "attested",
    externalUrl,
    attestedBy: actor.id,
    at: tx.nowIso,
    ...base(tx),
  });
  tx.update("content", content.id, content.version, { status: "published" });
  consumeApproval(tx, check.approval);
  for (const job of tx.list("jobs", (j) => j.subjectId === content.id && ["queued", "held", "failed"].includes(j.status))) {
    tx.update("jobs", job.id, job.version, { status: "cancelled", holdReason: "published-manually", nextAttemptAt: null });
  }
  audit(tx, actor, "manual-publication-attested", "content", content.id, null);
  return receipt;
}

function afterOutreachSent(tx: OpsTx, actor: Actor, draft: OutreachDraft, route: "provider" | "manual") {
  const prospect = tx.require("prospects", draft.prospectId);
  const advance = ["received", "triage-ready", "qualified-for-conversation"].includes(prospect.stage);
  tx.update("prospects", prospect.id, prospect.version, {
    lastOutboundAt: tx.nowIso,
    stage: advance ? "contacted" : prospect.stage,
    nextAction: draft.purpose === "follow-up" ? "Await reply (no further follow-ups)" : "Await reply",
  });
  if (advance) {
    audit(tx, actor, "stage-changed", "prospect", prospect.id, "contacted");
  }
  tx.insert("interactions", {
    id: newId("int"),
    prospectId: prospect.id,
    channel: "email",
    direction: "outbound",
    occurredAt: tx.nowIso,
    summary: `Approved ${draft.purpose.replace("-", " ")} message, version ${draft.currentVersion}, ${route === "provider" ? "sent through provider" : "sent by hand (attested)"}.`,
    sourceIntegrity: "not-applicable",
    outreachDraftId: draft.id,
    needsResponse: false,
    actorId: actor.id,
    ...base(tx),
  });
  for (const t of tx.list("tasks", (t) => t.prospectId === prospect.id && t.status === "open" && (t.type === "reply" || t.type === "triage"))) {
    tx.update("tasks", t.id, t.version, { status: "done", resolution: "Approved message sent." });
  }
  // One bounded follow-up reminder, never an automatic second message.
  if (draft.purpose !== "follow-up" && tx.settings().maxFollowUps > 0) {
    const due = new Date(tx.now.getTime() + tx.settings().followUpDelayDays * 86_400_000).toISOString().slice(0, 10);
    const key = `followup:${draft.id}`;
    if (!tx.list("tasks", (t) => t.dedupeKey === key).length) {
      tx.insert("tasks", {
        id: newId("tsk"),
        type: "follow-up",
        title: "No reply yet? Decide on one follow-up (limit 1), or close",
        dueOn: due,
        ownerId: prospect.ownerId,
        prospectId: prospect.id,
        status: "open",
        priority: "normal",
        resolution: null,
        createdBy: "system",
        dedupeKey: key,
        ...base(tx),
      });
    }
  }
}
