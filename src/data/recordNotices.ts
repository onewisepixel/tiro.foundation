import type { MemoryRecord } from "./memories";

type RecordKindNotice = {
  full: string;
  short: string;
};

// recordKind describes the record's category only — it establishes neither
// verification nor permission to publish. A "collection" notice of `null`
// reflects its category; it is not a claim that the record has been
// verified or evidenced.
const RECORD_KIND_NOTICES: Record<MemoryRecord["recordKind"], RecordKindNotice | null> = {
  demo: {
    full: "Demonstration record — illustrative content, identities, provenance, and permissions; not collected archival testimony.",
    short: "Demonstration record — illustrative content, not collected archival testimony.",
  },
  // No sanctioned pilot-record wording exists yet. Define it before any
  // record ships with recordKind: "pilot".
  pilot: null,
  collection: null,
};

export function getRecordKindNotice(kind: MemoryRecord["recordKind"]): RecordKindNotice | null {
  return RECORD_KIND_NOTICES[kind];
}
