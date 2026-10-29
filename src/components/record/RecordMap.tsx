"use client";

import LayerStack from "@/components/archive/LayerStack";
import { ALL_LAYERS, type LayerKey } from "@/components/archive/layers";
import { useScrollSpy } from "@/components/archive/useScrollSpy";
import "./record.css";

// The record page's map: the exploded record, coordinated with the
// structured record beside it. The list of layers is ordinary in-page
// links (the accessible interface); the drawing mirrors it. Reading a
// section lifts its sheet; choosing a sheet or a link moves to that
// section and its heading. Wide screens: a sticky column. Narrow screens:
// a sticky bar of the same links, without the drawing.
const SECTION_IDS = ALL_LAYERS.map((l) => `layer-${l.key}`);
const keyOf = (id: string | null) => (id ?? "layer-account").slice("layer-".length) as LayerKey;

export default function RecordMap() {
  const [current, setCurrent] = useScrollSpy(SECTION_IDS, 0.35, "layer-account");
  const active = keyOf(current);

  const go = (key: LayerKey) => {
    const section = document.getElementById(`layer-${key}`);
    if (!section) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    history.replaceState(null, "", `#layer-${key}`);
    setCurrent(`layer-${key}`);
  };

  return (
    <nav aria-label="Layers of this record" className="la-map">
      <div className="la-map-figure">
        <LayerStack active={active} onPick={go} labels={false} />
      </div>
      <ol className="la-map-list">
        {ALL_LAYERS.map((l, i) => (
          <li key={l.key}>
            <a
              href={`#layer-${l.key}`}
              aria-current={active === l.key ? "location" : undefined}
              data-derived={l.key === "derived"}
              onClick={(e) => {
                e.preventDefault();
                go(l.key);
              }}
            >
              <span className="la-map-n" aria-hidden="true">
                {l.key === "derived" ? "+" : `0${i + 1}`}
              </span>
              {l.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
