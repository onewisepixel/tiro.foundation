// The Now board and the weekly digest. Deterministic: items are ordered by
// lateness, then manual priority, then due date. Nothing ranks a person by
// perceived cultural value, age, ethnicity, influence, or any inference.
import { PLAYBOOKS } from "./cases";
import type { OpsTx } from "./store";
import type { AuditEvent, OpsTask, Prospect, Stage } from "./types";
import { ACTIVE_STAGES, STAGE_LABELS } from "./workflow";

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export type NextAction = {
  kind: "task" | "approvals" | "held-jobs" | "permission-review" | "case";
  title: string;
  detail: string;
  href: string;
  dueOn: string | null;
  overdue: boolean;
  priority: "high" | "normal" | "low";
};

export type Blocker = { kind: string; title: string; href: string; reason: string };

export type Briefing = {
  generatedAt: string;
  since: string;
  sinceLabel: string;
  progressed: { label: string; count: number }[];
  newInquiries: Pick<Prospect, "id" | "displayName" | "participationInterest" | "createdAt">[];
  nextActions: NextAction[];
  replies: (OpsTask & { prospectName: string | null })[];
  pendingApprovals: { outreach: number; content: number; campaign: number };
  atRisk: (OpsTask & { prospectName: string | null })[];
  blockers: Blocker[];
  continuing: { label: string; count: number }[];
  pipeline: { stage: Stage; label: string; count: number }[];
  paused: boolean;
};

const PROGRESS_LABELS: Record<string, string> = {
  "interest-received": "Inquiries received",
  "stage-changed": "Relationship stage changes",
  "approval-approved": "Approvals granted",
  "approval-rejected": "Approvals rejected",
  "approval-revision-requested": "Revisions requested",
  "manual-send-attested": "Messages sent by hand (attested)",
  "dispatch-confirmed": "Messages confirmed by a provider",
  "dispatch-simulated": "Dry runs recorded (nothing sent)",
  "manual-publication-attested": "Posts published by hand (attested)",
  "interaction-recorded": "Interactions recorded",
  "contact-withdrawn": "Opt-outs and withdrawals",
  "task-done": "Tasks completed",
  "case-opened": "Exceptions opened",
  "case-resolved": "Exceptions resolved",
  "draft-created": "Drafts prepared",
};

function today(tx: OpsTx) {
  return tx.nowIso.slice(0, 10);
}

