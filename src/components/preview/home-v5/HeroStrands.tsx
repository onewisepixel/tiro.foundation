"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TiroMark from "@/components/TiroMark";

// The hero figure: memory arriving, held, and carried forward with its
// context. Strands come in from the left (memories, each from its own
// origin), pass through the approved mark (unaltered, unanimated) the way
// the mark itself describes transmission, and leave as three pathways that
// every record must keep: Source, Authority, Consent. The mark's resonance
// line continues below the figure and becomes the page's thread.
//
// The three terminals are buttons. Pointing or focusing lights a pathway;
// choosing one opens its definition, drawn from Community Rights & Cultural
// Data Stewardship. The strands are decorative (aria-hidden); the terms
// and their definitions are the accessible content. Record frames in the
// background are outlined structure, never imitation documents.
type Term = "source" | "authority" | "consent";

const W = 760;
const H = 860; // the resonance line runs on below the strands
const r2 = (n: number) => Math.round(n * 100) / 100;
const MW = 120; // mark width in figure units
const MX = 380 - (MW * 47) / 90; // resonance line on x = 380
const MY = 80;
const u = MW / 90;
const tri = { a: { x: MX + 20 * u, y: MY + 60 * u }, b: { x: MX + 70 * u, y: MY + 66 * u }, c: { x: MX + 47 * u, y: MY + 135 * u } };
const enter = (t: number) => ({ x: r2(tri.a.x + (tri.c.x - tri.a.x) * t), y: r2(tri.a.y + (tri.c.y - tri.a.y) * t) });
const leave = (t: number) => ({ x: r2(tri.b.x + (tri.c.x - tri.b.x) * t), y: r2(tri.b.y + (tri.c.y - tri.b.y) * t) });
const FOOT = MY + 182 * u;

const SOURCES = [
  { x: 70, y: 150, kind: "hollow" },
  { x: 40, y: 330, kind: "filled" },
  { x: 210, y: 262, kind: "dot" },
  { x: 120, y: 470, kind: "filled" },
  { x: 60, y: 600, kind: "hollow" },
] as const;
const INBOUND = [
  { from: 0, at: 0.15 },
  { from: 1, at: 0.4 },
  { from: 2, at: 0.3 },
  { from: 3, at: 0.6 },
  { from: 4, at: 0.82 },
];

const TERMS: { key: Term; label: string; x: number; y: number; at: [number, number]; definition: string }[] = [
  {
    key: "source",
    label: "Source",
    x: 600,
    y: 128,
    at: [0.12, 0.28],
    definition: "Every memory comes from a person or a community. A record names its source, as they choose to be named.",
  },
  {
    key: "authority",
    label: "Authority",
    x: 600,
    y: 336,
    at: [0.44, 0.58],
    definition: "Who holds cultural authority over a memory is recorded separately from whoever recorded, translated, or submitted it.",
  },
  {
    key: "consent",
    label: "Consent",
    x: 600,
    y: 548,
    at: [0.74, 0.9],
    definition: "Consent is explicit, scoped to specific uses, and revocable. Permission for one use does not imply permission for another.",
  },
];

const curveIn = (s: { x: number; y: number }, e: { x: number; y: number }) => `M${s.x},${s.y} C${s.x + 130},${s.y} ${e.x - 120},${e.y} ${e.x},${e.y}`;
const curveOut = (o: { x: number; y: number }, t: { x: number; y: number }) => `M${o.x},${o.y} C${o.x + 140},${o.y} ${t.x - 170},${t.y} ${t.x},${t.y}`;
// Plain multiplication and rounding, not **: Math.pow can differ in the last
// digit between the server and the browser, which breaks hydration.
const bez = (p: number[], t: number) => {
  const m = 1 - t;
  return r2(m * m * m * p[0] + 3 * m * m * t * p[1] + 3 * m * t * t * p[2] + t * t * t * p[3]);
};
const midIn = (s: { x: number; y: number }, e: { x: number; y: number }, t: number) => ({
  x: bez([s.x, s.x + 130, e.x - 120, e.x], t),
  y: bez([s.y, s.y, e.y, e.y], t),
});

