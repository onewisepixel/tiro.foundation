export type MemoryMedia = {
  type: "image" | "audio" | "video" | "none";
  src?: string;
  alt?: string;
  caption?: string;
  duration?: string;
  credit?: string;
};

export type RelatedNode = {
  label: string;
  type: "Person" | "Place" | "Theme" | "Institution" | "Language";
  href?: string;
};

export type MemoryRecord = {
  id: string;
  recordId: string;
  // Record category only — does not establish verification or publication permission.
  // See src/data/recordNotices.ts for the per-kind display notice.
  recordKind: "demo" | "pilot" | "collection";
  archiveStatus: string;
  lastReviewed: string;
  accessLevel: string;
  confidenceLevel?: string;
  multipleVersions?: string;
  translatorNotes?: string;
  disputedDetails?: string;
  communityAnnotations?: string;
  title: string;
  summary: string;
  location: string;
  language: string;
  era: string;
  contributor: string;
  sourceAuthority: string;
  legalRights?: string;
  consentStatus: string;
  consentWithdrawal: string;
  provenance: string;
  rightsUsage: string;
  sensitivity?: string;
  media: MemoryMedia;
  transcript: string;
  culturalContext: string;
  tags: string[];
  relatedNodes: RelatedNode[];
  relatedMemories: {
    id: string;
    title: string;
    summary: string;
    href: string;
  }[];
};

// DEMONSTRATION RECORDS. They show the STRUCTURE of a memory record, one
// per media type, and contain nothing else: no testimony, no story, no
// person, and no cultural practice attributed to any community
// (docs/design/decisions.md, 2026-10-16, decision 3). Nothing below
// happened: no one was recorded, no consent was given, no review took
// place, and no TIRO program collected anything. Fields that would be
// claims on a real record describe what such a field holds. Place and
// language values are example metadata only, kept so that place and
// language nodes can show how they gather records; they say nothing about
// those places or languages. Keep demonstration identifiers (DEMO-MEM-*)
// distinct from any future accession scheme (docs/memory.txt).
const NOT_VERIFIED = "Not verified (demonstration record)";
const NOT_REVIEWED = "Not reviewed (demonstration record)";
const NO_CONSENT = "None. No consent was sought or given; this is not a real record.";
const NO_SOURCE = "None. This demonstration has no source.";

function example(wording: string): string {
  return `Example of what this field holds; nothing described here took place: ${wording}`;
}

const NO_TRANSCRIPT = `No transcript. Nothing was recorded for this demonstration.

On a real record, this panel shows the transcript in the language the source used, as reviewed with the source, and an attributed translation beside it. Corrections are added as attributed revisions; they never silently replace the source's words.`;

