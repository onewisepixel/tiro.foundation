"use client";

import { useRef, useState } from "react";
import TiroMark from "@/components/TiroMark";
import { PLACES, type Place } from "./places";

// Fig. 1 — a section through an imagined site.
//
// A speculative architectural drawing, not a building plan and not an
// image of any real place. It translates ideas from TIRO's site studies
// into the page's survey vocabulary, and walks the six movements as six
// places, inland to open water:
//
//   01 Canopy          Encounter    one shelter, many supports
//   02 Terraces        Witness      one voice, many listeners
//   03 Raised archive  Preserve     held above the high-water line
//   04 Boardwalks      Discover     paths that connect without merging
//   05 Closed room     Respect      a room with no public door
//   06 Pier's end      Participate  where the next record begins
//
// The ground line is the generational scale from v3.1. Each terrace step
// is one generation (25 years): the recorded past is seated as the
// audience. The approved mark, unaltered, stands on the stage at now.
// Beyond the shore the line becomes open water, with a pile or buoy every
// generation. The whole drawing is a keyboard-operable slider over the
// generations drawn on screen; the key below it is the accessible way to
// the places.
//
// Nothing date-dependent is rendered on the server: the calendar year is
// read only when someone interacts.

const W = 2400;
const H = 640;
const D = 500; // datum: the stage, the shore, the water surface
const NOW = 1300;
const GEN = 40; // one generation, in drawing units
const STEPS = 12; // terraces, one generation each
const RISE = 10;
const PLATEAU = D - STEPS * RISE;
const SHORE = 1440;
const FUTURE_END = 2300;
const MARK_W = 90; // the mark's width in drawing units

type Pt = { x: number; y: number };
const quad = (t: number, a: Pt, b: Pt, c: Pt): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * b.x + t ** 2 * c.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * b.y + t ** 2 * c.y,
});

// ---- The canopy: one shell carried by a branching frame and slender
// outer columns. Branches are derived from points on the shell's
// underside, joined pairwise down to a single trunk.
const UNDER: [Pt, Pt, Pt] = [{ x: 230, y: 195 }, { x: 420, y: 135 }, { x: 610, y: 195 }];
const UPPER: [Pt, Pt, Pt] = [{ x: 215, y: 192 }, { x: 420, y: 75 }, { x: 625, y: 192 }];
const CANOPY = (() => {
  const tips = Array.from({ length: 8 }, (_, i) => quad(0.07 + (i * 0.86) / 7, ...UNDER));
  const join = (pts: Pt[], drop: number) =>
    Array.from({ length: pts.length / 2 }, (_, i) => ({
      x: (pts[2 * i].x + pts[2 * i + 1].x) / 2,
      y: Math.max(pts[2 * i].y, pts[2 * i + 1].y) + drop,
    }));
  const l2 = join(tips, 45);
  const l1 = join(l2, 45);
  const top = { x: (l1[0].x + l1[1].x) / 2, y: Math.max(l1[0].y, l1[1].y) + 40 };
  const segs: [Pt, Pt][] = [];
  tips.forEach((p, i) => segs.push([l2[Math.floor(i / 2)], p]));
  l2.forEach((p, i) => segs.push([l1[Math.floor(i / 2)], p]));
  l1.forEach((p) => segs.push([top, p]));
  const ribs = Array.from({ length: 13 }, (_, i) => [quad(i / 12, ...UNDER), quad(i / 12, ...UPPER)] as [Pt, Pt]);
  return { segs, top, ribs };
})();

// ---- Ground: plateau, twelve terraces down to the stage (with its pool),
// the shore, then the seabed under open water.
const GROUND = (() => {
  let d = `M0,${PLATEAU} H${NOW - GEN * (STEPS - 1)}`;
  for (let k = STEPS - 1; k >= 1; k--) {
    d += ` V${D - RISE * k} H${NOW - GEN * (k - 1)}`;
  }
  d += ` V${D} H1322 V512 H1378 V${D} H${SHORE} C1480,${D} 1490,535 1560,548 S1900,575 ${W},585`;
  return d;
})();

