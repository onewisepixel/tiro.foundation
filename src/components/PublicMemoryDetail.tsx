import { getRecordKindNotice } from "@/data/recordNotices";
import { publicMemoryMediaSrc, type PublicMemoryRecord } from "@/lib/publicMemoryApi";

type PublicMemoryDetailProps = {
  record: PublicMemoryRecord;
};

function MediaItem({ recordId, mediaId, contentType }: { recordId: string; mediaId: string; contentType: string }) {
  const src = publicMemoryMediaSrc(recordId, mediaId);
  if (!src) {
    return null;
  }
  // Plain tags, not next/image — avoids a remotePatterns config entry and
  // a second image-optimizer caching layer for tiny, uncacheable fixture
  // media (see the milestone's caching decisions).
  if (contentType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="max-w-full rounded border border-[var(--tiro-border)]" />;
  }
  if (contentType.startsWith("audio/")) {
    return <audio controls src={src} className="w-full" />;
  }
  if (contentType.startsWith("video/")) {
    return <video controls src={src} className="max-w-full rounded border border-[var(--tiro-border)]" />;
  }
  return (
    <a href={src} className="tiro-link text-sm">
      Download ({contentType})
    </a>
  );
}

// Deliberately narrow — renders only the fields PublicMemoryRecord actually
// carries. No location/era/language/tags/transcript/culturalContext
// sections: fabricating them for a backend-sourced record would be
// dishonest about what this record actually contains. See MemoryDetail.tsx
// for the (unrelated, untouched) static-record equivalent.
export default function PublicMemoryDetail({ record }: PublicMemoryDetailProps) {
  const notice = getRecordKindNotice(record.recordKind);

  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-14 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-6">Live Record</p>
          <h1 className="mb-6 max-w-3xl font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            {record.title}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            {record.summary}
          </p>

          {notice ? (
            <p className="mt-6 inline-block border border-[var(--tiro-accent)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--tiro-accent)]">
              {notice.full}
            </p>
          ) : null}

          <div className="tiro-card mt-10">
            <div className="tiro-kv border-t-0">
              <span className="k">Record ID</span>
              <span className="v">{record.recordId}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Provenance</span>
              <span className="v">{record.provenanceRef}</span>
            </div>
            {record.reviewedAt ? (
              <div className="tiro-kv">
                <span className="k">Reviewed</span>
                <span className="v">{record.reviewedAt}</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {record.media.length > 0 ? (
        <section className="px-6 pb-12 md:pb-16">
          <div className="tiro-card mx-auto max-w-5xl">
            <p className="tiro-eyebrow mb-5">Media</p>
            <div className="space-y-6">
              {record.media.map((media) => (
                <MediaItem key={media.mediaId} recordId={record.recordId} mediaId={media.mediaId} contentType={media.contentType} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
