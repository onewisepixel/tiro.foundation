// SYNTHETIC DEMONSTRATION DATA — a fictional authority scenario.
//
// One deliberately constructed record showing the capacities behind a
// memory held by DIFFERENT parties (docs/ethos.txt §3.2–3.3), and how a
// collective exercises its authority. The model keeps five things apart
// (founder clarification, docs/design/decisions.md, 2026-10-28):
//
//   1. who POSSESSES the authority a use requires   (authorization.requiredFrom)
//   2. who MADE or authorized the decision           (decision.by)
//   3. who EXECUTED and who RECORDED it              (decision.executedBy, recordedBy)
//   4. what MANDATE permitted the execution          (decision.mandate)
//   5. whether that mandate was VALID for that use,
//      that holder, and that date                    (evaluated in authorityProjection.ts)
//
// A signer holds no authority of their own by being a signer. An authorized
// signer may execute a collective's decision, within a valid mandate. A
// signature outside the mandate has no effect, and the scenario includes one
// (research) to prove it. This clarifies the model; it broadens no one's
// authority.
//
// Everything here is fictional. No real person, community, institution,
// place, language, practice, testimony, recording, or consent exists behind
// any value, and nothing was collected. Parties carry abstract labels.
//
// Kept apart from syntheticArchive.ts: other demonstrations depend on that
// archive's exact contents. Read only through authorityProjection.ts, which
// publishes a SAFE CONSENT SUMMARY (ethos §3.3; contract 0.2 §7.3): no signer
// or subject identity, no mandate terms, no receipts, no record of attempts.
// Internal-only values carry "CANARY" strings; tests and
// scripts/test/verify-disclosure.mjs prove none of them leaves the server.
import "server-only";
import type { UseCategory, UseGrant, EvidenceState } from "@/lib/livingTrace/evidence";

export type Capacity = "Collector" | "Contributor" | "Subject" | "Source authority" | "Legal rights holder" | "Signer";

export type InternalParty = {
  id: string;
  capacity: Capacity;
  label: string;
  role: string;
  evidence: EvidenceState;
  // When false, a visitor sees only the capacity-level description below.
  identityPublic: boolean;
  publicLabel?: string;
  publicRole?: string;
  contactRecord: string; // never projected
};

export type InternalMandate = {
  id: string;
  signer: string;
  represents: string;
  record: string;
  uses: UseCategory[];
  validFrom: string;
  validUntil: string;
  verified: boolean;
  documentRef: string; // never projected
};

export type InternalDecision = {
  by: string; // the holder whose authority is exercised
  executedBy: string; // the holder in their own right, or a signer
  mandate: string | null; // required whenever executedBy !== by
  at: string;
  recordedBy: string;
};

export type InternalAuthorization = {
  use: UseCategory;
  grant: UseGrant; // what the decisions intend; published only if they are in effect
  requiredFrom: string[];
  decisions: InternalDecision[];
  basis: "consent";
  scope: string;
  review: string;
  receiptRef: string; // never projected
};