const pastLabel = (g: number) => (g === 4 ? "100 years ago" : `${(g / 4) * 100}`);
const futureLabel = (g: number) => (g === 4 ? "100 years ahead" : `${(g / 4) * 100}`);
const PAST = Array.from({ length: Math.floor((NOW - 20) / GEN) }, (_, i) => i + 1);
const FUTURE = Array.from({ length: Math.floor((FUTURE_END - NOW) / GEN) }, (_, i) => i + 1);



function describe(g: number, year: number | null) {
  if (g === 0) {
    return year ? `Now, ${year}. The stage.` : "Now. The stage.";
  }
  const n = Math.abs(g);
  const span = `${n} generation${n === 1 ? "" : "s"} (${n * 25} years)`;
  const when = year ? `, about ${g < 0 ? year - n * 25 : year + n * 25}` : "";
  if (g < 0) {
    return `${span} ago${when}. ${n <= STEPS ? `Terrace ${n}, recorded.` : "Recorded ground."}`;
  }
  return `${span} ahead${when}. Open water.`;
}

const surfaceAt = (g: number) => (g < 0 ? (-g <= STEPS ? D - RISE * -g : PLATEAU) : D);

function Callout({ p, hot }: { p: Place; hot: boolean }) {
  return (
    <g className="hv4-callout" data-hot={hot}>
      <line x1={p.x} x2={p.x} y1={p.y + 22} y2={p.to} stroke="var(--tiro-text-subtle)" strokeWidth="1" />
      <circle className="hv4-callout-ring" cx={p.x} cy={p.y} r={22} />
      <text className="hv4-callout-num" x={p.x} y={p.y + 7} textAnchor="middle">
        {String(p.n).padStart(2, "0")}
      </text>
      <text className="hv4-callout-label" x={p.left ? p.x - 34 : p.x + 34} y={p.y + 7} textAnchor={p.left ? "end" : "start"}>
        {p.name.toUpperCase()}
      </text>
    </g>
  );
}