// opts.events: audit events since the last review, fetched with
// store.auditSince() so the whole trail need not be loaded. Without it the
// trail is read through the transaction (fine for in-process stores).
export function buildBriefing(tx: OpsTx, opts: { operatorIds?: readonly string[]; events?: AuditEvent[] } = {}): Briefing {
  const settings = tx.settings();
  const since = settings.lastReviewAt ?? new Date(tx.now.getTime() - 7 * 86_400_000).toISOString();
  const day = today(tx);
  const soon = new Date(tx.now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const prospects = new Map(tx.list("prospects").map((p) => [p.id, p]));
  const nameOf = (id: string | null) => (id ? (prospects.get(id)?.displayName ?? null) : null);

  const events: AuditEvent[] = opts.events ? opts.events.filter((e) => e.at > since) : tx.list("audit", (e) => e.at > since);
  const counts = new Map<string, number>();
  for (const e of events) {
    if (PROGRESS_LABELS[e.action]) {
      counts.set(e.action, (counts.get(e.action) ?? 0) + 1);
    }
  }
  const progressed = [...counts.entries()].map(([action, count]) => ({ label: PROGRESS_LABELS[action], count })).sort((a, b) => b.count - a.count);

  const openTasks = tx.list("tasks", (t) => t.status === "open" || t.status === "escalated");
  const taskActions: NextAction[] = openTasks.map((t) => ({
    kind: "task",
    title: t.title,
    detail: nameOf(t.prospectId) ?? "Operations",
    href: t.prospectId ? `/flight-deck/relationships/${t.prospectId}` : "/flight-deck/health",
    dueOn: t.dueOn,
    overdue: !!t.dueOn && t.dueOn < day,
    priority: t.status === "escalated" ? "high" : t.priority,
  }));

  const pendingApprovals = {
    outreach: tx.list("outreach", (d) => d.status === "needs-review").length,
    content: tx.list("content", (d) => d.status === "needs-review").length,
    campaign: tx.list("campaigns", (c) => c.status === "needs-review").length,
  };
  const approvalTotal = pendingApprovals.outreach + pendingApprovals.content + pendingApprovals.campaign;
  const extra: NextAction[] = [];
  if (approvalTotal) {
    extra.push({ kind: "approvals", title: `Review ${approvalTotal} item${approvalTotal === 1 ? "" : "s"} awaiting approval`, detail: "Approvals", href: "/flight-deck/approvals", dueOn: null, overdue: false, priority: "high" });
  }
  const heldJobs = tx.list("jobs", (j) => j.status === "held" || j.status === "failed" || j.status === "dead");
  const failing = heldJobs.filter((j) => j.status !== "held" || j.holdReason !== "provider-disabled");
  if (failing.length) {
    extra.push({ kind: "held-jobs", title: `${failing.length} dispatch job${failing.length === 1 ? "" : "s"} held or failed`, detail: "Health", href: "/flight-deck/health", dueOn: null, overdue: false, priority: "high" });
  }

  // Exceptions come before ordinary work at the same lateness: each has a
  // deadline that matters to someone outside TIRO.
  const openCaseRows = tx.list("cases", (c) => c.status !== "resolved");
  for (const c of openCaseRows) {
    extra.push({
      kind: "case",
      title: `${PLAYBOOKS[c.kind].label}: next step ${(c.steps.findIndex((s) => !s.doneAt) + 1) || "resolve"}`,
      detail: nameOf(c.prospectId) ?? "Exception",
      href: `/flight-deck/cases/${c.id}`,
      dueOn: c.dueOn,
      overdue: c.dueOn < day,
      priority: "high",
    });
  }

  const order = (a: NextAction, b: NextAction) =>
    Number(b.overdue) - Number(a.overdue) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") || a.title.localeCompare(b.title);
  const nextActions = [...extra, ...taskActions].sort(order).slice(0, 5);

  const withName = (t: OpsTask) => ({ ...t, prospectName: nameOf(t.prospectId) });
  const replies = openTasks.filter((t) => t.type === "reply").map(withName);
  const atRisk = openTasks.filter((t) => t.ownerId && t.dueOn && t.dueOn <= soon).map(withName);

  const blockers: Blocker[] = [];
  for (const p of prospects.values()) {
    if (p.stage === "needs-review") {
      blockers.push({ kind: "relationship", title: p.displayName, href: `/flight-deck/relationships/${p.id}`, reason: `Needs review: ${p.blockedReason ?? "unspecified"} gate` });
    }
  }
  for (const perm of tx.list("permissions", (x) => x.state === "pending-review")) {
    blockers.push({ kind: "permission", title: nameOf(perm.prospectId) ?? "Prospect", href: `/flight-deck/relationships/${perm.prospectId}`, reason: "Contact basis not yet reviewed: no first message is possible" });
  }
  for (const c of tx.list("campaigns", (c) => c.status !== "closed" && (c.consentReviewStatus !== "cleared" || c.legalReviewStatus !== "cleared"))) {
    blockers.push({ kind: "campaign", title: c.name, href: "/flight-deck/campaigns", reason: `Consent review ${c.consentReviewStatus}, legal review ${c.legalReviewStatus}: cannot be activated` });
  }
  for (const c of openCaseRows.filter((c) => c.holdsOutreach)) {
    blockers.push({ kind: "case", title: nameOf(c.prospectId) ?? PLAYBOOKS[c.kind].label, href: `/flight-deck/cases/${c.id}`, reason: `${PLAYBOOKS[c.kind].label}: outreach held until resolved (due ${c.dueOn})` });
  }
  for (const d of tx.list("outreach", (d) => d.status === "held")) {
    blockers.push({ kind: "outreach", title: nameOf(d.prospectId) ?? "Outreach draft", href: `/flight-deck/outreach/${d.id}`, reason: "Message held: a gate failed at dispatch time" });
  }

  const continuing = [
    { label: "Dispatch jobs queued (run only when not paused)", count: tx.list("jobs", (j) => j.status === "queued").length },
    { label: "Open tasks owned by an operator", count: openTasks.filter((t) => !!t.ownerId && (opts.operatorIds ?? []).includes(t.ownerId)).length },
    { label: "Follow-up reminders scheduled", count: openTasks.filter((t) => t.type === "follow-up" && (!t.dueOn || t.dueOn > day)).length },
  ].filter((c) => c.count > 0);

  const pipeline = ([...ACTIVE_STAGES, "needs-review"] as Stage[]).map((stage) => ({ stage, label: STAGE_LABELS[stage], count: [...prospects.values()].filter((p) => p.stage === stage).length }));

  const newInquiries = [...prospects.values()]
    .filter((p) => p.source === "inbound-form" && p.createdAt > since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ id, displayName, participationInterest, createdAt }) => ({ id, displayName, participationInterest, createdAt }));

  return {
    generatedAt: tx.nowIso,
    since,
    sinceLabel: settings.lastReviewAt ? "since your last review" : "in the last seven days",
    progressed,
    newInquiries,
    nextActions,
    replies,
    pendingApprovals,
    atRisk,
    blockers,
    continuing,
    pipeline,
    paused: settings.allOutboundPaused,
  };
}

