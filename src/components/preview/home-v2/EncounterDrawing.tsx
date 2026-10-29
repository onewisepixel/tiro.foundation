"use client";

import { useEffect, useId, useRef } from "react";
import TiroMark from "@/components/TiroMark";

// Fig. 1 — the mark, extended to the ground.
//
// The approved mark is placed unaltered and is never animated
// (docs/design/art-direction.md, "The mark"). The drawing around it is
// honest abstraction: its construction lines are the mark's own triangle,
// its sides carried past the lower vertex down to a ground datum, and its
// resonance line continued to a station on that datum. The triangulation
// between stations is a surveyor's network, not a data graph: no line here
// stands for a relationship between records.
//
// Pointer response (fine pointers, motion allowed): the protractor arcs,
// centred on the mark's origin point, turn by at most 2 degrees, and the
// nearest survey station shows its bearing from the origin. With reduced
// motion or touch input the drawing is static and complete.
//
// Geometry in a 600 x 580 viewBox. The mark sits at 1.5x: left 229.5,
// top 36, so its origin is (297, 66), its triangle (259.5, 126),
// (334.5, 135), (300, 238.5), and its resonance line ends at (300, 309).

const O = { x: 297, y: 66 };
const V = { x: 300, y: 238.5 };
const R = { x: 300, y: 309 };
const GROUND = 560;

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: O.x + r * Math.sin(a), y: O.y + r * Math.cos(a) };
};

type Station = { id: string; x: number; y: number; ground?: boolean };

const ARC = 364;
const STATIONS: Station[] = [
  { id: "S1", x: 192.83, y: GROUND, ground: true },
  { id: "S2", x: 415.74, y: GROUND, ground: true },
  { id: "S3", x: 90, y: 105.66 },
  { id: "S4", x: 520, y: 157.26 },
  { id: "S5", ...polar(ARC, -32) },
  { id: "S6", ...polar(ARC, 32) },
  { id: "S7", x: 40, y: GROUND, ground: true },
  { id: "S8", x: 560, y: GROUND, ground: true },
  { id: "T", x: 300, y: 430 },
];

const at = (id: string) => STATIONS.find((s) => s.id === id)!;

const NETWORK: [string, string][] = [
  ["S3", "S5"],
  ["S4", "S6"],
  ["S5", "T"],
  ["T", "S6"],
  ["S5", "S1"],
  ["S6", "S2"],
  ["S5", "S7"],
  ["S7", "S1"],
  ["S6", "S8"],
  ["S8", "S2"],
  ["T", "S1"],
  ["T", "S2"],
];

