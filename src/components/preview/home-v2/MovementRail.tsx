"use client";

import { useEffect, useState } from "react";

// The six movements, kept as the page's conceptual index even though the
// page has four sections. Wide screens only (xl), fixed at the right edge;
// on smaller screens the sections read in order and the rail would crowd
// the content. The current movement is the last anchor whose top has
// passed the upper third of the viewport.
export type RailItem = { id: string; index: string; name: string };

export default function MovementRail({ items }: { items: RailItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let found = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= line) {
          found = item.id;
        }
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  return (
    <nav aria-label="Movements on this page" className="hv2-rail fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
      <ol className="flex flex-col items-end gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} aria-current={current === item.id ? "true" : undefined} className="flex items-center justify-end gap-2.5 py-1.5">
              <span className="hv2-rail-name lt-label whitespace-nowrap bg-[var(--tiro-bg)] px-1.5 !text-[10px] text-[var(--tiro-text-soft)]">{item.name}</span>
              <span className="hv2-rail-index font-[family-name:var(--font-code)] text-[10px] text-[var(--tiro-text-subtle)]">{item.index}</span>
              <span aria-hidden="true" className="hv2-rail-tick" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
