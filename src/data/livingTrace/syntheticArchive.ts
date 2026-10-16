// SYNTHETIC DEMONSTRATION DATA — The Living Trace proof scenes.
//
// Nothing in this file is testimony, a real person, a real community, a
// real place, or evidence of consent. It exists to prove interface
// behavior (Proof B "The Record" and Proof C "The Boundary") and is kept
// apart from src/data/memories.ts so demonstration content can never be
// mistaken for, counted with, or merged into archive records.
//
// INTERNAL. Import this only from src/lib/livingTrace/projection.ts. Pages
// and components receive projections, never these objects: restricted and
// undiscoverable records below deliberately carry "canary" strings, and
// projection.test.ts proves none of them ever leaves the projection layer.
// "server-only" makes any client import of this module a build error.
import "server-only";
import type { EvidenceState, UseCategory, UseGrant } from "@/lib/livingTrace/evidence";

export type Visibility =
  // Publicly described: the authorized fields render.
  | "public"
  // Restricted, and the rights authority has authorized a public notice.
  // ONLY the notice renders — no title, summary, or other metadata.
  | "restricted-notice"
  // Not discoverable at all. No route, no listing entry, no count, no
  // graph node, no "something is hidden here" placeholder.
  | "undiscoverable";

export type EvidencedValue = {
  value: string;
  evidence: EvidenceState;
  note?: string;
};

export type InternalRecord = {
  id: string;
  visibility: Visibility;
  title: string;
  summary: string;
  source: { label: string; note: string };
  capacities: { capacity: string; value: string; evidence: EvidenceState }[];
  context: { field: string; value: EvidencedValue }[];
  publicationStatus: string;
  custodyStatus: string;
  uses: Record<UseCategory, UseGrant>;
  withdrawal: string;
  provenance: { at: string; event: string; actor: string; evidence: EvidenceState }[];
  media: { kind: "none"; note: string };
  transcript: { note: string };
  aiProcessing: string;
  // Never projected for any visibility. Canary for tests.
  internalNotes: string;
  // Only meaningful for "restricted-notice". Everything a visitor may see
  // about that record lives inside this object and nowhere else.
  authorizedDisclosure?: {
    reference: string;
    notice: string;
    mayContact: boolean;
  };
};

import type { GraphNodeKind } from "@/lib/livingTrace/graph";
export type { GraphNodeKind };

export type InternalGraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  // For kind "record": the record whose visibility governs this node.
  recordId?: string;
};

// One party's claim within a relationship. Several accounts on one edge
// keep several provenances; they are never merged.
// The disclosure unit is the authorized CLAIM, not the record
// (docs/design/decisions.md, 2026-10-16). A restricted record's public
// notice authorizes nothing about the accounts it holds. To be acknowledged
// as "withheld" inside a visible relationship, a claim needs its own grant
// from its rights authority, separately scoped:
//   existence    that this account exists at all
//   association  that it bears on THIS relationship (its type and ends)
// Both default to deny. A grant never discloses the claim's position,
// claimant, evidence state, or source, and a withheld account never
// counts toward what the relationship says (its evidence state).
export type ClaimDisclosureGrant = {
  existence: boolean;
  association: boolean;
  // Reference to the authorization itself. Never projected.
  grantRef: string;
};

export type InternalAccount = {
  id: string;
  position: string;
  assertedBy: string;
  kind: "source" | "interpretation";
  evidence: EvidenceState;
  // Graph node holding the account. Its backing record's visibility
  // decides whether this account may be shown, acknowledged, or omitted.
  inNode: string | null;
  // Only for an account held in a non-public record. Absent = deny.
  disclosure?: ClaimDisclosureGrant;
};

export type InternalGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: EvidenceState;
  summary: string;
  recordedBy: string;
  provenance?: true;
  accounts: InternalAccount[];
};

const NOT_GRANTED_EXCEPT_DEMO_FIELDS: Record<UseCategory, UseGrant> = {
  recording: "not-applicable",
  preservation: "not-applicable",
  publication: "limited",
  research: "not-granted",
  derivatives: "not-granted",
  modelTraining: "not-granted",
  syntheticReproduction: "not-granted",
  commercialReuse: "not-granted",
};

