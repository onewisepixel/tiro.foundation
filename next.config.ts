import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Explicit, not a fix for a live gap: as of Next 15+ (this project is
    // on 16), the client-side Router Cache's "dynamic" staleTime already
    // defaults to 0 seconds (it was 30s before 15.0.0). Set here anyway so
    // the public Memory pages' "no stale content on a soft navigation"
    // requirement is a stated, checked-in guarantee rather than an
    // inherited default that a future framework upgrade could silently
    // change back. Scoped to "dynamic" only — the 3 static /memories/[id]
    // pages use the separate "static" staleTime (5 minutes), untouched.
    // NOTE, per Next's own docs: this governs the client router cache for
    // soft/prefetch navigations only — it is explicitly NOT the browser's
    // back/forward cache, which src/middleware.ts's Cache-Control header
    // addresses separately.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
