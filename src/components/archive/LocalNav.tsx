"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useScrollSpy } from "./useScrollSpy";

// Orientation inside an inner page: a slim bar that stays under the site
// header. The current room is marked (aria-current="location"); the way
// on (`cta`, when given) is always one step away. On narrow screens the
// list scrolls sideways inside the bar, never the page. Styled by
// archive.css (la-localnav).
//
// Local to the page: the shared site navigation is untouched.
export type LocalItem = { id: string; label: string };

export default function LocalNav({ title, items, cta }: { title: string; items: LocalItem[]; cta?: { href: string; label: string } }) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [current] = useScrollSpy(ids, 0.3);

  return (
    <nav aria-label={title} className="la-localnav">
      <div className="la-frame la-localnav-inner">
        <a href="#top" className="la-localnav-title">
          {title}
        </a>
        <ol className="la-localnav-list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} aria-current={current === item.id ? "location" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
        {cta ? (
          <Link href={cta.href} className="la-localnav-cta">
            {cta.label} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
