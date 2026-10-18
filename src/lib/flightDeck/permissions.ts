// Contact eligibility and suppression. Checked when a draft is prepared,
// again when it is approved, and again at dispatch time, immediately
// before any provider call. Suppression always wins over queued work.
import { audit, type Actor } from "./access";
import { newId } from "./ids";
import type { OpsTx } from "./store";
import type { CommunicationPermission, OutreachPurpose, Prospect, SuppressionScope } from "./types";

export type ContactPurpose = OutreachPurpose | "newsletter";

export type Eligibility = { ok: true; permission: CommunicationPermission } | { ok: false; reason: string };

// A promotional unsubscribe (newsletter) never blocks a transactional
// response about a request the person made; an outreach suppression
// blocks first contact and follow-ups but not a reply they asked for;
// "all" blocks everything.
const SCOPE_BLOCKS: Record<SuppressionScope, readonly ContactPurpose[]> = {
  all: ["acknowledgement", "reply", "first-contact", "follow-up", "newsletter"],
  outreach: ["first-contact", "follow-up", "newsletter"],
  newsletter: ["newsletter"],
};

export function activeSuppressions(tx: OpsTx, emailKey: string) {
  return tx.list("suppressions", (s) => s.emailKey === emailKey && s.liftedAt === null && s.effectiveAt <= tx.nowIso);
}

export function isSuppressed(tx: OpsTx, emailKey: string, purpose: ContactPurpose): boolean {
  return activeSuppressions(tx, emailKey).some((s) => SCOPE_BLOCKS[s.scope].includes(purpose));
}

function usable(p: CommunicationPermission, nowIso: string) {
  return p.state === "active" && (p.expiresAt === null || p.expiresAt > nowIso);
}

export function contactEligibility(tx: OpsTx, prospect: Prospect, purpose: ContactPurpose): Eligibility {
  if (!prospect.email || !prospect.emailKey) {
    return { ok: false, reason: "no-address" };
  }
  if (prospect.stage === "withdrawn" || prospect.stage === "suppressed") {
    return { ok: false, reason: "withdrawn" };
  }
  if (isSuppressed(tx, prospect.emailKey, purpose)) {
    return { ok: false, reason: "suppressed" };
  }
  // An open exception (deletion request, complaint, sensitive material,
  // doubtful contact...) holds ordinary outreach until it is resolved.
  // Correspondence about the case itself is handled inside the case.
  if (tx.list("cases", (c) => c.prospectId === prospect.id && c.status !== "resolved" && c.holdsOutreach).length) {
    return { ok: false, reason: "case-open" };
  }
  const perms = tx.list("permissions", (p) => p.prospectId === prospect.id);
  const find = (pred: (p: CommunicationPermission) => boolean) => perms.find((p) => pred(p) && usable(p, tx.nowIso));
  let permission: CommunicationPermission | undefined;
  switch (purpose) {
    case "acknowledgement":
    case "reply":
      permission = find((p) => p.purpose === "direct-response");
      break;
    case "first-contact":
      // A researched or referred contact: the documented basis must have
      // been reviewed by a person. Opt-in is never manufactured for them.
      permission = find((p) => p.purpose === "pilot-follow-up" && p.reviewedBy !== null);
      break;
    case "follow-up":
      permission = find((p) => (p.purpose === "pilot-follow-up" && p.reviewedBy !== null) || p.purpose === "direct-response");
      break;
    case "newsletter":
      permission = find((p) => p.purpose === "newsletter" && p.basis === "form-opt-in");
      break;
  }
  if (!permission) {
    const pending = perms.some((p) => p.state === "pending-review");
    const expired = perms.some((p) => p.state === "expired" || (p.expiresAt !== null && p.expiresAt <= tx.nowIso));
    return { ok: false, reason: pending ? "permission-pending-review" : expired ? "permission-expired" : "no-permission" };
  }
  return { ok: true, permission };
}

// Records a suppression and immediately stops everything it covers:
// queued or held jobs are cancelled and affected drafts are held, even if
// they were already approved. Retention and deletion are reviewed
// separately (a retention-review task is opened by the caller).
export function applySuppression(
  tx: OpsTx,
  actor: Actor,
  emailKey: string,
  scope: SuppressionScope,
  basis: "unsubscribe" | "withdrawal" | "founder-hold" | "bounce" | "complaint",
) {
  const existing = activeSuppressions(tx, emailKey).find((s) => s.scope === scope);
  const suppression =
    existing ??
    tx.insert("suppressions", {
      id: newId("sup"),
      emailKey,
      scope,
      basis,
      effectiveAt: tx.nowIso,
      createdBy: actor.id,
      liftedAt: null,
      createdAt: tx.nowIso,
      updatedAt: tx.nowIso,
      version: 1,
      synthetic: tx.synthetic,
    });
  if (!existing) {
    audit(tx, actor, "suppression-added", "suppression", suppression.id, basis);
  }

  const prospectIds = new Set(tx.list("prospects", (p) => p.emailKey === emailKey).map((p) => p.id));
  const blocked = SCOPE_BLOCKS[scope];
  for (const draft of tx.list("outreach", (d) => prospectIds.has(d.prospectId))) {
    if (!blocked.includes(draft.purpose)) {
      continue;
    }
    if (["draft", "needs-review", "approved", "manual-ready", "scheduled", "failed"].includes(draft.status)) {
      tx.update("outreach", draft.id, draft.version, { status: "held" });
      audit(tx, actor, "draft-held", "outreach", draft.id, "suppressed");
    }
    for (const job of tx.list("jobs", (j) => j.subjectId === draft.id && (j.status === "queued" || j.status === "held" || j.status === "failed"))) {
      tx.update("jobs", job.id, job.version, { status: "cancelled", holdReason: "suppressed", nextAttemptAt: null });
      audit(tx, actor, "job-cancelled", "job", job.id, "suppressed");
    }
  }
  for (const job of tx.list("jobs", (j) => j.kind === "send-acknowledgement" && (j.status === "queued" || j.status === "held"))) {
    const sub = tx.get("submissions", job.subjectId);
    if (sub && prospectIds.has(sub.prospectId) && blocked.includes("acknowledgement")) {
      tx.update("jobs", job.id, job.version, { status: "cancelled", holdReason: "suppressed", nextAttemptAt: null });
      audit(tx, actor, "job-cancelled", "job", job.id, "suppressed");
    }
  }
  return suppression;
}

export function liftSuppression(tx: OpsTx, actor: Actor, suppressionId: string) {
  const s = tx.require("suppressions", suppressionId);
  if (s.liftedAt) {
    return s;
  }
  const lifted = tx.update("suppressions", s.id, s.version, { liftedAt: tx.nowIso });
  audit(tx, actor, "suppression-lifted", "suppression", s.id, null);
  return lifted;
}
