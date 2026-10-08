// Scoped permission evaluation per docs/ethos.txt §3.3 and §4.
//
// Hard rule enforced throughout: a login, staff role, category, or
// publication flag never substitutes for a scoped grant. Every path below
// either finds an active, purpose-and-audience-matched, capacity-verified
// consent grant with undisputed authority and a permitting control state, or
// it denies. There is no bypass branch — "staff" is just another audience
// value, checked the same way as "public".
import type { ConsentGrant, Purpose, RestrictionRegisterEntry } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";

export type PermissionDecision = {
  allowed: boolean;
  reason: string;
  // The EXACT register snapshot this decision was computed against — null
  // only in the one branch where no register entry exists at all. Reviewer-
  // caught finding: a caller that needs to do more than just branch on
  // allowed/reason (services/intakeViews.ts's pendingPublication listing —
  // masking a title, deciding eligibility, reporting controlVersion) used
  // to take its OWN separate register read before calling this function,
  // then use evaluatePermission's independently-read, possibly NEWER
  // snapshot only for the allowed/reason decision — two different reads of
  // the same thing, open to exactly the inconsistency a shared snapshot
  // exists to prevent (reproduced: a redaction landing between the two
  // reads left the queue's masking decision based on the older, pre-
  // redaction snapshot while the allowed/reason decision reflected the
  // newer one). Exposing the snapshot here lets every such caller use the
  // SAME one for everything, never a second, separately-timed read.
  control: RestrictionRegisterEntry | null;
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

  // Reviewer-caught finding, round five: control used to be read FIRST,
  // before any evidence (record/authorityClaims/legalRights/consentGrants)
  // read — reproduced directly against the real lifecycle functions: a
  // consent grant's verification, committed atomically with a redaction
  // and a custody/publication transition (services/intake.ts's
  // commitApproval), landing in the gap between this function's control
  // read and its (later) evidence reads let the OLD control snapshot
  // combine with the NEWLY verified grant — allowed became true using
  // control from before the redaction that should have masked the title.
  // No single real moment in time ever actually held that combination.
  // Fixed with the same "content first, authoritative-register last"
  // ordering already applied to services/intakeViews.ts's reads: every
  // piece of evidence is read FIRST, and the register — authoritative over
  // whether any of it may be used, and the exact snapshot returned as
  // decision.control for every caller that masks or reports against it —
  // is read LAST, immediately before use. This is NOT an atomic, all-
  // entities-together snapshot — record/claims/rights/grants are still
  // four separate reads, and a transition can still land between any two
  // of them. What this ordering actually guarantees is narrower, and it's
  // enough: the register is never OLDER than the evidence it's combined
  // with. decision.control reflects, at minimum, every transition that had
  // already committed by the time the (necessarily somewhat stale)
  // evidence was read — the final authoritative control applied is always
  // at least as current as what it's judging, never a step behind it.
  const record = await fixtureStore.getRecord(recordId);
  const authorityClaims = await fixtureStore.listAuthorityClaims(recordId);
  const legalRights = await fixtureStore.listLegalRights(recordId);
  const grants = await fixtureStore.listConsentGrants(recordId);

  const control = await registerStore.getCurrent(recordId);
  if (!control) {
    return {
      allowed: false,
      reason: "No current restriction-register entry for this record; missing control state denies serving.",
      control: null,
    };
  }
  if (query.mediaId && control.redactedMediaIds?.includes(query.mediaId)) {
    return { allowed: false, reason: `Media ${query.mediaId} has been redacted.`, control };
  }
  if (control.currentCustodyStatus === "deleted" || control.currentCustodyStatus === "deletion-pending") {
    return { allowed: false, reason: `Custody status is "${control.currentCustodyStatus}".`, control };
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
    return { allowed: false, reason: "Custody status is \"quarantined\" — pending review.", control };
  }
  if (control.restrictedPurposes.includes(purpose)) {
    return { allowed: false, reason: `Purpose "${purpose}" is currently restricted for this record.`, control };
  }
  if (audience === "public" && control.currentPublicationStatus !== "published") {
    return {
      allowed: false,
      reason: `Publication status is "${control.currentPublicationStatus}", not published; public audience denied.`,
      control,
    };
  }
  if (control.currentPublicationStatus === "withdrawn") {
    return { allowed: false, reason: "Publication status is \"withdrawn\".", control };
  }

  if (!record) {
    return { allowed: false, reason: "Record not found.", control };
  }

  // Authority: missing, disputed, or unknown claims deny — undisputed
  // identified-or-shared authority is required, not merely "not disputed".
  if (authorityClaims.length === 0) {
    return { allowed: false, reason: "No authority claim on record; missing authority denies the affected use.", control };
  }
  const blockingAuthority = authorityClaims.find(
    (claim) => claim.status === "disputed" || claim.status === "unknown",
  );
  if (blockingAuthority) {
    return {
      allowed: false,
      reason: `Authority claim ${blockingAuthority.claimId} is "${blockingAuthority.status}".`,
      control,
    };
  }

  // Legal rights: unlike authority, an EMPTY list is fine (no claimed right
  // in dispute) — but any disputed or unknown right on record denies, the
  // same way a disputed authority claim does.
  const blockingLegalRight = legalRights.find(
    (right) => right.status === "disputed" || right.status === "unknown",
  );
  if (blockingLegalRight) {
    return {
      allowed: false,
      reason: `Legal right ${blockingLegalRight.rightId} is "${blockingLegalRight.status}".`,
      control,
    };
  }

  // Consent: an active, scope-matched, capacity-verified grant is required.
  // revokedConsentIds is checked IN ADDITION to the grant's own revokedAt —
  // the register is the one place a restore of an old ConsentGrant backup
  // cannot resurrect a revocation, so it is always consulted here too, never
  // trusted-away because the grant row itself looks unrevoked.
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
        control,
      };
    }
    return {
      allowed: false,
      reason: `No active consent grant for purpose "${purpose}" and audience "${audience}".`,
      control,
    };
  }

  return {
    allowed: true,
    reason: "Active, capacity-verified consent, undisputed authority, and current control state all permit this use.",
    control,
  };
}
