// Scoped permission evaluation per docs/ethos.txt §3.3 and §4.
//
// Hard rule enforced throughout: a login, staff role, category, or
// publication flag never substitutes for a scoped grant. Every path below
// either finds an active, purpose-and-audience-matched, capacity-verified
// consent grant with undisputed authority and a permitting control state, or
// it denies. There is no bypass branch — "staff" is just another audience
// value, checked the same way as "public".
import type { ConsentGrant, Purpose } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";

export type PermissionDecision = {
  allowed: boolean;
  reason: string;
};

export type PermissionQuery = {
  recordId: string;
  purpose: Purpose;
  audience: ConsentGrant["audience"];
  now: Date;
  // Present when checking access to a SPECIFIC media object, not just the
  // record generally. Redaction (redactMedia(), services/lifecycle.ts) is
  // a hard override checked here, independent of and in addition to every
  // other check below — it can only ever ADD a restriction, consistent
  // with docs/ethos.txt §3.5's "curator approval cannot expand source
  // permissions" applied to redaction specifically.
  mediaId?: string;
};

// The one real grant-matching predicate, extracted so services/intake.ts's
// approvePreservation/approvePublication can validate a consent grant
// against the EXACT same rule evaluatePermission itself enforces (purpose,
// audience, revocation — both the grant's own revokedAt and the register's
// revokedConsentIds, so a stale grant row can never bypass a
// register-level revocation — and expiry) rather than a second,
// hand-rolled check that could quietly drift from the real one over time.
// requireVerified defaults to true (evaluatePermission's own use); intake
// approval calls this with requireVerified: false, since verifying is
// exactly what approving is about to do.
export function findApprovableGrant(
  grants: ConsentGrant[],
  query: {
    purpose: Purpose;
    audience: ConsentGrant["audience"];
    now: Date;
    revokedConsentIds: string[];
    requireVerified?: boolean;
  },
): ConsentGrant | undefined {
  const requireVerified = query.requireVerified ?? true;
  return grants.find(
    (grant) =>
      grant.purposes.includes(query.purpose) &&
      grant.audience === query.audience &&
      (!requireVerified || grant.signerCapacityVerified) &&
      grant.revokedAt === null &&
      !query.revokedConsentIds.includes(grant.consentId) &&
      (grant.expiresAt === null || new Date(grant.expiresAt) > query.now),
  );
}

export async function evaluatePermission(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  query: PermissionQuery,
): Promise<PermissionDecision> {
  const { recordId, purpose, audience, now } = query;

  // The control register is authoritative and checked first. Missing
  // control state denies — it is never treated as "no restriction".
  const control = await registerStore.getCurrent(recordId);
  if (!control) {
    return {
      allowed: false,
      reason: "No current restriction-register entry for this record; missing control state denies serving.",
    };
  }
  if (query.mediaId && control.redactedMediaIds?.includes(query.mediaId)) {
    return { allowed: false, reason: `Media ${query.mediaId} has been redacted.` };
  }
  if (control.currentCustodyStatus === "deleted" || control.currentCustodyStatus === "deletion-pending") {
    return { allowed: false, reason: `Custody status is "${control.currentCustodyStatus}".` };
  }
  // Staff intake and review (services/intake.ts): a freshly created
  // submission's evidence starts "unknown"/unverified, which already
  // denies on its own further down — but a reviewer's approval writes
  // that verification in steps before the final custody transition
  // commits (services/intake.ts's IntakeRegisterCommitter.commitApproval),
  // so without this explicit, unconditional check, the record would
  // become genuinely readable mid-approval, before it's actually approved.
  // Quarantine denies everyone, unconditionally, the same way deleted/
  // deletion-pending already do — never "until the evidence happens to
  // look right."
  if (control.currentCustodyStatus === "quarantined") {
    return { allowed: false, reason: "Custody status is \"quarantined\" — pending review." };
  }
  if (control.restrictedPurposes.includes(purpose)) {
    return { allowed: false, reason: `Purpose "${purpose}" is currently restricted for this record.` };
  }
  if (audience === "public" && control.currentPublicationStatus !== "published") {
    return {
      allowed: false,
      reason: `Publication status is "${control.currentPublicationStatus}", not published; public audience denied.`,
    };
  }
  if (control.currentPublicationStatus === "withdrawn") {
    return { allowed: false, reason: "Publication status is \"withdrawn\"." };
  }

  const record = await fixtureStore.getRecord(recordId);
  if (!record) {
    return { allowed: false, reason: "Record not found." };
  }

  // Authority: missing, disputed, or unknown claims deny — undisputed
  // identified-or-shared authority is required, not merely "not disputed".
  const authorityClaims = await fixtureStore.listAuthorityClaims(recordId);
  if (authorityClaims.length === 0) {
    return { allowed: false, reason: "No authority claim on record; missing authority denies the affected use." };
  }
  const blockingAuthority = authorityClaims.find(
    (claim) => claim.status === "disputed" || claim.status === "unknown",
  );
  if (blockingAuthority) {
    return {
      allowed: false,
      reason: `Authority claim ${blockingAuthority.claimId} is "${blockingAuthority.status}".`,
    };
  }

  // Legal rights: unlike authority, an EMPTY list is fine (no claimed right
  // in dispute) — but any disputed or unknown right on record denies, the
  // same way a disputed authority claim does.
  const legalRights = await fixtureStore.listLegalRights(recordId);
  const blockingLegalRight = legalRights.find(
    (right) => right.status === "disputed" || right.status === "unknown",
  );
  if (blockingLegalRight) {
    return {
      allowed: false,
      reason: `Legal right ${blockingLegalRight.rightId} is "${blockingLegalRight.status}".`,
    };
  }

  // Consent: an active, scope-matched, capacity-verified grant is required.
  // revokedConsentIds is checked IN ADDITION to the grant's own revokedAt —
  // the register is the one place a restore of an old ConsentGrant backup
  // cannot resurrect a revocation, so it is always consulted here too, never
  // trusted-away because the grant row itself looks unrevoked.
  const grants = await fixtureStore.listConsentGrants(recordId);
  const matching = findApprovableGrant(grants, { purpose, audience, now, revokedConsentIds: control.revokedConsentIds, requireVerified: true });
  if (!matching) {
    const unverifiedOnly = grants.some(
      (grant) =>
        grant.purposes.includes(purpose) && grant.audience === audience && !grant.signerCapacityVerified,
    );
    if (unverifiedOnly) {
      return {
        allowed: false,
        reason: "A matching consent grant exists but signer capacity is not verified.",
      };
    }
    return {
      allowed: false,
      reason: `No active consent grant for purpose "${purpose}" and audience "${audience}".`,
    };
  }

  return {
    allowed: true,
    reason: "Active, capacity-verified consent, undisputed authority, and current control state all permit this use.",
  };
}
