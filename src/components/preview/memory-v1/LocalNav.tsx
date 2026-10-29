"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Orientation inside the Memory Project: a slim bar that stays under the
// site header. The current room is marked (aria-current="location"); the
// way to a specimen record is always one step away. On narrow screens the
// list scrolls sideways inside the bar, never the page.
//
// Prototype-local: the shared site navigation is untouched.
export type LocalItem = { id: string; label: string };

export default function LocalNav({ items, cta }: { items: LocalItem[]; cta: { href: string; label: string } }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let found: string | null = null;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top < line) {
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
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  return (
    <nav aria-label="The Memory Project" className="mv1-localnav">
      <div className="mv1-frame mv1-localnav-inner">
        <a href="#top" className="mv1-localnav-title">
          The Memory Project
        </a>
        <ol className="mv1-localnav-list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} aria-current={current === item.id ? "location" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
        <Link href={cta.href} className="mv1-localnav-cta">
          {cta.label} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </nav>
  );
}
