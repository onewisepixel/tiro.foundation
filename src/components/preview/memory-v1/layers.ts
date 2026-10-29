// The layers of a memory record, as the Memory Project explains them.
// Plain data, shared by the overview (where each layer explains the
// method) and the record page (where each layer is a section of a real
// structured record). Wording follows Community Rights & Cultural Data
// Stewardship and docs/ethos.txt §3.2–3.3; nothing here is a field value.
//
// The first five are the record. "Derived" is deliberately apart:
// translations, interpretations, and relationships are made FROM a record
// and keep their own attribution (/community-rights: "TIRO distinguishes
// the record from TIRO's interpretation of the record").
export type LayerKey = "account" | "source" | "authority" | "terms" | "provenance" | "derived";

export type Layer = { key: LayerKey; label: string; question: string; method: string };

export const RECORD_LAYERS: Layer[] = [
  {
    key: "account",
    label: "Account",
    question: "What was shared?",
    method:
      "The account as it was given, in its own language. Translations are attributed to a named translator and kept beside the source, never in its place.",
  },
  {
    key: "source",
    label: "Source",
    question: "Who shared it?",
    method: "The person or community a memory comes from, identified as they choose. A source is never replaced by whoever recorded it.",
  },
  {
    key: "authority",
    label: "Authority",
    question: "Who decides?",
    method:
      "Cultural authority is recorded separately from whoever collected, contributed, or signed. Where it is shared, disputed, or unknown, the record says so.",
  },
  {
    key: "terms",
    label: "Terms of care",
    question: "What may be done with it?",
    method: "Consent is given use by use. Preservation does not imply publication, and permission for one use does not imply permission for another.",
  },
  {
    key: "provenance",
    label: "Provenance",
    question: "How did it come to be held?",
    method:
      "Every event in the record's history, attributed. Disagreements and uncertainties are kept alongside the material, not edited away.",
  },
];

export const DERIVED_LAYER: Layer = {
  key: "derived",
  label: "Derived",
  question: "What has been made from it?",
  method:
    "Translations, interpretations, and relationships to other records. Each keeps its own attribution and is never mistaken for the account itself.",
};

export const ALL_LAYERS: Layer[] = [...RECORD_LAYERS, DERIVED_LAYER];

// The separate capacities behind "Authority" (docs/ethos.txt §3.2).
export const CAPACITIES = ["Collector", "Contributor", "Subject", "Source authority", "Legal rights holder", "Signer"];

export const RECORDS_BASE = "/preview/memory-v1/records";
