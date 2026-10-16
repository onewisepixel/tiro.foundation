import Link from "next/link";
import { EVIDENCE } from "@/lib/livingTrace/evidence";
import type { GraphEdge, SpecimenRecord } from "@/lib/livingTrace/projection";
import EvidenceTag, { EvidenceStroke } from "./EvidenceTag";
import OriginPoint from "./OriginPoint";
import PermissionGrid from "./PermissionGrid";
import SyntheticNotice, { SyntheticPill } from "./SyntheticNotice";
import TemporalRail from "./TemporalRail";
import VoiceSource from "./VoiceSource";

// Proof B — The Record.
//
// A working archival view, set in the Paper register so a structured record
// reads as distinct from the atmospheric page around it. Field set follows
// docs/ethos.txt §3.2–3.3 and §12 and docs/memory.txt's display model. No
// approved Memory Record Specification exists, so the layout is labeled a
// schema proposal. Order matters: the synthetic notice, then source and
// authority, then media: provenance and permission before consumption
// (docs/memory.txt §2 rationale).
export type RecordRelation = {
  edge: GraphEdge;
  // The node at the other end, from this record's point of view.
  otherLabel: string;
  otherHref: string | null;
  outgoing: boolean;
};

type RecordSpecimenProps = {
  record: SpecimenRecord;
  relations: RecordRelation[];
  headingLevel?: 1 | 2;
  // Where "view source chain" links go (the constellation), if present.
  chainHref?: (edgeId: string) => string;
  // A compact form for the homepage: trims the right rail to essentials.
  compact?: boolean;
};

function FieldRow({ term, value, evidence, note }: { term: string; value: string; evidence?: keyof typeof EVIDENCE; note?: string }) {
  return (
    <div className="grid gap-1 border-t border-[var(--tiro-border)] py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="lt-label pt-0.5">{term}</dt>
      <dd>
        <span className="text-sm text-[var(--tiro-text)]">{value}</span>
        {evidence ? (
          <span className="ml-2 inline-block">
            <EvidenceTag evidence={evidence} />
          </span>
        ) : null}
        {note ? <span className="mt-1 block text-xs leading-relaxed text-[var(--tiro-text-muted)]">{note}</span> : null}
      </dd>
    </div>
  );
}

// Who made the claims in a relationship, kept separate from who recorded it.
function claimLine(edge: GraphEdge): string {
  const claimants = [...new Set(edge.accounts.flatMap((a) => (a.state === "attributed" ? [a.assertedBy] : [])))];
  const withheld = edge.accounts.filter((a) => a.state === "withheld").length;
  const parts: string[] = [];
  if (claimants.length > 0) {
    parts.push(`Claimed by: ${claimants.join("; ")}.`);
  } else if (edge.accounts.length === 0) {
    parts.push("No one has claimed this.");
  }
  if (withheld > 0) {
    parts.push(`Plus ${withheld} account${withheld === 1 ? "" : "s"} from a restricted source, acknowledged only.`);
  }
  parts.push(`Recorded by: ${edge.recordedBy}.`);
  return parts.join(" ");
}

