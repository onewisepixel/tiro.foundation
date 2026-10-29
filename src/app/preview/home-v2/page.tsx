import type { Metadata } from "next";
import Link from "next/link";
import AccessStates from "@/components/preview/home-v2/AccessStates";
import EncounterDrawing from "@/components/preview/home-v2/EncounterDrawing";
import MovementRail, { type RailItem } from "@/components/preview/home-v2/MovementRail";
import RecordPreview from "@/components/preview/home-v2/RecordPreview";
import SourceGraph from "@/components/preview/home-v2/SourceGraph";
import OriginPoint from "@/components/trace/OriginPoint";
import Reveal from "@/components/trace/Reveal";
import { projectGraph, resolveRecord, SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";
import "./home-v2.css";

// HOMEPAGE V2 — DESIGN EXPLORATION, NOT THE LIVE HOMEPAGE.
//
// "Archival Futurism": the six movements (Encounter → Participate) kept as
// the conceptual spine but composed as four sections, each built on a
// datum: the mark's resonance line, turned to the horizontal. Detail
// arrives only on request (a question, a node, a tab), and every deeper
// explanation stays on its inner page. All demonstration material is the
// existing synthetic Living Trace archive, read through its projection.
//
// Not linked from navigation and excluded from indexing.
export const metadata: Metadata = {
  title: "Homepage v2 (exploration) — The Tiro Foundation",
  description: "A design exploration of the TIRO homepage. Not the live homepage.",
  robots: { index: false, follow: false },
};

const RAIL: RailItem[] = [
  { id: "encounter", index: "00", name: "Encounter" },
  { id: "witness", index: "01", name: "Witness" },
  { id: "preserve", index: "02", name: "Preserve" },
  { id: "discover", index: "03", name: "Discover" },
  { id: "respect", index: "04", name: "Respect" },
  { id: "participate", index: "05", name: "Participate" },
];

const PRINCIPLES = [
  { title: "Custody, not ownership.", body: "To store something does not give us authority over it." },
  { title: "Consent is explicit, traceable, revocable.", body: "It is scoped to specific uses, and it may be withdrawn." },
  { title: "Access is not entitlement.", body: "Preservation does not require publication." },
];

const PATHS = [
  { href: "/memory-project", title: "Explore the Memory Project", body: "How it is being built, and its demonstration records." },
  { href: "/manifesto", title: "Understand the mission", body: "Manifesto v0.2: memory, intelligence, stewardship, and the node." },
  { href: "/contact", title: "Contact a steward", body: "Partnership, contribution, and questions about custody and consent." },
];

function Datum({ movements, aside }: { movements: [string, string][]; aside?: string }) {
  return (
    <div className="hv2-datum" aria-hidden="true">
      <OriginPoint size={18} tone="accent" />
      <span className="lt-label whitespace-nowrap text-[var(--tiro-accent)]">
        {movements.map(([index, name], i) => (
          <span key={index}>
            {i > 0 ? <span className="px-2 text-[var(--tiro-text-subtle)]">·</span> : null}
            {index} / {name}
          </span>
        ))}
      </span>
      <span className="hv2-datum-line" />
      {aside ? <span className="lt-label hidden whitespace-nowrap md:inline">{aside}</span> : null}
    </div>
  );
}

export default function HomeV2() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");
  const record = specimen?.state === "public" ? specimen.record : null;
  const authority = record?.capacities.find((c) => c.capacity === "Source authority");
  const language = record?.context.find((c) => c.field === "Language");

  return (
    <main className="hv2 relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      <MovementRail items={RAIL} />

      {/* A · Encounter */}
      <section id="encounter" aria-labelledby="hv2-encounter-title" className="hv2-hero">
        <div className="hv2-frame hv2-hero-grid">
          <div className="hv2-hero-text">
            <p className="lt-label mb-8 text-[var(--tiro-accent)]">
              The Tiro Foundation <span aria-hidden="true">·</span> Node Zero
            </p>
            <h1 id="hv2-encounter-title" className="lt-display max-w-[15ch] text-[2.55rem] sm:text-[3.5rem] lg:text-[4.1rem] xl:text-[4.6rem]">
              There is enlightenment in exploration, <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
            </h1>
            <p className="mt-8 max-w-[30rem] text-lg leading-relaxed text-[var(--tiro-text-muted)] md:text-xl">
              Building the systems to preserve cultural memory, with communities as principals.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
              <Link href="/memory-project" className="hv2-cta">
                Explore the Memory Project <span aria-hidden="true" className="hv2-cta-arrow">→</span>
              </Link>
              <Link href="/manifesto" className="tiro-link text-sm">
                Read the Manifesto
              </Link>
            </div>
          </div>
          <EncounterDrawing />
        </div>
      </section>

      {/* B · Witness and Preserve */}
      <section id="witness" aria-labelledby="hv2-witness-title" className="hv2-surface-witness">
        <Reveal className="hv2-frame pb-24 pt-16 md:pb-32 md:pt-20">
          <Datum
            movements={[
              ["01", "Witness"],
              ["02", "Preserve"],
            ]}
            aside="A memory and its source"
          />
          <div className="mt-14 grid gap-10 md:mt-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
            <div className="hv2-rise">
              <h2 id="hv2-witness-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-7xl">
                Every memory <em>has a source.</em>
              </h2>
              <p className="mt-7 max-w-[34rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                Memory begins with people. Keeping it whole means keeping who gave it, who holds authority over it, and what each use
                permits.
              </p>
            </div>
            <figure className="hv2-rise border-l border-[var(--tiro-accent)] pl-5" style={{ "--lt-delay": "120ms" } as React.CSSProperties}>
              <blockquote className="lt-display text-xl italic leading-snug text-[var(--tiro-text-soft)] md:text-2xl">
                &ldquo;There is a difference between speaking for someone and allowing someone to be heard.&rdquo;
              </blockquote>
              <figcaption className="lt-label mt-4">
                <Link href="/manifesto" className="hover:text-[var(--tiro-text)]">
                  Manifesto v0.2 · V. The Witness
                </Link>
              </figcaption>
            </figure>
          </div>

          <div id="preserve" className="mt-16 md:mt-24">
            {record && authority && language ? (
              <RecordPreview
                record={{
                  recordId: record.recordId,
                  href: `${SPECIMEN_ROUTE}/${record.recordId}`,
                  title: record.title,
                  source: record.source,
                  authority: { value: authority.value, evidence: authority.evidence },
                  language: { value: language.value, evidence: language.evidence },
                  uses: record.uses,
                }}
              />
            ) : null}
          </div>
        </Reveal>
      </section>

      {/* C · Discover */}
      <section id="discover" aria-labelledby="hv2-discover-title" className="hv2-surface-discover">
        <Reveal className="hv2-frame pb-24 pt-16 md:pb-32 md:pt-20">
          <Datum movements={[["03", "Discover"]]} aside="Relationships and provenance" />
          <div className="hv2-rise mt-14 md:mt-20">
            <h2 id="hv2-discover-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-7xl">
              Connection <em>without collapse.</em>
            </h2>
            <p className="mt-7 max-w-[36rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
              Records connect through what they share, including accounts that disagree. No account is merged into another, and each
              keeps its own way back to its source.
            </p>
          </div>
          <div className="hv2-rise mt-12 md:mt-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
            <SourceGraph graph={graph} inspectHref="/living-trace#discover" />
          </div>
        </Reveal>
      </section>

      {/* D · Respect and Participate */}
      <section id="respect" aria-labelledby="hv2-respect-title">
        <Reveal className="hv2-frame pb-20 pt-16 md:pb-28 md:pt-20">
          <Datum
            movements={[
              ["04", "Respect"],
              ["05", "Participate"],
            ]}
            aside="Cultural authority precedes curiosity"
          />
          <div className="mt-14 grid gap-14 md:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div className="hv2-rise">
              <h2 id="hv2-respect-title" className="lt-display text-[2.5rem] sm:text-5xl md:text-6xl">
                Communities remain the principals. <em>TIRO is the custodian.</em>
              </h2>
              <ul className="mt-10 border-b border-[var(--tiro-border)]">
                {PRINCIPLES.map((p) => (
                  <li key={p.title} className="border-t border-[var(--tiro-border)] py-4">
                    <p className="font-[family-name:var(--font-display)] text-lg text-[var(--tiro-text)] md:text-xl">{p.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{p.body}</p>
                  </li>
                ))}
              </ul>
              <Link href="/community-rights" className="tiro-link mt-6 inline-block text-sm">
                Read Community Rights &amp; Cultural Data Stewardship
              </Link>
            </div>
            <div className="hv2-rise min-w-0 lg:pt-3" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
              <p className="lt-label mb-4">One record, three access states · synthetic</p>
              <AccessStates
                publicTitle={record?.title ?? "A public specimen record"}
                publicHref={record ? `${SPECIMEN_ROUTE}/${record.recordId}` : "/living-trace"}
                notice={restricted?.state === "restricted-notice" ? { reference: restricted.notice.reference, text: restricted.notice.notice } : null}
              />
            </div>
          </div>

          <div id="participate" className="mt-24 md:mt-32">
            <div className="hv2-rise grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
              <div>
                <h3 className="lt-label text-[var(--tiro-accent)]">Take part</h3>
                <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-[var(--tiro-text-muted)]">
                  Node Zero is TIRO&apos;s founding portal and institutional prototype. It becomes an operational custodian only once its
                  readiness gates are met.
                </p>
                <Link href="/pilot" className="tiro-link mt-5 inline-block text-sm">
                  A pilot is forming: start a conversation
                </Link>
              </div>
              <ul className="border-b border-[var(--tiro-border)]">
                {PATHS.map((path, i) => (
                  <li key={path.href}>
                    <Link href={path.href} className="hv2-path group">
                      <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                      <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-3xl">
                        {path.title}
                        <span aria-hidden="true" className="hv2-cta-arrow ml-3 text-[var(--tiro-accent)]">
                          →
                        </span>
                      </span>
                      <span aria-hidden="true" />
                      <span className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">{path.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The datum ends at an open origin: the next record has not been made. */}
          <div className="mt-24 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--hv2-datum)]" />
            <OriginPoint size={18} tone="accent" absent />
          </div>
          <p className="mt-3 text-right font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
            The next record has not been made.
          </p>
        </Reveal>
      </section>
    </main>
  );
}
