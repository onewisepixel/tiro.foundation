import type { ReactNode } from "react";
import Link from "next/link";
import { getMemoryById, type MemoryRecord } from "@/data/memories";
import { getRecordKindNotice } from "@/data/recordNotices";
import MemoryMediaViewer from "@/components/MemoryMediaViewer";

type MemoryDetailProps = {
  memory: MemoryRecord;
};

// One part of the record: its heading beside its text on wide screens,
// with an anchor (styled by src/app/memories/memories.css).
function RecordSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mm-section">
      <h2 id={`${id}-title`} className="mm-h2">
        {title}
      </h2>
      <div className="mm-body">{children}</div>
    </section>
  );
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p className="mm-field">
      <span className="mm-field-name">{name}:</span> {children}
    </p>
  );
}

export default function MemoryDetail({ memory }: MemoryDetailProps) {
  const notice = getRecordKindNotice(memory.recordKind);
  const isDemo = memory.recordKind === "demo";

  const hasIntegrityNotes =
    Boolean(memory.confidenceLevel) ||
    Boolean(memory.multipleVersions) ||
    Boolean(memory.translatorNotes) ||
    Boolean(memory.disputedDetails) ||
    Boolean(memory.communityAnnotations);

  return (
    <main id="top" className="la mm bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame mm-wrap mm-head">
        <p className="la-eyebrow">Memory Record</p>
        {/* The notice precedes every archival-looking detail, the title
            included (docs/ethos.txt §6.1). */}
        {notice ? <p className="mm-notice mt-8">{notice.full}</p> : null}
        <h1 className="mm-h1 mt-8">{memory.title}</h1>
        <p className="mm-intro mt-8">{memory.summary}</p>

        <dl className="mm-ledger">
          <div>
            <dt className="la-term">Record ID</dt>
            <dd className="mm-id">{memory.recordId}</dd>
          </div>
          <div>
            <dt className="la-term">Archive Status</dt>
            <dd>{memory.archiveStatus}</dd>
          </div>
          <div>
            <dt className="la-term">Last Reviewed</dt>
            <dd>{memory.lastReviewed}</dd>
          </div>
          <div>
            <dt className="la-term">Access Level</dt>
            <dd>{memory.accessLevel}</dd>
          </div>
          <div>
            <dt className="la-term">Location</dt>
            <dd>{memory.location}</dd>
          </div>
          <div>
            <dt className="la-term">Language</dt>
            <dd>{memory.language}</dd>
          </div>
          <div>
            <dt className="la-term">Era</dt>
            <dd>{memory.era}</dd>
          </div>
        </dl>
      </header>

      <div className="la-frame mm-wrap mm-sections">
        <RecordSection id="provenance-consent" title="Provenance & Consent">
          <div className="mm-fields">
            <Field name="Contributor">{memory.contributor}</Field>
            <Field name="Source Authority">{memory.sourceAuthority}</Field>
            {memory.legalRights ? <Field name="Legal Rights">{memory.legalRights}</Field> : null}
            <Field name="Consent Status">{memory.consentStatus}</Field>
            <Field name="Consent Withdrawal">{memory.consentWithdrawal}</Field>
            <Field name="Provenance Note">{memory.provenance}</Field>
            <Field name="Rights and Usage">{memory.rightsUsage}</Field>
            {memory.sensitivity ? <Field name="Sensitivity">{memory.sensitivity}</Field> : null}
          </div>
        </RecordSection>

        {hasIntegrityNotes ? (
          <section id="integrity-notes" className="mm-section mm-section-details">
            <details className="mm-details">
              <summary>
                <h2 className="mm-h2">Record Integrity Notes</h2>
                <span className="mm-toggle">v</span>
              </summary>

              <div className="mm-body mm-fields">
                {memory.confidenceLevel ? <Field name="Confidence Level">{memory.confidenceLevel}</Field> : null}
                {memory.multipleVersions ? <Field name="Multiple Versions">{memory.multipleVersions}</Field> : null}
                {memory.translatorNotes ? <Field name="Translator Notes">{memory.translatorNotes}</Field> : null}
                {memory.disputedDetails ? <Field name="Disputed Details">{memory.disputedDetails}</Field> : null}
                {memory.communityAnnotations ? (
                  <Field name="Community Annotations">{memory.communityAnnotations}</Field>
                ) : null}
              </div>
            </details>
          </section>
        ) : null}

        <RecordSection id="media" title={isDemo ? "Media" : "Media Evidence"}>
          <div className="mm-media">
            <MemoryMediaViewer media={memory.media} />
          </div>
        </RecordSection>

        <RecordSection id="transcript" title="Transcript">
          <p className="mm-transcript">{memory.transcript}</p>
        </RecordSection>

        <RecordSection id="cultural-context" title="Cultural Context / Notes">
          <p className="mm-text">{memory.culturalContext}</p>
        </RecordSection>

        <RecordSection id="tags" title="Tags">
          <div className="mm-tags">
            {memory.tags.map((tag) => (
              <span key={tag} className="tiro-chip">
                {tag}
              </span>
            ))}
          </div>
        </RecordSection>

        <RecordSection id="related-nodes" title="Related Nodes">
          <div className="mm-tags">
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
        </RecordSection>

        <RecordSection id="related-memories" title="Related Memories">
          <div className="mm-records">
            {memory.relatedMemories.map((related) => {
              const targetRecord = getMemoryById(related.id);
              const isDemo = targetRecord?.recordKind === "demo";

              return (
                <Link key={related.href} href={related.href}>
                  <span className="mm-record-title">
                    <span>{related.title}</span>
                    {isDemo ? <span className="tiro-chip">Demo</span> : null}
                  </span>
                  <span className="mm-record-summary">{related.summary}</span>
                </Link>
              );
            })}
          </div>
        </RecordSection>
      </div>
    </main>
  );
}
