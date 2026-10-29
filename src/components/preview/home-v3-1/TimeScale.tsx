"use client";

import { useRef, useState } from "react";
import TiroMark from "@/components/TiroMark";

// The scale: an instrument for reading time in generations (25 years).
// The past is drawn as recorded (a solid, ticked rule); the future as open
// (a dotted rule with hollow stations), the Living Trace's own line grammar
// for "recorded" and "unknown". The approved mark stands, unaltered and
// unanimated, on the present.
//
// "full" is the hero: a keyboard-operable slider over the generations that
// are actually drawn on screen (arrow keys: one generation; Page Up/Down:
// one century; Home/End: the drawn ends), also readable by pointer.
// "closing" is the page's last line: the open future alone, beginning at an
// open origin, decorative.
//
// Nothing date-dependent is rendered on the server: the calendar year is
// read only when someone interacts, so server and client markup agree.
const GEN = 44;
const SPAN = 2400;
const LINE = 72; // svg y of the rule; the svg's bottom edge is 48px below it
const STEPS = Array.from({ length: Math.floor(SPAN / GEN) }, (_, i) => i + 1);

const pastLabel = (g: number) => (g === 4 ? "100 years ago" : `${(g / 4) * 100}`);
const futureLabel = (g: number) => (g === 4 ? "100 years ahead" : `${(g / 4) * 100}`);

function describe(g: number, year: number | null) {
  if (g === 0) {
    return year ? `Now, ${year}` : "Now";
  }
  const n = Math.abs(g);
  const span = `${n} generation${n === 1 ? "" : "s"} (${n * 25} years)`;
  const when = year ? `, about ${g < 0 ? year - n * 25 : year + n * 25}` : "";
  return g < 0 ? `${span} ago${when}. Recorded past.` : `${span} ahead${when}. Open future.`;
}

