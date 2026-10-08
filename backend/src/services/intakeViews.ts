// Read-side views for staff intake and review — api/router.ts's
// GET /intake/:recordId and GET /intake/queue. Kept separate from
// router.ts (which stays transport-shaping only) the same way
// redactionView.ts is kept separate from the route handlers that use it.
//
// GET /intake/:recordId is authorized by nothing more than "authenticated
// staff" (API Gateway's Cognito authorizer, checked before router.ts ever
// runs) — explicitly NOT evaluatePermission, and explicitly NOT because a
// consent grant exists: there can't be a VERIFIED one yet for a
// quarantined submission, verifying is the point of review. What IS still
// enforced, every time: the record must be isSynthetic, must still be
// exactly "quarantined" (not "withdrawn" — rejection is terminal, and not
// anything else — once preserved, the normal evaluatePermission-gated
// GET /records/:id route is the right one), and redaction still applies
// even here (a hard override independent of every other consideration,
// permissions.ts's own docstring — this bypass-adjacent route is not an
// exception to that).
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import { evaluatePermission } from "./permissions";
import { applyTextRedactions, maskCorrectionsForRedactedFields, redactionsSafeView } from "./redactionView";

export type IntakeSubmissionView = {
  recordId: string;
  controlVersion: number;
  recordVersion: number;
  record: ReturnType<typeof applyTextRedactions>;
  authorityClaims: Awaited<ReturnType<FixtureStore["listAuthorityClaims"]>>;
  legalRights: Awaited<ReturnType<FixtureStore["listLegalRights"]>>;
  consentGrants: Awaited<ReturnType<FixtureStore["listConsentGrants"]>>;
  custodyCopies: Awaited<ReturnType<FixtureStore["listCustodyCopies"]>>;
  auditReceipts: Awaited<ReturnType<FixtureStore["listAuditReceipts"]>>;
  corrections: ReturnType<typeof maskCorrectionsForRedactedFields>;
  redactions: ReturnType<typeof redactionsSafeView>;
};

export async function readIntakeSubmission(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  recordId: string,
): Promise<IntakeSubmissionView | null> {
  const control = await registerStore.getCurrent(recordId);
  if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    return null;
  }
  const record = await fixtureStore.getRecord(recordId);
  if (!record || !record.isSynthetic) {
    return null;
  }
  const [authorityClaims, legalRights, consentGrants, custodyCopies, auditReceipts, corrections, redactions] = await Promise.all([
    fixtureStore.listAuthorityClaims(recordId),
    fixtureStore.listLegalRights(recordId),
    fixtureStore.listConsentGrants(recordId),
    fixtureStore.listCustodyCopies(recordId),
    fixtureStore.listAuditReceipts(recordId),
    fixtureStore.listCorrections(recordId),
    fixtureStore.listRedactions(recordId),
  ]);
  return {
    recordId,
    controlVersion: control.controlVersion,
    recordVersion: record.version,
    record: applyTextRedactions(record, control),
    authorityClaims,
    legalRights,
    consentGrants,
    custodyCopies,
    auditReceipts,
    corrections: maskCorrectionsForRedactedFields(corrections, control),
    redactions: redactionsSafeView(redactions),
  };
}

export type IntakeQueueEntry = { recordId: string; title: string; fixtureSetId: string; createdAt: string; controlVersion: number };
export type IntakeQueueView = { pendingPreservation: IntakeQueueEntry[]; pendingPublication: IntakeQueueEntry[] };

const TITLE_UNAVAILABLE = "[title unavailable]";

export async function readIntakeQueue(fixtureStore: FixtureStore, registerStore: RestrictionRegisterStore): Promise<IntakeQueueView> {
  // Fixture-scale only — a full table scan, same caveat as
  // RestrictionRegisterStore.listAll()'s own doc comment (store.ts): fine
  // for a handful of synthetic records, would need a proper index before
  // any real-scale use.
  const entries = await registerStore.listAll();
  const now = new Date();

  // Reviewer-caught finding: masking with the SCANNED entry (captured once,
  // up front, by listAll()) rather than a fresh read let a stale snapshot
  // expose a title the detail endpoint (readIntakeSubmission, which always
  // reads fresh) correctly withheld — a redaction landing after the scan
  // but before this function finished iterating would be invisible here.
  // getCurrent is always strongly consistent (RestrictionRegisterStore's
  // own contract — the one read in this system that cannot be stale), so
  // every entry below is re-read fresh immediately before it's used for
  // either filtering or masking, never trusted from the initial scan
  // beyond "this recordId exists and might currently qualify."

  const pendingPreservation: IntakeQueueEntry[] = [];
  for (const scanned of entries) {
    const fresh = await registerStore.getCurrent(scanned.recordId);
    if (!fresh || fresh.currentCustodyStatus !== "quarantined" || fresh.currentPublicationStatus === "withdrawn") continue;
    const record = await fixtureStore.getRecord(scanned.recordId);
    if (!record) continue;
    // A quarantined record's title CAN already be text-redacted
    // (redactText has no custody precondition) — the listing must never
    // show the pre-redaction value just because it's "only a queue."
    const masked = applyTextRedactions(record, fresh);
    pendingPreservation.push({
      recordId: scanned.recordId,
      title: masked.title,
      fixtureSetId: record.fixtureSetId,
      createdAt: record.createdAt,
      controlVersion: fresh.controlVersion,
    });
  }

  const pendingPublication: IntakeQueueEntry[] = [];
  for (const scanned of entries) {
    const fresh = await registerStore.getCurrent(scanned.recordId);
    if (!fresh || fresh.currentCustodyStatus !== "preserved" || fresh.currentPublicationStatus !== "not-published") continue;
    const grants = await fixtureStore.listConsentGrants(scanned.recordId);
    if (!grants.some((g) => g.purposes.includes("publication"))) continue;
    const record = await fixtureStore.getRecord(scanned.recordId);
    if (!record) continue;
    // These are "preserved" records with real evaluatePermission
    // semantics already in effect — authentication is never a substitute
    // for it, on this surface either. Title is only shown if staff would
    // actually be allowed to see it; otherwise a visible placeholder,
    // never raw content, defense in depth alongside the preservation-
    // adequacy requirement (which should already guarantee this passes).
    const decision = await evaluatePermission(fixtureStore, registerStore, {
      recordId: scanned.recordId,
      purpose: "preservation",
      audience: "staff",
      now,
    });
    const title = decision.allowed ? applyTextRedactions(record, fresh).title : TITLE_UNAVAILABLE;
    pendingPublication.push({
      recordId: scanned.recordId,
      title,
      fixtureSetId: record.fixtureSetId,
      createdAt: record.createdAt,
      controlVersion: fresh.controlVersion,
    });
  }

  return { pendingPreservation, pendingPublication };
}
