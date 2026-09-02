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
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-14 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-6">Memory Record</p>
          <h1 className="mb-6 max-w-3xl font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            {memory.title}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            {memory.summary}
          </p>

          <div className="tiro-card mt-10">
            <div className="tiro-kv">
              <span className="k">Record ID</span>
              <span className="v">{memory.recordId}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Archive Status</span>
              <span className="v">{memory.archiveStatus}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Last Reviewed</span>
              <span className="v">{memory.lastReviewed}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Access Level</span>
              <span className="v">{memory.accessLevel}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Location</span>
              <span className="v">{memory.location}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Language</span>
              <span className="v">{memory.language}</span>
            </div>
            <div className="tiro-kv">
              <span className="k">Era</span>
              <span className="v">{memory.era}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Provenance &amp; Consent</p>
          <div className="space-y-5 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
            <p>
              <span className="text-[var(--tiro-text-soft)]">Contributor:</span> {memory.contributor}
            </p>
            <p>
              <span className="text-[var(--tiro-text-soft)]">Source Authority:</span> {memory.sourceAuthority}
            </p>
            {memory.legalRights ? (
              <p>
                <span className="text-[var(--tiro-text-soft)]">Legal Rights:</span> {memory.legalRights}
              </p>
            ) : null}
            <p>
              <span className="text-[var(--tiro-text-soft)]">Consent Status:</span> {memory.consentStatus}
            </p>
            <p>
              <span className="text-[var(--tiro-text-soft)]">Consent Withdrawal:</span> {memory.consentWithdrawal}
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
        <section className="px-6 pb-12 md:pb-16">
          <div className="tiro-card mx-auto max-w-5xl !p-0">
            <details className="group">
              <summary className="cursor-pointer list-none px-6 py-5 md:px-9">
                <div className="flex items-center justify-between gap-4">
                  <p className="tiro-eyebrow">Record Integrity Notes</p>
                  <span className="text-xs text-[var(--tiro-text-muted)] transition-transform duration-200 group-open:rotate-180">
                    v
                  </span>
                </div>
              </summary>

              <div className="space-y-4 border-t border-[var(--tiro-border)] px-6 pb-6 pt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:px-9 md:text-base">
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

      <section className="px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Media Evidence</p>
          <MemoryMediaViewer media={memory.media} />
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Transcript</p>
          <p className="whitespace-pre-line font-[family-name:var(--font-code)] text-[15px] leading-[1.85] text-[var(--tiro-text-muted)]">
            {memory.transcript}
          </p>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Cultural Context / Notes</p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            {memory.culturalContext}
          </p>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Tags</p>
          <div className="flex flex-wrap gap-3">
            {memory.tags.map((tag) => (
              <span key={tag} className="tiro-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Related Nodes</p>
          <div className="flex flex-wrap gap-2.5">
            {memory.relatedNodes.map((node) =>
              node.href ? (
                <Link key={`${node.type}-${node.label}`} href={node.href} className="tiro-chip">
                  <span className="text-[var(--tiro-text-soft)]">{node.label}</span>
                  <span className="type">{node.type}</span>
                </Link>
              ) : (
                <span key={`${node.type}-${node.label}`} className="tiro-chip">
                  <span className="text-[var(--tiro-text-soft)]">{node.label}</span>
                  <span className="type">{node.type}</span>
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="tiro-card mx-auto max-w-5xl">
          <p className="tiro-eyebrow mb-5">Related Memories</p>
          <div className="space-y-4">
            {memory.relatedMemories.map((related) => (
              <Link key={related.href} href={related.href} className="tiro-card-link border border-[var(--tiro-border)] p-4">
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
