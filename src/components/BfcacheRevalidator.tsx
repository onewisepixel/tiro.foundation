"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

function setHidden(hidden: boolean): void {
  if (hidden) {
    document.documentElement.setAttribute("data-bfcache-pending", "true");
  } else {
    document.documentElement.removeAttribute("data-bfcache-pending");
  }
}

// Guarantees the Memory pages never show stale, pre-protective-action
// content on EITHER of two distinct back/forward mechanisms:
//
// 1. The browser's native back/forward cache (bfcache) — a full-document
//    restore, handled by `pagehide`/`pageshow` below exactly as before.
//
// 2. Reviewer-caught finding: Next.js's OWN client-side Router Cache,
//    which is a SEPARATE mechanism `pagehide`/`pageshow` never sees at
//    all, because a same-document `<Link>` navigation is not a real
//    document unload. Confirmed directly from Next's own docs (the
//    "Client Cache" glossary entry, node_modules/next/dist/docs/01-app/04-glossary.md):
//    "Pages are not cached by default but are reused during browser
//    back/forward navigation" — and separately, staleTimes.md's own
//    note that staleTimes "doesn't change back/forward caching behavior
//    to prevent layout shift and to prevent losing the browser scroll
//    position." Both confirm `next.config.ts`'s `staleTimes.dynamic: 0`
//    (set for an earlier finding) was never going to touch THIS reuse —
//    it governs prefetch/soft-navigation staleness, not back/forward,
//    which Next deliberately always reuses for exactly the reason quoted
//    above. The documented way to invalidate it on demand is
//    `router.refresh()` (same glossary entry) — triggered here from the
//    native `popstate` event, which fires for a History-API back/forward
//    transition (Next's own navigation mechanism) just as reliably as it
//    does for a plain multi-page-app history change, and — unlike
//    `pagehide`/`pageshow` — does NOT fire for a forward `<Link>` click to
//    a NEW, not-yet-visited entry (only for navigating through existing
//    history), matching exactly the back/forward scope this fix targets.
//
// Both mechanisms share the same hide/reveal primitive: content is hidden
// the instant a restore/reuse is detected, and revealed only once this
// render has a REAL signal that fresh content actually committed —
// `useTransition`'s `isPending` flipping back to false after
// `router.refresh()` was called inside `startTransition`, not a guess or
// a fixed delay.
export default function BfcacheRevalidator() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPendingRef = useRef(false);

  useEffect(() => {
    isPendingRef.current = isPending;
    if (!isPending) {
      setHidden(false);
    }
  }, [isPending]);

  useEffect(() => {
    function handlePopState() {
      setHidden(true);
      startTransition(() => {
        router.refresh();
      });
    }
    function handlePageHide() {
      setHidden(true);
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        // A genuine bfcache restore — reload forces a truly fresh
        // request (subject to src/proxy.ts's Cache-Control: no-store and
        // the public API's own no-store headers). Any popstate-triggered
        // refresh() still in flight is harmless here: this navigation is
        // about to be torn down regardless.
        window.location.reload();
        return;
      }
      // A normal (non-restored) show — only reveal if nothing from a
      // popstate-triggered refresh is still pending; otherwise let the
      // isPending-driven effect above reveal once that lands.
      if (!isPendingRef.current) {
        setHidden(false);
      }
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router, startTransition]);

  return null;
}
