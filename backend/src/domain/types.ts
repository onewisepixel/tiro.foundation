// Backend fixture domain model. Distinct from src/data/memories.ts (the public
// display type) by design — this models the lifecycle/permission machinery
// ethos.txt §4 describes; it is never read by the public Next.js site.
//
// Every entity here describes a SYNTHETIC fixture. `isSynthetic: true` and
// `fixtureSetId` are mandatory, not defensive — there is no path through this
// module that produces a record without them.

export type PublicationStatus =
  | "not-published"
  | "review"
  | "published"
  | "restricted"
  | "withdrawn";

export type CustodyStatus =
  | "quarantined"
  | "preserved"
  | "deletion-pending"
  | "deleted";

export type Purpose =
  | "collection"
  | "preservation"
  | "publication"
  | "research"
  | "derivatives"
  | "model-training"
  | "synthetic-reproduction"
  | "commercial-use";

// "superseded" marks a claim/right a staff member has explicitly corrected
// (services/intake.ts's supersedeAuthorityClaim/supersedeLegalRight) — the
// OLD row stays on record (nothing here is ever silently overwritten) but
// no longer counts as a live, unresolved claim. evaluatePermission's
// blocking check (permissions.ts) only ever flags "disputed"/"unknown", so
// a superseded claim needs no special-casing there: it simply isn't either
// of those any more.
export type AuthorityStatus = "identified" | "shared" | "disputed" | "unknown" | "superseded";
export type LegalRightStatus = "identified" | "disputed" | "unknown" | "superseded";

export type FixtureRecord = {
  // UUIDv7 — see backend/src/domain/id.ts. PK in the primary table.
  recordId: string;
  version: number;
  isSynthetic: true;
  fixtureSetId: string;

  title: string;
  summary: string;
  // Safe, non-identifying provenance pointer only — never testimony content.
  provenanceRef: string;

  publicationStatus: PublicationStatus;
  custodyStatus: CustodyStatus;

  reviewedAt: string | null;
  redactionApplied: boolean;

  mediaRefs: MediaRef[];
  createdAt: string;
  updatedAt: string;
};

export type MediaRef = {
  mediaId: string;
  // S3 key for a small synthetic dummy file. Never real media.
  objectKey: string;
  bytes: number;
  checksumSha256: string;
  contentType: string;
  // The EXACT S3 object version this reference is bound to — retrieval
  // always requests this specific VersionId, never "latest". Pinning this at
  // approval time means a later re-upload to the same key (a new version)
  // can never silently change what an already-approved reference serves.
  // null means a legacy reference created before version binding existed
  // (or one not yet migrated) — see services/media.ts, which fails closed
  // for these rather than guessing a version.
  versionId: string | null;
};

export type AuthorityClaim = {
  recordId: string;
  claimId: string;
  status: AuthorityStatus;
  claimant: string;
  scope: string;
  evidenceRef: string;
  reviewerDecision: string | null;
  createdAt: string;
};

export type LegalRight = {
  recordId: string;
  rightId: string;
  status: LegalRightStatus;
  holder: string;
  rightType: string;
  jurisdiction: string | null;
  evidenceRef: string;
  // Added for services/intake.ts's approvePreservation — same role as
  // AuthorityClaim's own reviewerDecision field above, kept symmetric.
  reviewerDecision: string | null;
  createdAt: string;
};

export type ConsentGrant = {
  recordId: string;
  consentId: string;
  version: number;
  signerCapacitySummary: string;
  // Whether a reviewer has confirmed the signer actually holds the capacity
  // claimed in signerCapacitySummary. An unverified claim of capacity
  // cannot itself grant anything — see services/permissions.ts.
  signerCapacityVerified: boolean;
  mandateRef: string | null;
  purposes: Purpose[];
  audience: "public" | "staff" | "research-partner";
  grantedAt: string;
  // null = no expiry stated at grant time.
  expiresAt: string | null;
  // Independent of expiresAt — set by a lifecycle withdrawal action.
  revokedAt: string | null;
  retentionTermsRef: string;
  withdrawalContact: string;
};

