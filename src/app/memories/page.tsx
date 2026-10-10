import type { Metadata } from "next";
import Link from "next/link";
import { memories, type MemoryRecord } from "@/data/memories";
import { getRecordKindNotice } from "@/data/recordNotices";
import { fetchPublicMemoryListing } from "@/lib/publicMemoryApi";
import PublicMemoryCard from "@/components/PublicMemoryCard";

// The live section below reads from the backend on every request — no
// Partial Prerendering is available here (cacheComponents isn't enabled),
// so a page mixing static and always-fresh content must pick one. The 3
// static cards' OUTPUT is identical either way (hardcoded data); only
// their render timing (build vs. request) changes.
export const dynamic = "force-dynamic";

function getIndexCopy(records: MemoryRecord[]) {
  const total = records.length;
  const demoCount = records.filter((record) => record.recordKind === "demo").length;

  if (total === 0) {
    return {
      heading: "Memory Records",
      subtitle: "No memory records are published yet.",
      metaTitle: "Memory Records — The Tiro Foundation",
      metaDescription: "No memory records are published yet.",
    };
  }

  if (demoCount === total) {
    return {
      heading: "Memory Record Demonstrations",
      subtitle:
        "Illustrative records demonstrating archival structure. These examples are not collected testimony, verified records, or evidence of consent.",
      metaTitle: "Memory Record Demonstrations — The Tiro Foundation",
      metaDescription:
        "Illustrative records demonstrating archival structure. These examples are not collected testimony, verified records, or evidence of consent.",
    };
  }

  if (demoCount === 0) {
    return {
      heading: "Memory Records",
      subtitle:
        "Memory records in this index. Each record states its own category, provenance, and consent status individually.",
      metaTitle: "Memory Records — The Tiro Foundation",
      metaDescription:
        "Memory records in this index. Each record states its own category, provenance, and consent status individually.",
    };
  }

  return {
    heading: "Memory Records",
    subtitle:
      "This index includes demonstration records alongside other record categories. Each record states its status individually below.",
    metaTitle: "Memory Records — The Tiro Foundation",
    metaDescription:
      "This index includes demonstration records alongside other record categories. Each record states its status individually.",
  };
}

const indexCopy = getIndexCopy(memories);

export const metadata: Metadata = {
  title: indexCopy.metaTitle,
  description: indexCopy.metaDescription,
};

type MemoriesIndexPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function MemoriesIndexPage({ searchParams }: MemoriesIndexPageProps) {
  const resolvedSearchParams = await searchParams;
  const cursorParam = resolvedSearchParams.cursor;
  const cursor = typeof cursorParam === "string" ? cursorParam : null;
  const listingResult = await fetchPublicMemoryListing({ cursor });

  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Archive Index</p>
          <h1 className="mb-5 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            {indexCopy.heading}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            {indexCopy.subtitle}
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {memories.map((memory) => {
            const notice = getRecordKindNotice(memory.recordKind);

            return (
              <article key={memory.id} className="tiro-card">
                {notice ? (
                  <p className="mb-5 inline-block border border-[var(--tiro-accent)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--tiro-accent)]">
                    {notice.full}
                  </p>
                ) : null}

                <div className="tiro-kv border-t-0">
                  <span className="k">{memory.recordId}</span>
                  <span className="v">{memory.archiveStatus}</span>
                </div>
                <div className="tiro-kv">
                  <span className="k">Location</span>
                  <span className="v">{memory.location}</span>
                </div>
                <div className="tiro-kv">
                  <span className="k">Era</span>
                  <span className="v">{memory.era}</span>
                </div>
                <div className="tiro-kv">
                  <span className="k">Media</span>
                  <span className="v">{memory.media.type}</span>
                </div>

                <h2 className="mt-6 font-[family-name:var(--font-display)] text-2xl italic tracking-tight text-[var(--tiro-text-soft)]">
                  {memory.title}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                  {memory.summary}
                </p>

                <div className="mt-5 flex flex-wrap gap-2.5">
                  {memory.tags.slice(0, 4).map((tag) => (
                    <span key={`${memory.id}-${tag}`} className="tiro-chip">
                      {tag}
                    </span>
                  ))}
                </div>

                <Link href={`/memories/${memory.id}`} className="tiro-link mt-6 inline-block text-sm">
                  View record
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Live Records</p>
          <p className="mb-8 max-w-3xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
            Backend-sourced demonstration records approved for public display through the staff review
            workflow. Kept separate from the archive index above, which describes only the static
            records listed there.
          </p>

          {listingResult.ok && listingResult.listing.hadFailures ? (
            // Reviewer-caught finding: some candidates on this page could
            // not be checked, so records may be missing from it. Never
            // present a partial page as the whole slice.
            <p role="status" className="mb-8 text-sm text-[var(--tiro-text-muted)]">
              Some records could not be checked just now, so this list may be incomplete. Please try again
              shortly.
            </p>
          ) : null}

          {!listingResult.ok ? (
            <p className="text-sm text-[var(--tiro-text-muted)]">
              Live records are temporarily unavailable. Please try again shortly.
            </p>
          ) : listingResult.listing.items.length > 0 ? (
            <div className="flex flex-col gap-6">
              {listingResult.listing.items.map((record) => (
                <PublicMemoryCard key={record.recordId} record={record} />
              ))}
            </div>
          ) : listingResult.listing.hadFailures ? null : listingResult.listing.nextCursor ? (
            // An empty page with unchecked candidates makes no emptiness
            // claim at all — the incomplete-results notice above covers it.
            // Reviewer-caught finding: an empty page does not mean nothing
            // is published — the backend's own listing is budget-bounded
            // and can legitimately return a sparse or empty slice while
            // still having more to check (see services/publicView.ts's
            // readPublicListing). Describe THIS slice only; the "Load
            // more" link below (rendered whenever nextCursor is present,
            // independent of this branch) keeps continuation available.
            <p className="text-sm text-[var(--tiro-text-muted)]">
              No live records on this page — more may be available further on.
            </p>
          ) : cursor === null ? (
            // Only safe to state as a GLOBAL claim when this is the very
            // first page (no cursor) and it's also exhausted (no
            // nextCursor) — the only case where "empty" and "nothing
            // published" actually coincide.
            <p className="text-sm text-[var(--tiro-text-muted)]">No live records are currently published.</p>
          ) : (
            <p className="text-sm text-[var(--tiro-text-muted)]">No further live records are available.</p>
          )}

          {listingResult.ok && listingResult.listing.nextCursor ? (
            <Link
              href={`/memories?cursor=${encodeURIComponent(listingResult.listing.nextCursor)}`}
              className="tiro-link mt-8 inline-block text-sm"
            >
              Load more
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
