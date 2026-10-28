import { ALL_LAYERS, type LayerKey } from "./layers";

// A record in exploded view, carried forward from the v5 homepage: five
// sheets on one gold thread (they are one record), and a sixth, dashed and
// set apart, for what is derived from it. The source sheet carries the
// origin point.
//
// Presentational only and always aria-hidden: whoever uses it provides the
// accessible equivalent (a tablist on the overview, a list of section links
// on the record page). Sheets can be picked with a pointer as a shortcut.
// With `sealed`, it draws a restricted record: a single sheet with a closed
// double edge and nothing beneath it.
const CX = 200;
const RX = 170;
const RY = 58;
const Y0 = 66;
const GAP = 86;
const DERIVED_Y = Y0 + GAP * 4 + 128;
const MID = Y0 + GAP * 2;

const sheet = (cy: number, rx = RX, ry = RY) => `M${CX - rx},${cy} L${CX},${cy - ry} L${CX + rx},${cy} L${CX},${cy + ry} Z`;

export default function LayerStack({
  active,
  onPick,
  labels = true,
  sealed = false,
}: {
  active?: LayerKey | null;
  onPick?: (key: LayerKey) => void;
  labels?: boolean;
  sealed?: boolean;
}) {
  if (sealed) {
    return (
      <svg viewBox="0 0 400 210" className="mv1-stack" aria-hidden="true" focusable="false">
        <line x1={CX} x2={CX} y1={0} y2={105} className="mv1-stack-thread" />
        <path d={sheet(105)} className="mv1-stack-plane" />
        <path d={sheet(105, 150, 51)} className="mv1-stack-seal" />
        <circle cx={CX} cy={105} r={4} className="mv1-stack-node" />
      </svg>
    );
  }

  const width = labels ? 560 : 400;
  return (
    <svg viewBox={`0 0 ${width} ${DERIVED_Y + RY + 24}`} className="mv1-stack" aria-hidden="true" focusable="false">
      <line x1={CX} x2={CX} y1={Y0 - RY - 18} y2={Y0 + GAP * 4 + RY + 14} className="mv1-stack-thread" />
      <line x1={CX} x2={CX} y1={Y0 + GAP * 4 + RY + 14} y2={DERIVED_Y - RY + 6} className="mv1-stack-branch" />
      {ALL_LAYERS.map((l, i) => {
        const derived = l.key === "derived";
        const cy = derived ? DERIVED_Y : Y0 + GAP * i;
        const on = active === l.key;
        return (
          <g
            key={l.key}
            className="mv1-sheet"
            data-derived={derived}
            style={{ "--mv1-collapse": `${derived ? 0 : (MID - cy) * 0.86}px`, "--lt-delay": `${100 + i * 90}ms` } as React.CSSProperties}
            onClick={onPick ? () => onPick(l.key) : undefined}
          >
            <g className="mv1-sheet-lift" data-on={on}>
              <path d={sheet(cy)} className={derived ? "mv1-stack-plane mv1-stack-plane-derived" : "mv1-stack-plane"} />
              {derived ? null : (
                <>
                  <line x1={CX - 112} y1={cy - 10} x2={CX - 40} y2={cy + 14.5} className="mv1-stack-field" />
                  <line x1={CX - 76} y1={cy - 24} x2={CX + 6} y2={cy + 4} className="mv1-stack-field" />
                  <line x1={CX - 30} y1={cy - 40} x2={CX + 42} y2={cy - 15.5} className="mv1-stack-field" />
                </>
              )}
              {l.key === "source" ? (
                <>
                  <circle cx={CX} cy={cy} r={8} className="mv1-stack-origin" />
                  <circle cx={CX} cy={cy} r={2.6} className="mv1-stack-node" />
                </>
              ) : (
                <circle cx={CX} cy={cy} r={derived ? 3 : 3.5} className={derived ? "mv1-stack-node-derived" : "mv1-stack-node"} />
              )}
              {labels ? (
                <>
                  <line x1={CX + RX + 8} x2={CX + RX + 34} y1={cy} y2={cy} className="mv1-stack-field" />
                  <text x={CX + RX + 42} y={cy + 4} className="mv1-stack-label">
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
