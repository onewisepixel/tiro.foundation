// Exceptions: the situations that must never drift into ordinary outreach.
//
// Each kind has a playbook: a deadline, a short checklist, whether it holds
// all outreach to the person while open, and any effect that must happen
// immediately (an opt-out applies suppression the moment the case is
// opened; an incident can pause all outbound activity at once).
//
// Cases record how something was handled, never what material said. The
// summary is 200 characters, and the guidance on every screen says not to
// describe content. Unsolicited sensitive material is removed, not stored:
// there is no upload or attachment field anywhere in Flight Deck.
//
// Deadlines are proposals pending legal review
// (docs/flight-deck/privacy-launch-gates.md §3), not legal commitments.
import { audit, requireCapability, type Actor } from "./access";
import { GateError } from "./approvals";
import { newId } from "./ids";
import { must, nullable, obj, oneOf, opaqueId, str } from "./schema";
import type { OpsTx } from "./store";
import { CASE_KINDS, type CaseKind, type OpsCase } from "./types";
import { withdraw } from "./prospects";

export type Playbook = {
  label: string;
  purpose: string;
  dueDays: number;
  holdsOutreach: boolean;
  requiresProspect: boolean;
  steps: { key: string; label: string; automatic?: boolean }[];
  outcomes: string[];
};

export const PLAYBOOKS: Record<CaseKind, Playbook> = {
  "sensitive-disclosure": {
    label: "Sensitive material received",
    purpose: "Someone sent a story, recording, document, or other sensitive material. It is removed, not kept or processed.",
    dueDays: 2,
    holdsOutreach: true,
    requiresProspect: false,
    steps: [
      { key: "stop-and-do-not-copy", label: "Do not forward, download, transcribe, summarize, translate, or upload it. Do not describe it in Flight Deck." },
      { key: "remove-material", label: "Delete it from the mailbox (including deleted items and any copies) and from any device or system it reached." },
      { key: "redact-flight-deck", label: "Check this person's Flight Deck record and redact any field that holds part of it." },
      { key: "notify-person", label: "Tell the person it was removed and not kept (template below)." },
      { key: "founder-review", label: "Founder confirms whether anything else is needed, for example if it concerns other people." },
    ],
    outcomes: ["material-removed", "escalated-to-counsel"],
  },
  "opt-out": {
    label: "Opt-out or unsubscribe",
    purpose: "The person asked us to stop some or all contact. Suppression applies the moment this case is opened.",
    dueDays: 2,
    holdsOutreach: false,
    requiresProspect: true,
    steps: [
      { key: "suppression-applied", label: "Suppression recorded and queued messages stopped.", automatic: true },
      { key: "confirm-to-person", label: "Confirm to the person that it is done (template below), unless they asked for no reply." },
      { key: "retention-decision", label: "Decide whether to keep the record or erase it; the opt-out record is kept either way." },
    ],
    outcomes: ["suppression-applied", "erased"],
  },
  "deletion-request": {
    label: "Deletion request",
    purpose: "The person asked us to delete what we hold. Outreach is held until it is done.",
    dueDays: 30,
    holdsOutreach: true,
    requiresProspect: true,
    steps: [
      { key: "verify-requester", label: "Confirm the request came from the address on record. Never ask for identity documents by email." },
      { key: "export-if-asked", label: "If they also asked for a copy, send the export first." },
      { key: "erase-record", label: "Erase the record from the relationship page (keeps only a keyed opt-out record).", automatic: true },
      { key: "confirm-deletion", label: "Confirm the deletion to the person (template below)." },
    ],
    outcomes: ["erased", "not-verified"],
  },
  "access-request": {
    label: "Request for a copy of their data",
    purpose: "The person asked what we hold about them.",
    dueDays: 30,
    holdsOutreach: false,
    requiresProspect: true,
    steps: [
      { key: "verify-requester", label: "Confirm the request came from the address on record." },
      { key: "export-record", label: "Generate the export (Export JSON on the relationship page) and check it." },
      { key: "send-copy", label: "Send it only to the address on record (template below)." },
    ],
    outcomes: ["export-sent", "not-verified"],
  },
  complaint: {
    label: "Complaint",
    purpose: "Someone is unhappy with how TIRO contacted them or handled their details. Outreach is held until resolved.",
    dueDays: 5,
    holdsOutreach: true,
    requiresProspect: false,
    steps: [
      { key: "acknowledge", label: "Acknowledge receipt (template below). Do not argue or explain yet." },
      { key: "investigate", label: "Read Activity for the record and establish what happened." },
      { key: "founder-decision", label: "Founder decides the response and any change to practice." },
      { key: "respond", label: "Respond plainly: what happened, what changes." },
    ],
    outcomes: ["resolved", "escalated-to-counsel"],
  },
  "mistaken-submission": {
    label: "Mistaken submission",
    purpose: "The form was filled in by mistake, for someone else, or with wrong details.",
    dueDays: 7,
    holdsOutreach: true,
    requiresProspect: true,
    steps: [
      { key: "confirm-with-person", label: "Confirm with the person what they meant, if it is safe to write to them." },
      { key: "correct-or-erase", label: "Correct the details, or erase the record." },
    ],
    outcomes: ["corrected", "erased", "no-action-needed"],
  },
  "lost-communication": {
    label: "Lost or undelivered message",
    purpose: "A message may not have arrived, or a reply may have been missed.",
    dueDays: 3,
    holdsOutreach: false,
    requiresProspect: true,
    steps: [
      { key: "identify", label: "Identify which message, to whom, and when, from Activity and the relationship page." },
      { key: "check-suppression", label: "Confirm the person has not opted out since." },
      { key: "resend-or-close", label: "Re-send through normal approval, or record why not." },
    ],
    outcomes: ["resolved", "no-action-needed"],
  },
  "questionable-contact": {
    label: "Doubtful researched contact",
    purpose: "The basis for contacting someone we found is in doubt (wrong person, personal address, unclear relevance). Outreach is held.",
    dueDays: 5,
    holdsOutreach: true,
    requiresProspect: true,
    steps: [
      { key: "review-evidence", label: "Re-check the source evidence and the reason recorded for contact." },
      { key: "decide-basis", label: "Accept or reject the contact basis on the relationship page." },
      { key: "erase-if-rejected", label: "If rejected, erase the record." },
    ],
    outcomes: ["basis-confirmed", "erased"],
  },
  incident: {
    label: "Operational incident",
    purpose: "Something went wrong: a message sent in error, suspected exposure of data, a compromised account, or a system fault.",
    dueDays: 1,
    holdsOutreach: false,
    requiresProspect: false,
    steps: [
      { key: "pause-outbound", label: "Pause all outbound activity.", automatic: true },
      { key: "contain", label: "Contain it: revoke sessions or operators, stop the cause." },
      { key: "assess-personal-data", label: "Establish which records and people could be affected." },
      { key: "notification-decision", label: "Founder decides, with counsel where needed, whether anyone must be notified." },
      { key: "resume-and-record", label: "Resume outbound activity only when safe, and record what changes." },
    ],
    outcomes: ["resolved", "escalated-to-counsel"],
  },
};

