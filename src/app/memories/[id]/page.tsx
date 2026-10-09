import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import MemoryDetail from "@/components/MemoryDetail";
import PublicMemoryDetail from "@/components/PublicMemoryDetail";
import { getMemoryById, memories } from "@/data/memories";
import { getRecordKindNotice } from "@/data/recordNotices";
import { fetchPublicMemoryRecord, type PublicMemoryRecord } from "@/lib/publicMemoryApi";

type Params = {
  id: string;
};

type PageProps = {
  params: Promise<Params>;
};

export function generateStaticParams() {
  return memories.map((memory) => ({ id: memory.id }));
}

// Production-build-only finding (caught exactly where the review insisted
// on checking — `next build && next start`, not `next dev`): without this,
// requesting an id NOT in generateStaticParams's list threw "Page changed
// from static to dynamic at runtime" (Next's E132) and 500'd instead of
// 404ing. Next's non-PPR model doesn't support "some renders of this
// route are a cached static shell, others are genuinely uncached" for the
// SAME route template — generateStaticParams marks the whole template
// isSSG at build time, and any render whose fetch resolves to
// revalidate:0 (exactly what {cache:"no-store"} does) contradicts that.
// Forcing the whole route dynamic trades away true static serving for
// the 3 known ids (now rendered per-request instead of from a prebuilt
// HTML file) for correctness on unknown/live ids — an explicit, accepted
// cost: these are small, cheap-to-render pages, and "never risk a 500 or
// stale content" matters far more here than that marginal optimization.
export const dynamic = "force-dynamic";

// Reviewer-caught finding: collapsing every !ok fetchPublicMemoryRecord
// result to a bare null meant a network error or backend 500 was
// indistinguishable from a genuine 404 — both rendered "Memory Not Found."
// An operational failure must say so, not claim the record doesn't exist.
type ResolvedPublicRecord =
  | { kind: "found"; record: PublicMemoryRecord }
  | { kind: "not-found" }
  | { kind: "unavailable" };

// React's cache() dedupes this within a single request's render pass —
// generateMetadata and the page component are two SEPARATE function
// invocations, not naturally sharing anything, so without this each would
// fire its OWN independent fetch. Two independent fetches could race
// against a protective action landing in between and produce a masked
// detail page under a stale (pre-mask) metadata title, or vice versa —
// exactly the "queue title vs. detail title" class of finding this
// engagement has caught before in other contexts. Wrapping with cache()
// means both call sites below get the exact same resolved value from one
// underlying fetch. No `export const dynamic` here: the 3 static ids must
// keep their existing SSG behavior (dynamicParams's default of true
// already renders unknown ids per-request); this uncached fetch, reached
// only on the fallback branch, is what makes THAT specific render
// dynamic, without touching the rest.
const resolvePublicRecord = cache(async (id: string): Promise<ResolvedPublicRecord> => {
  const result = await fetchPublicMemoryRecord(id);
  if (result.ok) {
    return { kind: "found", record: result.record };
  }
  // status 404 is the backend's own explicit "not found or not eligible"
  // answer (api/router.ts's public routes return a flat 404 for both
  // nonexistent and denied records, by design — see backend's publicView.ts).
  // Anything else — 0 (network/unreachable), 5xx, a malformed response —
  // is an OPERATIONAL failure this page must not misreport as "no such
  // record."
  return result.status === 404 ? { kind: "not-found" } : { kind: "unavailable" };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const memory = getMemoryById(id);

  if (memory) {
    const notice = getRecordKindNotice(memory.recordKind);
    return {
      title: `${memory.recordKind === "demo" ? "Demo: " : ""}${memory.title} — The Tiro Foundation`,
      description: notice ? `${notice.short} ${memory.summary}` : memory.summary,
    };
  }

  const resolved = await resolvePublicRecord(id);
  if (resolved.kind === "found") {
    const notice = getRecordKindNotice(resolved.record.recordKind);
    return {
      title: `Demo: ${resolved.record.title} — The Tiro Foundation`,
      description: notice ? `${notice.short} ${resolved.record.summary}` : resolved.record.summary,
    };
  }
  if (resolved.kind === "unavailable") {
    return {
      title: "Live Record Temporarily Unavailable — The Tiro Foundation",
      description: "This record could not be checked right now. Please try again shortly.",
    };
  }

  return {
    title: "Memory Not Found — The Tiro Foundation",
    description: "Requested memory record does not exist.",
  };
}

export default async function MemoryDetailRoute({ params }: PageProps) {
  const { id } = await params;
  const memory = getMemoryById(id);

  if (memory) {
    return <MemoryDetail memory={memory} />;
  }

  const resolved = await resolvePublicRecord(id);
  if (resolved.kind === "found") {
    return <PublicMemoryDetail record={resolved.record} />;
  }
  if (resolved.kind === "unavailable") {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--tiro-bg)] px-6 text-center text-[var(--tiro-text)]">
        <p className="tiro-eyebrow mb-5">Temporarily Unavailable</p>
        <h1 className="mb-4 font-[family-name:var(--font-display)] text-3xl italic tracking-tight md:text-5xl">
          This record could not be checked right now
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
          The live Memory service did not respond. This is not a statement that the record does not
          exist — please try again shortly.
        </p>
      </main>
    );
  }

  notFound();
}