export type InternalScenarioRecord = {
  id: string;
  version: string;
  title: string;
  summary: string;
  attribution: { text: string; authorizedBy: string[] };
  parties: InternalParty[];
  mandates: InternalMandate[];
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

const STEWARD = "TIRO steward (illustrative role)";

export const SCENARIO_RECORDS: InternalScenarioRecord[] = [
  {
    id: "DEMO-MP-0001",
    version: "1",
    title: "An account given by one person, recorded by another, and governed by a third",
    summary:
      "A fictional scenario showing each capacity behind a memory held by a different party, how a collective exercises its authority through a representative, and what each use permits. It contains no testimony.",
    attribution: { text: "Synthetic contributor P-01, with the authority of Synthetic collective A-01", authorizedBy: ["A-01", "P-01"] },
    parties: [
      {
        id: "P-01",
        capacity: "Contributor",
        label: "Synthetic contributor P-01",
        role: "Gave the account. Decides on their own participation, voice, and likeness.",
        evidence: "attested",
        identityPublic: true,
        contactRecord: "CANARY-PARTY-CONTACT-P01",
      },
      {
        id: "A-01",
        capacity: "Source authority",
        label: "Synthetic collective A-01",
        role: "Holds cultural authority over the account. Exercises it through representatives it authorizes.",
        evidence: "attested",
        identityPublic: true,
        contactRecord: "CANARY-PARTY-CONTACT-A01",
      },
      {
        id: "S-01",
        capacity: "Signer",
        label: "CANARY-SIGNER-IDENTITY S-01",
        role: "CANARY-SIGNER-ROLE",
        evidence: "attested",
        identityPublic: false,
        publicLabel: "An authorized representative of Synthetic collective A-01",
        publicRole: "Signs for A-01 within a verified mandate. Holds no authority of their own. Identity and mandate are restricted.",
        contactRecord: "CANARY-PARTY-CONTACT-S01",
      },
      {
        id: "C-01",
        capacity: "Collector",
        label: "Synthetic collector C-01",
        role: "Facilitated and made the recording. Holds no authority over the account or the people in it.",
        evidence: "attested",
        identityPublic: true,
        contactRecord: "CANARY-PARTY-CONTACT-C01",
      },
      {
        id: "I-01",
        capacity: "Legal rights holder",
        label: "Synthetic institution I-01",
        role: "Holds copyright in the audio recording made by C-01. Has no cultural authority over the account.",
        evidence: "attested",
        identityPublic: true,
        contactRecord: "CANARY-PARTY-CONTACT-I01",
      },
      {
        id: "P-02",
        capacity: "Subject",
        label: "CANARY-SUBJECT-IDENTITY P-02",
        role: "CANARY-SUBJECT-ROLE",
        evidence: "attested",
        identityPublic: false,
        publicLabel: "A person named in the account",
        publicRole: "Has privacy and dignity interests, separate from authorship or authority. Identity withheld from publication.",
        contactRecord: "CANARY-PARTY-CONTACT-P02",
      },
    ],
    mandates: [
      {
        id: "CANARY-MANDATE-M01",
        signer: "S-01",
        represents: "A-01",
        record: "DEMO-MP-0001",
        uses: ["recording", "preservation", "publication", "derivatives"],
        validFrom: "2026-10-01",
        validUntil: "2027-09-30",
        verified: true,
        documentRef: "CANARY-MANDATE-DOCUMENT",
      },
    ],
    authorizations: [
      {
        use: "recording",
        grant: "granted",
        requiredFrom: ["P-01", "A-01"],
        decisions: [
          { by: "P-01", executedBy: "P-01", mandate: null, at: "2026-10-12", recordedBy: STEWARD },
          { by: "A-01", executedBy: "S-01", mandate: "CANARY-MANDATE-M01", at: "2026-10-12", recordedBy: STEWARD },
        ],
        basis: "consent",
        scope: "One recorded session. Does not imply retention or public access.",
        review: "Not applicable after the session.",
        receiptRef: "CANARY-RECEIPT-RECORDING",
      },
      {
        use: "preservation",
        grant: "granted",
        requiredFrom: ["A-01"],
        decisions: [{ by: "A-01", executedBy: "S-01", mandate: "CANARY-MANDATE-M01", at: "2026-10-12", recordedBy: STEWARD }],
        basis: "consent",
        scope: "Custody copies for integrity and migration. No publication implied.",
        review: "When the representative's mandate is reviewed (illustrative).",
        receiptRef: "CANARY-RECEIPT-PRESERVATION",
      },
      {
        use: "publication",
        grant: "limited",
        requiredFrom: ["A-01", "P-02"],
        decisions: [
          { by: "A-01", executedBy: "S-01", mandate: "CANARY-MANDATE-M01", at: "2026-10-12", recordedBy: STEWARD },
          { by: "P-02", executedBy: "P-02", mandate: null, at: "2026-10-14", recordedBy: STEWARD },
        ],
        basis: "consent",
        scope: "The transcript only, to a named audience, with the subject's name withheld. No audio.",
        review: "When the representative's mandate is reviewed (illustrative).",
        receiptRef: "CANARY-RECEIPT-PUBLICATION",
      },
      {
        // A signature outside the mandate's scope. It is recorded, and it has
        // no effect: research stays not granted, and nothing about the
        // attempt is published.
        use: "research",
        grant: "not-granted",
        requiredFrom: ["A-01"],
        decisions: [{ by: "A-01", executedBy: "S-01", mandate: "CANARY-MANDATE-M01", at: "2026-10-12", recordedBy: STEWARD }],
        basis: "consent",
        scope: "None.",
        review: "A new request needs A-01's decision through a mandate that covers research.",
        receiptRef: "CANARY-RECEIPT-RESEARCH",
      },
      {
        use: "derivatives",
        grant: "limited",
        requiredFrom: ["A-01", "I-01"],
        decisions: [
          { by: "A-01", executedBy: "S-01", mandate: "CANARY-MANDATE-M01", at: "2026-10-12", recordedBy: STEWARD },
          { by: "I-01", executedBy: "I-01", mandate: null, at: "2026-10-13", recordedBy: STEWARD },
        ],
        basis: "consent",
        scope: "An attributed translation of the transcript. Audio derivatives need the rights holder as well as the source authority.",
        review: "When the representative's mandate is reviewed (illustrative).",
        receiptRef: "CANARY-RECEIPT-DERIVATIVES",
      },
      {
        use: "modelTraining",
        grant: "not-granted",
        requiredFrom: ["A-01"],
        decisions: [],
        basis: "consent",
        scope: "None.",
        review: "Only a specific, separate authorization could change this.",
        receiptRef: "CANARY-RECEIPT-TRAINING",
      },
      {
        use: "syntheticReproduction",
        grant: "not-granted",
        requiredFrom: ["P-01", "A-01"],
        decisions: [],
        basis: "consent",
        scope: "None. The contributor's voice needs their own distinct authorization.",
        review: "Only a specific, separate authorization could change this.",
        receiptRef: "CANARY-RECEIPT-SYNTHETIC",
      },
      {
        use: "commercialReuse",
        grant: "not-granted",
        requiredFrom: ["A-01", "I-01"],
        decisions: [],
        basis: "consent",
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
      { at: "2026-10-28", event: "Scenario created as a design study", actor: "TIRO design (Memory Project v1)", evidence: "recorded" },
      { at: "2026-10-28", event: "Revised to separate authority, decision, execution, mandate, and validity", actor: "TIRO design (Milestone 2.1)", evidence: "recorded" },
      { at: "—", event: "No recording, consent, or review took place. All parties are fictional.", actor: "—", evidence: "unknown" },
    ],
    media: { kind: "none", note: "No audio attached. In this scenario, publication of the audio is not authorized." },
    transcript: { note: "No transcript. A fictional scenario has no source media." },
    aiProcessing: "Disabled. No transcription, translation, or model processing has been applied.",
    internalNotes: "CANARY-SCENARIO-INTERNAL: internal notes are never projected.",
  },
];
