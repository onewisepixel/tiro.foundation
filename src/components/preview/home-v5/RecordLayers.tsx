"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { USE_CATEGORIES, USE_GRANT_LABEL, type EvidenceState, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";
import EvidenceTag from "@/components/trace/EvidenceTag";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// The record, in exploded view. One synthetic specimen drawn as a stack of
// sheets that separate into its layers: what a visitor reads (the account)
// resting on what makes it trustworthy (source, authority, terms of care,
// provenance). A gold thread runs through every layer: they are one record.
//
// The drawing is decorative; the layer list is a real tablist (arrow keys
// move between layers) and its panel holds the same information as text.
// The sheets separate once, when the section is reached; with reduced
// motion they are simply drawn apart. Every value is the projected fixture's.
export type LayerData = {
  recordId: string;
  href: string;
  title: string;
  summary: string;
  source: { label: string; note: string };
  authority: { capacity: string; value: string; evidence: EvidenceState }[];
  uses: Record<UseCategory, UseGrant>;
  withdrawal: string;
  provenance: { at: string; event: string; actor: string; evidence: EvidenceState }[];
};

const LAYERS = [
  { key: "account", label: "Account", hint: "What it says" },
  { key: "source", label: "Source", hint: "Who shared it" },
  { key: "authority", label: "Authority", hint: "Who decides" },
  { key: "terms", label: "Terms of care", hint: "What is permitted" },
  { key: "provenance", label: "Provenance", hint: "How it came to be held" },
] as const;

type LayerKey = (typeof LAYERS)[number]["key"];

// Sheet geometry (viewBox 560 x 500): isometric planes, top to bottom.
const CX = 200;
const RX = 170;
const RY = 58;
const Y0 = 66;
const GAP = 86;
const MID = Y0 + GAP * 2;

const sheetPath = (cy: number) => `M${CX - RX},${cy} L${CX},${cy - RY} L${CX + RX},${cy} L${CX},${cy + RY} Z`;

export default function RecordLayers({ data }: { data: LayerData }) {
  const [active, setActive] = useState<LayerKey>("account");
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  // "#record-source", "#record-terms" … from links elsewhere on the page
  // open the matching layer.
  useEffect(() => {
    const fromHash = () => {
      const key = window.location.hash.replace("#record-", "");
      if (LAYERS.some((l) => l.key === key)) {
        setActive(key as LayerKey);
        document.getElementById("record")?.scrollIntoView({ block: "start" });
      }
    };
    const frame = requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? LAYERS.length - 1 : null;
    if (!delta && jump === null) {
      return;
    }
    e.preventDefault();
    const next = LAYERS[jump ?? (i + delta + LAYERS.length) % LAYERS.length].key;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="hv5-layers">
      <div className="hv5-layers-figure" aria-hidden="true">
        <svg viewBox="0 0 560 500" focusable="false">
          {/* The thread through every layer. */}
          <line x1={CX} x2={CX} y1={Y0 - RY - 18} y2={Y0 + GAP * 4 + RY + 18} stroke="var(--tiro-accent)" strokeWidth="1.25" />
          {LAYERS.map((l, i) => {
            const cy = Y0 + GAP * i;
            const on = active === l.key;
            return (
              <g
                key={l.key}
                className="hv5-sheet"
                style={{ "--hv5-collapse": `${(MID - cy) * 0.86}px`, "--lt-delay": `${120 + i * 90}ms` } as React.CSSProperties}
                onClick={() => setActive(l.key)}
              >
                <g className="hv5-sheet-lift" data-on={on}>
                  <path d={sheetPath(cy)} className="hv5-sheet-plane" />
                  <line x1={CX - 112} y1={cy - 10} x2={CX - 40} y2={cy + 14.5} className="hv5-sheet-field" />
                  <line x1={CX - 76} y1={cy - 24} x2={CX + 6} y2={cy + 4} className="hv5-sheet-field" />
                  <line x1={CX - 30} y1={cy - 40} x2={CX + 42} y2={cy - 15.5} className="hv5-sheet-field" />
                  {l.key === "source" ? (
                    <>
                      <circle cx={CX} cy={cy} r={8} fill="var(--tiro-raised)" stroke="var(--tiro-accent)" strokeWidth="1.6" />
                      <circle cx={CX} cy={cy} r={2.6} fill="var(--tiro-accent)" />
                    </>
                  ) : (
                    <circle cx={CX} cy={cy} r={3.5} fill="var(--tiro-accent)" />
                  )}
                  <line x1={CX + RX + 8} x2={CX + RX + 34} y1={cy} y2={cy} className="hv5-sheet-leader" />
                  <text x={CX + RX + 42} y={cy + 4} className="hv5-sheet-label">
                    {l.label.toUpperCase()}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SyntheticPill />
          <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{data.recordId}</span>
        </div>

        <div role="tablist" aria-label="Layers of the record" aria-orientation="vertical" className="hv5-layer-tabs">
          {LAYERS.map((l, i) => (
            <button
              key={l.key}
              id={`record-${l.key}`}
              ref={(el) => {
                tabs.current[l.key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active === l.key}
              aria-controls="hv5-layer-panel"
              tabIndex={active === l.key ? 0 : -1}
              className="hv5-layer-tab"
              onClick={() => setActive(l.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
              <span className="text-[var(--tiro-text)]">{l.label}</span>
              <span className="hidden text-sm text-[var(--tiro-text-muted)] sm:inline">{l.hint}</span>
            </button>
          ))}
        </div>

        <div id="hv5-layer-panel" role="tabpanel" aria-labelledby={`record-${active}`} className="hv5-layer-panel">
          <div key={active} className="hv5-enter">
            {active === "account" ? (
              <>
                <p className="lt-display text-2xl leading-snug md:text-[1.75rem]">{data.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{data.summary}</p>
              </>
            ) : null}
            {active === "source" ? (
              <>
                <p className="lt-display text-2xl leading-snug">{data.source.label}</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-lg italic leading-relaxed text-[var(--tiro-text-soft)]">{data.source.note}</p>
              </>
            ) : null}
            {active === "authority" ? (
              <dl className="grid gap-4">
                {data.authority.map((a) => (
                  <div key={a.capacity}>
                    <dt className="lt-label">{a.capacity}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                      {a.value} <EvidenceTag evidence={a.evidence} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {active === "terms" ? (
              <>
                <ul className="grid gap-x-6 sm:grid-cols-2">
                  {USE_CATEGORIES.map((use) => (
                    <li key={use.key} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--tiro-border)] py-1.5 text-sm">
                      <span className="text-[var(--tiro-text-muted)]">{use.label}</span>
                      <span className="shrink-0 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text)]">{USE_GRANT_LABEL[data.uses[use.key]]}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                  <span className="lt-label !text-[10px]">Withdrawal</span> {data.withdrawal}
                </p>
              </>
            ) : null}
            {active === "provenance" ? (
              <ol className="grid gap-3">
                {data.provenance.map((p, i) => (
                  <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-dashed border-[var(--tiro-border)] pb-3 text-sm">
                    <span className="font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">{p.at}</span>
                    <span className="text-[var(--tiro-text-soft)]">
                      {p.event}
                      <span className="mt-1 block">
                        <EvidenceTag evidence={p.evidence} />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>

        <Link href={data.href} className="tiro-link mt-5 inline-block text-sm">
          Open the full specimen record
        </Link>
      </div>
    </div>
  );
}
