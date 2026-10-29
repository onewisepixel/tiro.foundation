// The only path from the authority scenario (src/data/livingTrace/
// authorityScenario.ts) to a page. Same discipline as projection.ts: every
// field is built from an explicit allow-list, never by spreading an
// internal object, so a field added to the scenario later is withheld until
// someone deliberately projects it. Contact records, consent-receipt
// references, the signer's mandate document, and internal notes are never
// projected.
//
// The output is a SpecimenRecord (so every existing record component can
// render it) extended with what the scenario adds: a record version, an
// authorized attribution, the parties in their separate capacities, the
// signer's mandate, and per-use authorizations naming who decided.
//
// SCOPE: a static demonstration over fixed, fictional, build-time data, like
// projection.ts. It is not an authorization implementation for real
// records.
import "server-only";
import { SCENARIO_RECORDS, type Capacity, type InternalScenarioRecord } from "../../data/livingTrace/authorityScenario";
import type { EvidenceState, UseCategory, UseGrant } from "./evidence";
import type { SpecimenRecord } from "./projection";

export type ProjectedParty = { id: string; capacity: Capacity; label: string; role: string; evidence: EvidenceState };

export type ProjectedAuthorization = {
  use: UseCategory;
  grant: UseGrant;
  decidedBy: { id: string; label: string; capacity: Capacity }[];
  basis: string;
  scope: string;
  review: string;
};

export type AuthorityRecord = SpecimenRecord & {
  version: string;
  attribution: string;
  parties: ProjectedParty[];
  mandate: { signer: string; represents: string; scope: string; until: string };
  authorizations: ProjectedAuthorization[];
};

function project(r: InternalScenarioRecord): AuthorityRecord {
  const party = (id: string) => r.parties.find((p) => p.id === id);
  const labelOf = (id: string) => party(id)?.label ?? "Unidentified party";
  const contributor = r.parties.find((p) => p.capacity === "Contributor");
  const uses = Object.fromEntries(r.authorizations.map((a) => [a.use, a.grant])) as Record<UseCategory, UseGrant>;

  return {
    recordId: r.id,
    recordKind: "demo",
    synthetic: true,
    title: r.title,
    summary: r.summary,
    source: { label: contributor?.label ?? "Not identified", note: contributor?.role ?? "" },
    capacities: r.parties.map((p) => ({ capacity: p.capacity, value: `${p.label}. ${p.role}`, evidence: p.evidence })),
    context: r.context.map((c) => ({ field: c.field, value: c.value, evidence: c.evidence, ...(c.note ? { note: c.note } : {}) })),
    publicationStatus: r.publicationStatus,
    custodyStatus: r.custodyStatus,
    uses,
    withdrawal: r.withdrawal,
    provenance: r.provenance.map((p) => ({ at: p.at, event: p.event, actor: p.actor, evidence: p.evidence })),
    media: { kind: r.media.kind, note: r.media.note },
    transcript: { note: r.transcript.note },
    aiProcessing: r.aiProcessing,

    version: r.version,
    attribution: r.attribution.text,
    parties: r.parties.map((p) => ({ id: p.id, capacity: p.capacity, label: p.label, role: p.role, evidence: p.evidence })),
    mandate: { signer: labelOf(r.mandate.signer), represents: labelOf(r.mandate.represents), scope: r.mandate.scope, until: r.mandate.until },
    authorizations: r.authorizations.map((a) => ({
      use: a.use,
      grant: a.grant,
      decidedBy: a.decidedBy.map((id) => ({ id, label: labelOf(id), capacity: party(id)?.capacity ?? "Contributor" })),
      basis: a.basis,
      scope: a.scope,
      review: a.review,
    })),
  };
}

// Every scenario record is public in this demonstration. There is no
// restricted or undiscoverable scenario record; those behaviors are shown by
// the Living Trace specimens.
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