const label = { fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.06em" } as const;
const caps = { fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.18em" } as const;

export default function TimeScale({ variant = "full" }: { variant?: "full" | "closing" }) {
  const closing = variant === "closing";
  const svgRef = useRef<SVGSVGElement | null>(null);
  const yearRef = useRef<number | null>(null);
  const [g, setG] = useState(0);
  const [range, setRange] = useState({ min: -40, max: 40 });
  const [active, setActive] = useState<"pointer" | "keyboard" | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);

  // Measures where "now" is and which generations are visible, then places
  // the cursor. Only ever called from an event, never during render.
  const measure = () => {
    const svg = svgRef.current;
    const host = svg?.parentElement?.parentElement;
    if (!svg || !host) {
      return null;
    }
    yearRef.current ??= new Date().getFullYear();
    const box = host.getBoundingClientRect();
    const nowX = svg.getBoundingClientRect().left + SPAN - box.left;
    const next = { min: -Math.floor((nowX - 24) / GEN), max: Math.floor((box.width - nowX - 24) / GEN) };
    setRange(next);
    return { box, nowX, ...next };
  };

  const goTo = (target: number, m = measure()) => {
    if (!m) {
      return;
    }
    const clamped = Math.max(m.min, Math.min(m.max, target));
    setG(clamped);
    setCursorX(m.nowX + clamped * GEN);
  };

  if (closing) {
    return (
      <div className="hv31-scale-wrap" data-variant="closing" aria-hidden="true">
        <div className="hv31-scale">
          <div className="hv31-scale-ruler">
            <svg viewBox={`${-SPAN} 0 ${SPAN * 2} 120`} focusable="false">
              {/* The plumb line from the closing statement to the open origin. */}
              <line x1={0} x2={0} y1={0} y2={LINE - 8} stroke="var(--tiro-mineral-line)" strokeWidth="1" strokeDasharray="3 4" />
              <line x1={8} x2={SPAN} y1={LINE} y2={LINE} stroke="var(--tiro-mineral-line)" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round" />
              {STEPS.map((s) => {
                const century = s % 4 === 0;
                return (
                  <g key={s}>
                    <circle cx={s * GEN} cy={LINE} r={century ? 3.4 : 1.9} fill="var(--hv31-bg, var(--tiro-bg))" stroke="var(--tiro-mineral-line)" strokeWidth="1" />
                    {century ? (
                      <text x={s * GEN} y={LINE + 24} textAnchor="middle" fill="var(--tiro-text-muted)" style={label}>
                        {futureLabel(s)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <circle cx={0} cy={LINE} r={7} fill="var(--hv31-bg, var(--tiro-bg))" stroke="var(--tiro-accent)" strokeWidth="1.5" strokeDasharray="1.5 3" />
              <text x={0} y={LINE + 24} textAnchor="middle" fill="var(--tiro-accent)" style={caps}>
                NEXT
              </text>
            </svg>
          </div>
        </div>
      </div>
    );
  }

  const text = describe(g, yearRef.current);

  return (
    <div className="hv31-scale-wrap" data-variant="full">
      <div
        className="hv31-scale"
        role="slider"
        tabIndex={0}
        aria-label="Time scale in generations of 25 years"
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={g}
        aria-valuetext={text}
        aria-describedby="hv31-scale-help"
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) {
            setActive("keyboard");
            goTo(g);
          }
        }}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -4, PageUp: 4 };
          const m = measure();
          if (!m) {
            return;
          }
          let target: number | null = null;
          if (e.key in step) target = g + step[e.key];
          else if (e.key === "Home") target = m.min;
          else if (e.key === "End") target = m.max;
          else if (e.key === "Escape" || e.key === "0") target = 0;
          if (target !== null) {
            e.preventDefault();
            setActive("keyboard");
            goTo(target, m);
          }
        }}
        onPointerMove={(e) => {
          const m = measure();
          if (m) {
            setActive("pointer");
            goTo(Math.round((e.clientX - m.box.left - m.nowX) / GEN), m);
          }
        }}
        onPointerDown={(e) => {
          const m = measure();
          if (m) {
            setActive("pointer");
            goTo(Math.round((e.clientX - m.box.left - m.nowX) / GEN), m);
          }
        }}
        onPointerLeave={() => setActive((a) => (a === "pointer" ? null : a))}
      >
        <div className="hv31-scale-ruler" aria-hidden="true">
          <svg ref={svgRef} viewBox={`${-SPAN} 0 ${SPAN * 2} 120`} focusable="false">
            {/* Recorded past: a solid rule, a tick for every generation. */}
            <g className="lt-fade-in" style={{ "--lt-delay": "150ms" } as React.CSSProperties}>
              <line x1={-SPAN} x2={0} y1={LINE} y2={LINE} stroke="var(--tiro-text-subtle)" strokeWidth="1" />
              {STEPS.map((s) => {
                const century = s % 4 === 0;
                const h = s % 40 === 0 ? 22 : century ? 14 : 6;
                return (
                  <g key={s}>
                    <line x1={-s * GEN} x2={-s * GEN} y1={LINE - h} y2={LINE} stroke={century ? "var(--tiro-text-subtle)" : "var(--tiro-mineral-line)"} strokeWidth="1" />
                    {century ? (
                      <text x={-s * GEN} y={LINE + 24} textAnchor="middle" fill="var(--tiro-text-muted)" style={label}>
                        {pastLabel(s)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={-16} y={LINE - 12} textAnchor="end" fill="var(--tiro-text-soft)" style={caps}>
                ← RECORDED
              </text>
            </g>

            {/* Open future: a dotted rule, a hollow station for every generation. */}
            <g className="lt-fade-in" style={{ "--lt-delay": "600ms" } as React.CSSProperties}>
              <line x1={0} x2={SPAN} y1={LINE} y2={LINE} stroke="var(--tiro-mineral-line)" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round" />
              {STEPS.map((s) => {
                const century = s % 4 === 0;
                return (
                  <g key={s}>
                    <circle cx={s * GEN} cy={LINE} r={century ? 3.4 : 1.9} fill="var(--hv31-bg, var(--tiro-bg))" stroke="var(--tiro-mineral-line)" strokeWidth="1" />
                    {century ? (
                      <text x={s * GEN} y={LINE + 24} textAnchor="middle" fill="var(--tiro-text-muted)" style={label}>
                        {futureLabel(s)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={16} y={LINE - 12} fill="var(--tiro-text-soft)" style={caps}>
                OPEN →
              </text>
            </g>

            {/* The present: a survey benchmark under the mark. */}
            <path d={`M-6,${LINE + 4} L6,${LINE + 4} L0,${LINE + 12} Z`} fill="var(--tiro-accent)" />
            <text x={0} y={LINE + 26} textAnchor="middle" fill="var(--tiro-accent)" style={caps}>
              NOW
            </text>
          </svg>
        </div>

        {active && cursorX !== null ? (
          <>
            <span className="hv31-scale-cursor" style={{ left: cursorX }} aria-hidden="true" />
            <span className="hv31-scale-readout" style={{ "--hv31-x": `${cursorX}px` } as React.CSSProperties} aria-hidden="true">
              {text}
            </span>
          </>
        ) : null}
      </div>

      <div className="hv31-scale-mark" aria-hidden="true">
        <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
      </div>

      <p id="hv31-scale-help" className="hv31-scale-help" data-shown={active === "keyboard"}>
        Arrow keys: one generation · Page Up/Down: one century · Esc: now
      </p>

      {/* Narrow screens: the reading sits under the scale, clear of the mark. */}
      <p className="hv31-scale-status" aria-hidden="true" data-shown={active !== null && cursorX !== null}>
        {text}
        {active === "keyboard" ? <span className="mt-1 block text-[var(--tiro-text-muted)]">Arrows: one generation · Page Up/Down: one century · Esc: now</span> : null}
      </p>
    </div>
  );
}
