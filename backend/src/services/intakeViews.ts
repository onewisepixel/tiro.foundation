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
  // The FINAL read, taken deliberately last — used consistently for
  // eligibility AND masking below. Reviewer-caught finding: reading the
  // register FIRST (as this function originally did) left a real window —
  // a redaction immediately followed by an unrelated correction (which
  // overwrites the record's raw stored value regardless of redaction
  // flags; only a fresh register read is what re-masks it) landing inside
  // that window could leak: the OLD register snapshot still said "not
  // redacted", so the newly-corrected raw content would pass straight
  // through unmasked. Taking this read last, after every content read
  // above, makes it at least as fresh as what it's about to mask.
  const control = await registerStore.getCurrent(recordId);
  if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    return null;
  }
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

  // Reviewer-caught finding, round two: the first fix here still read the
  // register BEFORE the record, on the theory that getCurrent is always
  // strongly consistent so "fresh" was good enough. That's true in
  // isolation, but it's the WRONG order relative to the record read that
  // follows it: a redaction landing in the gap between this register read
  // and the record read, immediately followed by an unrelated correction
  // (which overwrites the record's raw value regardless of redaction
  // flags — only a fresh register read re-masks it), produced a real,
  // reproduced leak — the register snapshot taken here was already stale
  // by the time the newly-corrected raw title was read and masked against
  // it. Fixed: content (record, grants) is read FIRST for every
  // candidate, and the register is read LAST, immediately before use —
  // the same ordering fix applied to readIntakeSubmission above.
  //
  // Reviewer-caught finding, round three: doing that content-then-register
  // dance for EVERY entry this function's own listAll() scan returns
  // throttled this stack's deliberately tiny provisioned RCU once real
  // usage accumulated enough history (240+ register rows from this
  // engagement's own live drills) — two extra GetItems per entry,
  // regardless of whether most of them obviously don't qualify at all.
  // Fixed by using the scan's OWN already-free data as a cheap first-pass
  // filter (the custody/publication status it already returned) to narrow
  // to PLAUSIBLE candidates before reading anything else for any of them —
  // the expensive, race-safe dance below still runs for every candidate
  // that passes this filter, so the actual security guarantee (never show
  // stale/un-redacted content) is unchanged; this only skips re-reading
  // entries the scan itself already shows are nowhere close to eligible.
  const preservationCandidates = entries.filter(
    (e) => e.currentCustodyStatus === "quarantined" && e.currentPublicationStatus !== "withdrawn",
  );
  const publicationCandidates = entries.filter(
    (e) => e.currentCustodyStatus === "preserved" && e.currentPublicationStatus === "not-published",
  );

  const pendingPreservation: IntakeQueueEntry[] = [];
  for (const scanned of preservationCandidates) {
    const record = await fixtureStore.getRecord(scanned.recordId);
    if (!record) continue;
    const control = await registerStore.getCurrent(scanned.recordId);
    if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") continue;
    // A quarantined record's title CAN already be text-redacted
    // (redactText has no custody precondition) — the listing must never
    // show the pre-redaction value just because it's "only a queue."
    const masked = applyTextRedactions(record, control);
    pendingPreservation.push({
      recordId: scanned.recordId,
      title: masked.title,
      fixtureSetId: record.fixtureSetId,
      createdAt: record.createdAt,
      controlVersion: control.controlVersion,
    });
  }

  const pendingPublication: IntakeQueueEntry[] = [];
  for (const scanned of publicationCandidates) {
    const record = await fixtureStore.getRecord(scanned.recordId);
    if (!record) continue;
    const grants = await fixtureStore.listConsentGrants(scanned.recordId);
    if (!grants.some((g) => g.purposes.includes("publication"))) continue;
    // Reviewer-caught finding, round four: this used to take its OWN
    // separate register read here, THEN call evaluatePermission below,
    // which does its OWN independent register read internally — two
    // different reads of the same thing, open to exactly the
    // inconsistency a single shared snapshot exists to prevent.
    // Reproduced: a redaction landing between the two reads left the
    // title masked (or not) against the OLDER snapshot while allowed/
    // reason reflected the NEWER one — the stronger repro (expired
    // preservation consent plus concurrent redaction/publication
    // approval) showed access denied before the transition and the
    // title still exposed after it. Fixed: evaluatePermission now
    // returns the exact register snapshot it used (permissions.ts) —
    // ONE register read total, used consistently below for eligibility,
    // masking, AND controlVersion. These are "preserved" records with
    // real evaluatePermission semantics already in effect — title is
    // only shown if staff would actually be allowed to see it;
    // otherwise a visible placeholder, never raw content.
    const decision = await evaluatePermission(fixtureStore, registerStore, {
      recordId: scanned.recordId,
      purpose: "preservation",
      audience: "staff",
      now,
    });
    const control = decision.control;
    if (!control || control.currentCustodyStatus !== "preserved" || control.currentPublicationStatus !== "not-published") continue;
    const title = decision.allowed ? applyTextRedactions(record, control).title : TITLE_UNAVAILABLE;
    pendingPublication.push({
      recordId: scanned.recordId,
      title,
      fixtureSetId: record.fixtureSetId,
      createdAt: record.createdAt,
      controlVersion: control.controlVersion,
    });
  }

  return { pendingPreservation, pendingPublication };
}
