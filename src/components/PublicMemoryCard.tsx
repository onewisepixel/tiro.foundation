import Link from "next/link";
import { getRecordKindNotice } from "@/data/recordNotices";
import type { PublicMemoryRecord } from "@/lib/publicMemoryApi";

type PublicMemoryCardProps = {
  record: PublicMemoryRecord;
};

// Deliberately narrow — renders only the fields a backend-sourced record
// actually has. Visually distinct from the static tiro-card entries on
// purpose: blending the two would mean fabricating fields (location/era/
// tags/etc.) this record simply doesn't carry.
export default function PublicMemoryCard({ record }: PublicMemoryCardProps) {
  const notice = getRecordKindNotice(record.recordKind);

  return (
    <article className="tiro-card">
      {notice ? (
        <p className="mb-5 inline-block border border-[var(--tiro-accent)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--tiro-accent)]">
          {notice.full}
        </p>
      ) : null}

      <div className="tiro-kv border-t-0">
        <span className="k">{record.recordId}</span>
        <span className="v">Live record</span>
      </div>
      {record.reviewedAt ? (
        <div className="tiro-kv">
          <span className="k">Reviewed</span>
          <span className="v">{record.reviewedAt}</span>
        </div>
      ) : null}
      <div className="tiro-kv">
        <span className="k">Media</span>
        <span className="v">{record.media.length > 0 ? `${record.media.length} file(s)` : "None"}</span>
      </div>

      <h2 className="mt-6 font-[family-name:var(--font-display)] text-2xl italic tracking-tight text-[var(--tiro-text-soft)]">
        {record.title}
      </h2>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
        {record.summary}
      </p>

      <Link href={`/memories/${record.recordId}`} className="tiro-link mt-6 inline-block text-sm">
        View record
      </Link>
    </article>
  );
}