export default function HeroStrands() {
  const [hover, setHover] = useState<Term | null>(null);
  const [open, setOpen] = useState<Term | null>(null);
  const lit = hover ?? open;
  const state = (k: Term) => (lit === null ? "rest" : lit === k ? "lit" : "dim");

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openTerm = TERMS.find((t) => t.key === open) ?? null;

  return (
    <div className="hv5-strands-wrap">
      {/* Terms and their definition come first in reading order; on wide
          screens they are placed over the figure, beside their terminals. */}
      <ul className="hv5-terms" aria-label="What every record keeps">
        {TERMS.map((t) => (
          <li key={t.key} style={{ "--tx": `${(t.x / W) * 100}%`, "--ty": `${(t.y / H) * 100}%` } as React.CSSProperties}>
            <button
              type="button"
              className="hv5-term"
              aria-expanded={open === t.key}
              aria-controls="hv5-term-definition"
              onClick={() => setOpen((o) => (o === t.key ? null : t.key))}
              onPointerEnter={() => setHover(t.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(t.key)}
              onBlur={() => setHover(null)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <div
        id="hv5-term-definition"
        className="hv5-definition"
        data-open={openTerm !== null}
        style={openTerm ? ({ "--ty": `${(openTerm.y / H) * 100}%` } as React.CSSProperties) : undefined}
        aria-live="polite"
      >
        {openTerm ? (
          <div key={openTerm.key} className="hv5-enter">
            <p className="lt-label text-[var(--tiro-accent)]">{openTerm.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-soft)]">{openTerm.definition}</p>
            <Link href="/community-rights" className="tiro-link mt-3 inline-block text-xs">
              Community Rights &amp; Cultural Data Stewardship
            </Link>
          </div>
        ) : null}
      </div>

      <div className="hv5-strands">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" data-lit={lit ?? "none"}>
        {/* Construction: verticals through two stations, record frames. */}
        <g className="lt-fade-in" style={{ "--lt-delay": "100ms" } as React.CSSProperties}>
          <line x1={150} x2={150} y1={120} y2={640} className="hv5-construct" />
          <line x1={540} x2={540} y1={60} y2={660} className="hv5-construct" />
          <g className="hv5-frame-rec">
            <rect x={92} y={304} width={112} height={168} />
            {[334, 356, 378, 400, 422].map((y) => (
              <line key={y} x1={106} x2={y === 422 ? 160 : 190} y1={y} y2={y} />
            ))}
            <rect x={500} y={84} width={96} height={150} />
            {[112, 132, 152, 172].map((y) => (
              <line key={y} x1={512} x2={y === 172 ? 548 : 584} y1={y} y2={y} />
            ))}
          </g>
          <path d="M470,30 C610,30 740,72 800,130" className="hv5-open" />
          <path d="M470,690 C620,660 720,640 800,612" className="hv5-open" />
          <path d="M-20,540 C40,520 70,560 120,620" className="hv5-open" />
          <circle cx={150} cy={210} r={4.5} className="hv5-node-hollow" />
          <circle cx={540} cy={420} r={4.5} className="hv5-node-hollow" />
          <circle cx={540} cy={290} r={2.6} className="hv5-node-dot" />
        </g>

        {/* Above the origin, the line has always been here. */}
        <line x1={MX + 45 * u} x2={MX + 45 * u} y1={0} y2={MY + 9 * u} className="hv5-above" />

        {/* Inbound: memories, each from its own origin. */}
        <g>
          {INBOUND.map((s, i) => {
            const src = SOURCES[s.from];
            const e = enter(s.at);
            const m = midIn(src, e, 0.55);
            return (
              <g key={i}>
                <path d={curveIn(src, e)} pathLength={1} className="hv5-strand-in lt-draw" style={{ "--lt-delay": `${200 + i * 120}ms` } as React.CSSProperties} />
                {i % 2 === 1 ? <circle cx={m.x} cy={m.y} r={2.6} className="hv5-node-dot lt-fade-in" style={{ "--lt-delay": "1200ms" } as React.CSSProperties} /> : null}
              </g>
            );
          })}
          {SOURCES.map((s, i) =>
            s.kind === "hollow" ? (
              <circle key={i} cx={s.x} cy={s.y} r={5.5} className="hv5-node-hollow" />
            ) : s.kind === "filled" ? (
              <circle key={i} cx={s.x} cy={s.y} r={4.5} className="hv5-node-filled" />
            ) : (
              <circle key={i} cx={s.x} cy={s.y} r={3} className="hv5-node-dot" />
            ),
          )}
        </g>

        {/* Outbound: the three pathways a record keeps. */}
        {TERMS.map((t, ti) => (
          <g key={t.key} className="hv5-pathway" data-state={state(t.key)}>
            {t.at.map((at, j) => (
              <path
                key={j}
                d={curveOut(leave(at), { x: t.x, y: t.y })}
                pathLength={1}
                className="hv5-strand-out lt-draw"
                style={{ "--lt-delay": `${900 + ti * 160 + j * 80}ms` } as React.CSSProperties}
              />
            ))}
            <circle cx={t.x} cy={t.y} r={5} className="hv5-node-filled" />
          </g>
        ))}

        {/* The resonance line continues below the figure, into the page. */}
        <line x1={380} x2={380} y1={FOOT} y2={H} className="hv5-resonance" />

        {/* The approved mark, unaltered. */}
        <foreignObject x={MX} y={MY} width={MW} height={(MW * 202) / 90}>
          <TiroMark variant="primary" className="block h-auto w-full text-[var(--tiro-mark)]" />
        </foreignObject>
      </svg>

      {/* Where the page's thread begins: the bottom of the resonance line. */}
      <span data-thread="start" className="hv5-thread-start" aria-hidden="true" />
      </div>
    </div>
  );
}
