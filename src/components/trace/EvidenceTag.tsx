import { EVIDENCE, toneColor, type EvidenceState } from "@/lib/livingTrace/evidence";

// A short sample of the line a relationship of this evidence state is
// drawn with — so legends, field tags, and graph edges share one visual
// rule. Decorative: the adjacent text always names the state.
export function EvidenceStroke({ evidence, width = 28 }: { evidence: EvidenceState; width?: number }) {
  const def = EVIDENCE[evidence];
  return (
    <svg width={width} height="8" viewBox={`0 0 ${width} 8`} aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      {evidence === "contested" ? (
        // Contested is drawn as two parallel strands: two accounts, kept.
        <>
          <line x1="1" y1="2.5" x2={width - 1} y2="2.5" stroke={toneColor(def.tone)} strokeWidth="1.25" strokeDasharray={def.dash} />
          <line x1="1" y1="5.5" x2={width - 1} y2="5.5" stroke={toneColor(def.tone)} strokeWidth="1.25" strokeDasharray={def.dash} />
        </>
      ) : (
        <line
          x1="1"
          y1="4"
          x2={width - 1}
          y2="4"
          stroke={toneColor(def.tone)}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={def.dash === "none" ? undefined : def.dash}
        />
      )}
    </svg>
  );
}

// Stroke sample + the state's name. Never color alone.
export default function EvidenceTag({ evidence, showMeaning = false }: { evidence: EvidenceState; showMeaning?: boolean }) {
  const def = EVIDENCE[evidence];
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <EvidenceStroke evidence={evidence} width={22} />
      <span className="lt-label !tracking-[0.12em]">{def.label}</span>
      {showMeaning ? <span className="text-sm text-[var(--tiro-text-muted)]">{def.meaning}</span> : null}
    </span>
  );
}

export function EvidenceLegend({ className }: { className?: string }) {
  return (
    <dl className={`grid gap-x-8 gap-y-3 sm:grid-cols-2 ${className ?? ""}`}>
      {(Object.keys(EVIDENCE) as EvidenceState[]).map((state) => (
        <div key={state} className="flex items-start gap-3">
          <dt className="flex w-[8.5rem] shrink-0 items-center gap-2 pt-0.5">
            <EvidenceStroke evidence={state} />
            <span className="lt-label !tracking-[0.12em] text-[var(--tiro-text-soft)]">{EVIDENCE[state].label}</span>
          </dt>
          <dd className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">{EVIDENCE[state].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
