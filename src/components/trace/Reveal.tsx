"use client";

import { useEffect, useRef, useState } from "react";

// "Reveal": relationships become visible once their context is on screen.
//
// Server markup is always the complete, final state ("static"). After
// hydration, and only when motion is allowed and the region starts BELOW
// the fold, it is set to "pending" and played once ("shown") when it
// scrolls into view. Nothing already visible is ever hidden, nothing is
// scroll-linked, and with reduced motion or no IntersectionObserver the
// state simply stays "static".
type RevealState = "static" | "pending" | "shown";

export default function Reveal({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<RevealState>("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight) {
      return;
    }
    // A one-time, mount-only transition out of the server state.
    setState("pending");
    // Shown once the region's top passes the lower part of the viewport,
    // whether it scrolls into view or is jumped past (an anchor link can
    // land beyond it without any intersection ever being observed).
    let done = false;
    const show = () => {
      if (!done && el.getBoundingClientRect().top < window.innerHeight * 0.85) {
        done = true;
        setState("shown");
        cleanup();
      }
    };
    const observer = new IntersectionObserver(show, { threshold: [0, 0.2] });
    const onScroll = () => requestAnimationFrame(show);
    const cleanup = () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, []);

  return (
    <Tag ref={ref as React.Ref<never>} data-lt-reveal={state} className={className}>
      {children}
    </Tag>
  );
}
