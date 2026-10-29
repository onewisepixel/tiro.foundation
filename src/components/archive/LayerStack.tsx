import { r2 } from "@/lib/geometry";
import { ALL_LAYERS, RECORD_LAYERS, type LayerKey } from "./layers";

// A record in exploded view, first drawn for the v5 homepage: five sheets
// on one gold thread (they are one record), and a sixth, dashed and set
// apart, for what is derived from it. The source sheet carries the origin
// point. Styled by archive.css (la-stack, la-sheet).
//
// Presentational only and always aria-hidden: whoever uses it provides the
// accessible equivalent (a tablist on the homepage and the Memory Project,
// a list of section links on the record page). Sheets can be picked with a
// pointer as a shortcut.
//
// Inside a Reveal, the sheets separate once, when the drawing is reached
// (archive.css, la-sheet); with reduced motion they are simply drawn
// apart. Options:
//   derived  the sixth, Derived sheet (default). The homepage draws the
//            record alone, without it.
//   labels   each sheet's name beside it (default).
//   sealed   a restricted record instead: a single sheet with a closed
//            double edge and nothing beneath it.
const CX = 200;
const RX = 170;
const RY = 58;
const Y0 = 66;
const GAP = 86;
const LAST = Y0 + GAP * 4;
const DERIVED_Y = LAST + 128;
const MID = Y0 + GAP * 2;

const sheet = (cy: number, rx = RX, ry = RY) => `M${CX - rx},${cy} L${CX},${cy - ry} L${CX + rx},${cy} L${CX},${cy + ry} Z`;

export default function LayerStack({
  active,
  onPick,
  labels = true,
  derived = true,
  sealed = false,
}: {
  active?: LayerKey | null;
  onPick?: (key: LayerKey) => void;
  labels?: boolean;
  derived?: boolean;
  sealed?: boolean;
}) {
  if (sealed) {
    return (
      <svg viewBox="0 0 400 210" className="la-stack" aria-hidden="true" focusable="false">
        <line x1={CX} x2={CX} y1={0} y2={105} className="la-stack-thread" />
        <path d={sheet(105)} className="la-stack-plane" />
        <path d={sheet(105, 150, 51)} className="la-stack-seal" />
        <circle cx={CX} cy={105} r={4} className="la-stack-node" />
      </svg>
    );
  }

  const layers = derived ? ALL_LAYERS : RECORD_LAYERS;
  const width = labels ? 560 : 400;
  const height = derived ? DERIVED_Y + RY + 24 : LAST + RY + 32;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="la-stack" aria-hidden="true" focusable="false">
      <line x1={CX} x2={CX} y1={Y0 - RY - 18} y2={LAST + RY + (derived ? 14 : 18)} className="la-stack-thread" />
      {derived ? <line x1={CX} x2={CX} y1={LAST + RY + 14} y2={DERIVED_Y - RY + 6} className="la-stack-branch" /> : null}
      {layers.map((l, i) => {
        const isDerived = l.key === "derived";
        const cy = isDerived ? DERIVED_Y : Y0 + GAP * i;
        const on = active === l.key;
        return (
          <g
            key={l.key}
            className="la-sheet"
            data-derived={isDerived}
            style={{ "--la-collapse": `${isDerived ? 0 : r2((MID - cy) * 0.86)}px`, "--lt-delay": `${100 + i * 90}ms` } as React.CSSProperties}
            onClick={onPick ? () => onPick(l.key) : undefined}
          >
            <g className="la-sheet-lift" data-on={on}>
              <path d={sheet(cy)} className={isDerived ? "la-stack-plane la-stack-plane-derived" : "la-stack-plane"} />
              {isDerived ? null : (
                <>
                  <line x1={CX - 112} y1={cy - 10} x2={CX - 40} y2={cy + 14.5} className="la-stack-field" />
                  <line x1={CX - 76} y1={cy - 24} x2={CX + 6} y2={cy + 4} className="la-stack-field" />
                  <line x1={CX - 30} y1={cy - 40} x2={CX + 42} y2={cy - 15.5} className="la-stack-field" />
                </>
              )}
              {l.key === "source" ? (
                <>
                  <circle cx={CX} cy={cy} r={8} className="la-stack-origin" />
                  <circle cx={CX} cy={cy} r={2.6} className="la-stack-node" />
                </>
              ) : (
                <circle cx={CX} cy={cy} r={isDerived ? 3 : 3.5} className={isDerived ? "la-stack-node-derived" : "la-stack-node"} />
              )}
              {labels ? (
                <>
                  <line x1={CX + RX + 8} x2={CX + RX + 34} y1={cy} y2={cy} className="la-stack-field" />
                  <text x={CX + RX + 42} y={cy + 4} className="la-stack-label">
                    {l.label.toUpperCase()}
                  </text>
                </>
              ) : null}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