// Plain-text weekly digest. Generated locally on demand; never delivered
// externally in 0.1 (no provider, no schedule approved). It names
// prospects only by display name and never includes notes or addresses.
export function digestText(b: Briefing): string {
  const lines: string[] = [];
  const date = (iso: string) => iso.slice(0, 10);
  lines.push(`TIRO Flight Deck: weekly digest (${date(b.generatedAt)})`);
  lines.push(`Covering ${date(b.since)} to ${date(b.generatedAt)}. SYNTHETIC LOCAL DEMO DATA.`);
  if (b.paused) {
    lines.push("", "ALL OUTBOUND ACTIVITY IS PAUSED.");
  }
  lines.push("", "What happened");
  if (b.progressed.length === 0) {
    lines.push("  Nothing recorded.");
  }
  for (const p of b.progressed) {
    lines.push(`  ${p.count}  ${p.label}`);
  }
  lines.push("", "Top decisions and next actions");
  if (b.nextActions.length === 0) {
    lines.push("  None open.");
  }
  b.nextActions.forEach((a, i) => lines.push(`  ${i + 1}. ${a.title} (${a.detail})${a.dueOn ? `, due ${a.dueOn}` : ""}${a.overdue ? ", OVERDUE" : ""}`));
  lines.push("", "Blocked");
  if (b.blockers.length === 0) {
    lines.push("  Nothing blocked.");
  }
  for (const x of b.blockers) {
    lines.push(`  - ${x.title}: ${x.reason}`);
  }
  lines.push("", "Awaiting approval");
  lines.push(`  ${b.pendingApprovals.outreach} outreach, ${b.pendingApprovals.content} content, ${b.pendingApprovals.campaign} campaign`);
  lines.push("", "Pipeline (active stages)");
  for (const s of b.pipeline.filter((s) => s.count > 0)) {
    lines.push(`  ${s.count}  ${s.label}`);
  }
  lines.push("", "Continuing without you");
  if (b.continuing.length === 0) {
    lines.push("  Nothing queued.");
  }
  for (const c of b.continuing) {
    lines.push(`  ${c.count}  ${c.label}`);
  }
  lines.push("", "Counts are of operational records in this store. They are not participants, partners, or collection results.");
  return lines.join("\n");
}
