"use client";

import { useEffect, useRef, useState } from "react";

// The thread: the mark's resonance line, continued through the page. It
// leaves the bottom of the hero figure, turns along the rule above the
// hero's strip, and runs down the left margin through a node at every
// section, ending at an open origin: the next record has not been made.
//
// The path is measured from the page's own anchors ([data-thread="start"],
// "turn", "node", "end"), so it stays continuous at any width, and is
// re-measured whenever the page resizes (fonts, viewport). It is drawn
// whole, never scroll-linked. The node of the section being read is
// marked current; that is the only response to scrolling.
//
// Decorative: aria-hidden. Each node sits beside a section heading that
// carries the meaning.
export default function Thread() {
  const ref = useRef<SVGSVGElement | null>(null);
  const [geo, setGeo] = useState<{ d: string; w: number; h: number } | null>(null);

  useEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) {
      return;
    }
    let frame = 0;

    const measure = () => {
      frame = 0;
      const base = host.getBoundingClientRect();
      const q = (sel: string) => host.querySelector<HTMLElement>(`[data-thread="${sel}"]`);
      const start = q("start");
      const turn = q("turn");
      const end = q("end");
      const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-thread="node"]'));
      if (!start || !turn || !end || nodes.length === 0) {
        return;
      }
      const at = (el: HTMLElement) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2 - base.left, y: b.top + b.height / 2 - base.top, top: b.top - base.top };
      };
      const s = at(start);
      const t = at(turn).top;
      const g = at(nodes[0]).x;
      const e = at(end).y;
      const r = Math.max(4, Math.min(28, (s.x - g) / 2, (t - s.y) / 2));
      const d = `M${s.x},${s.y} V${t - r} Q${s.x},${t} ${s.x - r},${t} H${g + r} Q${g},${t} ${g},${t + r} V${e}`;
      setGeo({ d, w: host.scrollWidth, h: host.scrollHeight });
    };

    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };

    // The current section: the last node whose section top has passed 40%
    // of the viewport.
    const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-thread="node"]'));
    let ticking = 0;
    const current = () => {
      ticking = 0;
      const line = window.innerHeight * 0.4;
      let found = -1;
      nodes.forEach((n, i) => {
        if (n.getBoundingClientRect().top < line) {
          found = i;
        }
      });
      nodes.forEach((n, i) => {
        n.dataset.current = String(i === found);
      });
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = requestAnimationFrame(current);
      }
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    schedule();
    current();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(ticking);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className="hv5-thread"
      data-ready={geo !== null}
      width={geo?.w ?? 0}
      height={geo?.h ?? 0}
      aria-hidden="true"
      focusable="false"
    >
      {geo ? <path d={geo.d} /> : null}
    </svg>
  );
}
