"use client";

import { useEffect, useState } from "react";
import LayerStack from "./LayerStack";
import { ALL_LAYERS, type LayerKey } from "./layers";

// The record page's map: the exploded record, coordinated with the
// structured record beside it. The list of layers is ordinary in-page
// links (the accessible interface); the drawing mirrors it. Reading a
// section lifts its sheet; choosing a sheet or a link moves to that
// section and its heading. Wide screens: a sticky column. Narrow screens:
// a sticky bar of the same links, without the drawing.
export default function RecordMap() {
  const [active, setActive] = useState<LayerKey>("account");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let found: LayerKey = "account";
      for (const l of ALL_LAYERS) {
        const el = document.getElementById(`layer-${l.key}`);
        if (el && el.getBoundingClientRect().top < line) {
          found = l.key;
        }
      }
      setActive(found);
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const go = (key: LayerKey) => {
    const section = document.getElementById(`layer-${key}`);
    if (!section) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    history.replaceState(null, "", `#layer-${key}`);
    setActive(key);
  };

  return (
    <nav aria-label="Layers of this record" className="mv1-map">
      <div className="mv1-map-figure">
        <LayerStack active={active} onPick={go} labels={false} />
      </div>
      <ol className="mv1-map-list">
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
              <span className="mv1-map-n" aria-hidden="true">
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
