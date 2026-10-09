"use client";

import { useEffect } from "react";

// Guarantees the Memory pages never show stale, pre-protective-action
// content restored from the browser's back/forward cache (bfcache).
//
// Chrome restoring a page from bfcache paints the cached DOM FIRST, then
// fires `pageshow` — by the time any JS handler runs, the (possibly stale)
// content is already on screen for at least one frame. The only way to
// avoid showing it at all is to make sure the content was ALREADY hidden
// at the moment the browser took its snapshot: `pagehide` fires right
// before a page may be frozen into bfcache, so setting the hidden state
// there means the frozen snapshot itself is blank — nothing stale is ever
// painted, not even briefly.
//
// `pageshow` with `event.persisted === true` means this exact restore
// happened; a full reload forces a genuinely fresh request (subject to
// src/proxy.ts's `Cache-Control: no-store` and the public API's own
// no-store headers), so the page the user then sees reflects whatever
// protective actions happened while it was away.
export default function BfcacheRevalidator() {
  useEffect(() => {
    function handlePageHide() {
      document.documentElement.setAttribute("data-bfcache-pending", "true");
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
        return;
      }
      document.documentElement.removeAttribute("data-bfcache-pending");
    }
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return null;
}
