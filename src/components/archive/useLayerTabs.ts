"use client";

import { useRef, useState } from "react";

// The keyboard model of a vertical tablist of record layers (the homepage's
// record and the Memory Project's method): one tab in the tab order (the
// selected one); Arrow keys move and wrap, Home and End jump; moving
// selects, and focus follows. Markup and panels stay with the caller.
export function useLayerTabs<K extends string>(keys: readonly K[], initial: K) {
  const [active, setActive] = useState<K>(initial);
  const tabs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
    if (!delta && jump === null) {
      return;
    }
    e.preventDefault();
    const next = keys[jump ?? (i + delta + keys.length) % keys.length];
    setActive(next);
    tabs.current[next]?.focus();
  };

  // Spread onto each tab button, after its own attributes.
  const tabProps = (key: K, i: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      tabs.current[key] = el;
    },
    role: "tab" as const,
    "aria-selected": active === key,
    tabIndex: active === key ? 0 : -1,
    onClick: () => setActive(key),
    onKeyDown: (e: React.KeyboardEvent) => onKey(e, i),
  });

  return { active, setActive, tabProps };
}