export default function SiteSection() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [g, setG] = useState(0);
  const [range, setRange] = useState({ min: -STEPS, max: 10 });
  const [active, setActive] = useState<"pointer" | "keyboard" | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number } | null>(null);
  // Hover and keyboard focus are tracked apart, so a pointer resting over
  // the key cannot clear the highlight a keyboard user just moved to.
  const [hoverN, setHoverN] = useState<number | null>(null);
  const [focusN, setFocusN] = useState<number | null>(null);
  const hot = focusN ?? hoverN;

  // Maps drawing units to the wrapper's pixels and finds which generations
  // are on screen. Only ever called from events, never during render.
  const measure = () => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !wrap || !ctm) {
      return null;
    }
    if (year === null) {
      setYear(new Date().getFullYear());
    }
    const box = wrap.getBoundingClientRect();
    const uLeft = Math.max(20, (box.left - ctm.e) / ctm.a);
    const uRight = Math.min(FUTURE_END, (box.right - ctm.e) / ctm.a);
    const next = { min: -Math.floor((NOW - uLeft) / GEN - 0.5), max: Math.floor((uRight - NOW) / GEN - 0.5) };
    setRange(next);
    const toPx = (u: Pt) => ({ x: ctm.a * u.x + ctm.e - box.left, y: ctm.d * u.y + ctm.f - box.top });
    return { ctm, box, toPx, ...next };
  };

  const goTo = (target: number, m = measure()) => {
    if (!m) {
      return;
    }
    const v = Math.max(m.min, Math.min(m.max, target));
    setG(v);
    setReadout(m.toPx({ x: NOW + v * GEN, y: H }));
  };

  const fromPointer = (clientX: number) => {
    const m = measure();
    if (m) {
      setActive("pointer");
      goTo(Math.round(((clientX - m.ctm.e) / m.ctm.a - NOW) / GEN), m);
    }
  };

  const text = describe(g, year);
  const showing = active !== null && readout !== null;
  const cx = NOW + g * GEN;

  return (
    <div>
      <div
        ref={wrapRef}
        className="hv4-site"
        role="slider"
        tabIndex={0}
        aria-label="Fig. 1, a section through an imagined site, read as a time scale in generations of 25 years"
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={g}
        aria-valuetext={text}
        aria-describedby="hv4-site-desc hv4-site-help"
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
        onPointerMove={(e) => fromPointer(e.clientX)}
        onPointerDown={(e) => fromPointer(e.clientX)}
        onPointerLeave={() => setActive((a) => (a === "pointer" ? null : a))}
      >
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
          {/* Water, then the ground in section (poché) over it. */}
          <rect x={SHORE} y={D} width={W - SHORE} height={H - D} fill="color-mix(in srgb, var(--tiro-mineral-line) 9%, transparent)" />
          <rect x={1322} y={D} width={56} height={12} fill="color-mix(in srgb, var(--tiro-mineral-line) 22%, transparent)" />

          {/* Piles: under the raised archive and the boardwalk, one per generation. */}
          <g stroke="var(--tiro-mineral-line)" strokeWidth="1.5">
            {[5, 6, 7, 8].map((k) => (
              <line key={`a${k}`} x1={NOW + k * GEN} x2={NOW + k * GEN} y1={450} y2={620} />
            ))}
            {Array.from({ length: 14 }, (_, i) => i + 10).map((k) => (
              <line key={`b${k}`} x1={NOW + k * GEN} x2={NOW + k * GEN} y1={476} y2={620} />
            ))}
          </g>

          <path d={`${GROUND} V${H} H0 Z`} fill="var(--hv4-poche)" />
          <g stroke="var(--hv4-faint)" strokeWidth="1" strokeDasharray="6 10" fill="none">
            <path d="M0,560 C400,552 900,568 1650,560" />
            <path d="M0,606 C500,614 1400,598 2400,608" />
          </g>
          <path d={GROUND} fill="none" stroke="var(--tiro-text-subtle)" strokeWidth="1.5" strokeLinejoin="round" />

          {/* Terrace treads: one generation each, lit by the reading. */}
          {Array.from({ length: STEPS }, (_, i) => i + 1).map((k) => (
            <line
              key={`t${k}`}
              className="hv4-tread"
              data-lit={g === -k}
              x1={NOW - GEN * k}
              x2={NOW - GEN * k + GEN}
              y1={D - RISE * k}
              y2={D - RISE * k}
            />
          ))}

          {/* Forest edge, inland. */}
          <g className="lt-fade-in" stroke="var(--hv4-faint)" strokeWidth="1.25" fill="none" style={{ "--lt-delay": "100ms" } as React.CSSProperties}>
            <line x1={52} x2={52} y1={PLATEAU} y2={322} />
            <circle cx={52} cy={292} r={34} />
            <line x1={140} x2={140} y1={PLATEAU} y2={300} />
            <circle cx={140} cy={262} r={44} />
          </g>

          {/* 01 The canopy. */}
          <g className="lt-fade-in" fill="none" style={{ "--lt-delay": "200ms" } as React.CSSProperties}>
            <path d={`M${UPPER[0].x},${UPPER[0].y} Q${UPPER[1].x},${UPPER[1].y} ${UPPER[2].x},${UPPER[2].y}`} stroke="var(--tiro-text-subtle)" strokeWidth="1.5" />
            <path d={`M${UNDER[0].x},${UNDER[0].y} Q${UNDER[1].x},${UNDER[1].y} ${UNDER[2].x},${UNDER[2].y}`} stroke="var(--tiro-text-subtle)" strokeWidth="1.25" />
            {CANOPY.ribs.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--hv4-faint)" strokeWidth="1" />
            ))}
            <g stroke="var(--tiro-mineral-line)" strokeLinecap="round">
              <line x1={CANOPY.top.x} y1={PLATEAU} x2={CANOPY.top.x} y2={CANOPY.top.y} strokeWidth="3" />
              {CANOPY.segs.map(([a, b], i) => (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={i >= 12 ? 2.25 : i >= 8 ? 1.75 : 1.25} />
              ))}
              <line x1={248} y1={PLATEAU} x2={248} y2={quad(0.04, ...UNDER).y} strokeWidth="1.25" />
              <line x1={592} y1={PLATEAU} x2={592} y2={quad(0.96, ...UNDER).y} strokeWidth="1.25" />
            </g>
          </g>

          {/* 03 The raised archive: a ribbed dome on a deck above high water. */}
          <g className="lt-fade-in" fill="none" style={{ "--lt-delay": "350ms" } as React.CSSProperties}>
            <line x1={1480} x2={1660} y1={450} y2={450} stroke="var(--tiro-text-subtle)" strokeWidth="2" />
            <path d="M1502,450 A68,68 0 0 1 1638,450" stroke="var(--tiro-text-subtle)" strokeWidth="1.5" fill="var(--hv4-bg)" />
            <g stroke="var(--hv4-faint)" strokeWidth="1">
              {[30, 60].map((deg) => {
                const rx = 68 * Math.sin((deg * Math.PI) / 180);
                return (
                  <g key={deg}>
                    <path d={`M${1570 - rx},450 A${rx},68 0 0 1 1570,382`} />
                    <path d={`M${1570 + rx},450 A${rx},68 0 0 0 1570,382`} />
                  </g>
                );
              })}
              {[25, 52].map((deg) => {
                const a = (deg * Math.PI) / 180;
                const y = 450 - 68 * Math.sin(a);
                const half = 68 * Math.cos(a);
                return <line key={deg} x1={1570 - half} x2={1570 + half} y1={y} y2={y} />;
              })}
            </g>
            {/* High-water mark. */}
            <line x1={1450} x2={1690} y1={480} y2={480} stroke="var(--tiro-mineral-line)" strokeWidth="1" strokeDasharray="8 6" />
            <path d="M1676,472 L1690,472 L1683,480 Z" fill="var(--tiro-mineral-line)" />
          </g>

          {/* 04 Boardwalks, 05 the closed room, 06 the pier's end. */}
          <g className="lt-fade-in" fill="none" style={{ "--lt-delay": "450ms" } as React.CSSProperties}>
            <path d="M1660,450 V470 H2230" stroke="var(--tiro-text-subtle)" strokeWidth="2" />
            <line x1={1660} x2={2230} y1={476} y2={476} stroke="var(--tiro-text-subtle)" strokeWidth="1" />
            <line x1={1700} x2={2220} y1={452} y2={452} stroke="var(--hv4-faint)" strokeWidth="1" />
            {Array.from({ length: 14 }, (_, i) => 1700 + i * GEN).map((x) => (
              <line key={x} x1={x} x2={x} y1={452} y2={470} stroke="var(--hv4-faint)" strokeWidth="1" />
            ))}
            <rect x={1980} y={404} width={90} height={66} fill="var(--hv4-bg)" stroke="var(--tiro-text-subtle)" strokeWidth="1.5" />
            <rect x={1985} y={409} width={80} height={61} stroke="var(--tiro-text-subtle)" strokeWidth="1" />
            <line x1={1972} x2={2078} y1={400} y2={400} stroke="var(--tiro-text-subtle)" strokeWidth="2" />
            <circle cx={2250} cy={470} r={9} fill="var(--hv4-bg)" stroke="var(--tiro-accent)" strokeWidth="1.75" strokeDasharray="2 3.5" />
            <path d="M2322,500 A28,28 0 0 1 2378,500" stroke="var(--tiro-accent)" strokeWidth="1.5" opacity="0.75" />
          </g>

          {/* The scale: recorded past, open future. */}
          <g className="lt-fade-in" style={{ "--lt-delay": "250ms" } as React.CSSProperties}>
            <line x1={0} x2={NOW} y1={D} y2={D} stroke="var(--tiro-text-subtle)" strokeWidth="1" strokeDasharray="10 6" />
            {PAST.map((k) => {
              const century = k % 4 === 0;
              const h = k % 40 === 0 ? 24 : century ? 16 : 8;
              return (
                <g key={`p${k}`}>
                  <line x1={NOW - k * GEN} x2={NOW - k * GEN} y1={D} y2={D + h} stroke={century ? "var(--tiro-text-subtle)" : "var(--tiro-mineral-line)"} strokeWidth="1" />
                  {century ? (
                    <>
                      <text className="hv4-scale-label hv4-long" x={NOW - k * GEN} y={D + 40} textAnchor="middle">
                        {pastLabel(k)}
                      </text>
                      <text className="hv4-scale-label hv4-short" x={NOW - k * GEN} y={D + 44} textAnchor="middle">
                        −{(k / 4) * 100}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
            <line x1={NOW} x2={FUTURE_END} y1={D} y2={D} stroke="var(--tiro-mineral-line)" strokeWidth="1.25" strokeDasharray="1.5 7" strokeLinecap="round" />
            {FUTURE.map((k) => {
              const century = k % 4 === 0;
              return (
                <g key={`f${k}`}>
                  <circle cx={NOW + k * GEN} cy={D} r={century ? 6 : 3.5} fill="var(--hv4-bg)" stroke="var(--tiro-mineral-line)" strokeWidth="1.25" />
                  {century ? (
                    <>
                      <text className="hv4-scale-label hv4-long" x={NOW + k * GEN} y={D + 40} textAnchor="middle">
                        {futureLabel(k)}
                      </text>
                      <text className="hv4-scale-label hv4-short" x={NOW + k * GEN} y={D + 44} textAnchor="middle">
                        +{(k / 4) * 100}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
            <path d={`M${NOW - 8},${D + 5} L${NOW + 8},${D + 5} L${NOW},${D + 16} Z`} fill="var(--tiro-accent)" />
            <text className="hv4-scale-caps" x={NOW - 16} y={D + 76} textAnchor="end" fill="var(--tiro-text-soft)">
              ← RECORDED
            </text>
            <text className="hv4-scale-caps" x={NOW + 16} y={D + 76} fill="var(--tiro-text-soft)">
              OPEN →
            </text>
            <text className="hv4-scale-caps" x={NOW} y={D + 108} textAnchor="middle" fill="var(--tiro-accent)">
              NOW
            </text>
          </g>

          {/* The mark, unaltered, standing on the stage at now. */}
          <foreignObject x={NOW - MARK_W * 47 / 90} y={D - MARK_W * 182 / 90} width={MARK_W} height={MARK_W * 202 / 90}>
            <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
          </foreignObject>

          {PLACES.map((p) => (
            <Callout key={p.n} p={p} hot={hot === p.n} />
          ))}

          {showing ? (
            <line x1={cx} x2={cx} y1={surfaceAt(g) - 100} y2={D + 26} stroke="var(--tiro-accent)" strokeWidth="1.5" />
          ) : null}
        </svg>

        {showing ? (
          <span className="hv4-site-readout" style={{ "--hv4-x": `${readout.x}px`, "--hv4-y": `${readout.y}px` } as React.CSSProperties} aria-hidden="true">
            {text}
            {active === "keyboard" ? <span className="mt-1 block text-[var(--tiro-text-muted)]">Arrows: one generation · Page Up/Down: one century · Esc: now</span> : null}
          </span>
        ) : null}
      </div>

      <p className="hv4-site-status" aria-hidden="true" data-shown={showing}>
        {text}
        {active === "keyboard" ? <span className="mt-1 block text-[var(--tiro-text-muted)]">Arrows: one generation · Page Up/Down: one century · Esc: now</span> : null}
      </p>
      <p id="hv4-site-help" className="hv4-site-help" data-shown={active === "keyboard"}>
        Arrow keys: one generation · Page Up/Down: one century · Esc: now
      </p>
      <p id="hv4-site-desc" className="sr-only">
        A speculative drawing, not a building plan. From high ground inland, a canopy on many supports; twelve terraces stepping down, one per
        generation, to a stage where the TIRO mark stands at the present; a raised archive above the high-water line; boardwalks over open water
        to a closed room and a pier&apos;s end.
      </p>

      <div className="hv4-frame">
        <p className="hv4-fig">
          <span className="text-[var(--tiro-accent)]">Fig. 1</span> · Section through an imagined site · Speculative, not a building plan
        </p>
        <ol className="hv4-key" aria-label="Places in the drawing, one for each movement">
          {PLACES.map((p) => {
            const body = (
              <>
                <span className="hv4-key-num" aria-hidden="true">
                  {String(p.n).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-[var(--tiro-text)]">
                    {p.name} <span className="text-[var(--tiro-text-muted)]">· {p.movement}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--tiro-text-muted)]">{p.href ? p.gloss : `${p.gloss} You are here.`}</span>
                </span>
              </>
            );
            return (
              <li key={p.n} onMouseEnter={() => setHoverN(p.n)} onMouseLeave={() => setHoverN(null)}>
                {p.href ? (
                  <a href={p.href} className="hv4-key-item" onFocus={() => setFocusN(p.n)} onBlur={() => setFocusN(null)}>
                    {body}
                  </a>
                ) : (
                  <span className="hv4-key-item">{body}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
