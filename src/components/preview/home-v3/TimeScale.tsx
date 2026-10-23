"use client";

import { useRef, useState } from "react";
import TiroMark from "@/components/TiroMark";

// The scale: time in generations (25 years each), running off both edges
// of the page. Drawn in the Living Trace's own line grammar: the past is
// recorded (solid), the future is open (dotted, hollow points). The
// approved mark stands, unaltered and unanimated, at now.
//
// "full": the hero. "closing": the page's last line, where only the open
// future remains, beginning at an open origin.
//
// Pointing at the scale reads the generation under the pointer. It is
// decorative (aria-hidden); the page states its meaning in text.
const GEN = 44;
const SPAN = 2400;
const LINE = 80;
const gens = Array.from({ length: Math.floor(SPAN / GEN) }, (_, i) => i + 1);

const label = (g: number) => (g === 4 ? "100 years" : `${(g / 4) * 100}`);

export default function TimeScale({ variant = "full" }: { variant?: "full" | "closing" }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<{ x: number; text: string } | null>(null);
  const closing = variant === "closing";

  const read = (clientX: number, box: DOMRect) => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const nowX = svg.getBoundingClientRect().left + SPAN;
    const g = Math.round((clientX - nowX) / GEN);
    if (closing && g < 0) {
      setCursor(null);
      return;
    }
    const year = new Date().getFullYear();
    const n = Math.abs(g);
    const unit = `generation${n === 1 ? "" : "s"}`;
    const text = g === 0 ? `Now · ${year}` : g < 0 ? `${n} ${unit} ago · c. ${year - n * 25}` : `${n} ${unit} ahead · c. ${year + n * 25}`;
    setCursor({ x: nowX - box.left + g * GEN, text });
  };

  return (
    <div
      className="hv3-scale"
      data-variant={variant}
      aria-hidden="true"
      onPointerMove={(e) => read(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerDown={(e) => read(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setCursor(null)}
    >
      <svg ref={svgRef} viewBox={`${-SPAN} 0 ${SPAN * 2} 120`} focusable="false">
        {/* The past: recorded. */}
        {closing ? null : (
          <g className="lt-fade-in" style={{ "--lt-delay": "200ms" } as React.CSSProperties}>
            <line x1={-SPAN} x2={0} y1={LINE} y2={LINE} stroke="var(--hv3-line)" strokeWidth="1" />
            {gens.map((g) => {
              const century = g % 4 === 0;
              const millennium = g % 40 === 0;
              const h = millennium ? 22 : century ? 13 : 6;
              return (
                <g key={`p${g}`}>
                  <line x1={-g * GEN} x2={-g * GEN} y1={LINE - h} y2={LINE} stroke={century ? "var(--hv3-line)" : "var(--hv3-faint)"} strokeWidth="1" />
                  {century ? (
                    <text x={-g * GEN} y={LINE + 20} textAnchor="middle" fill="var(--tiro-text-subtle)" style={{ fontFamily: "var(--font-code)", fontSize: 10, letterSpacing: "0.06em" }}>
                      −{label(g)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <text x={-12} y={LINE - 10} textAnchor="end" fill="var(--tiro-text-muted)" style={{ fontFamily: "var(--font-code)", fontSize: 10, letterSpacing: "0.16em" }}>
              RECORDED
            </text>
          </g>
        )}

        {/* The future: open. */}
        <g className="lt-fade-in" style={{ "--lt-delay": closing ? "0ms" : "700ms" } as React.CSSProperties}>
          <line x1={closing ? 0 : 0} x2={SPAN} y1={LINE} y2={LINE} stroke="var(--hv3-line)" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round" />
          {gens.map((g) => {
            const century = g % 4 === 0;
            return (
              <g key={`f${g}`}>
                <circle cx={g * GEN} cy={LINE} r={century ? 3.2 : 1.8} fill="var(--hv3-bg, var(--tiro-bg))" stroke={century ? "var(--hv3-line)" : "var(--hv3-faint)"} strokeWidth="1" />
                {century ? (
                  <text x={g * GEN} y={LINE + 20} textAnchor="middle" fill="var(--tiro-text-subtle)" style={{ fontFamily: "var(--font-code)", fontSize: 10, letterSpacing: "0.06em" }}>
                    +{label(g)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <text x={12} y={LINE - 10} fill="var(--tiro-text-muted)" style={{ fontFamily: "var(--font-code)", fontSize: 10, letterSpacing: "0.16em" }}>
            OPEN
          </text>
        </g>

        {closing ? (
          <g>
            <circle cx={0} cy={LINE} r={7} fill="var(--hv3-bg, var(--tiro-bg))" stroke="var(--tiro-accent)" strokeWidth="1.5" strokeDasharray="1.5 3" />
          </g>
        ) : null}
      </svg>

      {closing ? null : (
        <div className="hv3-scale-mark">
          <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
        </div>
      )}

      {cursor ? (
        <>
          <span className="hv3-scale-cursor" style={{ left: cursor.x }} />
          <span className="hv3-scale-readout lt-label !text-[10px] text-[var(--tiro-text-soft)]" style={{ left: cursor.x }}>
            {cursor.text}
          </span>
        </>
      ) : null}
    </div>
  );
}
