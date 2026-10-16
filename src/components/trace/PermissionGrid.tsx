import { USE_CATEGORIES, USE_GRANT_LABEL, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";

// "Purpose does not transfer" (/community-rights), made visible: each use
// from docs/ethos.txt §3.3 has its own state. Only "granted" draws a solid
// mark; every other state is visibly something other than permission.
function GrantGlyph({ grant }: { grant: UseGrant }) {
  const stroke = "currentColor";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      {grant === "granted" ? <circle cx="7" cy="7" r="4.5" fill={stroke} /> : null}
      {grant === "limited" ? (
        <>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke={stroke} strokeWidth="1.25" />
          <path d="M7 2.5 A4.5 4.5 0 0 1 7 11.5 Z" fill={stroke} />
        </>
      ) : null}
      {grant === "not-granted" || grant === "withdrawn" ? (
        <>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke={stroke} strokeWidth="1.25" />
          <line x1="3.8" y1="10.2" x2="10.2" y2="3.8" stroke={stroke} strokeWidth="1.25" />
        </>
      ) : null}
      {grant === "unknown" || grant === "disputed" ? (
        <circle cx="7" cy="7" r="4.5" fill="none" stroke={stroke} strokeWidth="1.25" strokeDasharray="1.5 2" />
      ) : null}
      {grant === "not-applicable" ? <line x1="3" y1="7" x2="11" y2="7" stroke={stroke} strokeWidth="1.25" /> : null}
    </svg>
  );
}

export default function PermissionGrid({ uses }: { uses: Record<UseCategory, UseGrant> }) {
  return (
    <ul className="divide-y divide-[var(--tiro-border)] border-y border-[var(--tiro-border)]">
      {USE_CATEGORIES.map(({ key, label, boundary }) => {
        const grant = uses[key];
        const isGranted = grant === "granted" || grant === "limited";
        return (
          <li key={key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 py-2.5">
            <span className="text-sm text-[var(--tiro-text-soft)]">{label}</span>
            <span
              className={`inline-flex items-center gap-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.1em] ${
                isGranted ? "text-[var(--tiro-text)]" : "text-[var(--tiro-text-muted)]"
              }`}
            >
              <GrantGlyph grant={grant} />
              {USE_GRANT_LABEL[grant]}
            </span>
            <span className="col-span-2 text-xs leading-relaxed text-[var(--tiro-text-muted)]">{boundary}</span>
          </li>
        );
      })}
    </ul>
  );
}
