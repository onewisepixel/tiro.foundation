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
    return <img src={src} alt="" className="mm-live-media" />;
  }
  if (contentType.startsWith("audio/")) {
    return <audio controls src={src} className="w-full" />;
  }
  if (contentType.startsWith("video/")) {
    return <video controls src={src} className="mm-live-media" />;
  }
  return (
    <a href={src} className="la-more">
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
    <main id="top" className="la mm bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame mm-wrap mm-head">
        <p className="la-eyebrow">Live Record</p>
        <h1 className="mm-h1 mt-8">{record.title}</h1>
        <p className="mm-intro mt-8">{record.summary}</p>

        {notice ? <p className="mm-notice mt-8">{notice.full}</p> : null}

        <dl className="mm-ledger">
          <div>
            <dt className="la-term">Record ID</dt>
            <dd className="mm-id">{record.recordId}</dd>
          </div>
          <div>
            <dt className="la-term">Provenance</dt>
            <dd>{record.provenanceRef}</dd>
          </div>
          {record.reviewedAt ? (
            <div>
              <dt className="la-term">Reviewed</dt>
              <dd>{record.reviewedAt}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {record.media.length > 0 ? (
        <div className="la-frame mm-wrap mm-sections">
          <section id="media" aria-labelledby="media-title" className="mm-section">
            <h2 id="media-title" className="mm-h2">
              Media
            </h2>
            <div className="mm-body mm-live-media-list">
              {record.media.map((media) => (
                <MediaItem key={media.mediaId} recordId={record.recordId} mediaId={media.mediaId} contentType={media.contentType} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