export default function RecordSpecimen({ record, relations, headingLevel = 2, chainHref, compact = false }: RecordSpecimenProps) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const Section = headingLevel === 1 ? "h2" : "h3";

  return (
    <article
      aria-labelledby={`${record.recordId}-title`}
      className="tiro-register-paper border border-[var(--tiro-border-strong)] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
    >
      <header className="border-b border-[var(--tiro-border)] px-5 pb-6 pt-5 md:px-9 md:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="lt-label">
            Memory record <span aria-hidden="true">/</span> <span className="text-[var(--tiro-text)]">{record.recordId}</span>
          </p>
          <SyntheticPill />
        </div>
        <SyntheticNotice className="mt-5 max-w-2xl" />
        <Title id={`${record.recordId}-title`} className="lt-display mt-6 max-w-3xl text-3xl md:text-[2.75rem]">
          {record.title}
        </Title>
        <p className="mt-4 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">{record.summary}</p>
        <p className="lt-label mt-5">Schema proposal: no approved Memory Record Specification yet</p>
      </header>

      <div className="grid md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="px-5 py-6 md:border-r md:border-[var(--tiro-border)] md:px-9 md:py-8">
          <section aria-labelledby={`${record.recordId}-source`}>
            <Section id={`${record.recordId}-source`} className="lt-label text-[var(--tiro-text)]">
              Source
            </Section>
            <div className="mt-3 flex items-start gap-3">
              <OriginPoint size={22} className="mt-1" />
              <div>
                <p className="font-[family-name:var(--font-display)] text-xl">{record.source.label}</p>
                <p className="mt-1 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">{record.source.note}</p>
              </div>
            </div>
          </section>

          <section aria-labelledby={`${record.recordId}-voice`} className="mt-8">
            <Section id={`${record.recordId}-voice`} className="lt-label mb-3 text-[var(--tiro-text)]">
              Voice and transcript
            </Section>
            <VoiceSource mediaNote={record.media.note} transcriptNote={record.transcript.note} accessNote={record.publicationStatus} />
          </section>

          <section aria-labelledby={`${record.recordId}-context`} className="mt-8">
            <Section id={`${record.recordId}-context`} className="lt-label mb-1 text-[var(--tiro-text)]">
              Context
            </Section>
            <dl>
              {record.context.map((field) => (
                <FieldRow key={field.field} term={field.field} value={field.value} evidence={field.evidence} note={field.note} />
              ))}
              <FieldRow term="AI processing" value={record.aiProcessing} />
            </dl>
          </section>

          <section aria-labelledby={`${record.recordId}-related`} className="mt-8">
            <Section id={`${record.recordId}-related`} className="lt-label mb-1 text-[var(--tiro-text)]">
              Related records and traces
            </Section>
            {relations.length === 0 ? (
              <p className="border-t border-[var(--tiro-border)] py-3 text-sm text-[var(--tiro-text-muted)]">
                No relationships on record.
              </p>
            ) : (
              <ul>
                {relations.map(({ edge, otherLabel, otherHref, outgoing }) => (
                  <li key={edge.id} className="border-t border-[var(--tiro-border)] py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <EvidenceStroke evidence={edge.evidence} />
                      <span className="text-sm text-[var(--tiro-text)]">
                        {edge.relation} <span aria-hidden="true" className="text-[var(--tiro-text-muted)]">{outgoing ? "→" : "←"}</span>
                        <span className="sr-only">{outgoing ? "to" : "from"}</span>{" "}
                        {otherHref ? (
                          <Link href={otherHref} className="tiro-link !text-[var(--tiro-text)]">
                            {otherLabel}
                          </Link>
                        ) : (
                          <span>{otherLabel}</span>
                        )}
                      </span>
                      <span className="lt-label !tracking-[0.12em]">{EVIDENCE[edge.evidence].label}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                      {edge.summary} <span className="text-[var(--tiro-text-soft)]">{claimLine(edge)}</span>
                    </p>
                    {chainHref ? (
                      <Link href={chainHref(edge.id)} className="tiro-link mt-1 inline-block text-xs">
                        View source chain
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t border-[var(--tiro-border)] px-5 py-6 md:border-t-0 md:px-8 md:py-8">
          <section aria-labelledby={`${record.recordId}-authority`}>
            <Section id={`${record.recordId}-authority`} className="lt-label mb-1 text-[var(--tiro-text)]">
              Authority and capacities
            </Section>
            <dl>
              {(compact ? record.capacities.slice(0, 2) : record.capacities).map((c) => (
                <div key={c.capacity} className="border-t border-[var(--tiro-border)] py-2.5">
                  <dt className="lt-label">{c.capacity}</dt>
                  <dd className="mt-1 text-sm text-[var(--tiro-text)]">{c.value}</dd>
                  <dd className="mt-1">
                    <EvidenceTag evidence={c.evidence} />
                  </dd>
                </div>
              ))}
            </dl>
            {compact ? null : (
              <p className="mt-2 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                Collector, contributor, subject, source authority, rights holder, and signer are separate capacities.
                One person may hold several only with supporting evidence.
              </p>
            )}
          </section>

          <section aria-labelledby={`${record.recordId}-consent`} className="mt-8">
            <Section id={`${record.recordId}-consent`} className="lt-label mb-1 text-[var(--tiro-text)]">
              Consent and access
            </Section>
            <dl>
              <div className="border-t border-[var(--tiro-border)] py-2.5">
                <dt className="lt-label">Publication</dt>
                <dd className="mt-1 text-sm text-[var(--tiro-text)]">{record.publicationStatus}</dd>
              </div>
              <div className="border-t border-[var(--tiro-border)] py-2.5">
                <dt className="lt-label">Custody</dt>
                <dd className="mt-1 text-sm text-[var(--tiro-text)]">{record.custodyStatus}</dd>
              </div>
            </dl>
            <p className="lt-label mb-2 mt-4">Permitted uses, each on its own</p>
            <PermissionGrid uses={record.uses} />
          </section>

          {compact ? null : (
            <>
              <section aria-labelledby={`${record.recordId}-withdrawal`} className="mt-8">
                <Section id={`${record.recordId}-withdrawal`} className="lt-label mb-2 text-[var(--tiro-text)]">
                  Withdrawal
                </Section>
                <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  {record.withdrawal}{" "}
                  <Link href="/community-rights" className="tiro-link !text-[var(--tiro-text)]">
                    Read the governing policy
                  </Link>
                  .
                </p>
              </section>

              <section aria-labelledby={`${record.recordId}-revision`} className="mt-8">
                <Section id={`${record.recordId}-revision`} className="lt-label mb-3 text-[var(--tiro-text)]">
                  Revision and provenance
                </Section>
                <TemporalRail entries={record.provenance} />
              </section>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
