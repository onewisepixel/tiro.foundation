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

export type AuthorityStatus = "identified" | "shared" | "disputed" | "unknown";
export type LegalRightStatus = "identified" | "disputed" | "unknown";

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
  | "retain"
  | "delete"
  | "complete-deletion";
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
  updatedAt: string;
};
