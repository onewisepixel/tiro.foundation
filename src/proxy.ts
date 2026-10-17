// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same mechanism, same
// execution point — just a new file/export name; see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// Two jobs:
//
// 1. Memory pages. Sets `Cache-Control: no-store` on the Memory pages' own
// navigation response — not just the embedded backend fetch, which
// `{cache: "no-store"}` already covers. This still defeats Next.js's own
// server-side data cache and a normal browser disk-cache reuse of the HTML
// document.
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
//
// 2. Flight Deck (private operations). Outside a local-demo request
// (src/lib/flightDeck/config.ts) every /flight-deck path, including its
// server actions and export routes, answers 404 before any page code runs.
// This is the outer gate only: every page, action and route handler
// checks again on the server (src/lib/flightDeck/runtime.ts).
import { NextResponse, type NextRequest } from "next/server";
import { localDemoActive } from "@/lib/flightDeck/config";

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/flight-deck" || pathname.startsWith("/flight-deck/")) {
    if (!localDemoActive(process.env, request.headers.get("host"))) {
      return new NextResponse("Not found", { status: 404, headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
    }
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  if (pathname === "/pilot") {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return response;
}

export const config = {
  matcher: ["/memories", "/memories/:id", "/pilot", "/flight-deck", "/flight-deck/:path*"],
};
