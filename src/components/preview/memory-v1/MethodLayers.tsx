"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import LayerStack from "./LayerStack";
import { ALL_LAYERS, CAPACITIES, RECORDS_BASE, type LayerKey } from "./layers";

// The method, explained layer by layer. A tablist (arrow keys, Home/End)
// beside the exploded record; choosing a layer lifts its sheet and explains
// what that layer holds and why, with a way into the same layer of the
// specimen record. The drawing is a pointer shortcut; the tablist is the
// interface.
export default function MethodLayers({ specimenId }: { specimenId: string }) {
  const [active, setActive] = useState<LayerKey>("account");
  const tabs = useRef<Partial<Record<LayerKey, HTMLButtonElement | null>>>({});
  const layer = ALL_LAYERS.find((l) => l.key === active)!;
  const index = ALL_LAYERS.indexOf(layer);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? ALL_LAYERS.length - 1 : null;
    if (!delta && jump === null) {
      return;
    }
    e.preventDefault();
    const next = ALL_LAYERS[jump ?? (i + delta + ALL_LAYERS.length) % ALL_LAYERS.length].key;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="mv1-method">
      <div className="mv1-method-figure">
        <LayerStack active={active} onPick={setActive} />
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Layers of a memory record" aria-orientation="vertical" className="mv1-tabs">
          {ALL_LAYERS.map((l, i) => (
            <button
              key={l.key}
              ref={(el) => {
                tabs.current[l.key] = el;
              }}
              type="button"
              role="tab"
              id={`mv1-tab-${l.key}`}
              aria-selected={active === l.key}
              aria-controls="mv1-method-panel"
              tabIndex={active === l.key ? 0 : -1}
              className="mv1-tab"
              data-derived={l.key === "derived"}
              onClick={() => setActive(l.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="mv1-tab-n">{l.key === "derived" ? "+" : `0${i + 1}`}</span>
              <span className="mv1-tab-label">{l.label}</span>
              <span className="mv1-tab-q">{l.question}</span>
            </button>
          ))}
        </div>

        <div id="mv1-method-panel" role="tabpanel" aria-labelledby={`mv1-tab-${active}`} className="mv1-method-panel">
          <div key={active} className="mv1-enter">
            <p className="mv1-panel-q">{layer.question}</p>
            <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-[var(--tiro-text-soft)]">{layer.method}</p>
            {active === "authority" ? (
              <div className="mt-5">
                <ul className="flex flex-wrap gap-2" aria-label="Separate capacities">
                  {CAPACITIES.map((c) => (
                    <li key={c} className="mv1-chip">
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 max-w-[34rem] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  These are separate capacities. One person may hold several only with supporting evidence, and a collector&apos;s upload or signature
                  is not proof of authority over everyone recorded.
                </p>
              </div>
            ) : null}
            <Link href={`${RECORDS_BASE}/${specimenId}#layer-${active}`} className="mv1-more mt-6">
              {index < 5 ? `See the ${layer.label.toLowerCase()} layer in a specimen record` : "See what is derived from a specimen record"}
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