const SYNTHETIC_WITHDRAWAL =
  "For a real record, this states who may request withdrawal or restriction, how, and what withdrawal does to the record and its derivatives. This demonstration has no source who could withdraw it.";

export const INTERNAL_RECORDS: InternalRecord[] = [
  {
    id: "DEMO-LT-0001",
    visibility: "public",
    title: "An oral account, held with its context intact",
    summary:
      "A specimen record showing how TIRO structures a single testimony for custody: who the source is, who holds authority, what each use permits, and how every claim about it is evidenced. It contains no testimony.",
    source: {
      label: "Synthetic source S-01",
      note: "Not a real person. A real record identifies its human source here, as the source chooses to be identified.",
    },
    capacities: [
      { capacity: "Source authority", value: "Demonstration only. No authority is claimed.", evidence: "unknown" },
      { capacity: "Legal rights holder", value: "Not assessed. Unknown rights need assessment, not assumed clearance.", evidence: "unknown" },
      { capacity: "Collector", value: "None. Nothing was collected.", evidence: "recorded" },
      { capacity: "Contributor", value: "None.", evidence: "recorded" },
      { capacity: "Subject", value: "None. No person is represented.", evidence: "recorded" },
      { capacity: "Signer capacity", value: "Not applicable. No consent was signed.", evidence: "recorded" },
    ],
    context: [
      { field: "Language", value: { value: "Not specified", evidence: "unknown", note: "A real record names the language and variety as the source identifies them." } },
      { field: "Place", value: { value: "Not specified", evidence: "unknown" } },
      { field: "Date of account", value: { value: "Not specified", evidence: "unknown" } },
      { field: "Translator / context", value: { value: "None", evidence: "recorded", note: "Translations are attributed to a named translator and kept beside the source text." } },
    ],
    publicationStatus: "Published (demonstration fields only)",
    custodyStatus: "Not ingested. No archival object exists.",
    uses: NOT_GRANTED_EXCEPT_DEMO_FIELDS,
    withdrawal: SYNTHETIC_WITHDRAWAL,
    provenance: [
      { at: "2026-10-16", event: "Specimen created as a design study", actor: "TIRO design (Living Trace v0.1)", evidence: "recorded" },
      { at: "—", event: "No original media attached", actor: "—", evidence: "unknown" },
      { at: "—", event: "No review or verification. None is implied.", actor: "—", evidence: "unknown" },
    ],
    media: {
      kind: "none",
      note: "No audio attached. TIRO never autoplays a voice; a real recording would play only when you choose, with a transcript alongside.",
    },
    transcript: {
      note: "No transcript. A synthetic record has no source media. A real record shows the source-language transcript and its attributed translation side by side.",
    },
    aiProcessing: "Disabled. No transcription, translation, or model processing has been applied.",
    internalNotes: "CANARY-INTERNAL-0001: internal notes are never projected.",
  },
  {
    id: "DEMO-LT-0002",
    visibility: "restricted-notice",
    title: "CANARY-RESTRICTED-TITLE: this title must never render",
    summary: "CANARY-RESTRICTED-SUMMARY: this summary must never render",
    source: { label: "CANARY-RESTRICTED-SOURCE", note: "CANARY-RESTRICTED-SOURCE-NOTE" },
    capacities: [{ capacity: "Source authority", value: "CANARY-RESTRICTED-AUTHORITY", evidence: "attested" }],
    context: [{ field: "Place", value: { value: "CANARY-RESTRICTED-PLACE", evidence: "attested" } }],
    publicationStatus: "Restricted",
    custodyStatus: "Preserved",
    uses: { ...NOT_GRANTED_EXCEPT_DEMO_FIELDS, publication: "not-granted", preservation: "granted" },
    withdrawal: "CANARY-RESTRICTED-WITHDRAWAL",
    provenance: [{ at: "CANARY-RESTRICTED-DATE", event: "CANARY-RESTRICTED-EVENT", actor: "CANARY-RESTRICTED-ACTOR", evidence: "recorded" }],
    media: { kind: "none", note: "CANARY-RESTRICTED-MEDIA" },
    transcript: { note: "CANARY-RESTRICTED-TRANSCRIPT" },
    aiProcessing: "Disabled.",
    internalNotes: "CANARY-INTERNAL-0002: internal notes are never projected.",
    authorizedDisclosure: {
      reference: "DEMO-LT-0002",
      notice:
        "This material is held for preservation and is not available for public access. Its rights authority has authorized only this notice: no title, description, or other details.",
      mayContact: true,
    },
  },
  {
    id: "DEMO-LT-0003",
    visibility: "undiscoverable",
    title: "CANARY-UNDISCOVERABLE-TITLE",
    summary: "CANARY-UNDISCOVERABLE-SUMMARY",
    source: { label: "CANARY-UNDISCOVERABLE-SOURCE", note: "CANARY-UNDISCOVERABLE-SOURCE-NOTE" },
    capacities: [],
    context: [],
    publicationStatus: "Restricted",
    custodyStatus: "Preserved",
    uses: { ...NOT_GRANTED_EXCEPT_DEMO_FIELDS, publication: "not-granted" },
    withdrawal: "CANARY-UNDISCOVERABLE-WITHDRAWAL",
    provenance: [],
    media: { kind: "none", note: "CANARY-UNDISCOVERABLE-MEDIA" },
    transcript: { note: "CANARY-UNDISCOVERABLE-TRANSCRIPT" },
    aiProcessing: "Disabled.",
    internalNotes: "CANARY-INTERNAL-0003: internal notes are never projected.",
  },
  {
    id: "DEMO-LT-0004",
    visibility: "public",
    title: "A variant account of the same event",
    summary:
      "A second specimen showing how TIRO keeps a disagreeing account beside the first rather than merging or correcting it away. It contains no testimony.",
    source: {
      label: "Synthetic source S-02",
      note: "Not a real person. Shown as a separate source because a variant account has its own origin.",
    },
    capacities: [
      { capacity: "Source authority", value: "Demonstration only. No authority is claimed.", evidence: "unknown" },
      { capacity: "Legal rights holder", value: "Not assessed.", evidence: "unknown" },
    ],
    context: [
      { field: "Language", value: { value: "Not specified", evidence: "unknown" } },
      { field: "Place", value: { value: "Not specified", evidence: "unknown" } },
    ],
    publicationStatus: "Published (demonstration fields only)",
    custodyStatus: "Not ingested. No archival object exists.",
    uses: NOT_GRANTED_EXCEPT_DEMO_FIELDS,
    withdrawal: SYNTHETIC_WITHDRAWAL,
    provenance: [{ at: "2026-10-16", event: "Specimen created as a design study", actor: "TIRO design (Living Trace v0.1)", evidence: "recorded" }],
    media: { kind: "none", note: "No audio attached." },
    transcript: { note: "No transcript. A synthetic record has no source media." },
    aiProcessing: "Disabled.",
    internalNotes: "CANARY-INTERNAL-0004: internal notes are never projected.",
  },
  {
    id: "DEMO-LT-0005",
    visibility: "public",
    title: "A third account, from an unrelated source",
    summary:
      "A specimen from a third synthetic source. It shares a language with the first record and may or may not refer to the same place; the archive does not decide that for it. It contains no testimony.",
    source: {
      label: "Synthetic source S-03",
      note: "Not a real person. A separate origin: nothing in this record derives from Sources S-01 or S-02.",
    },
    capacities: [
      { capacity: "Source authority", value: "Demonstration only. No authority is claimed.", evidence: "unknown" },
      { capacity: "Legal rights holder", value: "Not assessed.", evidence: "unknown" },
    ],
    context: [
      { field: "Language", value: { value: "Not specified", evidence: "unknown" } },
      { field: "Place", value: { value: "Not specified", evidence: "unknown", note: "Whether this is the place in Record A is an open question, shown as such." } },
    ],
    publicationStatus: "Published (demonstration fields only)",
    custodyStatus: "Not ingested. No archival object exists.",
    uses: NOT_GRANTED_EXCEPT_DEMO_FIELDS,
    withdrawal: SYNTHETIC_WITHDRAWAL,
    provenance: [{ at: "2026-10-16", event: "Specimen created as a design study", actor: "TIRO design (Living Trace v0.2)", evidence: "recorded" }],
    media: { kind: "none", note: "No audio attached." },
    transcript: { note: "No transcript. A synthetic record has no source media." },
    aiProcessing: "Disabled.",
    internalNotes: "CANARY-INTERNAL-0005: internal notes are never projected.",
  },
];

