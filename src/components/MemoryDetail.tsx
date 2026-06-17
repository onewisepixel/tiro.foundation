import Link from "next/link";
import type { MemoryRecord } from "@/data/memories";
import MemoryMediaViewer from "@/components/MemoryMediaViewer";

type MemoryDetailProps = {
  memory: MemoryRecord;
};

export default function MemoryDetail({ memory }: MemoryDetailProps) {
  const hasIntegrityNotes =
    Boolean(memory.confidenceLevel) ||
    Boolean(memory.multipleVersions) ||
    Boolean(memory.translatorNotes) ||
    Boolean(memory.disputedDetails) ||
    Boolean(memory.communityAnnotations);

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32"
      style={{ fontFamily: "var(--font-geist-sans, sans-serif)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div className="ambient-orb" />
      </div>

      <section className="relative z-10 px-6 pb-14 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Memory Record
          </p>
          <h1 className="mb-6 text-4xl font-semibold leading-tight tracking-tight text-[var(--tiro-text)] md:text-6xl">
            {memory.title}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            {memory.summary}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
                Record ID
              </p>
              <p className="mt-1 text-sm text-[var(--tiro-text-soft)]">{memory.recordId}</p>
            </div>
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
                Archive Status
              </p>
              <p className="mt-1 text-sm text-[var(--tiro-text-soft)]">{memory.archiveStatus}</p>
            </div>
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
                Last Reviewed
              </p>
              <p className="mt-1 text-sm text-[var(--tiro-text-soft)]">{memory.lastReviewed}</p>
            </div>
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
                Access Level
              </p>
              <p className="mt-1 text-sm text-[var(--tiro-text-soft)]">{memory.accessLevel}</p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--tiro-text-subtle)]">
                Location
              </p>
              <p className="mt-2 text-sm text-[var(--tiro-text-soft)]">{memory.location}</p>
            </div>
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--tiro-text-subtle)]">
                Language
              </p>
              <p className="mt-2 text-sm text-[var(--tiro-text-soft)]">{memory.language}</p>
            </div>
            <div className="rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--tiro-text-subtle)]">
                Era
              </p>
              <p className="mt-2 text-sm text-[var(--tiro-text-soft)]">{memory.era}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Provenance & Consent
          </p>
          <div className="space-y-5 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
            <p>
              <span className="text-[var(--tiro-text-soft)]">Contributor:</span> {memory.contributor}
            </p>
            <p>
              <span className="text-[var(--tiro-text-soft)]">Consent Status:</span> {memory.consentStatus}
            </p>
            <p>
              <span className="text-[var(--tiro-text-soft)]">Provenance Note:</span> {memory.provenance}
            </p>
            <p>
              <span className="text-[var(--tiro-text-soft)]">Rights and Usage:</span> {memory.rightsUsage}
            </p>
            {memory.sensitivity ? (
              <p>
                <span className="text-[var(--tiro-text-soft)]">Sensitivity:</span> {memory.sensitivity}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {hasIntegrityNotes ? (
        <section className="relative z-10 px-6 pb-12 md:pb-16">
          <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 backdrop-blur-sm md:p-5">
            <details className="group">
              <summary className="cursor-pointer list-none px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
                    Record Integrity Notes
                  </p>
                  <span className="text-xs text-[var(--tiro-text-muted)] transition-transform duration-200 group-open:rotate-180">
                    v
                  </span>
                </div>
              </summary>

              <div className="mt-2 space-y-4 border-t border-[var(--tiro-border)] px-3 pb-3 pt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                {memory.confidenceLevel ? (
                  <p>
                    <span className="text-[var(--tiro-text-soft)]">Confidence Level:</span>{" "}
                    {memory.confidenceLevel}
                  </p>
                ) : null}
                {memory.multipleVersions ? (
                  <p>
                    <span className="text-[var(--tiro-text-soft)]">Multiple Versions:</span>{" "}
                    {memory.multipleVersions}
                  </p>
                ) : null}
                {memory.translatorNotes ? (
                  <p>
                    <span className="text-[var(--tiro-text-soft)]">Translator Notes:</span>{" "}
                    {memory.translatorNotes}
                  </p>
                ) : null}
                {memory.disputedDetails ? (
                  <p>
                    <span className="text-[var(--tiro-text-soft)]">Disputed Details:</span>{" "}
                    {memory.disputedDetails}
                  </p>
                ) : null}
                {memory.communityAnnotations ? (
                  <p>
                    <span className="text-[var(--tiro-text-soft)]">Community Annotations:</span>{" "}
                    {memory.communityAnnotations}
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        </section>
      ) : null}

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Media Evidence
          </p>
          <MemoryMediaViewer media={memory.media} />
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Transcript
          </p>
          <p className="whitespace-pre-line font-[family-name:var(--font-geist-mono)] text-[15px] leading-[1.85] text-[var(--tiro-text-muted)]">
            {memory.transcript}
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Cultural Context / Notes
          </p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            {memory.culturalContext}
          </p>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">Tags</p>
          <div className="flex flex-wrap gap-3">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-1 text-xs tracking-[0.12em] text-[var(--tiro-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Related Nodes
          </p>
          <div className="flex flex-wrap gap-2.5">
            {memory.relatedNodes.map((node) => (
              node.href ? (
                <Link
                  key={`${node.type}-${node.label}`}
                  href={node.href}
                  className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-2 text-xs text-[var(--tiro-text-muted)] transition-colors duration-200 hover:bg-[var(--tiro-surface-strong)]"
                >
                  <span className="text-[var(--tiro-text-soft)]">{node.label}</span> - {node.type}
                </Link>
              ) : (
                <span
                  key={`${node.type}-${node.label}`}
                  className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-2 text-xs text-[var(--tiro-text-muted)]"
                >
                  <span className="text-[var(--tiro-text-soft)]">{node.label}</span> - {node.type}
                </span>
              )
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-5xl rounded-xl border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-7 backdrop-blur-sm md:p-9">
          <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Related Memories
          </p>
          <div className="space-y-4">
            {memory.relatedMemories.map((related) => (
              <Link
                key={related.href}
                href={related.href}
                className="block rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] p-4 transition-colors duration-200 hover:bg-[var(--tiro-surface-strong)]"
              >
                <p className="text-sm font-medium text-[var(--tiro-text-soft)] md:text-base">
                  {related.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  {related.summary}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
