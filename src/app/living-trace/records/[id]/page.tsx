import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RestrictedRecordNotice } from "@/components/trace/Boundary";
import RecordSpecimen from "@/components/trace/RecordSpecimen";
import { discoverableRouteIds, projectGraph, relationsFor, resolveRecord } from "@/lib/livingTrace/projection";

// Proof B and Proof C as real routes.
//
// Only discoverable ids are generated, and dynamicParams = false makes
// every other id (including an undiscoverable record's) the same 404 as an
// id that never existed: the build output itself contains no page for an
// undiscoverable record. A restricted record renders only its authorized
// notice, under a generic title, so even the document <title> discloses
// nothing the notice does not.
export const dynamicParams = false;

export function generateStaticParams() {
  return discoverableRouteIds().map((id) => ({ id }));
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const resolved = resolveRecord(id);
  if (!resolved) {
    return {};
  }
  if (resolved.state === "restricted-notice") {
    return { title: "Restricted record — The Tiro Foundation" };
  }
  return {
    title: `${resolved.record.title} (synthetic demonstration) — The Tiro Foundation`,
    description: "A synthetic specimen record from The Living Trace design proof. Not archival testimony.",
  };
}

export default async function SpecimenRecordPage({ params }: PageProps) {
  const { id } = await params;
  const resolved = resolveRecord(id);
  if (!resolved) {
    notFound();
  }

  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <div className="mx-auto max-w-6xl px-[var(--lt-gutter)] pb-28 md:px-6 md:pb-36">
        <nav aria-label="Breadcrumb" className="lt-label mb-8">
          <Link href="/living-trace" className="hover:text-[var(--tiro-text)]">
            The Living Trace
          </Link>{" "}
          <span aria-hidden="true">/</span> Specimen records <span aria-hidden="true">/</span>{" "}
          <span className="text-[var(--tiro-text-soft)]">{resolved.state === "public" ? resolved.record.recordId : resolved.notice.reference}</span>
        </nav>

        {resolved.state === "public" ? (
          <RecordSpecimen
            record={resolved.record}
            relations={relationsFor(projectGraph(), resolved.record.recordId)}
            headingLevel={1}
            chainHref={(edgeId) => `/living-trace?edge=${edgeId}#discover`}
          />
        ) : (
          <div className="max-w-3xl">
            <RestrictedRecordNotice notice={resolved.notice} headingLevel={1} />
            <p className="mt-6 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
              Synthetic demonstration of a restricted record with an authorized public notice. View this page&apos;s source:
              the record&apos;s title, description, and other details are not in it, because they were never sent.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
