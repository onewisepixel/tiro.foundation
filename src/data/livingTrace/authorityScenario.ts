// SYNTHETIC DEMONSTRATION DATA — a fictional authority scenario.
//
// One deliberately constructed record that shows the capacities behind a
// memory as DIFFERENT parties with explicit authorization relationships
// (docs/ethos.txt §3.2–3.3): the collector facilitates the recording, the
// contributor gives the account, a source authority governs permissions
// and acts through a signer with a defined, time-limited mandate, a
// separate legal rights holder holds copyright in the recording, and a
// subject named in the account has privacy interests of their own.
//
// Everything here is fictional. No real person, community, institution,
// place, language, practice, testimony, recording, or consent exists
// behind any value, and nothing was collected. Parties carry abstract
// labels (P-01, A-01, I-01 …) in the same style as the Living Trace
// specimens.
//
// Kept apart from syntheticArchive.ts on purpose: other demonstrations
// depend on that archive's exact contents, and this scenario must not
// change them. It is read only through authorityProjection.ts, which
// builds every field from an explicit allow-list. Internal-only fields
// below carry "CANARY" strings; authorityProjection.test.ts and
// scripts/test/verify-disclosure.mjs prove none of them leaves the
// projection layer. "server-only" makes any client import a build error.
import "server-only";
import type { EvidenceState, UseCategory, UseGrant } from "@/lib/livingTrace/evidence";

export type Capacity = "Collector" | "Contributor" | "Subject" | "Source authority" | "Legal rights holder" | "Signer";

export type InternalParty = {
  id: string;
  capacity: Capacity;
  label: string;
  // What this party does in relation to the record, in plain words.
  role: string;
  evidence: EvidenceState;
  // Never projected.
  contactRecord: string;
};

export type InternalAuthorization = {
  use: UseCategory;
  grant: UseGrant;
  // Party ids whose authorization this use requires and records.
  decidedBy: string[];
  basis: string;
  scope: string;
  review: string;
  // Never projected: the receipt identifies the signer and their documents.
  receiptRef: string;
};

export type InternalScenarioRecord = {
  id: string;
  version: string;
  title: string;
  summary: string;
  // How the source may be credited, as authorized. Used in citations.
  attribution: { text: string; authorizedBy: string[] };
  parties: InternalParty[];
  mandate: {
    signer: string;
    represents: string;
    scope: string;
    until: string;
    // Never projected: ethos §3.3 keeps the mandate restricted.
    documentRef: string;
  };
  authorizations: InternalAuthorization[];
  context: { field: string; value: string; evidence: EvidenceState; note?: string }[];
  publicationStatus: string;
  custodyStatus: string;
  withdrawal: string;
  provenance: { at: string; event: string; actor: string; evidence: EvidenceState }[];
  media: { kind: "none"; note: string };
  transcript: { note: string };
  aiProcessing: string;
  internalNotes: string;
};

const RECEIPT = "Synthetic consent receipt (restricted; never published)";

