import type { NextConfig } from "next";

// Former demonstration-record slugs named invented stories (retired in
// Living Trace 0.2.1, docs/design/decisions.md decision 3). Temporary
// redirects keep old links working without keeping the names in content.
const RETIRED_DEMO_SLUGS: Record<string, string> = {
  "lagos-port-harcourt-migration": "demo-audio-record",
  "rain-season-enugu": "demo-image-record",
  "market-song-lagos": "demo-video-record",
};

const nextConfig: NextConfig = {
  // Only scripts/flight-deck/dev.mjs sets this, so the Flight Deck local
  // demo can run beside an ordinary `npm run dev` (Next allows one dev
  // server per build directory). Builds and deployments use ".next".
  distDir: process.env.FLIGHT_DECK_DIST_DIR || ".next",
  async redirects() {
    return Object.entries(RETIRED_DEMO_SLUGS).map(([from, to]) => ({
      source: `/memories/${from}`,
      destination: `/memories/${to}`,
      permanent: false,
    }));
  },
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
    // Flight Deck 0.1: no Server Action in this app accepts files or long
    // text (the /pilot form is a few short fields; drafts are a few KB at
    // most). Down from the 1 MB default so an oversized body is refused
    // before it is parsed.
    serverActions: {
      bodySizeLimit: "64kb",
    },
  },
};

export default nextConfig;
