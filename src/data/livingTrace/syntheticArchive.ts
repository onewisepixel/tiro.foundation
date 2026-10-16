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

export type InternalGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: EvidenceState;
  basis: string;
  assertedBy: string;
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
];

// The relationship graph behind Proof "Discover". Nodes for restricted or
// undiscoverable records, and any edge touching them, exist here so the
// projection can be tested against them. A visitor never receives them.
export const INTERNAL_NODES: InternalGraphNode[] = [
  { id: "origin-s01", kind: "origin", label: "Source S-01" },
  { id: "rec-a", kind: "record", label: "Record A", recordId: "DEMO-LT-0001" },
  { id: "lang-1", kind: "language", label: "Language" },
  { id: "place-1", kind: "place", label: "Place" },
  { id: "context-1", kind: "context", label: "Context note" },
  { id: "rec-b", kind: "record", label: "Record B", recordId: "DEMO-LT-0004" },
  { id: "origin-s02", kind: "origin", label: "Source S-02" },
  { id: "rec-r", kind: "record", label: "CANARY-GRAPH-RESTRICTED-NODE", recordId: "DEMO-LT-0002" },
  { id: "rec-u", kind: "record", label: "CANARY-GRAPH-UNDISCOVERABLE-NODE", recordId: "DEMO-LT-0003" },
];

export const INTERNAL_EDGES: InternalGraphEdge[] = [
  {
    id: "e-origin-a",
    from: "origin-s01",
    to: "rec-a",
    relation: "Source of the account",
    evidence: "recorded",
    basis: "The record's own source field. For a real record: the consent receipt reference (kept restricted) and the source's chosen attribution.",
    assertedBy: "Record DEMO-LT-0001",
  },
  {
    id: "e-a-lang",
    from: "rec-a",
    to: "lang-1",
    relation: "Spoken in",
    evidence: "attested",
    basis: "Language as identified by the source. In this specimen the value is 'not specified'; the link shows where that claim would come from.",
    assertedBy: "Synthetic source S-01",
  },
  {
    id: "e-a-place",
    from: "rec-a",
    to: "place-1",
    relation: "Refers to",
    evidence: "attested",
    basis: "A place named within the account. A real record cites the transcript passage.",
    assertedBy: "Synthetic source S-01",
  },
  {
    id: "e-a-context",
    from: "rec-a",
    to: "context-1",
    relation: "Contextualized by",
    evidence: "inferred",
    basis: "A curatorial note: TIRO's interpretation, kept separate from the testimony and labeled as such.",
    assertedBy: "TIRO curator (illustrative role)",
  },
  {
    id: "e-context-b",
    from: "context-1",
    to: "rec-b",
    relation: "Variant of",
    evidence: "contested",
    basis: "Two accounts describe the same event differently. Both are kept and attributed; neither corrects the other.",
    assertedBy: "TIRO curator (illustrative role)",
  },
  {
    id: "e-origin-b",
    from: "origin-s02",
    to: "rec-b",
    relation: "Source of the account",
    evidence: "recorded",
    basis: "The record's own source field. A variant account keeps its own origin; it is never re-attributed to the first source.",
    assertedBy: "Record DEMO-LT-0004",
  },
  {
    id: "e-b-place",
    from: "rec-b",
    to: "place-1",
    relation: "Same place as Record A?",
    evidence: "unknown",
    basis: "No evidence establishes this. The link is drawn only to show that the question is open.",
    assertedBy: "No one: unresolved",
  },
  {
    id: "e-a-r",
    from: "rec-a",
    to: "rec-r",
    relation: "CANARY-GRAPH-RESTRICTED-EDGE",
    evidence: "attested",
    basis: "CANARY-GRAPH-RESTRICTED-BASIS",
    assertedBy: "CANARY",
  },
  {
    id: "e-b-u",
    from: "rec-b",
    to: "rec-u",
    relation: "CANARY-GRAPH-UNDISCOVERABLE-EDGE",
    evidence: "attested",
    basis: "CANARY-GRAPH-UNDISCOVERABLE-BASIS",
    assertedBy: "CANARY",
  },
];