// The relationship graph behind Discover. Every edge exists to show one
// distinct behavior of the grammar; none is added for visual density.
// Nodes for restricted or undiscoverable records, every edge touching
// them, and every account they hold exist here so the projection can be
// tested against them. A visitor never receives them.
export const INTERNAL_NODES: InternalGraphNode[] = [
  { id: "origin-s01", kind: "origin", label: "Source S-01" },
  { id: "origin-s02", kind: "origin", label: "Source S-02" },
  { id: "origin-s03", kind: "origin", label: "Source S-03" },
  { id: "rec-a", kind: "record", label: "Record A", recordId: "DEMO-LT-0001" },
  { id: "rec-b", kind: "record", label: "Record B", recordId: "DEMO-LT-0004" },
  { id: "rec-c", kind: "record", label: "Record C", recordId: "DEMO-LT-0005" },
  { id: "der-t", kind: "derivative", label: "Translation of A" },
  { id: "note-1", kind: "interpretation", label: "Curatorial note" },
  { id: "event-1", kind: "event", label: "Event described" },
  { id: "lang-1", kind: "language", label: "Language" },
  { id: "place-1", kind: "place", label: "Place" },
  { id: "rec-r", kind: "record", label: "CANARY-GRAPH-RESTRICTED-NODE", recordId: "DEMO-LT-0002" },
  { id: "rec-u", kind: "record", label: "CANARY-GRAPH-UNDISCOVERABLE-NODE", recordId: "DEMO-LT-0003" },
];

