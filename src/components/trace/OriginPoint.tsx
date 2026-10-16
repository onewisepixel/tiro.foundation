// Origin point — a source, person, record, or place.
//
// Geometry follows the TIRO mark's own origin circumpunct (ring r=8 with a
// 2.6 dot, src/components/TiroMark.tsx) so the marker reads as kin to the
// mark without reproducing or altering it. Meant to be distinctive and
// sparing: one per source or movement, never a bullet or texture.
type OriginPointProps = {
  size?: number;
  tone?: "accent" | "mineral" | "text";
  // A hollow ring with no dot: a place where an origin is expected but is
  // not on record.
  absent?: boolean;
  className?: string;
};

const TONE: Record<NonNullable<OriginPointProps["tone"]>, string> = {
  accent: "var(--tiro-accent)",
  mineral: "var(--tiro-mineral)",
  text: "var(--tiro-text-soft)",
};

export default function OriginPoint({ size = 16, tone = "accent", absent = false, className }: OriginPointProps) {
  const color = TONE[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, overflow: "visible" }}
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeDasharray={absent ? "1.5 3" : undefined}
      />
      {absent ? null : <circle cx="12" cy="12" r="2.6" fill={color} />}
    </svg>
  );
}