export type LifecycleAction =
  | "restrict"
  | "withdraw"
  | "revoke-consent"
  | "correct"
  | "dispute-correction"
  | "redact-text"
  | "redact-media"
  | "retain"
  | "delete"
  | "complete-deletion"
  // Staff intake and review (services/intake.ts) — a staff member
  // originates a brand-new synthetic record through the browser, pending
  // reviewer promotion into the same permission/lifecycle machinery every
  // other record is already subject to.
  | "create-submission"
  | "add-authority-claim"
  | "add-legal-right"
  | "add-consent-grant"
  | "add-media"
  | "supersede-authority-claim"
  | "supersede-legal-right"
  | "approve-preservation"
  | "approve-publication"
  | "request-changes"
  | "reject-submission";

// Fields a correction or text redaction may target — deliberately limited
// to the record's own safe, already-public-facing text fields (per
// docs/ethos.txt §4's Memory model); never evidence, identity, or consent
// documents, which have their own distinct lifecycle actions.
export type CorrectableField = "title" | "summary" | "provenanceRef";

// §12's "Correct" action: "Add or revise an attributed factual/
// transcription/translation correction; preserve safe provenance and
// contested accounts." A correction REPLACES the live field (so readers
// see the corrected text immediately — the point of fixing an error) but
// never ERASES the prior value: it's preserved here permanently, attributed
// and reasoned, so the record of what changed and why survives. A later
// disagreement about the correction itself (disputeCorrection,
// services/lifecycle.ts) marks `status: "disputed"` WITHOUT reverting the
// correction — disagreements remain attributed, not resolved by silently
// overwriting either account.
export type Correction = {
  recordId: string;
  correctionId: string;
  field: CorrectableField;
  previousValue: string;
  correctedValue: string;
  // Non-identifying summary of who proposed/reviewed this — same shape as
  // every other capacity field in this model (e.g. ConsentGrant's
  // signerCapacitySummary), never a raw identity.
  attribution: string;
  reason: string;
  status: "accepted" | "disputed";
  disputeReason: string | null;
  createdAt: string;
};

// §3.5's redaction tooling, scoped to what this backend can actually do:
// mask a text field or permanently deny a specific media object — never
// image/audio/video content processing (blur/bleep/crop), which needs real
// media-processing infrastructure this project doesn't have. Redaction is
// NOT deletion: underlying bytes/values are preserved for authorized
// review, never erased — "Ethics or curator approval cannot expand source
// permissions" applies here too, so redaction only ever adds a
// restriction, never removes one. previousValue (the pre-redaction text)
// is carried in complete-preservation exports only — never public-redacted
// ones (services/export.ts) — and is never served through the normal
// record-read path (api/router.ts) regardless of caller.
export type Redaction =
  | { recordId: string; redactionId: string; scope: "text"; field: CorrectableField; previousValue: string; reason: string; createdAt: string }
  | { recordId: string; redactionId: string; scope: "media"; mediaId: string; reason: string; createdAt: string };
export type LifecycleRequestStatus = "pending" | "in-progress" | "completed" | "denied";

export type LifecycleRequest = {
  requestId: string;
  recordId: string;
  action: LifecycleAction;
  status: LifecycleRequestStatus;
  requesterCapacity: string;
  reason: string;
  protectiveHold: boolean;
  // A stable fingerprint of everything that defines "this operation" beyond
  // requestId itself (recordId, action, requesterCapacity, reason,
  // protectiveHold, and any action-specific payload like `purposes` or
  // `consentId`). getOrCreateRequest (services/lifecycle.ts) compares this
  // on every lookup — a requestId reused for a DIFFERENT operation is a
  // conflict, never a silent replay of the wrong thing.
  payloadFingerprint: string;
  createdAt: string;
  completedAt: string | null;
  // Minimal non-sensitive receipt only — never testimony, contact info, or
  // evidence content. See docs/ethos.txt §12 "Audit and appeals".
  receiptSummary: string | null;
};

