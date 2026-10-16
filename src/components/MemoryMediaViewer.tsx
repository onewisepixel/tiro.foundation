import Image from "next/image";
import type { MemoryMedia } from "@/data/memories";

type MemoryMediaViewerProps = {
  media: MemoryMedia;
};

const KIND_NOUN: Record<Exclude<MemoryMedia["type"], "none">, string> = {
  image: "image",
  audio: "audio recording",
  video: "video recording",
};

function MediaMeta({ media }: { media: MemoryMedia }) {
  // Duration describes a file; with no file attached there is nothing for
  // it to describe, so it is not shown.
  const duration = media.src ? media.duration : undefined;
  if (!media.caption && !media.credit && !duration) {
    return null;
  }

  return (
    <figcaption className="mt-4 space-y-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
      {media.caption ? <p>{media.caption}</p> : null}
      {duration ? (
        <p>
          <span className="text-[var(--tiro-text-soft)]">Duration:</span> {duration}
        </p>
      ) : null}
      {media.credit ? (
        <p>
          <span className="text-[var(--tiro-text-soft)]">Credit:</span> {media.credit}
        </p>
      ) : null}
    </figcaption>
  );
}

// No player, frame, or waveform is drawn for media that does not exist:
// an empty player implies a recording is being withheld. The frame states
// plainly that there is no file.
function NoFile({ media }: { media: MemoryMedia & { type: "image" | "audio" | "video" } }) {
  return (
    <figure className="tiro-card">
      <div className="border border-dashed border-[var(--tiro-border-strong)] px-5 py-8 text-center md:py-10">
        <p className="lt-label">No {KIND_NOUN[media.type]} attached</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          No file exists for this record. A real record would show its {KIND_NOUN[media.type]} here, only after consent and review,
          and never autoplayed{media.type === "image" ? "" : ", with a transcript alongside"}.
        </p>
      </div>
      <MediaMeta media={media} />
    </figure>
  );
}

export default function MemoryMediaViewer({ media }: MemoryMediaViewerProps) {
  if (media.type === "none") {
    return (
      <figure className="tiro-card">
        <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
          No public media attached to this record.
        </p>
        <MediaMeta media={media} />
      </figure>
    );
  }

  if (!media.src) {
    return <NoFile media={media as MemoryMedia & { type: "image" | "audio" | "video" }} />;
  }

  if (media.type === "image") {
    return (
      <figure className="tiro-card">
        <div className="overflow-hidden border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)]">
          <div className="relative h-64 w-full md:h-80">
            <Image
              src={media.src}
              alt={media.alt || "Archival image"}
              fill
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        </div>
        <MediaMeta media={media} />
      </figure>
    );
  }

  if (media.type === "audio") {
    return (
      <figure className="tiro-card">
        <div className="border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)] p-4 md:p-5">
          <audio controls preload="none" className="w-full" aria-label="Audio evidence player">
            <source src={media.src} />
          </audio>
        </div>
        <MediaMeta media={media} />
      </figure>
    );
  }

  return (
    <figure className="tiro-card">
      <div className="overflow-hidden border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)]">
        <video controls preload="metadata" className="h-auto w-full" aria-label="Video evidence player">
          <source src={media.src} />
        </video>
      </div>
      <MediaMeta media={media} />
    </figure>
  );
}
