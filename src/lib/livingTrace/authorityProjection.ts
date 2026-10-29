// The only path from the authority scenario (src/data/livingTrace/
// authorityScenario.ts) to a page.
//
// Two layers, kept apart:
//
//   EVALUATION (server-only). For each use, whether the authority it needs
//   was actually exercised: every required holder decided, either in their
//   own right or through a signer acting under a mandate that is verified,
//   represents that holder, covers this record and this use, and was valid
//   on the date of the decision. A signature outside its mandate has no
//   effect. A signer never holds authority by being a signer.
//
//   PUBLIC PROJECTION (the safe consent summary; ethos §3.3, contract 0.2
//   §7.3). Built field by field from AUTHORITY_PUBLIC_FIELDS, never by
//   spreading an internal object. It publishes, per use, whether it is in
//   effect, whose authority it rests on (by capacity), and how that
//   authority was exercised. It never publishes a signer's or subject's
//   identity, a mandate's identity or terms, receipts, or any record of an
//   attempt that had no effect. Incomplete authorization fails closed.
//
// SCOPE: a static demonstration over fixed, fictional, build-time data. Not
// an authorization implementation for real records.
import "server-only";
import {
  SCENARIO_RECORDS,
  type Capacity,
  type InternalAuthorization,
  type InternalDecision,
  type InternalMandate,
  type InternalScenarioRecord,
} from "../../data/livingTrace/authorityScenario";
import type { EvidenceState, UseCategory, UseGrant } from "./evidence";
import type { SpecimenRecord } from "./projection";

// ---------------------------------------------------------------------------
// Evaluation (never projected)
// ---------------------------------------------------------------------------

export type MandateCheck = "covered" | "not-verified" | "wrong-holder" | "wrong-record" | "outside-scope" | "outside-period" | "missing";

// Whether a mandate lets its signer execute `holder`'s decision on `use`
// for `record` on `at` (ISO dates compare lexically).
export function mandateCovers(
  mandate: InternalMandate | undefined,
  act: { signer: string; holder: string; record: string; use: UseCategory; at: string },
): MandateCheck {
  if (!mandate || mandate.signer !== act.signer) return "missing";
  if (!mandate.verified) return "not-verified";
  if (mandate.represents !== act.holder) return "wrong-holder";
  if (mandate.record !== act.record) return "wrong-record";
  if (!mandate.uses.includes(act.use)) return "outside-scope";
  if (act.at < mandate.validFrom || act.at > mandate.validUntil) return "outside-period";
  return "covered";
}

export type DecisionCheck = { decision: InternalDecision; effective: boolean; how: "own-right" | "representative" | null; check: MandateCheck | "own-right" | "not-a-holder" };

function checkDecision(r: InternalScenarioRecord, a: InternalAuthorization, d: InternalDecision): DecisionCheck {
  if (!a.requiredFrom.includes(d.by)) {
    return { decision: d, effective: false, how: null, check: "not-a-holder" };
  }
  if (d.executedBy === d.by && d.mandate === null) {
    return { decision: d, effective: true, how: "own-right", check: "own-right" };
  }
  const mandate = r.mandates.find((m) => m.id === d.mandate);
  const check = mandateCovers(mandate, { signer: d.executedBy, holder: d.by, record: r.id, use: a.use, at: d.at });
  return { decision: d, effective: check === "covered", how: check === "covered" ? "representative" : null, check };
}

export type Evaluation = { use: UseCategory; inEffect: boolean; decisions: DecisionCheck[]; missing: string[] };

