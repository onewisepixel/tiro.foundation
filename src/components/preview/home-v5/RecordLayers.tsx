"use client";

import Link from "next/link";
import { useEffect } from "react";
import LayerStack from "@/components/archive/LayerStack";
import { RECORD_LAYERS } from "@/components/archive/layers";
import { useLayerTabs } from "@/components/archive/useLayerTabs";
import { USE_CATEGORIES, USE_GRANT_LABEL, type EvidenceState, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";
import EvidenceTag from "@/components/trace/EvidenceTag";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// The record, in exploded view. One synthetic specimen drawn as a stack of
// sheets that separate into its layers: what a visitor reads (the account)
// resting on what makes it trustworthy (source, authority, terms of care,
// provenance). A gold thread runs through every layer: they are one record.
//
// The drawing is the Living Archive's LayerStack, here without the Derived
// sheet: the homepage shows the record itself. It is decorative; the layer
// list is a real tablist (arrow keys move between layers) and its panel
// holds the same information as text, read from this specimen. Every value
// is the projected fixture's.
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

// Each layer's name (layers.ts), with the homepage's short gloss.
const HINTS = { account: "What it says", source: "Who shared it", authority: "Who decides", terms: "What is permitted", provenance: "How it came to be held" } as const;
type RecordKey = keyof typeof HINTS; // the record's own five: no Derived here
const LAYERS = RECORD_LAYERS.map((l) => ({ key: l.key as RecordKey, label: l.label, hint: HINTS[l.key as RecordKey] }));
const KEYS = LAYERS.map((l) => l.key);

export default function RecordLayers({ data }: { data: LayerData }) {
  const { active, setActive, tabProps } = useLayerTabs<RecordKey>(KEYS, "account");

  // "#record-source", "#record-terms" … from links elsewhere on the page
  // open the matching layer.
  useEffect(() => {
    const fromHash = () => {
      const key = window.location.hash.replace("#record-", "");
      if (LAYERS.some((l) => l.key === key)) {
        setActive(key as RecordKey);
        document.getElementById("record")?.scrollIntoView({ block: "start" });
      }
    };
    const frame = requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [setActive]);

  return (
    <div className="hv5-layers">
      <div className="hv5-layers-figure" aria-hidden="true">
        <LayerStack active={active} onPick={(key) => setActive(key as RecordKey)} derived={false} />
      </div>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SyntheticPill />
          <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{data.recordId}</span>
        </div>

        <div role="tablist" aria-label="Layers of the record" aria-orientation="vertical" className="hv5-layer-tabs">
          {LAYERS.map((l, i) => (
            <button key={l.key} id={`record-${l.key}`} type="button" aria-controls="hv5-layer-panel" className="hv5-layer-tab" {...tabProps(l.key, i)}>
              <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
              <span className="text-[var(--tiro-text)]">{l.label}</span>
              <span className="hidden text-sm text-[var(--tiro-text-muted)] sm:inline">{l.hint}</span>
            </button>
          ))}
        </div>

        <div id="hv5-layer-panel" role="tabpanel" aria-labelledby={`record-${active}`} className="hv5-layer-panel">
          <div key={active} className="la-enter">
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
