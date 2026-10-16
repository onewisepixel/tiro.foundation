// Conspicuous labeling for synthetic demonstration content. Shown BEFORE
// any field that looks like an archival claim (docs/ethos.txt §6.1:
// demonstration notices precede illustrative verification or consent
// text). Separate from src/data/recordNotices.ts, whose wording governs
// the demonstration records in src/data/memories.ts; this one is for the
// Living Trace specimens, which contain no testimony at all.
export const SYNTHETIC_NOTICE =
  "Synthetic demonstration. No real person, community, place, testimony, or consent is represented. Fields show how a record is structured, not what any record contains.";

export function SyntheticPill() {
  return (
    <span className="inline-flex items-center gap-2 border border-[var(--tiro-accent)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.14em] text-[var(--tiro-accent)]">
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-[var(--tiro-accent)]" />
      Synthetic demonstration
    </span>
  );
}

export default function SyntheticNotice({ className }: { className?: string }) {
  return (
    <p
      className={`border-l-2 border-[var(--tiro-accent)] pl-4 text-sm leading-relaxed text-[var(--tiro-text-soft)] ${className ?? ""}`}
    >
      <strong className="font-semibold">Synthetic demonstration.</strong>{" "}
      {SYNTHETIC_NOTICE.replace(/^Synthetic demonstration\. /, "")}
    </p>
  );
}
