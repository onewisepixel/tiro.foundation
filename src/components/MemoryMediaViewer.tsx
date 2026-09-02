import Image from "next/image";
import type { MemoryMedia } from "@/data/memories";

type MemoryMediaViewerProps = {
  media: MemoryMedia;
};

function MediaMeta({ media }: { media: MemoryMedia }) {
  if (!media.caption && !media.credit && !media.duration) {
    return null;
  }

  return (
    <figcaption className="mt-4 space-y-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
      {media.caption ? <p>{media.caption}</p> : null}
      {media.duration ? (
        <p>
          <span className="text-[var(--tiro-text-soft)]">Duration:</span> {media.duration}
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

  if (media.type === "image") {
    return (
      <figure className="tiro-card">
        <div className="overflow-hidden border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)]">
          {media.src ? (
            <div className="relative h-64 w-full md:h-80">
              <Image
                src={media.src}
                alt={media.alt || "Archival image"}
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="grid h-64 place-items-center px-6 text-center md:h-80">
              <p className="max-w-lg text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                Archival image frame reserved for authenticated documentary
                plate or scan.
              </p>
            </div>
          )}
        </div>
        <MediaMeta media={media} />
      </figure>
    );
  }

  if (media.type === "audio") {
    return (
      <figure className="tiro-card">
        <div className="border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)] p-4 md:p-5">
          <audio
            controls
            preload="none"
            className="w-full"
            aria-label="Audio evidence player"
          >
            {media.src ? <source src={media.src} /> : null}
          </audio>
          {!media.src ? (
            <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
              Audio capture preserved in record metadata. Public playback is not
              attached in this prototype.
            </p>
          ) : null}
        </div>
        <MediaMeta media={media} />
      </figure>
    );
  }

  return (
    <figure className="tiro-card">
      <div className="overflow-hidden border border-[var(--tiro-border)] bg-[var(--tiro-bg-deep)]">
        <video
          controls
          preload="metadata"
          className="h-auto w-full"
          aria-label="Video evidence player"
        >
          {media.src ? <source src={media.src} /> : null}
        </video>
        {!media.src ? (
          <div className="border-t border-[var(--tiro-border)] px-5 py-4">
            <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">
              Video documentation is cataloged but not publicly attached in this
              prototype.
            </p>
          </div>
        ) : null}
      </div>
      <MediaMeta media={media} />
    </figure>
  );
}
