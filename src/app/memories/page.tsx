import type { Metadata } from "next";
import Link from "next/link";
import { memories, type MemoryRecord } from "@/data/memories";
import { getRecordKindNotice } from "@/data/recordNotices";
import { fetchPublicMemoryListing } from "@/lib/publicMemoryApi";
import PublicMemoryCard from "@/components/PublicMemoryCard";
import "@/components/archive/archive.css";
import "./memories.css";

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
    <main id="top" className="la mm bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame mm-wrap mm-head">
        <p className="la-eyebrow">Archive Index</p>
        <h1 className="mm-h1 mt-6">{indexCopy.heading}</h1>
        <p className="mm-intro mt-8">{indexCopy.subtitle}</p>
      </header>

      <div className="la-frame mm-wrap">
        <div className="mm-index">
          {memories.map((memory) => {
            const notice = getRecordKindNotice(memory.recordKind);

            return (
              <article key={memory.id} className="mm-entry">
                {notice ? <p className="mm-notice">{notice.full}</p> : null}

                <p className="mm-accession">
                  <span className="mm-id">{memory.recordId}</span>
                  <span className="mm-status">{memory.archiveStatus}</span>
                </p>

                <div className="mm-entry-body">
                  <dl className="mm-facts">
                    <div>
                      <dt className="la-term">Location</dt>
                      <dd>{memory.location}</dd>
                    </div>
                    <div>
                      <dt className="la-term">Era</dt>
                      <dd>{memory.era}</dd>
                    </div>
                    <div>
                      <dt className="la-term">Media</dt>
                      <dd>{memory.media.type}</dd>
                    </div>
                  </dl>

                  <h2 className="mm-title">{memory.title}</h2>

                  <p className="mm-summary">{memory.summary}</p>

                  <div className="mm-tags">
                    {memory.tags.slice(0, 4).map((tag) => (
                      <span key={`${memory.id}-${tag}`} className="tiro-chip">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Link href={`/memories/${memory.id}`} className="la-more mt-6">
                    View record
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <section id="live-records" aria-labelledby="live-records-title" className="la-frame mm-wrap mm-live">
        <div className="mm-live-inner">
          <h2 id="live-records-title" className="mm-h2">Live Records</h2>
          <p className="mm-text mt-5">
            Backend-sourced demonstration records approved for public display through the staff review
            workflow. Kept separate from the archive index above, which describes only the static
            records listed there.
          </p>

          {listingResult.ok && listingResult.listing.hadFailures ? (
            // Reviewer-caught finding: some candidates on this page could
            // not be checked, so records may be missing from it. Never
            // present a partial page as the whole slice.
            <p role="status" className="mm-state" data-state="incomplete">
              Some records could not be checked just now, so this list may be incomplete. Please try again
              shortly.
            </p>
          ) : null}

          {!listingResult.ok && listingResult.reason === "disabled" ? (
            // Decision 44: backend-connected records are not shown publicly
            // without an explicit decision. Not enabled is a deliberate
            // state, described as one, never as an outage.
            <p className="mm-state" data-state="disabled">
              <span className="mm-ring" aria-hidden="true" />
              <span>
                Live records are not enabled on this site. Records from the live Memory service are not shown publicly until their public display is
                approved.
              </span>
            </p>
          ) : !listingResult.ok ? (
            <p className="mm-state" data-state="unavailable">
              Live records are temporarily unavailable. Please try again shortly.
            </p>
          ) : listingResult.listing.items.length > 0 ? (
            <div className="mm-index mm-index-live">
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
            <p className="mm-state">
              No live records on this page — more may be available further on.
            </p>
          ) : cursor === null ? (
            // Only safe to state as a GLOBAL claim when this is the very
            // first page (no cursor) and it's also exhausted (no
            // nextCursor) — the only case where "empty" and "nothing
            // published" actually coincide.
            <p className="mm-state">No live records are currently published.</p>
          ) : (
            <p className="mm-state">No further live records are available.</p>
          )}

          {listingResult.ok && listingResult.listing.nextCursor ? (
            <Link
              href={`/memories?cursor=${encodeURIComponent(listingResult.listing.nextCursor)}`}
              className="la-more mt-8"
            >
              Load more
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
