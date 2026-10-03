// Synthetic, non-sensitive fixture set for the preservation-workflow
// exercise. Every entity is invented. isSynthetic is always true. None of
// this implies real consent, real authority, or a real appointment — see
// docs/ethos.txt §6.0/§6.1 on keeping demonstrations separate from evidence.
import type {
  AuthorityClaim,
  ConsentGrant,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
} from "../domain/types";
import { uuidv7 } from "../domain/id";

export const FIXTURE_SET_ID = "fixture-set-2026-10-preservation-drill";

function now(): string {
  return new Date().toISOString();
}

export type Fixture = {
  record: FixtureRecord;
  authorityClaims: AuthorityClaim[];
  legalRights: LegalRight[];
  consentGrants: ConsentGrant[];
  custodyCopies: CustodyCopy[];
};

// Case 1: clean, active, publishable — the T0 "authorized" state used by the
// restore drill before any lifecycle action runs against it.
function activeAuthorizedFixture(): Fixture {
  const recordId = uuidv7();
  const consentId = uuidv7();
  return {
    record: {
      recordId,
      version: 0,
      isSynthetic: true,
      fixtureSetId: FIXTURE_SET_ID,
      title: "[SYNTHETIC] Drainage-season routine, invented neighborhood",
      summary: "Fabricated test content standing in for a short daily-life account. Not a real testimony.",
      provenanceRef: "fixture://invented-session-001",
      publicationStatus: "published",
      custodyStatus: "preserved",
      reviewedAt: now(),
      redactionApplied: false,
      // Placeholder-shaped: this builder is pure/sync, so it cannot produce a
      // real S3 version. versionId: null correctly marks this as not yet
      // bound — see fixtures/media.ts's bindSeedMedia, which uploads real
      // bytes and rebinds this to a real version wherever media actually
      // needs to be exercised (not every test needs that).
      mediaRefs: [
        {
          mediaId: uuidv7(),
          objectKey: "fixtures/active-authorized/dummy.txt",
          bytes: 128,
          checksumSha256: "0".repeat(64),
          contentType: "text/plain",
          versionId: null,
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    },
    authorityClaims: [
      {
        recordId,
        claimId: uuidv7(),
        status: "identified",
        claimant: "[SYNTHETIC] Invented Steward A",
        scope: "full record",
        evidenceRef: "fixture://invented-evidence-001",
        reviewerDecision: "accepted",
        createdAt: now(),
      },
    ],
    legalRights: [],
    consentGrants: [
      {
        recordId,
        consentId,
        version: 0,
        signerCapacitySummary: "[SYNTHETIC] invented primary narrator",
        signerCapacityVerified: true,
        mandateRef: null,
        purposes: ["collection", "preservation", "publication"],
        audience: "public",
        grantedAt: now(),
        expiresAt: null,
        revokedAt: null,
        retentionTermsRef: "fixture://invented-retention-001",
        withdrawalContact: "fixture-steward@example.invalid",
      },
    ],
    custodyCopies: [
      {
        recordId,
        copyId: uuidv7(),
        location: "primary",
        objectVersionId: null,
        // Generic bookkeeping copy, not tied to the media object above —
        // see fixtures/media.ts's bindSeedMedia for the SEPARATE,
        // media-tracking copy it adds when a test actually needs one.
        mediaId: null,
        createdAt: now(),
        reconciledAt: now(),
      },
    ],
  };
}

// Case 2: expired consent — purpose/audience match, but the grant lapsed.
function expiredConsentFixture(): Fixture {
  const recordId = uuidv7();
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  return {
    record: {
      recordId,
      version: 0,
      isSynthetic: true,
      fixtureSetId: FIXTURE_SET_ID,
      title: "[SYNTHETIC] Expired-consent test fixture",
      summary: "Fabricated content whose consent grant has lapsed.",
      provenanceRef: "fixture://invented-session-002",
      publicationStatus: "published",
      custodyStatus: "preserved",
      reviewedAt: now(),
      redactionApplied: false,
      mediaRefs: [],
      createdAt: now(),
      updatedAt: now(),
    },
    authorityClaims: [
      {
        recordId,
        claimId: uuidv7(),
        status: "identified",
        claimant: "[SYNTHETIC] Invented Steward B",
        scope: "full record",
        evidenceRef: "fixture://invented-evidence-002",
        reviewerDecision: "accepted",
        createdAt: now(),
      },
    ],
    legalRights: [],
    consentGrants: [
      {
        recordId,
        consentId: uuidv7(),
        version: 0,
        signerCapacitySummary: "[SYNTHETIC] invented narrator",
        signerCapacityVerified: true,
        mandateRef: null,
        purposes: ["collection", "preservation", "publication"],
        audience: "public",
        grantedAt: past,
        expiresAt: past,
        revokedAt: null,
        retentionTermsRef: "fixture://invented-retention-002",
        withdrawalContact: "fixture-steward@example.invalid",
      },
    ],
    custodyCopies: [],
  };
}

// Case 3: disputed authority — consent exists, but authority is contested.
function disputedAuthorityFixture(): Fixture {
  const recordId = uuidv7();
  return {
    record: {
      recordId,
      version: 0,
      isSynthetic: true,
      fixtureSetId: FIXTURE_SET_ID,
      title: "[SYNTHETIC] Disputed-authority test fixture",
      summary: "Fabricated content, published, whose authority claim became contested afterward.",
      provenanceRef: "fixture://invented-session-003",
      // Deliberately "published" / "preserved" — isolates authority dispute
      // as the sole reason evaluatePermission denies this record, rather
      // than letting an unrelated publication-status gate mask it.
      publicationStatus: "published",
      custodyStatus: "preserved",
      reviewedAt: now(),
      redactionApplied: false,
      mediaRefs: [],
      createdAt: now(),
      updatedAt: now(),
    },
    authorityClaims: [
      {
        recordId,
        claimId: uuidv7(),
        status: "disputed",
        claimant: "[SYNTHETIC] Invented Claimant C",
        scope: "full record",
        evidenceRef: "fixture://invented-evidence-003",
        reviewerDecision: null,
        createdAt: now(),
      },
    ],
    legalRights: [],
    consentGrants: [
      {
        recordId,
        consentId: uuidv7(),
        version: 0,
        signerCapacitySummary: "[SYNTHETIC] invented narrator",
        signerCapacityVerified: true,
        mandateRef: null,
        purposes: ["collection", "preservation", "publication"],
        audience: "public",
        grantedAt: now(),
        expiresAt: null,
        revokedAt: null,
        retentionTermsRef: "fixture://invented-retention-003",
        withdrawalContact: "fixture-steward@example.invalid",
      },
    ],
    custodyCopies: [],
  };
}

// Case 4: preservation-only — consent explicitly excludes publication.
function preservationOnlyFixture(): Fixture {
  const recordId = uuidv7();
  return {
    record: {
      recordId,
      version: 0,
      isSynthetic: true,
      fixtureSetId: FIXTURE_SET_ID,
      title: "[SYNTHETIC] Preservation-only test fixture",
      summary: "Fabricated content with preservation-only consent.",
      provenanceRef: "fixture://invented-session-004",
      publicationStatus: "restricted",
      custodyStatus: "preserved",
      reviewedAt: now(),
      redactionApplied: false,
      mediaRefs: [],
      createdAt: now(),
      updatedAt: now(),
    },
    authorityClaims: [
      {
        recordId,
        claimId: uuidv7(),
        status: "identified",
        claimant: "[SYNTHETIC] Invented Steward D",
        scope: "full record",
        evidenceRef: "fixture://invented-evidence-004",
        reviewerDecision: "accepted",
        createdAt: now(),
      },
    ],
    legalRights: [],
    consentGrants: [
      {
        recordId,
        consentId: uuidv7(),
        version: 0,
        signerCapacitySummary: "[SYNTHETIC] invented narrator",
        signerCapacityVerified: true,
        mandateRef: null,
        purposes: ["collection", "preservation"],
        audience: "staff",
        grantedAt: now(),
        expiresAt: null,
        revokedAt: null,
        retentionTermsRef: "fixture://invented-retention-004",
        withdrawalContact: "fixture-steward@example.invalid",
      },
    ],
    custodyCopies: [],
  };
}

export function buildSeedFixtures(): Fixture[] {
  return [activeAuthorizedFixture(), expiredConsentFixture(), disputedAuthorityFixture(), preservationOnlyFixture()];
}
