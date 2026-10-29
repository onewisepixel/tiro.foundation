"use client";

import { useEffect, useState } from "react";

// Orientation that follows reading: the last of `ids` whose element has
// scrolled above a reading line (`line` x the viewport height), or
// `fallback` before the first. Measured once per animation frame, on
// scroll and resize; nothing animates with scrolling. The setter lets a
// caller mark a choice at once, before the scroll reaches it.
// `ids` must be stable between renders (a constant, or a prop).
export function useScrollSpy<T extends string>(ids: readonly T[], line: number, fallback: T | null = null) {
  const [current, setCurrent] = useState<T | null>(fallback);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.innerHeight * line;
      let found: T | null = fallback;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < y) {
          found = id;
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
  }, [ids, line, fallback]);

  return [current, setCurrent] as const;
}
