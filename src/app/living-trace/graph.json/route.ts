import { projectGraph } from "@/lib/livingTrace/projection";

// The projected (visitor-safe) Discover graph, prerendered at build time
// so the interactive constellation can load after first paint instead of
// riding in every homepage payload. It is exactly what the pages already
// render: the projection's output, never the internal archive, and
// scripts/test/verify-disclosure.mjs scans it with the other prerendered
// output.
//
// Static demonstration data only. A live-archive equivalent must be
// evaluated per request against current permissions and invalidated on
// any change (docs/design/living-trace.md, "Production integration").
export const dynamic = "force-static";

export function GET() {
  return Response.json(projectGraph(), {
    headers: {
      "X-Robots-Tag": "noindex",
    },
  });
}
