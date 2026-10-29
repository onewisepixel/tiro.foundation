// TIRO Citation Standard v0.1 (PROVISIONAL), as code.
// The standard itself: docs/design/citation-standard-v0.1.md.
//
// Pure and safe for the client: it formats only what the caller passes,
// which must already be a projection the reader is entitled to see.
//
// The rules this function enforces:
//   1. The source is credited first, exactly as authorized. Without an
//      authorized attribution the citation says so; it never substitutes
//      TIRO or a collector.
//   2. TIRO appears only as custodian, after the work, never in the author
//      position.
//   3. A citation names the record identifier and the version cited.
//   4. A persistent URL and an access date complete it. Anything not yet
//      available is stated plainly and reported as a warning, never faked.
//   5. Translations and interpretations are cited as their own works, with
//      their own attribution, pointing back to the record they derive from.
//      An interpretation is labeled as not a source account.
//   6. A restricted record is cited by its reference alone.
//   7. A synthetic record says so in the citation itself.

export type CitationInput =
  | {
      kind: "record";
      recordId: string;
      title: string | null; // null: publication of the title is not permitted
      attribution: string | null; // as authorized by the source and rights authority
      version: string | null;
      persistentUrl: string | null;
      accessed: string | null; // YYYY-MM-DD
      synthetic: boolean;
    }
  | {
      kind: "translation" | "interpretation";
      recordId: string;
      version: string | null;
      title: string;
      by: string; // translator or interpreter, as attributed
      recordAttribution: string | null;
      persistentUrl: string | null;
      accessed: string | null;
      synthetic: boolean;
    }
  | { kind: "restricted"; reference: string; accessed: string | null };

export type Citation = { text: string; warnings: string[] };

const CUSTODIAN = "The Memory Project; held by the Tiro Foundation (custodian)";

function tail(persistentUrl: string | null, accessed: string | null, synthetic: boolean, warnings: string[]) {
  const parts: string[] = [];
  if (persistentUrl) {
    parts.push(`${persistentUrl}.`);
  } else {
    parts.push("Persistent URL not yet issued.");
    warnings.push("No persistent URL: TIRO does not issue persistent record URLs yet.");
  }
  if (accessed) {
    parts.push(`Accessed ${accessed}.`);
  } else {
    warnings.push("No access date.");
  }
  if (synthetic) {
    parts.push("Synthetic demonstration; not archival evidence.");
  }
  return parts.join(" ");
}

function versioned(recordId: string, version: string | null, warnings: string[]) {
  if (version) {
    return `${recordId}, version ${version}`;
  }
  warnings.push("Unversioned: the record model does not assign versions to this record yet.");
  return `${recordId}, unversioned`;
}

export function cite(input: CitationInput): Citation {
  const warnings: string[] = [];

  if (input.kind === "restricted") {
    const accessed = input.accessed ? ` Accessed ${input.accessed}.` : "";
    return {
      text: `Restricted record ${input.reference}. ${CUSTODIAN}. No further details are published.${accessed}`,
      warnings: input.accessed ? [] : ["No access date."],
    };
  }

  if (input.kind === "record") {
    const credit = input.attribution ?? "Source not credited, as authorized";
    if (!input.attribution) {
      warnings.push("No authorized attribution: the source is not named, and no one else is credited in its place.");
    }
    const title = input.title ? `“${input.title}.”` : "Title not published.";
    return {
      text: `${credit}. ${title} ${versioned(input.recordId, input.version, warnings)}. ${CUSTODIAN}. ${tail(input.persistentUrl, input.accessed, input.synthetic, warnings)}`,
      warnings,
    };
  }

  const role = input.kind === "translation" ? "translator" : "interpreter";
  const relation = input.kind === "translation" ? "Translation of" : "Interpretation of";
  const source = input.recordAttribution ? `, from an account attributed to ${input.recordAttribution}` : "";
  const notSource = input.kind === "interpretation" ? " An interpretation, not a source account." : "";
  return {
    text: `${input.by}, ${role}. “${input.title}.” ${relation} ${versioned(input.recordId, input.version, warnings)}${source}.${notSource} ${CUSTODIAN}. ${tail(input.persistentUrl, input.accessed, input.synthetic, warnings)}`,
    warnings,
  };
}