function arcPath(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 0 0 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

const TICKS = Array.from({ length: 19 }, (_, i) => -36 + i * 4);

function bearing(s: Station) {
  const deg = (Math.atan2(s.x - O.x, -(s.y - O.y)) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

export default function EncounterDrawing() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    if (still.matches || !fine.matches) {
      return;
    }
    const region = root.closest("section") ?? root;
    const stations = Array.from(svg.querySelectorAll<SVGGElement>("[data-station]"));
    let frame = 0;
    let last: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      if (!last) {
        return;
      }
      const box = svg.getBoundingClientRect();
      const nx = (last.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
      root.style.setProperty("--hv2-turn", `${(Math.max(-1, Math.min(1, nx)) * -2).toFixed(3)}deg`);
      // Pointer in drawing units; the nearest station within reach answers.
      const px = ((last.clientX - box.left) / box.width) * 600;
      const py = ((last.clientY - box.top) / box.height) * 580;
      let nearest: string | null = null;
      let best = 70;
      for (const s of STATIONS) {
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < best) {
          best = d;
          nearest = s.id;
        }
      }
      for (const el of stations) {
        el.dataset.near = String(el.dataset.station === nearest);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      last = event;
      if (!frame) {
        frame = requestAnimationFrame(apply);
      }
    };
    const onLeave = () => {
      last = null;
      root.style.setProperty("--hv2-turn", "0deg");
      for (const el of stations) {
        el.dataset.near = "false";
      }
    };
    region.addEventListener("pointermove", onMove as EventListener, { passive: true });
    region.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      region.removeEventListener("pointermove", onMove as EventListener);
      region.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={rootRef} className="hv2-drawing" aria-hidden="true">
      <span className="hv2-ground" />
      <svg ref={svgRef} className="hv2-construction" viewBox="0 0 600 580" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tiro-mark)" />
            <stop offset="1" stopColor="var(--tiro-mineral-line)" />
          </linearGradient>
        </defs>

        {/* Protractor arcs, centred on the mark's origin. */}
        <g className="hv2-protractor lt-fade-in" style={{ "--lt-delay": "300ms" } as React.CSSProperties}>
          <path d={arcPath(ARC, -36, 36)} fill="none" stroke="var(--hv2-hair)" strokeWidth="1" strokeDasharray="2 5" />
          <path d={arcPath(494, -24, 24)} fill="none" stroke="var(--hv2-faint)" strokeWidth="1" />
          {TICKS.map((deg) => {
            const major = deg % 12 === 0;
            const a = polar(ARC, deg);
            const b = polar(ARC + (major ? 11 : 6), deg);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--hv2-hair)" strokeWidth="1" />;
          })}
        </g>

        {/* Construction: the mark's triangle carried outward. Dashed, so it
            reads as a drafting aid and never as the mark itself. */}
        <g className="lt-fade-in" style={{ "--lt-delay": "150ms" } as React.CSSProperties} stroke="var(--hv2-hair)" strokeWidth="1" strokeDasharray="4 6" fill="none">
          <line x1={V.x} y1={V.y} x2={192.83} y2={GROUND} />
          <line x1={V.x} y1={V.y} x2={415.74} y2={GROUND} />
          <line x1={40} y1={99.66} x2={252} y2={125.1} />
          <line x1={342} y1={135.9} x2={560} y2={162.06} />
        </g>

        {/* Triangulation between stations. */}
        <g fill="none" stroke="var(--hv2-faint)" strokeWidth="1">
          {NETWORK.map(([a, b], i) => {
            const p = at(a);
            const q = at(b);
            return (
              <path
                key={`${a}-${b}`}
                d={`M${p.x},${p.y} L${q.x},${q.y}`}
                pathLength={1}
                className="lt-draw"
                style={{ "--lt-delay": `${700 + i * 90}ms` } as React.CSSProperties}
              />
            );
          })}
        </g>

        {/* The resonance line, continued to the ground. */}
        <path
          d={`M${R.x},${R.y} L${R.x},${GROUND}`}
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          pathLength={1}
          className="lt-draw"
          style={{ "--lt-delay": "400ms" } as React.CSSProperties}
        />

        {/* Survey stations. */}
        {STATIONS.map((s, i) => (
          <g
            key={s.id}
            data-station={s.id}
            data-near="false"
            className="hv2-station lt-fade-in"
            style={{ "--lt-delay": `${900 + i * 80}ms` } as React.CSSProperties}
          >
            <circle className="hv2-station-ring" cx={s.x} cy={s.y} r={s.ground ? 4 : 4.5} fill="var(--tiro-bg)" stroke="var(--tiro-mineral-line)" strokeWidth="1.25" />
            <circle className="hv2-station-dot" cx={s.x} cy={s.y} r="1.3" fill="var(--tiro-mineral-line)" />
            <text
              className="hv2-station-label"
              x={s.x + (s.x > 470 ? -10 : 10)}
              y={s.y - 10}
              textAnchor={s.x > 470 ? "end" : "start"}
              fill="var(--tiro-text-muted)"
              style={{ fontFamily: "var(--font-code)", fontSize: 12, letterSpacing: "0.08em" }}
            >
              {s.id} · {String(bearing(s)).padStart(3, "0")}°
            </text>
          </g>
        ))}

        {/* Ground origin: where the resonance line meets the datum. */}
        <g className="lt-fade-in" style={{ "--lt-delay": "1300ms" } as React.CSSProperties}>
          <circle cx={R.x} cy={GROUND} r="8" fill="var(--tiro-bg)" stroke="var(--tiro-mark)" strokeWidth="1.6" />
          <circle cx={R.x} cy={GROUND} r="2.6" fill="var(--tiro-mark)" />
        </g>
      </svg>

      <div className="hv2-mark">
        <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
      </div>

      <p className="lt-label lt-fade-in absolute left-0 top-0 !text-[10px] md:!text-[11px]" style={{ "--lt-delay": "1100ms" } as React.CSSProperties}>
        Fig. 1 · The mark, extended
      </p>
      <p
        className="lt-label lt-fade-in absolute left-0 top-[1.35rem] md:top-[1.5rem] !text-[10px] md:!text-[11px]"
        style={{ "--lt-delay": "1200ms" } as React.CSSProperties}
      >
        Abstraction · no records shown
      </p>
    </div>
  );
}