export type CustodyCopy = {
  recordId: string;
  copyId: string;
  location: "primary" | "backup" | "partner-export";
  // For S3-versioned media copies.
  objectVersionId: string | null;
  // Which MediaRef (by mediaId) this copy tracks, when it represents an
  // S3-backed media object specifically — null for non-media bookkeeping
  // copies. completeDeletion (services/lifecycle.ts) uses this to find the
  // exact owned S3 key/version to purge before reconciling the copy.
  mediaId: string | null;
  createdAt: string;
  // Set once propagation of a lifecycle action to this copy is confirmed —
  // for a media copy, only after its S3 versions/delete markers are
  // confirmed actually removed (or a documented retention/expiry exception
  // applies), never merely attempted.
  reconciledAt: string | null;
};

export type AuditReceipt = {
  recordId: string;
  receiptId: string;
  action: LifecycleAction | "export" | "restore";
  outcome: "completed" | "failed" | "pending";
  // Deliberately minimal — no sensitive fields allowed here by type design.
  safeNote: string;
  at: string;
};

// The durable control register. Kept in a SEPARATE table/store from
// everything above — see backend/src/store/store.ts — so that restoring an
// old backup of FixtureRecord/CustodyCopy/etc. can never resurrect access by
// itself. This is the single source of truth consulted on every permission
// check and the one authoritative "is this record currently allowed to be
// served" answer.
export type RestrictionRegisterEntry = {
  recordId: string;
  // Monotonic — only ever increases. Used to detect/reject stale writes.
  controlVersion: number;
  currentPublicationStatus: PublicationStatus;
  currentCustodyStatus: CustodyStatus;
  restrictedPurposes: Purpose[];
  // consentIds revoked via a lifecycle action, tracked HERE (not just on the
  // ConsentGrant itself) so that restoring an old backup of ConsentGrant rows
  // can never resurrect a revoked grant's access — the register is always
  // consulted in addition to, never instead of, the grant's own revokedAt.
  revokedConsentIds: string[];
  // Set, via a conditional write, for the exact duration completeDeletion
  // is actively purging this record's S3 media — real mutual exclusion,
  // not just a read-then-act check. retainForPreservationOnly (the one
  // other action that writes currentCustodyStatus) refuses to proceed
  // while this is set, so a retention action can never "win" a check but
  // still have its media destroyed afterward: either it wins BEFORE the
  // claim exists (completeDeletion's own claim-write then fails the
  // version check and denies, untouched), or it's refused WHILE the claim
  // is held. Optional/nullable so existing callers that never construct
  // this field directly keep compiling unchanged. See services/lifecycle.ts.
  mediaPurgeClaim?: { requestId: string; claimedAt: string } | null;
  // mediaIds redacted via redactMedia() (services/lifecycle.ts) — checked
  // by evaluatePermission as a hard override, independent of and in
  // addition to every other check: a redacted object is denied for every
  // purpose/audience, even one that would otherwise be fully authorized.
  // Optional/nullable for the same reason as mediaPurgeClaim — existing
  // callers that never construct this field directly keep compiling.
  redactedMediaIds?: string[];
  // Reviewer-caught finding: text redaction used to live ONLY in the
  // primary FixtureStore (the live field value + a Redaction row) — the
  // one place restoring an old backup can silently resurrect it, since
  // restore legitimately overwrites FixtureStore content with old data.
  // This durable register field is checked wherever a record's fields are
  // actually served (services/redactionView.ts's applyTextRedactions),
  // the SAME pattern redactedMediaIds already uses for media — so even a
  // restored record carrying the pre-redaction original text is masked at
  // serve time, because the register (never touched by restore) still
  // says the field is redacted.
  redactedTextFields?: CorrectableField[];
  updatedAt: string;
};
