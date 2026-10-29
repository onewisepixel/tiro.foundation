// The close: 06, the pier's end. The boardwalk from the site runs in from
// the left and stops at an open origin, directly under the closing
// statement (a plumb line joins them). Beyond it there is only open water,
// a buoy every generation, labelled by century. Decorative; the statement
// carries the meaning.
//
// Drawn 1:1 in pixels (one generation = 44px, as in v3.1's scale), with
// x = 0 placed at the closing statement's first letter + 8px.
const GEN = 44;
const SPAN = 2400;
const DECK = 60;
const WATER = 84;
const STEPS = Array.from({ length: Math.floor(SPAN / GEN) }, (_, i) => i + 1);

export default function PierEnd() {
  return (
    <div className="hv4-pier" aria-hidden="true">
      <svg viewBox={`${-SPAN} 0 ${SPAN * 2} 140`} focusable="false">
        {/* Plumb line from the statement down to the open origin. */}
        <line x1={0} x2={0} y1={0} y2={DECK - 10} stroke="var(--tiro-mineral-line)" strokeWidth="1" strokeDasharray="3 4" />

        {/* Water: under the pier, and open beyond it. */}
        <line x1={-SPAN} x2={0} y1={WATER} y2={WATER} stroke="var(--hv4-faint)" strokeWidth="1" />
        <line x1={10} x2={SPAN} y1={WATER} y2={WATER} stroke="var(--tiro-mineral-line)" strokeWidth="1.25" strokeDasharray="1.5 6" strokeLinecap="round" />

        {/* The boardwalk: deck, rail, posts, piles, one per generation. */}
        <line x1={-SPAN} x2={-12} y1={DECK} y2={DECK} stroke="var(--tiro-text-subtle)" strokeWidth="2" />
        <line x1={-SPAN} x2={-12} y1={DECK + 6} y2={DECK + 6} stroke="var(--tiro-text-subtle)" strokeWidth="1" />
        <line x1={-SPAN} x2={-22} y1={DECK - 18} y2={DECK - 18} stroke="var(--hv4-faint)" strokeWidth="1" />
        {STEPS.map((k) => (
          <g key={`p${k}`} stroke="var(--tiro-mineral-line)" strokeWidth="1.25">
            <line x1={-k * GEN} x2={-k * GEN} y1={DECK - 18} y2={DECK} stroke="var(--hv4-faint)" strokeWidth="1" />
            <line x1={-k * GEN} x2={-k * GEN} y1={DECK + 6} y2={140} />
          </g>
        ))}

        {/* Open water: a buoy for every generation not yet lived. */}
        {STEPS.map((k) => {
          const century = k % 4 === 0;
          return (
            <g key={`f${k}`}>
              <circle cx={k * GEN} cy={WATER} r={century ? 3.6 : 2} fill="var(--hv4-bg, var(--tiro-bg))" stroke="var(--tiro-mineral-line)" strokeWidth="1" />
              {century ? (
                <text x={k * GEN} y={WATER + 26} textAnchor="middle" fill="var(--tiro-text-muted)" style={{ fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.06em" }}>
                  {k === 4 ? "100 years ahead" : `${(k / 4) * 100}`}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* The open origin at the pier's end. */}
        <circle cx={0} cy={DECK} r={8} fill="var(--hv4-bg, var(--tiro-bg))" stroke="var(--tiro-accent)" strokeWidth="1.5" strokeDasharray="1.5 3" />
        <text x={0} y={WATER + 26} textAnchor="middle" fill="var(--tiro-accent)" style={{ fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.18em" }}>
          NEXT
        </text>
      </svg>
    </div>
  );
}
