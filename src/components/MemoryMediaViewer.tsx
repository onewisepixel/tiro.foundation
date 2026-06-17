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
      <figure className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
        <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
          No public media attached to this record.
        </p>
        <MediaMeta media={media} />
      </figure>
    );
  }

  if (media.type === "image") {
    return (
      <figure className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-5 backdrop-blur-sm md:p-7">
        <div className="overflow-hidden rounded-lg border border-[var(--tiro-border)] bg-[color-mix(in_srgb,var(--tiro-bg)_84%,black)]">
          {media.src ? (
            <img
              src={media.src}
              alt={media.alt || "Archival image"}
              className="h-auto w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-64 place-items-center bg-gradient-to-b from-[var(--tiro-surface-strong)] to-[var(--tiro-surface)] px-6 text-center md:h-80">
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
      <figure className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
        <div className="rounded-lg border border-[var(--tiro-border)] bg-[color-mix(in_srgb,var(--tiro-bg)_88%,black)] p-4 md:p-5">
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
    <figure className="rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-5 backdrop-blur-sm md:p-7">
      <div className="overflow-hidden rounded-lg border border-[var(--tiro-border)] bg-[color-mix(in_srgb,var(--tiro-bg)_84%,black)]">
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
