// The Living Trace's epistemic vocabulary — the single source of truth for
// how the interface distinguishes what is recorded, attested, inferred,
// contested, and unknown. Every visible relationship and every record
// field that makes a claim carries one of these states, and each state is
// expressed by stroke pattern + glyph + words — never by color alone.
//
// These definitions describe display semantics only. They are not an
// adopted Memory Record Specification (none exists in the repo; see
// docs/ethos.txt §4 "proposed operational schema") and confer no
// verification on any record.

export type EvidenceState = "recorded" | "attested" | "inferred" | "contested" | "unknown";

export type EvidenceDefinition = {
  label: string;
  // One plain sentence a visitor can read without knowing the system.
  meaning: string;
  // SVG stroke-dasharray in user units for a non-scaling 1.25–1.5px stroke.
  // "none" = continuous. Kept here, not in CSS, so legends and graph
  // edges draw from the same rule.
  dash: string;
  // Which color role the line takes. Gold marks an origin's own line;
  // mineral marks relationships between records.
  tone: "accent" | "mineral" | "contested" | "muted";
};

export const EVIDENCE: Record<EvidenceState, EvidenceDefinition> = {
  recorded: {
    label: "Recorded",
    meaning: "Present in the source material itself.",
    dash: "none",
    tone: "accent",
  },
  attested: {
    label: "Attested",
    meaning: "Stated by an identified source, with a reference you can follow.",
    dash: "none",
    tone: "mineral",
  },
  inferred: {
    label: "Inferred",
    meaning: "An interpretation, not a verified claim. The interpreter is named.",
    dash: "5 5",
    tone: "mineral",
  },
  contested: {
    label: "Contested",
    meaning: "Accounts disagree. Each account is kept and attributed; none is overwritten.",
    dash: "10 4 2 4",
    tone: "contested",
  },
  unknown: {
    label: "Unknown",
    meaning: "No evidence on record. The absence is shown rather than filled in.",
    dash: "1 5",
    tone: "muted",
  },
};

export const EVIDENCE_ORDER: EvidenceState[] = ["recorded", "attested", "inferred", "contested", "unknown"];

export function toneColor(tone: EvidenceDefinition["tone"]): string {
  switch (tone) {
    case "accent":
      return "var(--tiro-accent)";
    case "mineral":
      return "var(--tiro-mineral-line)";
    case "contested":
      return "var(--tiro-contested)";
    case "muted":
      return "var(--tiro-text-subtle)";
  }
}

// The eight use categories from docs/ethos.txt §3.3 ("Use permissions").
// Order and wording follow that table. "Purpose does not transfer"
// (/community-rights): each is granted or not on its own.
export type UseCategory =
  | "recording"
  | "preservation"
  | "publication"
  | "research"
  | "derivatives"
  | "modelTraining"
  | "syntheticReproduction"
  | "commercialReuse";

export const USE_CATEGORIES: { key: UseCategory; label: string; boundary: string }[] = [
  { key: "recording", label: "Recording / collection", boundary: "Does not imply retention or public access." },
  { key: "preservation", label: "Preservation", boundary: "No automatic publication." },
  { key: "publication", label: "Publication", boundary: "Named audience and channels only." },
  { key: "research", label: "Research", boundary: "Separate access and output conditions." },
  { key: "derivatives", label: "Derivatives", boundary: "Translation or adaptation within approved scope." },
  { key: "modelTraining", label: "Model training", boundary: "Only when specifically authorized." },
  { key: "syntheticReproduction", label: "Synthetic reproduction", boundary: "Voice or likeness needs distinct authorization." },
  { key: "commercialReuse", label: "Commercial reuse", boundary: "Educational access never grants it." },
];

// "Not granted", "unknown", "disputed", and "withdrawn" are not equivalent
// to permission (docs/ethos.txt §3.3) — each is shown as its own state.
export type UseGrant = "granted" | "limited" | "not-granted" | "unknown" | "disputed" | "withdrawn" | "not-applicable";

export const USE_GRANT_LABEL: Record<UseGrant, string> = {
  granted: "Granted",
  limited: "Limited",
  "not-granted": "Not granted",
  unknown: "Unknown",
  disputed: "Disputed",
  withdrawn: "Withdrawn",
  "not-applicable": "Not applicable",
};
