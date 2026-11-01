import Link from "next/link";
import { getRecordKindNotice } from "@/data/recordNotices";
import type { PublicMemoryListingCard } from "@/lib/publicMemoryApi";

type PublicMemoryCardProps = {
  record: PublicMemoryListingCard;
};

// Deliberately narrow — renders only the fields a backend-sourced record
// actually has. Set in the same index entry as the static records (styled
// by src/app/memories/memories.css), but marked as live, under its own
// heading, and never given fields (location/era/tags/etc.) this record
// simply doesn't carry.
export default function PublicMemoryCard({ record }: PublicMemoryCardProps) {
  const notice = getRecordKindNotice(record.recordKind);

  return (
    <article className="mm-entry" data-live="">
      {notice ? <p className="mm-notice">{notice.full}</p> : null}

      <p className="mm-accession">
        <span className="mm-id">{record.recordId}</span>
        <span className="mm-status">Live record</span>
      </p>

      <div className="mm-entry-body">
        <dl className="mm-facts">
          {record.reviewedAt ? (
            <div>
              <dt className="la-term">Reviewed</dt>
              <dd>{record.reviewedAt}</dd>
            </div>
          ) : null}
          <div>
            <dt className="la-term">Media</dt>
            <dd>{record.media.length > 0 ? `${record.media.length}${record.mediaTruncated ? "+" : ""} file(s)` : record.mediaTruncated ? "See record" : "None"}</dd>
          </div>
        </dl>

        <h2 className="mm-title">
          {record.title}
          {record.titleTruncated ? "…" : null}
        </h2>

        <p className="mm-summary">
          {record.summaryExcerpt}
          {record.summaryTruncated ? "…" : null}
        </p>

        <Link href={`/memories/${record.recordId}`} className="la-more mt-6">
          View record
        </Link>
      </div>
    </article>
  );
}
