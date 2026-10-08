// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same mechanism, same
// execution point — just a new file/export name; see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// Sets `Cache-Control: no-store` on the Memory pages' own navigation
// response — not just the embedded backend fetch, which `{cache: "no-store"}`
// already covers. A main-frame response carrying `Cache-Control: no-store`
// is excluded from the browser's back/forward cache (bfcache) eligibility
// criteria, which is what actually stops "press back after a protective
// action and see the old content" — `force-dynamic` plus an uncached fetch
// alone only defeats Next.js's own server-side caching and a normal
// browser disk-cache reuse; neither touches bfcache, which can restore a
// full previously-rendered page bypassing the network (and therefore any
// fresh permission check) entirely.
import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/memories", "/memories/:id"],
};
