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
const resolvePublicRecord = cache(async (id: string): Promise<PublicMemoryRecord | null> => {
  const result = await fetchPublicMemoryRecord(id);
  return result.ok ? result.record : null;
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

  const publicRecord = await resolvePublicRecord(id);
  if (publicRecord) {
    const notice = getRecordKindNotice(publicRecord.recordKind);
    return {
      title: `Demo: ${publicRecord.title} — The Tiro Foundation`,
      description: notice ? `${notice.short} ${publicRecord.summary}` : publicRecord.summary,
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

  const publicRecord = await resolvePublicRecord(id);
  if (publicRecord) {
    return <PublicMemoryDetail record={publicRecord} />;
  }

  notFound();
}
