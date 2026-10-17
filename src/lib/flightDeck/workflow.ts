// The interest / prospective-relationship state machine
// (docs/flight-deck/architecture.md §5).
import type { Stage } from "./types";

export const ACTIVE_STAGES: readonly Stage[] = [
  "received",
  "triage-ready",
  "qualified-for-conversation",
  "contacted",
  "conversation-scheduled",
  "consultation-underway",
  "pilot-candidate",
];

const EXITS: readonly Stage[] = ["needs-review", "declined", "withdrawn", "suppressed", "closed"];

const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  received: ["triage-ready", "duplicate", ...EXITS],
  "triage-ready": ["qualified-for-conversation", "duplicate", ...EXITS],
  "qualified-for-conversation": ["contacted", "triage-ready", ...EXITS],
  contacted: ["conversation-scheduled", ...EXITS],
  "conversation-scheduled": ["consultation-underway", "contacted", ...EXITS],
  "consultation-underway": ["pilot-candidate", ...EXITS],
  "pilot-candidate": EXITS,
  // A blocked item returns to an active stage only once its gate is
  // resolved (the service clears blockedReason on the way out).
  "needs-review": [...ACTIVE_STAGES, "declined", "withdrawn", "suppressed", "closed", "duplicate"],
  // Closed and declined may be reopened for triage by the founder.
  // Withdrawn and suppressed are never reopened from the CRM: only the
  // person can renew contact, by writing again, and a founder must then
  // review and lift the suppression explicitly.
  closed: ["triage-ready"],
  declined: ["triage-ready"],
  duplicate: ["closed"],
  withdrawn: [],
  suppressed: [],
};

export const STAGE_LABELS: Record<Stage, string> = {
  received: "Received",
  "triage-ready": "Ready for triage",
  "qualified-for-conversation": "Qualified for conversation",
  contacted: "Contacted",
  "conversation-scheduled": "Conversation scheduled",
  "consultation-underway": "Consultation underway",
  "pilot-candidate": "Pilot candidate",
  closed: "Closed",
  withdrawn: "Withdrawn",
  declined: "Declined",
  duplicate: "Duplicate",
  "needs-review": "Needs review",
  suppressed: "Suppressed",
};

// What a stage does NOT mean, shown next to it wherever it could be
// mistaken for an authority or collection decision.
export const STAGE_CAVEATS: Partial<Record<Stage, string>> = {
  "qualified-for-conversation": "An internal scheduling designation. Not verified authority, not eligibility to collect.",
  "pilot-candidate": "Under consideration for a future pilot. Not an approved archival contributor; no collection is authorized.",
  "consultation-underway": "Community, legal and stewardship consultation. No material is being collected.",
};

export function allowedTransitions(from: Stage): readonly Stage[] {
  return TRANSITIONS[from];
}

export function canTransition(from: Stage, to: Stage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(stage: Stage): boolean {
  return !ACTIVE_STAGES.includes(stage) && stage !== "needs-review";
}

// Reopening from a terminal stage is a founder decision.
export function requiresFounder(from: Stage): boolean {
  return from === "closed" || from === "declined";
}