const SOURCE_FIELD = "Record source field (synthetic)";

function sourceLink(id: string, origin: string, record: string, recordId: string): InternalGraphEdge {
  return {
    id,
    from: origin,
    to: record,
    relation: "Source of the account",
    evidence: "recorded",
    summary: `Record ${recordId} names this source in its own source field. For a real record, the consent receipt behind it stays restricted.`,
    recordedBy: `Record ${recordId}`,
    provenance: true,
    accounts: [{ id: `${id}:1`, position: "This source gave the account.", assertedBy: SOURCE_FIELD, kind: "source", evidence: "recorded", inNode: record }],
  };
}

export const INTERNAL_EDGES: InternalGraphEdge[] = [
  sourceLink("p-s01-a", "origin-s01", "rec-a", "DEMO-LT-0001"),
  sourceLink("p-s02-b", "origin-s02", "rec-b", "DEMO-LT-0004"),
  sourceLink("p-s03-c", "origin-s03", "rec-c", "DEMO-LT-0005"),
  {
    // A derivative keeps its source: its chain runs T <- A <- S-01.
    id: "p-a-t",
    from: "rec-a",
    to: "der-t",
    relation: "Translated as",
    evidence: "recorded",
    summary: "A translation is a derivative of Record A, attributed to its translator and kept beside the source. It is not a new source.",
    recordedBy: "Synthetic translator X-01 (illustrative role)",
    provenance: true,
    accounts: [
      { id: "p-a-t:1", position: "Translated from Record A.", assertedBy: "Synthetic translator X-01 (illustrative role)", kind: "source", evidence: "recorded", inNode: "der-t" },
    ],
  },
  {
    id: "e-a-lang",
    from: "rec-a",
    to: "lang-1",
    relation: "Spoken in",
    evidence: "attested",
    summary: "The language as the source identifies it. In this specimen the value is not specified; the link shows where the claim would come from.",
    recordedBy: "Record DEMO-LT-0001",
    accounts: [
      { id: "e-a-lang:1", position: "The account was given in this language.", assertedBy: "Synthetic source S-01", kind: "source", evidence: "attested", inNode: "rec-a" },
      // Undiscoverable source: omitted without a trace.
      { id: "e-a-lang:u", position: "CANARY-ACCOUNT-UNDISCOVERABLE", assertedBy: "CANARY-ACCOUNT-UNDISCOVERABLE-BY", kind: "source", evidence: "attested", inNode: "rec-u" },
    ],
  },
  {
    id: "e-c-lang",
    from: "rec-c",
    to: "lang-1",
    relation: "Spoken in",
    evidence: "attested",
    summary: "A second record in the same language. Sharing a language connects the records; it does not make one account confirm the other.",
    recordedBy: "Record DEMO-LT-0005",
    accounts: [
      { id: "e-c-lang:1", position: "The account was given in this language.", assertedBy: "Synthetic source S-03", kind: "source", evidence: "attested", inNode: "rec-c" },
    ],
  },
  {
    id: "e-a-place",
    from: "rec-a",
    to: "place-1",
    relation: "Refers to",
    evidence: "attested",
    summary: "A place named in Record A's account.",
    recordedBy: "Record DEMO-LT-0001",
    accounts: [
      { id: "e-a-place:1", position: "The account names this place.", assertedBy: "Synthetic source S-01", kind: "source", evidence: "attested", inNode: "rec-a" },
      // Restricted source; its rights authority has granted BOTH existence
      // and association for this claim: shown only as "withheld", with no
      // position, claimant, evidence, or reference.
      {
        id: "e-a-place:r",
        position: "CANARY-ACCOUNT-RESTRICTED",
        assertedBy: "CANARY-ACCOUNT-RESTRICTED-BY",
        kind: "source",
        evidence: "attested",
        inNode: "rec-r",
        disclosure: { existence: true, association: true, grantRef: "CANARY-GRANT-REF-1" },
      },
    ],
  },
  {
    id: "e-a-event",
    from: "rec-a",
    to: "event-1",
    relation: "Describes",
    evidence: "attested",
    summary: "Record A gives an account of this event.",
    recordedBy: "Record DEMO-LT-0001",
    accounts: [{ id: "e-a-event:1", position: "Describes the event.", assertedBy: "Synthetic source S-01", kind: "source", evidence: "attested", inNode: "rec-a" }],
  },
  {
    id: "e-b-event",
    from: "rec-b",
    to: "event-1",
    relation: "Describes",
    evidence: "attested",
    summary: "Record B gives its own account of the same event.",
    recordedBy: "Record DEMO-LT-0004",
    accounts: [{ id: "e-b-event:1", position: "Describes the event.", assertedBy: "Synthetic source S-02", kind: "source", evidence: "attested", inNode: "rec-b" }],
  },
  {
    // Two independently sourced accounts that disagree. Each keeps its own
    // origin and chain; the curator who noted the disagreement is
    // recorded separately and decides nothing.
    id: "c-ab-when",
    from: "rec-a",
    to: "rec-b",
    relation: "Differ on when the event happened",
    evidence: "contested",
    summary: "The two accounts place the event at different times. Both are kept and attributed; neither corrects the other.",
    recordedBy: "TIRO curator (illustrative role): noted that the accounts differ, without deciding between them",
    accounts: [
      { id: "c-ab-when:a", position: "Places the event earlier.", assertedBy: "Synthetic source S-01", kind: "source", evidence: "attested", inNode: "rec-a" },
      { id: "c-ab-when:b", position: "Places the event later.", assertedBy: "Synthetic source S-02", kind: "source", evidence: "attested", inNode: "rec-b" },
    ],
  },
  {
    id: "i-a-note",
    from: "rec-a",
    to: "note-1",
    relation: "Interpreted in",
    evidence: "inferred",
    summary: "A curatorial reading of Record A: TIRO's interpretation, kept apart from the account and labeled as such.",
    recordedBy: "TIRO curator (illustrative role)",
    accounts: [
      { id: "i-a-note:1", position: "Reads the account as part of a wider pattern.", assertedBy: "TIRO curator (illustrative role)", kind: "interpretation", evidence: "inferred", inNode: null },
    ],
  },
  {
    // Incomplete evidence: a question, not a claim. No one has asserted it.
    id: "u-c-place",
    from: "rec-c",
    to: "place-1",
    relation: "Same place as Record A?",
    evidence: "unknown",
    summary: "No evidence establishes whether Record C refers to the same place. The link is drawn only to show that the question is open.",
    recordedBy: "TIRO curator (illustrative role): recorded the open question",
    accounts: [],
  },
  {
    // A restricted claim granted EXISTENCE but not ASSOCIATION: acknowledging
    // it here would disclose that it bears on this relationship, so it is
    // omitted without a trace. The relationship itself still shows.
    id: "e-c-event",
    from: "rec-c",
    to: "event-1",
    relation: "Mentions",
    evidence: "attested",
    summary: "Record C mentions the event in passing.",
    recordedBy: "Record DEMO-LT-0005",
    accounts: [
      { id: "e-c-event:1", position: "Mentions the event.", assertedBy: "Synthetic source S-03", kind: "source", evidence: "attested", inNode: "rec-c" },
      {
        id: "e-c-event:r",
        position: "CANARY-ACCOUNT-EXISTENCE-ONLY",
        assertedBy: "CANARY",
        kind: "source",
        evidence: "attested",
        inNode: "rec-r",
        disclosure: { existence: true, association: false, grantRef: "CANARY-GRANT-REF-2" },
      },
    ],
  },
  // ---- Never projected: endpoints or supporting accounts are not public.
  {
    // A disagreement that only exists because of a withheld claim. Showing
    // it as "contested" would reveal the withheld account's position (that
    // it disagrees), even with full existence and association grants. A
    // withheld account never determines what a relationship says, so the
    // relationship is withheld whole.
    id: "x-b-event-contested-by-withheld",
    from: "rec-b",
    to: "event-1",
    relation: "CANARY-CONTESTED-ONLY-BY-WITHHELD",
    evidence: "contested",
    summary: "CANARY-CONTESTED-ONLY-BY-WITHHELD-SUMMARY",
    recordedBy: "CANARY",
    accounts: [
      { id: "x-b-event-cw:b", position: "Dates the event.", assertedBy: "Synthetic source S-02", kind: "source", evidence: "attested", inNode: "rec-b" },
      {
        id: "x-b-event-cw:r",
        position: "CANARY-ACCOUNT-DISAGREES",
        assertedBy: "CANARY",
        kind: "source",
        evidence: "attested",
        inNode: "rec-r",
        disclosure: { existence: true, association: true, grantRef: "CANARY-GRANT-REF-3" },
      },
    ],
  },
  {
    id: "x-a-r",
    from: "rec-a",
    to: "rec-r",
    relation: "CANARY-GRAPH-RESTRICTED-EDGE",
    evidence: "attested",
    summary: "CANARY-GRAPH-RESTRICTED-SUMMARY",
    recordedBy: "CANARY",
    accounts: [],
  },
  {
    id: "x-b-u",
    from: "rec-b",
    to: "rec-u",
    relation: "CANARY-GRAPH-UNDISCOVERABLE-EDGE",
    evidence: "attested",
    summary: "CANARY-GRAPH-UNDISCOVERABLE-SUMMARY",
    recordedBy: "CANARY",
    accounts: [],
  },
  {
    // Both ends are public, but the disagreement is only evidenced by an
    // undiscoverable account. Showing "contested" with one visible account
    // would misstate it, and acknowledging the other would disclose it, so
    // the whole relationship is withheld.
    id: "x-b-place-contested",
    from: "rec-b",
    to: "place-1",
    relation: "CANARY-CONTESTED-VIA-UNDISCOVERABLE",
    evidence: "contested",
    summary: "CANARY-CONTESTED-VIA-UNDISCOVERABLE-SUMMARY",
    recordedBy: "CANARY",
    accounts: [
      { id: "x-b-place-contested:b", position: "Names the place.", assertedBy: "Synthetic source S-02", kind: "source", evidence: "attested", inNode: "rec-b" },
      { id: "x-b-place-contested:u", position: "CANARY-ACCOUNT-UNDISCOVERABLE-2", assertedBy: "CANARY", kind: "source", evidence: "attested", inNode: "rec-u" },
    ],
  },
];
