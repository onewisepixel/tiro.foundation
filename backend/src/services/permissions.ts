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
};

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
  if (control.currentCustodyStatus === "deleted" || control.currentCustodyStatus === "deletion-pending") {
    return { allowed: false, reason: `Custody status is "${control.currentCustodyStatus}".` };
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

  // Consent: an active, scope-matched, capacity-verified grant is required.
  const grants = await fixtureStore.listConsentGrants(recordId);
  const matching = grants.find(
    (grant) =>
      grant.purposes.includes(purpose) &&
      grant.audience === audience &&
      grant.signerCapacityVerified &&
      grant.revokedAt === null &&
      (grant.expiresAt === null || new Date(grant.expiresAt) > now),
  );
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