export const CASE_OUTCOMES = [...new Set(Object.values(PLAYBOOKS).flatMap((p) => p.outcomes))];

const OpenCaseInput = obj({
  kind: oneOf(CASE_KINDS),
  prospectId: nullable(opaqueId("prs")),
  receivedVia: oneOf(["email", "web-form", "phone", "in-person", "post", "internal"] as const),
  summary: str({ min: 1, max: 200 }),
  optOutScope: nullable(oneOf(["all", "outreach", "newsletter"] as const)),
  pauseOutbound: nullable(oneOf(["yes"] as const)),
});

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function openCases(tx: OpsTx, prospectId: string): OpsCase[] {
  return tx.list("cases", (c) => c.prospectId === prospectId && c.status !== "resolved");
}

export function openCase(tx: OpsTx, actor: Actor, input: unknown): OpsCase {
  const v = must(OpenCaseInput, input);
  // An incident may be opened by anyone who may pause; everything else by
  // whoever keeps relationships.
  requireCapability(actor, v.kind === "incident" ? "pause" : "edit-relationships");
  const playbook = PLAYBOOKS[v.kind];
  if (playbook.requiresProspect && !v.prospectId) {
    throw new GateError("case-needs-prospect");
  }
  if (v.prospectId) {
    tx.require("prospects", v.prospectId);
  }
  const steps = playbook.steps.map((s) => ({ key: s.key, doneAt: null as string | null, doneBy: null as string | null }));
  const done = (key: string) => {
    const step = steps.find((s) => s.key === key);
    if (step) {
      step.doneAt = tx.nowIso;
      step.doneBy = actor.id;
    }
  };

  if (v.kind === "opt-out") {
    withdraw(tx, actor, v.prospectId!, v.optOutScope ?? "all", v.optOutScope === "newsletter" ? "unsubscribe" : "withdrawal");
    done("suppression-applied");
  }
  if (v.kind === "incident" && v.pauseOutbound === "yes") {
    const s = tx.settings();
    if (!s.allOutboundPaused) {
      tx.updateSettings(s.version, { allOutboundPaused: true, pausedAt: tx.nowIso, pausedBy: actor.id });
      audit(tx, actor, "outbound-paused", "settings", null, "incident");
    }
    done("pause-outbound");
  }

  const c = tx.insert("cases", {
    id: newId("case"),
    kind: v.kind,
    prospectId: v.prospectId,
    receivedVia: v.receivedVia,
    receivedAt: tx.nowIso,
    summary: v.summary,
    status: "open",
    dueOn: addDays(tx.nowIso, playbook.dueDays),
    ownerId: actor.id === "system" ? null : actor.id,
    holdsOutreach: playbook.holdsOutreach,
    steps,
    outcome: null,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: tx.synthetic,
  });

  if (playbook.holdsOutreach && v.prospectId) {
    holdOutreachFor(tx, actor, v.prospectId);
  }
  audit(tx, actor, "case-opened", "case", c.id, v.kind);
  return c;
}