// A use is in effect only if every party whose authority it requires has an
// effective decision.
export function evaluateAuthorization(r: InternalScenarioRecord, a: InternalAuthorization): Evaluation {
  const decisions = a.decisions.map((d) => checkDecision(r, a, d));
  const missing = a.requiredFrom.filter((h) => !decisions.some((c) => c.effective && c.decision.by === h));
  return { use: a.use, inEffect: a.decisions.length > 0 && missing.length === 0, decisions, missing };
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

export type PublicParty = { capacity: Capacity; label: string; role: string; evidence: EvidenceState; identityWithheld: boolean };

export type PublicAuthorization = {
  use: UseCategory;
  grant: UseGrant;
  inEffect: boolean;
  requires: { capacity: Capacity; label: string }[];
  exercised: { capacity: Capacity; label: string; how: "In their own right" | "Through an authorized representative, under a verified mandate"; recordedBy: string }[];
  basis: "Consent";
  scope: string;
  review: string;
};

export type AuthorityRecord = SpecimenRecord & {
  version: string;
  attribution: string;
  parties: PublicParty[];
  authorizations: PublicAuthorization[];
};

// Exactly the fields that may reach a page, at every level. Anything else
// in a projection is a defect (disclosureGuards.test.ts).
export const AUTHORITY_PUBLIC_FIELDS = {
  recordId: true,
  recordKind: true,
  synthetic: true,
  title: true,
  summary: true,
  source: { label: true, note: true },
  capacities: [{ capacity: true, value: true, evidence: true }],
  context: [{ field: true, value: true, evidence: true, note: true }],
  publicationStatus: true,
  custodyStatus: true,
  uses: "record",
  withdrawal: true,
  provenance: [{ at: true, event: true, actor: true, evidence: true }],
  media: { kind: true, note: true },
  transcript: { note: true },
  aiProcessing: true,
  version: true,
  attribution: true,
  parties: [{ capacity: true, label: true, role: true, evidence: true, identityWithheld: true }],
  authorizations: [
    {
      use: true,
      grant: true,
      inEffect: true,
      requires: [{ capacity: true, label: true }],
      exercised: [{ capacity: true, label: true, how: true, recordedBy: true }],
      basis: true,
      scope: true,
      review: true,
    },
  ],
} as const;

function project(r: InternalScenarioRecord): AuthorityRecord {
  const party = (id: string) => r.parties.find((p) => p.id === id);
  const publicLabel = (id: string) => {
    const p = party(id);
    return !p ? "Unidentified party" : p.identityPublic ? p.label : (p.publicLabel ?? `A ${p.capacity.toLowerCase()}`);
  };
  const capacityOf = (id: string): Capacity => party(id)?.capacity ?? "Contributor";

  const authorizations: PublicAuthorization[] = r.authorizations.map((a) => {
    const e = evaluateAuthorization(r, a);
    // Fail closed: an intended grant that is not in effect is published as
    // unknown, never as permission. A refusal stays a refusal.
    const grant: UseGrant = e.inEffect ? a.grant : a.grant === "granted" || a.grant === "limited" ? "unknown" : a.grant;
    return {
      use: a.use,
      grant,
      inEffect: e.inEffect,
      requires: a.requiredFrom.map((h) => ({ capacity: capacityOf(h), label: publicLabel(h) })),
      // Only effective decisions, and only when the use is in effect: an
      // attempt that had no effect is not published.
      exercised: e.inEffect
        ? e.decisions
            .filter((c) => c.effective)
            .map((c) => ({
              capacity: capacityOf(c.decision.by),
              label: publicLabel(c.decision.by),
              how: c.how === "own-right" ? ("In their own right" as const) : ("Through an authorized representative, under a verified mandate" as const),
              recordedBy: c.decision.recordedBy,
            }))
        : [],
      basis: "Consent",
      scope: a.scope,
      review: a.review,
    };
  });

  const parties: PublicParty[] = r.parties.map((p) => ({
    capacity: p.capacity,
    label: p.identityPublic ? p.label : (p.publicLabel ?? `A ${p.capacity.toLowerCase()}`),
    role: p.identityPublic ? p.role : (p.publicRole ?? "Identity withheld."),
    evidence: p.evidence,
    identityWithheld: !p.identityPublic,
  }));
  const contributor = parties.find((p) => p.capacity === "Contributor");

  return {
    recordId: r.id,
    recordKind: "demo",
    synthetic: true,
    title: r.title,
    summary: r.summary,
    source: { label: contributor?.label ?? "Not identified", note: contributor?.role ?? "" },
    capacities: parties.map((p) => ({ capacity: p.capacity, value: `${p.label}. ${p.role}`, evidence: p.evidence })),
    context: r.context.map((c) => ({ field: c.field, value: c.value, evidence: c.evidence, ...(c.note ? { note: c.note } : {}) })),
    publicationStatus: r.publicationStatus,
    custodyStatus: r.custodyStatus,
    uses: Object.fromEntries(authorizations.map((a) => [a.use, a.grant])) as Record<UseCategory, UseGrant>,
    withdrawal: r.withdrawal,
    provenance: r.provenance.map((p) => ({ at: p.at, event: p.event, actor: p.actor, evidence: p.evidence })),
    media: { kind: r.media.kind, note: r.media.note },
    transcript: { note: r.transcript.note },
    aiProcessing: r.aiProcessing,
    version: r.version,
    attribution: r.attribution.text,
    parties,
    authorizations,
  };
}

// Every scenario record is public in this demonstration. Restricted and
// undiscoverable behavior is shown by the Living Trace specimens.
export function resolveScenarioRecord(id: string): { state: "public"; record: AuthorityRecord } | null {
  const r = SCENARIO_RECORDS.find((x) => x.id === id);
  return r ? { state: "public", record: project(r) } : null;
}

export function scenarioRouteIds(): string[] {
  return SCENARIO_RECORDS.map((r) => r.id);
}

export function listScenario(): { recordId: string; title: string }[] {
  return SCENARIO_RECORDS.map((r) => ({ recordId: r.id, title: r.title }));
}
