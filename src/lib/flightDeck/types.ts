// Flight Deck operations domain: entity contracts.
//
// This is a RECRUITMENT AND OPERATIONS domain, deliberately separate from
// the archival fixture domain in backend/src/domain/types.ts. Nothing here
// is a Memory Project source, a source-authority determination, consent for
// preservation, or an archive contributor account. Names are chosen so they
// cannot be mistaken for the archive's AuthorityClaim, ConsentGrant, or
// FixtureRecord: a CommunicationPermission is permission to write to
// someone, nothing more.
//
// Every type is inferred from its schema, so the same definition validates
// incoming requests and every store write.
import { arrayOf, bool, int, isoDate, isoInstant, literal, nullable, obj, oneOf, opaqueId, str, type Infer } from "./schema";

// ---------- Shared vocabularies ----------

export const ROLES = ["founder", "operator", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTOR_ROLES = [...ROLES, "system", "public"] as const;

// Self-selected on the public form. An expression of interest, never a
// verified capacity or authority.
export const PARTICIPATION_INTERESTS = ["interested-contributor", "community-partner", "specialist-volunteer", "institution"] as const;
export type ParticipationInterest = (typeof PARTICIPATION_INTERESTS)[number];

export const PROSPECT_SOURCES = ["inbound-form", "referral", "manual-research"] as const;

// docs/flight-deck/architecture.md §5: the interest / prospective-
// relationship state machine. "qualified-for-conversation" is an internal
// scheduling designation, not verified authority or eligibility to collect;
// "pilot-candidate" is not an approved archival contributor.
export const STAGES = [
  "received",
  "triage-ready",
  "qualified-for-conversation",
  "contacted",
  "conversation-scheduled",
  "consultation-underway",
  "pilot-candidate",
  "closed",
  "withdrawn",
  "declined",
  "duplicate",
  "needs-review",
  "suppressed",
] as const;
export type Stage = (typeof STAGES)[number];

export const BLOCK_REASONS = ["privacy", "legal", "community-authority", "readiness", "other"] as const;
export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RETENTION_CLASSES = ["inquiry-12m", "active-relationship", "suppression-only"] as const;

export const PERMISSION_PURPOSES = ["direct-response", "pilot-follow-up", "newsletter"] as const;
export type PermissionPurpose = (typeof PERMISSION_PURPOSES)[number];
export const PERMISSION_BASES = ["form-request-reply", "form-opt-in", "documented-public-business-contact", "referral-introduction"] as const;
export const PERMISSION_STATES = ["active", "pending-review", "withdrawn", "expired"] as const;

export const CHANNELS_CONTENT = ["instagram", "linkedin", "newsletter", "website"] as const;
export type ContentChannel = (typeof CHANNELS_CONTENT)[number];
export const ORIGIN_CATEGORIES = ["evidence", "demonstration", "abstraction"] as const;

export const DRAFT_STATUSES = ["draft", "needs-review", "approved", "manual-ready", "scheduled", "sent", "published", "failed", "held", "archived"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const OUTREACH_PURPOSES = ["first-contact", "follow-up", "reply", "acknowledgement"] as const;
export type OutreachPurpose = (typeof OUTREACH_PURPOSES)[number];

export const SUPPRESSION_SCOPES = ["all", "outreach", "newsletter"] as const;
export type SuppressionScope = (typeof SUPPRESSION_SCOPES)[number];

// Short machine codes only. Audit events and job errors never carry free
// text, so they cannot carry a personal message, a token, or archive
// content by accident.
const code = str({ min: 1, max: 48, pattern: /^[a-z0-9][a-z0-9-]*$/, code: "invalid-code" });
const userId = str({ min: 4, max: 64, pattern: /^(usr_[A-Za-z0-9]{6,48}|system)$/, code: "invalid-user" });

const base = {
  createdAt: isoInstant,
  updatedAt: isoInstant,
  version: int({ min: 1 }),
  synthetic: bool,
};

const url = str({ max: 500, pattern: /^https:\/\/[^\s]+$/, code: "https-url-required" });
const shortText = (max: number) => str({ max, multiline: true });

// ---------- Entities ----------

export const ProspectSchema = obj({
  id: opaqueId("prs"),
  kind: oneOf(["person", "organization"] as const),
  displayName: str({ min: 1, max: 120 }),
  email: nullable(str({ max: 254 })),
  emailKey: nullable(str({ max: 64, pattern: /^[a-f0-9]{64}$/ })),
  organizationId: nullable(opaqueId("org")),
  organizationName: nullable(str({ max: 160 })),
  region: nullable(str({ max: 80 })),
  participationInterest: oneOf(PARTICIPATION_INTERESTS),
  source: oneOf(PROSPECT_SOURCES),
  sourceEvidenceUrl: nullable(url),
  sourceObservedOn: nullable(isoDate),
  contactReason: nullable(shortText(500)),
  stage: oneOf(STAGES),
  blockedReason: nullable(oneOf(BLOCK_REASONS)),
  ownerId: nullable(userId),
  nextAction: nullable(str({ max: 200 })),
  nextActionDue: nullable(isoDate),
  priority: oneOf(PRIORITIES),
  // Never inferred, never set by a form. 0.1 has no path to "verified":
  // the schema itself forbids it.
  authorityStatus: oneOf(["unverified", "not-applicable"] as const),
  retentionClass: oneOf(RETENTION_CLASSES),
  retainUntil: nullable(isoDate),
  lastInboundAt: nullable(isoInstant),
  lastOutboundAt: nullable(isoInstant),
  ...base,
});
export type Prospect = Infer<typeof ProspectSchema>;

export const InterestSubmissionSchema = obj({
  id: opaqueId("sub"),
  prospectId: opaqueId("prs"),
  formVersion: str({ max: 32 }),
  noticeVersion: str({ max: 32 }),
  category: oneOf(PARTICIPATION_INTERESTS),
  note: nullable(shortText(500)),
  referral: nullable(str({ max: 80 })),
  outcome: oneOf(["accepted", "accepted-repeat"] as const),
  submittedAt: isoInstant,
  ...base,
});
export type InterestSubmission = Infer<typeof InterestSubmissionSchema>;

export const CommunicationPermissionSchema = obj({
  id: opaqueId("perm"),
  prospectId: opaqueId("prs"),
  purpose: oneOf(PERMISSION_PURPOSES),
  basis: oneOf(PERMISSION_BASES),
  // The exact wording shown at capture, and its version. Never manufactured
  // for a researched contact: those carry a documented basis instead.
  capturedWording: nullable(shortText(600)),
  wordingVersion: nullable(str({ max: 32 })),
  captureChannel: oneOf(["web-form", "manual-record"] as const),
  capturedAt: isoInstant,
  state: oneOf(PERMISSION_STATES),
  reviewedBy: nullable(userId),
  reviewedAt: nullable(isoInstant),
  withdrawnAt: nullable(isoInstant),
  expiresAt: nullable(isoInstant),
  ...base,
});
export type CommunicationPermission = Infer<typeof CommunicationPermissionSchema>;

export const OrganizationSchema = obj({
  id: opaqueId("org"),
  name: str({ min: 1, max: 160 }),
  kind: oneOf(["archive", "library", "university", "community-organization", "cultural-institution", "other"] as const),
  website: nullable(url),
  region: nullable(str({ max: 80 })),
  relevance: shortText(500),
  sourceEvidenceUrl: nullable(url),
  sourceObservedOn: nullable(isoDate),
  ...base,
});
export type Organization = Infer<typeof OrganizationSchema>;

// A person's association with an organization, for introductions. Not an
// archival relationship and never drawn as one.
export const AffiliationSchema = obj({
  id: opaqueId("aff"),
  prospectId: opaqueId("prs"),
  organizationId: opaqueId("org"),
  role: str({ max: 120 }),
  relevance: shortText(300),
  ...base,
});
export type Affiliation = Infer<typeof AffiliationSchema>;

export const InteractionSchema = obj({
  id: opaqueId("int"),
  prospectId: opaqueId("prs"),
  channel: oneOf(["email", "call", "video", "meeting", "letter", "other"] as const),
  direction: oneOf(["inbound", "outbound", "internal-note"] as const),
  occurredAt: isoInstant,
  // High-level only. No testimony, no raw correspondence.
  summary: shortText(600),
  sourceIntegrity: oneOf(["verified-sender", "unverified", "not-applicable"] as const),
  outreachDraftId: nullable(opaqueId("out")),
  needsResponse: bool,
  actorId: userId,
  ...base,
});
export type Interaction = Infer<typeof InteractionSchema>;

export const TASK_TYPES = ["triage", "reply", "follow-up", "schedule-conversation", "consultation", "permission-review", "retention-review", "approval", "operations"] as const;
export const OpsTaskSchema = obj({
  id: opaqueId("tsk"),
  type: oneOf(TASK_TYPES),
  title: str({ min: 1, max: 160 }),
  dueOn: nullable(isoDate),
  ownerId: nullable(userId),
  prospectId: nullable(opaqueId("prs")),
  status: oneOf(["open", "done", "cancelled", "escalated"] as const),
  priority: oneOf(PRIORITIES),
  resolution: nullable(str({ max: 300 })),
  createdBy: userId,
  // Deterministic automation creates a task at most once per key.
  dedupeKey: nullable(str({ max: 120 })),
  ...base,
});
export type OpsTask = Infer<typeof OpsTaskSchema>;

const REVIEW_STATUS = ["not-started", "in-review", "cleared", "blocked"] as const;
export const CampaignSchema = obj({
  id: opaqueId("cmp"),
  name: str({ min: 1, max: 120 }),
  purpose: shortText(500),
  audience: shortText(300),
  channels: arrayOf(oneOf([...CHANNELS_CONTENT, "email-introduction"] as const), { max: 6 }),
  postsPerWeekCap: int({ min: 0, max: 14 }),
  introductionsPerWeekCap: int({ min: 0, max: 25 }),
  reviewOwnerId: userId,
  startsOn: nullable(isoDate),
  endsOn: nullable(isoDate),
  status: oneOf(["draft", "needs-review", "approved", "active", "paused", "closed"] as const),
  metricsDefinition: shortText(600),
  consentReviewStatus: oneOf(REVIEW_STATUS),
  legalReviewStatus: oneOf(REVIEW_STATUS),
  ...base,
});
export type Campaign = Infer<typeof CampaignSchema>;

const ContentVersionSchema = obj({
  version: int({ min: 1 }),
  body: str({ min: 1, max: 3000, multiline: true }),
  editedAt: isoInstant,
  editedBy: userId,
  contentHash: str({ max: 64, pattern: /^[a-f0-9]{64}$/ }),
});
export type ContentVersion = Infer<typeof ContentVersionSchema>;

export const ContentDraftSchema = obj({
  id: opaqueId("cnt"),
  campaignId: nullable(opaqueId("cmp")),
  title: str({ min: 1, max: 160 }),
  channel: oneOf(CHANNELS_CONTENT),
  originCategory: oneOf(ORIGIN_CATEGORIES),
  sourceReference: str({ min: 1, max: 200 }),
  assetDescription: nullable(str({ max: 300 })),
  assetPermission: nullable(str({ max: 300 })),
  versions: arrayOf(ContentVersionSchema, { max: 200 }),
  currentVersion: int({ min: 1 }),
  status: oneOf(DRAFT_STATUSES),
  scheduledFor: nullable(isoInstant),
  publicationRoute: oneOf(["manual", "integration"] as const),
  origin: oneOf(["template", "human"] as const),
  ...base,
});
export type ContentDraft = Infer<typeof ContentDraftSchema>;

const OutreachVersionSchema = obj({
  version: int({ min: 1 }),
  subject: str({ min: 1, max: 160 }),
  body: str({ min: 1, max: 4000, multiline: true }),
  editedAt: isoInstant,
  editedBy: userId,
  contentHash: str({ max: 64, pattern: /^[a-f0-9]{64}$/ }),
});
export type OutreachVersion = Infer<typeof OutreachVersionSchema>;

export const OutreachDraftSchema = obj({
  id: opaqueId("out"),
  prospectId: opaqueId("prs"),
  campaignId: nullable(opaqueId("cmp")),
  purpose: oneOf(OUTREACH_PURPOSES),
  permissionId: nullable(opaqueId("perm")),
  channel: literal("email"),
  versions: arrayOf(OutreachVersionSchema, { max: 200 }),
  currentVersion: int({ min: 1 }),
  status: oneOf(DRAFT_STATUSES),
  scheduledFor: nullable(isoInstant),
  followUpOf: nullable(opaqueId("out")),
  origin: oneOf(["template", "human"] as const),
  ...base,
});
export type OutreachDraft = Infer<typeof OutreachDraftSchema>;

export const APPROVAL_SUBJECTS = ["outreach", "content", "campaign"] as const;
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];
export const ApprovalSchema = obj({
  id: opaqueId("apr"),
  subjectType: oneOf(APPROVAL_SUBJECTS),
  subjectId: str({ max: 64 }),
  subjectVersion: int({ min: 1 }),
  // sha256 over the canonical payload: exact content, recipient, channel,
  // and schedule (approvals.ts). The approval is bound to this, not to the
  // draft's id.
  payloadHash: str({ max: 64, pattern: /^[a-f0-9]{64}$/ }),
  outcome: oneOf(["approved", "rejected", "revision-requested"] as const),
  state: oneOf(["active", "invalidated", "consumed", "expired", "closed"] as const),
  approverId: userId,
  approverRole: oneOf(ROLES),
  secondReviewerId: nullable(userId),
  decidedAt: isoInstant,
  expiresAt: nullable(isoInstant),
  invalidatedAt: nullable(isoInstant),
  invalidatedReason: nullable(code),
  ...base,
});
export type Approval = Infer<typeof ApprovalSchema>;

export const JOB_KINDS = ["send-outreach", "publish-content", "send-acknowledgement"] as const;
// running: claimed by a runner until nextAttemptAt (a lease). simulated:
// the dry-run outbox recorded it and nothing left the machine.
export const JOB_STATUSES = ["queued", "running", "held", "succeeded", "simulated", "failed", "cancelled", "dead"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const DispatchJobSchema = obj({
  id: opaqueId("job"),
  kind: oneOf(JOB_KINDS),
  subjectId: str({ max: 64 }),
  subjectVersion: int({ min: 1 }),
  approvalId: nullable(opaqueId("apr")),
  idempotencyKey: str({ min: 8, max: 128 }),
  status: oneOf(JOB_STATUSES),
  attempts: int({ min: 0, max: 50 }),
  maxAttempts: int({ min: 1, max: 10 }),
  nextAttemptAt: nullable(isoInstant),
  lastErrorCode: nullable(code),
  holdReason: nullable(code),
  ...base,
});
export type DispatchJob = Infer<typeof DispatchJobSchema>;

export const DeliveryReceiptSchema = obj({
  id: opaqueId("rcp"),
  jobId: nullable(opaqueId("job")),
  subjectType: oneOf(["outreach", "content", "acknowledgement"] as const),
  subjectId: str({ max: 64 }),
  subjectVersion: int({ min: 1 }),
  // provider: a provider confirmed it. dry-run: the local outbox recorded
  // it and nothing left the machine. manual-attestation: a named person
  // says they sent or posted it by hand.
  route: oneOf(["provider", "dry-run", "manual-attestation"] as const),
  providerName: nullable(str({ max: 40 })),
  providerMessageId: nullable(str({ max: 200 })),
  requestId: str({ max: 128 }),
  result: oneOf(["confirmed", "simulated", "attested"] as const),
  externalUrl: nullable(url),
  attestedBy: nullable(userId),
  at: isoInstant,
  ...base,
});
export type DeliveryReceipt = Infer<typeof DeliveryReceiptSchema>;

export const SuppressionSchema = obj({
  id: opaqueId("sup"),
  // Keyed hash of the normalized address. A suppression survives deletion
  // of the prospect it came from.
  emailKey: str({ max: 64, pattern: /^[a-f0-9]{64}$/ }),
  scope: oneOf(SUPPRESSION_SCOPES),
  basis: oneOf(["unsubscribe", "withdrawal", "founder-hold", "bounce", "complaint"] as const),
  effectiveAt: isoInstant,
  createdBy: userId,
  liftedAt: nullable(isoInstant),
  ...base,
});
export type Suppression = Infer<typeof SuppressionSchema>;

export const AuditEventSchema = obj({
  id: opaqueId("evt"),
  at: isoInstant,
  actorId: str({ max: 64, pattern: /^(usr_[A-Za-z0-9]{6,48}|system|public)$/ }),
  actorRole: oneOf(ACTOR_ROLES),
  action: code,
  objectType: code,
  objectId: nullable(str({ max: 64, pattern: /^[a-z]{3,4}_[A-Za-z0-9]{8,48}$/ })),
  reason: nullable(code),
  synthetic: bool,
});
export type AuditEvent = Infer<typeof AuditEventSchema>;

// Aggregate counts only: no identifiers, no addresses, no notes.
export const FunnelCountSchema = obj({
  id: str({ max: 120 }),
  day: isoDate,
  event: oneOf(["interest-accepted", "interest-repeat", "abuse-honeypot", "abuse-too-fast", "abuse-token", "abuse-rate-limited", "rejected-invalid", "rejected-attachment"] as const),
  category: nullable(oneOf(PARTICIPATION_INTERESTS)),
  referral: nullable(str({ max: 40 })),
  count: int({ min: 0 }),
});
export type FunnelCount = Infer<typeof FunnelCountSchema>;

export const SettingsSchema = obj({
  allOutboundPaused: bool,
  pausedAt: nullable(isoInstant),
  pausedBy: nullable(userId),
  lastReviewAt: nullable(isoInstant),
  followUpDelayDays: int({ min: 3, max: 60 }),
  maxFollowUps: int({ min: 0, max: 1 }),
  approvalValidityDays: int({ min: 1, max: 30 }),
  version: int({ min: 1 }),
});
export type Settings = Infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  allOutboundPaused: false,
  pausedAt: null,
  pausedBy: null,
  lastReviewAt: null,
  followUpDelayDays: 10,
  maxFollowUps: 1,
  approvalValidityDays: 14,
  version: 1,
};