// Held drafts and cancelled jobs, exactly as a suppression does, but
// reversible: they can be sent for review again once the case is resolved.
function holdOutreachFor(tx: OpsTx, actor: Actor, prospectId: string) {
  for (const d of tx.list("outreach", (d) => d.prospectId === prospectId && ["needs-review", "approved", "manual-ready", "scheduled", "failed"].includes(d.status))) {
    tx.update("outreach", d.id, d.version, { status: "held" });
    audit(tx, actor, "draft-held", "outreach", d.id, "case-open");
    for (const j of tx.list("jobs", (j) => j.subjectId === d.id && (j.status === "queued" || j.status === "held" || j.status === "failed"))) {
      tx.update("jobs", j.id, j.version, { status: "cancelled", holdReason: "case-open", nextAttemptAt: null });
    }
  }
}

export function completeStep(tx: OpsTx, actor: Actor, caseId: string, expectedVersion: number, stepKey: string) {
  requireCapability(actor, "edit-relationships");
  const c = tx.require("cases", caseId);
  if (c.status === "resolved") {
    throw new GateError("case-resolved");
  }
  const def = PLAYBOOKS[c.kind].steps.find((s) => s.key === stepKey);
  if (!def) {
    throw new GateError("validation-failed");
  }
  if (def.automatic) {
    throw new GateError("step-is-automatic");
  }
  const steps = c.steps.map((s) => (s.key === stepKey && !s.doneAt ? { ...s, doneAt: tx.nowIso, doneBy: actor.id } : s));
  tx.update("cases", caseId, expectedVersion, { steps, status: c.status === "open" ? "contained" : c.status });
  audit(tx, actor, "case-step-done", "case", caseId, stepKey);
}

// Marks an automatic step done when the action it describes happens
// elsewhere (erasure, resuming outbound).
export function markAutomaticStep(tx: OpsTx, actor: Actor, c: OpsCase, stepKey: string) {
  const fresh = tx.require("cases", c.id);
  if (!fresh.steps.some((s) => s.key === stepKey && !s.doneAt)) {
    return;
  }
  const steps = fresh.steps.map((s) => (s.key === stepKey && !s.doneAt ? { ...s, doneAt: tx.nowIso, doneBy: actor.id } : s));
  tx.update("cases", c.id, fresh.version, { steps });
  audit(tx, actor, "case-step-done", "case", c.id, stepKey);
}

export function resolveCase(tx: OpsTx, actor: Actor, caseId: string, expectedVersion: number, outcome: string) {
  requireCapability(actor, "edit-relationships");
  const c = tx.require("cases", caseId);
  if (c.status === "resolved") {
    throw new GateError("case-resolved");
  }
  if (!PLAYBOOKS[c.kind].outcomes.includes(outcome)) {
    throw new GateError("validation-failed");
  }
  // "Not verified" and "escalated" may close a case early; every other
  // outcome needs the checklist finished.
  const early = outcome === "not-verified" || outcome === "escalated-to-counsel" || outcome === "no-action-needed";
  if (!early && c.steps.some((s) => !s.doneAt)) {
    throw new GateError("case-steps-incomplete");
  }
  // A complaint or sensitive disclosure is resolved by the founder.
  if ((c.kind === "complaint" || c.kind === "sensitive-disclosure" || c.kind === "incident") && actor.role !== "founder") {
    throw new GateError("founder-required");
  }
  tx.update("cases", caseId, expectedVersion, { status: "resolved", outcome });
  audit(tx, actor, "case-resolved", "case", caseId, outcome);
}

// Replaces a field that holds material that should never have been
// recorded. The replacement says what happened, not what was there.
export const REDACTABLE = {
  prospect: ["displayName", "organizationName", "region", "contactReason", "nextAction"],
  interaction: ["summary"],
} as const;

export function redactField(tx: OpsTx, actor: Actor, caseId: string, target: "prospect" | "interaction", id: string, field: string) {
  requireCapability(actor, "edit-relationships");
  const c = tx.require("cases", caseId);
  if (c.status === "resolved") {
    throw new GateError("case-resolved");
  }
  const marker = `[Removed under case ${caseId.slice(-6)}]`;
  if (target === "prospect" && (REDACTABLE.prospect as readonly string[]).includes(field)) {
    const p = tx.require("prospects", id);
    const value = field === "displayName" ? `Name removed (case ${caseId.slice(-6)})` : field === "contactReason" ? `${marker} Reason re-recorded separately if still valid.` : null;
    tx.update("prospects", id, p.version, { [field]: value } as never);
  } else if (target === "interaction" && field === "summary") {
    const i = tx.require("interactions", id);
    tx.update("interactions", id, i.version, { summary: marker });
  } else {
    throw new GateError("validation-failed");
  }
  audit(tx, actor, "field-redacted", target, id, field.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
}