export const memories: MemoryRecord[] = [
  {
    id: "demo-audio-record",
    recordId: "DEMO-MEM-0001",
    recordKind: "demo",
    archiveStatus: NOT_VERIFIED,
    lastReviewed: NOT_REVIEWED,
    accessLevel: "Public (demonstration)",
    confidenceLevel: example("how confident the record is in each detail, and on what basis, such as whether an account was cross-checked and by whom."),
    multipleVersions: example("each revision of the transcript or metadata, with its date and the reason for the change."),
    translatorNotes: example("why a phrase was left untranslated or rendered a particular way, signed by the translator."),
    disputedDetails: example("a detail remembered differently across retellings, with each version kept and attributed."),
    communityAnnotations: example("notes added by the source's community, attributed and kept separate from TIRO's own notes."),
    title: "Demonstration record: an audio account",
    summary: "Shows how an audio memory record is structured: source, authority, consent, provenance, and media, in that order. Contains no testimony.",
    location: "Lagos and Port Harcourt, Nigeria (example metadata)",
    language: "Nigerian Pidgin and English (example metadata)",
    era: "Not specified (demonstration)",
    contributor: "No real contributor. A real record names the narrator and the collector as separate people.",
    sourceAuthority: NO_SOURCE,
    consentStatus: NO_CONSENT,
    consentWithdrawal: example(
      "who may request withdrawal or restriction, how to contact TIRO with the record's ID, and what TIRO will do: cease public access and distribution within its systems, and retain a preservation copy only under terms disclosed at consent.",
    ),
    provenance: example("how and where the account was captured, who witnessed it, and who reviewed it before cataloging."),
    rightsUsage: example("which uses are permitted (for example, non-commercial education with attribution) and which need renewed authorization."),
    sensitivity: example("whether anything in the record needs redaction or an access restriction, and why."),
    media: {
      type: "audio",
      caption: "Placeholder for an audio record. No recording exists.",
      credit: "None (demonstration placeholder)",
    },
    transcript: NO_TRANSCRIPT,
    culturalContext: example(
      "context the source or their community chooses to give, attributed to them, kept separate from any interpretation TIRO adds. This demonstration has none.",
    ),
    tags: ["Demonstration", "Audio record"],
    relatedNodes: [
      { label: "Lagos", type: "Place", href: "/nodes/lagos" },
      { label: "Port Harcourt", type: "Place" },
      { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
    ],
    relatedMemories: [
      {
        id: "demo-image-record",
        title: "Demonstration record: an image with a translated account",
        summary: "Shows how an image record carries a translation and its translator's notes. Contains no testimony.",
        href: "/memories/demo-image-record",
      },
      {
        id: "demo-video-record",
        title: "Demonstration record: a recorded performance",
        summary: "Shows how a performance record handles shared authority and versions. Contains no performance.",
        href: "/memories/demo-video-record",
      },
    ],
  },
  {
    id: "demo-image-record",
    recordId: "DEMO-MEM-0002",
    recordKind: "demo",
    archiveStatus: NOT_VERIFIED,
    lastReviewed: NOT_REVIEWED,
    accessLevel: "Public (demonstration)",
    confidenceLevel: example("how confident the record is in each detail, for example a single narrator with context reviewed by a language steward."),
    translatorNotes: example("how idioms were rendered, with sense-equivalents and the translator's name."),
    title: "Demonstration record: an image with a translated account",
    summary: "Shows how an image record carries a translation and its translator's notes, attributed and kept beside the source. Contains no testimony.",
    location: "Enugu, Nigeria (example metadata)",
    language: "English and Igbo (example metadata)",
    era: "Not specified (demonstration)",
    contributor: "No real contributor. A real record names who shared the account and who translated it.",
    sourceAuthority: NO_SOURCE,
    consentStatus: NO_CONSENT,
    consentWithdrawal: example(
      "who may request withdrawal or restriction, how, and what withdrawal does to the image, the transcript, and the translation as a derivative.",
    ),
    provenance: example("where the account was shared, and who reviewed the transcript and translation."),
    rightsUsage: example("whether the image may be cited, and that synthetic voice replication or dramatization needs separate consent."),
    media: {
      type: "image",
      alt: "",
      caption: "Placeholder for an image. No image exists.",
      credit: "None (demonstration placeholder)",
    },
    transcript: NO_TRANSCRIPT,
    culturalContext: example("context the source chooses to give, attributed to them. This demonstration has none."),
    tags: ["Demonstration", "Image record", "Translation"],
    relatedNodes: [
      { label: "Enugu", type: "Place" },
      { label: "Igbo", type: "Language" },
    ],
    relatedMemories: [
      {
        id: "demo-audio-record",
        title: "Demonstration record: an audio account",
        summary: "Shows how an audio memory record is structured. Contains no testimony.",
        href: "/memories/demo-audio-record",
      },
      {
        id: "demo-video-record",
        title: "Demonstration record: a recorded performance",
        summary: "Shows how a performance record handles shared authority and versions. Contains no performance.",
        href: "/memories/demo-video-record",
      },
    ],
  },
  {
    id: "demo-video-record",
    recordId: "DEMO-MEM-0003",
    recordKind: "demo",
    archiveStatus: NOT_VERIFIED,
    lastReviewed: NOT_REVIEWED,
    accessLevel: "Public (demonstration)",
    confidenceLevel: example("how a performance was documented, and whether it was reconstructed from recollection."),
    multipleVersions: example("segmentation or lyric revisions made after review with the performer."),
    disputedDetails: example("parts of a performance remembered differently by different listeners, each kept and attributed."),
    title: "Demonstration record: a recorded performance",
    summary: "Shows how a performance record handles shared or collective authority, versions, and playback limits. Contains no performance.",
    location: "Lagos, Nigeria (example metadata)",
    language: "Yoruba and Nigerian Pidgin (example metadata)",
    era: "Not specified (demonstration)",
    contributor: "No real performer. A real record names the performer as they choose to be identified.",
    sourceAuthority: example(
      "the performer and, where authority over a work is shared or collective, the community that holds it. The record says so when authority is shared, uncertain, or disputed.",
    ),
    consentStatus: NO_CONSENT,
    consentWithdrawal: example("who may request withdrawal or restriction of the performance, and how."),
    provenance: example("how the performance was captured and reviewed with the performer."),
    rightsUsage: example("whether playback is permitted for scholarship or exhibition, and that commercial sampling is not."),
    media: {
      type: "video",
      caption: "Placeholder for a video record. No recording exists.",
      credit: "None (demonstration placeholder)",
    },
    transcript: NO_TRANSCRIPT,
    culturalContext: example(
      "context written or approved by the performer or their community, attributed to them, and separate from TIRO's notes. This demonstration describes no practice of any community.",
    ),
    tags: ["Demonstration", "Video record", "Performance (format)"],
    relatedNodes: [
      { label: "Lagos", type: "Place", href: "/nodes/lagos" },
      { label: "Yoruba", type: "Language" },
      { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
    ],
    relatedMemories: [
      {
        id: "demo-audio-record",
        title: "Demonstration record: an audio account",
        summary: "Shows how an audio memory record is structured. Contains no testimony.",
        href: "/memories/demo-audio-record",
      },
      {
        id: "demo-image-record",
        title: "Demonstration record: an image with a translated account",
        summary: "Shows how an image record carries a translation. Contains no testimony.",
        href: "/memories/demo-image-record",
      },
    ],
  },
];

export function getMemoryById(id: string): MemoryRecord | undefined {
  return memories.find((memory) => memory.id === id);
}
