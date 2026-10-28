import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Concordance, { type ConcordanceRow } from "@/components/preview/memory-v1/Concordance";
import CopyCitation from "@/components/preview/memory-v1/CopyCitation";
import LayerStack from "@/components/preview/memory-v1/LayerStack";
import { ALL_LAYERS, CAPACITIES, RECORDS_BASE, type LayerKey } from "@/components/preview/memory-v1/layers";
import RecordMap from "@/components/preview/memory-v1/RecordMap";
import { RestrictedRecordNotice } from "@/components/trace/Boundary";
import EvidenceTag from "@/components/trace/EvidenceTag";
import OriginPoint from "@/components/trace/OriginPoint";
import PermissionGrid from "@/components/trace/PermissionGrid";
import SyntheticNotice, { SyntheticPill } from "@/components/trace/SyntheticNotice";
import TemporalRail from "@/components/trace/TemporalRail";
import VoiceSource from "@/components/trace/VoiceSource";
import type { EvidenceState } from "@/lib/livingTrace/evidence";
import { discoverableRouteIds, listDiscoverable, projectGraph, relationsFor, resolveRecord, SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";
import "../../memory-v1.css";

// A memory record, in two coordinated views.
//
// The structured record is the primary content: every field, in layer
// order, with headings, anchors, evidence states in words, and a citation.
// A researcher can read, search, link, and cite it without touching the
// visualization. Beside it (or, on narrow screens, above it as a bar) the
// exploded record maps the same layers: reading a layer lifts its sheet;
// choosing a sheet moves to its section.
//
// Same disclosure rules as the Living Trace routes this builds on: only
// discoverable ids are generated and dynamicParams = false, so an
// undiscoverable record's id 404s exactly like an id that never existed. A
// restricted record renders its authorized notice and nothing else, under
// a generic title. Every value comes from the projection.
export const dynamicParams = false;

export function generateStaticParams() {
  return discoverableRouteIds().map((id) => ({ id }));
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const resolved = resolveRecord(id);
  const robots = { index: false, follow: false };
  if (!resolved) {
    return { robots };
  }
  if (resolved.state === "restricted-notice") {
    return { title: "Restricted record (preview) — The Tiro Foundation", robots };
  }
  return {
    title: `${resolved.record.title} (synthetic demonstration, preview) — The Tiro Foundation`,
    description: "A synthetic specimen record. Not archival testimony.",
    robots,
  };
}

const layer = (key: LayerKey) => ALL_LAYERS.find((l) => l.key === key)!;

function LayerSection({ k, children }: { k: LayerKey; children: React.ReactNode }) {
  const l = layer(k);
  return (
    <section id={`layer-${k}`} aria-labelledby={`layer-${k}-title`} className="mv1-layer">
      <h2 id={`layer-${k}-title`} tabIndex={-1}>
        <span className="mv1-layer-label">{l.label}</span>
        <span className="mv1-layer-q">{l.question}</span>
      </h2>
      <p className="mv1-layer-why">{l.method}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Field({ term, value, evidence, note }: { term: string; value: string; evidence?: EvidenceState; note?: string }) {
  return (
    <div>
      <dt className="mv1-dt">{term}</dt>
      <dd>
        {value}
        {evidence ? (
          <span className="ml-2 inline-block align-middle">
            <EvidenceTag evidence={evidence} />
          </span>
        ) : null}
        {note ? <span className="mt-1 block text-sm text-[var(--tiro-text-muted)]">{note}</span> : null}
      </dd>
    </div>
  );
}

function Crumbs({ id }: { id: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mv1-crumbs">
      <Link href="/preview/home-v5">The Living Archive</Link> <span aria-hidden="true">/</span>{" "}
      <Link href="/preview/memory-v1">The Memory Project</Link> <span aria-hidden="true">/</span>{" "}
      <Link href="/preview/memory-v1#records">Demonstration records</Link> <span aria-hidden="true">/</span>{" "}
      <span className="text-[var(--tiro-accent)]" aria-current="page">
        {id}
      </span>
    </nav>
  );
}

export default async function RecordPreview({ params }: PageProps) {
  const { id } = await params;
  const resolved = resolveRecord(id);
  if (!resolved) {
    notFound();
  }

  if (resolved.state === "restricted-notice") {
    return (
      <main className="mv1 bg-[var(--tiro-bg)] pt-[63px] text-[var(--tiro-text)]">
        <div className="mv1-frame mv1-record-head">
          <Crumbs id={resolved.notice.reference} />
          <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
            <div className="max-w-[13rem]">
              <LayerStack sealed />
              <p className="mv1-fineprint mt-3">One layer: the notice. Nothing beneath it is sent to this page.</p>
            </div>
            <div className="max-w-3xl">
              <RestrictedRecordNotice notice={resolved.notice} headingLevel={1} />
              <p className="mv1-body mt-6 !text-sm">
                Synthetic demonstration of a restricted record. The &ldquo;rights authority&rdquo; named in the notice is part of the fiction. View this
                page&apos;s source: the record&apos;s title, description, and other layers are not in it, because they were never sent.
              </p>
              <p className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Link href="/preview/memory-v1#records" className="mv1-more">
                  Back to the demonstration records
                </Link>
                <Link href="/community-rights" className="mv1-more">
                  Why access is not entitlement
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const record = resolved.record;
  const graph = projectGraph();
  const relations = relationsFor(graph, record.recordId);
  const toPreview = (href: string | null) => (href ? href.replace(SPECIMEN_ROUTE, RECORDS_BASE) : null);
  const sourceLink = relations.find((r) => r.edge.provenance && r.edge.relation === "Source of the account");
  const derived: ConcordanceRow[] = relations.filter((r) => r !== sourceLink).map((r) => ({ ...r, otherHref: toPreview(r.otherHref) }));

  const publicIds = listDiscoverable().flatMap((e) => (e.state === "public" ? [e.recordId] : []));
  const at = publicIds.indexOf(record.recordId);
  const prev = at > 0 ? publicIds[at - 1] : null;
  const next = at < publicIds.length - 1 ? publicIds[at + 1] : null;
  const created = record.provenance.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.at))?.at;
  const citation = `The Tiro Foundation, The Memory Project. “${record.title}.” Record ${record.recordId}, synthetic demonstration${created ? `, created ${created}` : ""}. Not archival evidence.`;

  return (
    <main className="mv1 bg-[var(--tiro-bg)] pt-[63px] text-[var(--tiro-text)]">
      <header className="mv1-frame mv1-record-head">
        <Crumbs id={record.recordId} />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="mv1-eyebrow">Memory record · {record.recordId}</p>
          <SyntheticPill />
        </div>
        <SyntheticNotice className="mt-6 max-w-3xl" />
        <h1 className="mv1-h1 mt-8 max-w-4xl">{record.title}</h1>
        <p className="mv1-lede mt-6 max-w-3xl">{record.summary}</p>
        <dl className="mv1-states mt-8">
          <div className="flex gap-2">
            <dt className="mv1-dt">Publication</dt>
            <dd className="text-sm text-[var(--tiro-text-soft)]">{record.publicationStatus}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="mv1-dt">Custody</dt>
            <dd className="text-sm text-[var(--tiro-text-soft)]">{record.custodyStatus}</dd>
          </div>
        </dl>
        <p className="mv1-fineprint mt-4">Schema proposal: no approved Memory Record Specification yet.</p>
      </header>

      <div className="mv1-frame mv1-record-body">
        <RecordMap />

        <article aria-label={`Record ${record.recordId}`} className="min-w-0">
          <LayerSection k="account">
            <VoiceSource mediaNote={record.media.note} transcriptNote={record.transcript.note} accessNote={record.publicationStatus} />
            <dl className="mv1-fields mt-6">
              {record.context.map((c) => (
                <Field key={c.field} term={c.field} value={c.value} evidence={c.evidence} note={c.note} />
              ))}
              <Field term="AI processing" value={record.aiProcessing} />
            </dl>
          </LayerSection>

          <LayerSection k="source">
            <div className="flex items-start gap-4">
              <OriginPoint size={26} className="mt-1" />
              <div>
                <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)]">{record.source.label}</p>
                <p className="mt-2 max-w-[36rem] font-[family-name:var(--font-display)] text-lg italic leading-relaxed text-[var(--tiro-text-soft)]">
                  {record.source.note}
                </p>
                {sourceLink ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[var(--tiro-text-muted)]">
                    <EvidenceTag evidence={sourceLink.edge.evidence} /> {sourceLink.edge.summary}
                  </p>
                ) : null}
              </div>
            </div>
          </LayerSection>

          <LayerSection k="authority">
            <dl className="mv1-fields">
              {record.capacities.map((c) => (
                <Field key={c.capacity} term={c.capacity} value={c.value} evidence={c.evidence} />
              ))}
            </dl>
            <p className="mv1-body mt-4 !text-sm">
              {CAPACITIES.join(", ")} are separate capacities. One person may hold several only with supporting evidence.
            </p>
          </LayerSection>

          <LayerSection k="terms">
            <dl className="mv1-fields">
              <Field term="Publication" value={record.publicationStatus} />
              <Field term="Custody" value={record.custodyStatus} />
            </dl>
            <h3 className="mv1-dt mb-2 mt-6">Permitted uses, each on its own</h3>
            <PermissionGrid uses={record.uses} />
            <h3 className="mv1-dt mb-2 mt-6">Withdrawal</h3>
            <p className="mv1-body !text-[0.9375rem]">
              {record.withdrawal}{" "}
              <Link href="/community-rights" className="mv1-more !text-[0.9375rem]">
                Read the governing policy
              </Link>
            </p>
          </LayerSection>

          <LayerSection k="provenance">
            <TemporalRail entries={record.provenance} />
          </LayerSection>

          <LayerSection k="derived">
            {derived.length > 0 ? (
              <Concordance rows={derived} idPrefix={`mv1-${record.recordId}`} />
            ) : (
              <p className="mv1-body">Nothing has been derived from this record, and no relationships are on record.</p>
            )}
            <Link href="/living-trace#discover" className="mv1-more mt-5">
              Trace each account to its source in the full synthetic map<span aria-hidden="true"> →</span>
            </Link>
          </LayerSection>

          <section aria-labelledby="mv1-cite-title" className="mv1-layer">
            <h2 id="mv1-cite-title" className="mv1-layer-label">
              Cite this record
            </h2>
            <div className="mv1-cite-block mt-5">
              <p className="mv1-dt">Citation format, shown on a demonstration</p>
              <p className="mv1-cite-text mt-2">{citation}</p>
              <CopyCitation text={citation} />
            </div>
          </section>

          <nav aria-label="Other demonstration records" className="mv1-pager mt-16">
            {prev ? (
              <Link href={`${RECORDS_BASE}/${prev}`} className="mv1-more">
                <span aria-hidden="true">← </span>Previous record · {prev}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`${RECORDS_BASE}/${next}`} className="mv1-more sm:text-right">
                Next record · {next}
                <span aria-hidden="true"> →</span>
              </Link>
            ) : (
              <span />
            )}
            <Link href="/preview/memory-v1" className="mv1-more">
              <span aria-hidden="true">← </span>Back to the Memory Project
            </Link>
          </nav>
        </article>
      </div>
    </main>
  );
}