export const SCENARIO_RECORDS: InternalScenarioRecord[] = [
  {
    id: "DEMO-MP-0001",
    version: "1",
    title: "An account given by one person, recorded by another, and governed by a third",
    summary:
      "A fictional scenario showing each capacity behind a memory held by a different party, and which party decides each use. It contains no testimony.",
    attribution: { text: "Synthetic contributor P-01, with the authority of Synthetic collective A-01", authorizedBy: ["A-01", "P-01"] },
    parties: [
      {
        id: "P-01",
        capacity: "Contributor",
        label: "Synthetic contributor P-01",
        role: "Gave the account. Decides on their own participation, voice, and likeness.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-P01",
      },
      {
        id: "A-01",
        capacity: "Source authority",
        label: "Synthetic collective A-01",
        role: "Holds cultural authority over the account. Governs its preservation, publication, and derivatives.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-A01",
      },
      {
        id: "S-01",
        capacity: "Signer",
        label: "Synthetic signer S-01",
        role: "Signed for A-01 within a defined mandate. Holds no authority of their own over the account.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-S01",
      },
      {
        id: "C-01",
        capacity: "Collector",
        label: "Synthetic collector C-01",
        role: "Facilitated and made the recording. Holds no authority over the account or the people in it.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-C01",
      },
      {
        id: "I-01",
        capacity: "Legal rights holder",
        label: "Synthetic institution I-01",
        role: "Holds copyright in the audio recording made by C-01. Has no cultural authority over the account.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-I01",
      },
      {
        id: "P-02",
        capacity: "Subject",
        label: "Synthetic person P-02",
        role: "Named in the account. Has privacy and dignity interests, separate from authorship or authority.",
        evidence: "attested",
        contactRecord: "CANARY-PARTY-CONTACT-P02",
      },
    ],
    mandate: {
      signer: "S-01",
      represents: "A-01",
      scope: "Recording, preservation, and limited publication of this record only.",
      until: "Until a review date set in the receipt (illustrative).",
      documentRef: "CANARY-MANDATE-DOCUMENT",
    },
    authorizations: [
      {
        use: "recording",
        grant: "granted",
        decidedBy: ["P-01", "A-01"],
        basis: RECEIPT,
        scope: "One recorded session. Does not imply retention or public access.",
        review: "Not applicable after the session.",
        receiptRef: "CANARY-RECEIPT-RECORDING",
      },
      {
        use: "preservation",
        grant: "granted",
        decidedBy: ["A-01"],
        basis: `${RECEIPT}, signed by S-01 under mandate`,
        scope: "Custody copies for integrity and migration. No publication implied.",
        review: "At the mandate's review date (illustrative).",
        receiptRef: "CANARY-RECEIPT-PRESERVATION",
      },
      {
        use: "publication",
        grant: "limited",
        decidedBy: ["A-01", "P-02"],
        basis: `${RECEIPT}, signed by S-01 under mandate; P-02's interest recorded separately`,
        scope: "The transcript only, to a named audience, with P-02's name withheld. No audio.",
        review: "At the mandate's review date (illustrative).",
        receiptRef: "CANARY-RECEIPT-PUBLICATION",
      },
      {
        use: "research",
        grant: "not-granted",
        decidedBy: ["A-01"],
        basis: "Not requested.",
        scope: "None.",
        review: "A new request needs fresh authorization.",
        receiptRef: "CANARY-RECEIPT-RESEARCH",
      },
      {
        use: "derivatives",
        grant: "limited",
        decidedBy: ["A-01", "I-01"],
        basis: `${RECEIPT}; I-01's licence for copies of the audio (restricted)`,
        scope: "An attributed translation of the transcript. Audio derivatives need I-01 as well as A-01.",
        review: "At the mandate's review date (illustrative).",
        receiptRef: "CANARY-RECEIPT-DERIVATIVES",
      },
      {
        use: "modelTraining",
        grant: "not-granted",
        decidedBy: ["A-01"],
        basis: "Not requested.",
        scope: "None.",
        review: "Only a specific, separate authorization could change this.",
        receiptRef: "CANARY-RECEIPT-TRAINING",
      },
      {
        use: "syntheticReproduction",
        grant: "not-granted",
        decidedBy: ["P-01", "A-01"],
        basis: "Not requested. P-01's voice needs P-01's own distinct authorization.",
        scope: "None.",
        review: "Only a specific, separate authorization could change this.",
        receiptRef: "CANARY-RECEIPT-SYNTHETIC",
      },
      {
        use: "commercialReuse",
        grant: "not-granted",
        decidedBy: ["A-01", "I-01"],
        basis: "Not requested.",
        scope: "None.",
        review: "Educational access never grants it.",
        receiptRef: "CANARY-RECEIPT-COMMERCIAL",
      },
    ],
    context: [
      { field: "Language", value: "Not specified", evidence: "unknown", note: "A real record names the language and variety as the source identifies them." },
      { field: "Place", value: "Withheld", evidence: "attested", note: "In this scenario, A-01 withholds the place from publication." },
      { field: "Date of account", value: "Not specified", evidence: "unknown" },
    ],
    publicationStatus: "Published (limited: transcript fields only, in this scenario)",
    custodyStatus: "Not ingested. No archival object exists.",
    withdrawal:
      "In this scenario, P-01 may withdraw their participation and A-01 may restrict or withdraw the account, each through a steward. Withdrawal stops publication and future distribution within TIRO-controlled systems.",
    provenance: [
      { at: "2026-10-30", event: "Scenario created as a design study", actor: "TIRO design (Memory Project v1)", evidence: "recorded" },
      { at: "—", event: "No recording, consent, or review took place. All parties are fictional.", actor: "—", evidence: "unknown" },
    ],
    media: { kind: "none", note: "No audio attached. In this scenario, publication of the audio is not authorized." },
    transcript: { note: "No transcript. A fictional scenario has no source media." },
    aiProcessing: "Disabled. No transcription, translation, or model processing has been applied.",
    internalNotes: "CANARY-SCENARIO-INTERNAL: internal notes are never projected.",
  },
];
