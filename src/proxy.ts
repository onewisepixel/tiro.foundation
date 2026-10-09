// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same mechanism, same
// execution point — just a new file/export name; see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// Sets `Cache-Control: no-store` on the Memory pages' own navigation
// response — not just the embedded backend fetch, which `{cache: "no-store"}`
// already covers. This still defeats Next.js's own server-side data cache
// and a normal browser disk-cache reuse of the HTML document.
//
// Reviewer correction: it does NOT defeat the browser's back/forward
// cache (bfcache). An earlier version of this comment claimed otherwise —
// wrong. As of Chrome ~109, `Cache-Control: no-store` is explicitly NOT a
// bfcache-exclusion criterion (developer.chrome.com/docs/web-platform/bfcache)
// — Chrome deliberately changed this to raise bfcache hit rates, on the
// expectation that pages needing guaranteed freshness handle it themselves
// via the `pageshow`/`pagehide` lifecycle events. That handling lives in
// src/components/BfcacheRevalidator.tsx (rendered from
// src/app/memories/layout.tsx), not here — this header alone is
// necessary but not sufficient.
import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/memories", "/memories/:id"],
};
