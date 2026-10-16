import type { EvidenceState } from "@/lib/livingTrace/evidence";
import EvidenceTag from "./EvidenceTag";
import OriginPoint from "./OriginPoint";

// Temporal layer — versions, continuity, and change. A plain ordered list
// with a quiet connecting rule; chronology is shown as the record's own
// history, not as a claim that the culture it documents is linear.
export type TemporalEntry = { at: string; event: string; actor: string; evidence: EvidenceState };

export default function TemporalRail({ entries }: { entries: TemporalEntry[] }) {
  return (
    <ol className="relative">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const known = entry.evidence !== "unknown";
        return (
          <li key={`${entry.at}-${index}`} className="relative grid grid-cols-[18px_1fr] gap-x-3 pb-5 last:pb-0">
            {!isLast ? (
              <span aria-hidden="true" className="absolute left-[8.5px] top-[18px] bottom-0 w-px bg-[var(--tiro-border-strong)]" />
            ) : null}
            <span className="pt-[3px]">
              <OriginPoint size={18} tone={known ? "accent" : "text"} absent={!known} />
            </span>
            <div>
              <p className="font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">
                {entry.at === "—" ? <span className="sr-only">No date</span> : <time dateTime={entry.at}>{entry.at}</time>}
                {entry.at === "—" ? <span aria-hidden="true">—</span> : null}
              </p>
              <p className="mt-0.5 text-sm text-[var(--tiro-text-soft)]">{entry.event}</p>
              {entry.actor !== "—" ? <p className="text-xs text-[var(--tiro-text-muted)]">{entry.actor}</p> : null}
              <div className="mt-1.5">
                <EvidenceTag evidence={entry.evidence} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
