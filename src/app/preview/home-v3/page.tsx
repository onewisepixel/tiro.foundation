import type { Metadata } from "next";
import Link from "next/link";
import CatalogueCard from "@/components/preview/home-v3/CatalogueCard";
import Gloss from "@/components/preview/home-v3/Gloss";
import TimeScale from "@/components/preview/home-v3/TimeScale";
import TwoAccounts, { type Account, type Disagreement } from "@/components/preview/home-v3/TwoAccounts";
import Reveal from "@/components/trace/Reveal";
import { projectGraph, resolveRecord, SPECIMEN_ROUTE, type ProjectedGraph } from "@/lib/livingTrace/projection";
import "./home-v3.css";

// HOMEPAGE V3 — DESIGN EXPLORATION, NOT THE LIVE HOMEPAGE.
//
// "Written for people we will never meet" (Manifesto v0.2, VI). An
// institution that has always been here and is still ahead of its time,
// expressed through two motifs: the scale (time in generations, the past
// recorded, the future open, the mark standing at now) and the gloss
// (every section names the accepted document its statements come from).
// The six movements are carried in four sections. Demonstration material
// is the synthetic Living Trace archive, read through its projection.
//
// Not linked from navigation and excluded from indexing.
export const metadata: Metadata = {
  title: "Homepage v3 (exploration) — The Tiro Foundation",
  description: "A design exploration of the TIRO homepage. Not the live homepage.",
  robots: { index: false, follow: false },
};

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

// The contested relationship between Records A and B, assembled only from
// the projected graph: its two attributed accounts, the event both
// describe, and each account's own source link.
function disagreement(graph: ProjectedGraph): Disagreement | null {
  const edge = graph.edges.find((e) => e.evidence === "contested");
  if (!edge) {
    return null;
  }
  const node = (id: string | null) => graph.nodes.find((n) => n.id === id) ?? null;
  const accounts: Account[] = [];
  for (const a of edge.accounts) {
    if (a.state !== "attributed" || !a.anchor) {
      continue;
    }
    const record = node(a.anchor);
    const sourceLink = graph.edges.find((e) => e.provenance && e.to === a.anchor && node(e.from)?.kind === "origin");
    const source = node(sourceLink?.from ?? null);
    if (record && source) {
      accounts.push({ key: a.id, record: record.label, recordHref: record.href, position: a.position, assertedBy: a.assertedBy, source: source.label });
    }
  }
  const shared = graph.edges.filter((e) => e.from === edge.from && node(e.to)?.kind === "event").map((e) => e.to);
  const event = graph.edges.find((e) => e.from === edge.to && shared.includes(e.to));
  if (accounts.length !== 2 || !event) {
    return null;
  }
  return {
    event: node(event.to)!.label,
    relation: edge.relation,
    summary: edge.summary,
    recordedBy: edge.recordedBy,
    accounts: [accounts[0], accounts[1]],
  };
}

export default function HomeV3() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");
  const record = specimen?.state === "public" ? specimen.record : null;
  const authority = record?.capacities.find((c) => c.capacity === "Source authority");
  const language = record?.context.find((c) => c.field === "Language");
  const accounts = disagreement(graph);

  return (
    <main className="hv3 relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      {/* I · Encounter */}
      <section id="encounter" aria-labelledby="hv3-encounter-title" className="flex flex-col justify-between pt-28 lg:min-h-[100svh] lg:pt-32">
        <div className="hv3-frame hv3-row">
          <Gloss
            mark="I · Encounter"
            entries={[
              { term: "Source", value: "Manifesto v0.2", href: "/manifesto" },
              { term: "Scale", value: "Manifesto v0.2 · VI", href: "/manifesto" },
            ]}
            consulted
          />
          <div>
            <p className="lt-label mb-7 text-[var(--tiro-accent)]">The Tiro Foundation · Node Zero</p>
            <h1 id="hv3-encounter-title" className="lt-display max-w-[17ch] text-[2.55rem] sm:text-[3.6rem] lg:text-[4.4rem] xl:text-[5rem]">
              There is enlightenment in exploration, <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
            </h1>
            <div className="mt-9 grid gap-8 md:grid-cols-[minmax(0,30rem)_auto] md:items-end md:justify-between">
              <p className="text-lg leading-relaxed text-[var(--tiro-text-muted)] md:text-xl">
                Building the systems to preserve cultural memory, with communities as principals.
              </p>
              <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
                <Link href="/memory-project" className="hv3-cta">
                  Explore the Memory Project <span aria-hidden="true" className="hv3-arrow">→</span>
                </Link>
                <Link href="/manifesto" className="tiro-link text-sm">
                  Read the Manifesto
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 md:mt-16">
          <p className="sr-only">
            A time scale measured in generations of 25 years. The past is drawn as recorded; the future as open. The TIRO mark stands at the
            present.
          </p>
          <TimeScale />
          <p className="hv3-frame mt-3 text-center font-[family-name:var(--font-display)] text-base italic text-[var(--tiro-text-muted)] md:text-lg">
            A system designed for a quarter behaves differently from one designed for a century.
          </p>
          <div className="h-12 md:h-16" />
        </div>
      </section>

      {/* II · Witness and Preserve */}
      <section
        id="witness"
        aria-labelledby="hv3-witness-title"
        className="border-t border-[var(--tiro-border)]"
        style={{ background: "color-mix(in srgb, var(--tiro-accent) 5%, var(--tiro-bg))", "--hv3-section-bg": "color-mix(in srgb, var(--tiro-accent) 5%, var(--tiro-bg))" } as React.CSSProperties}
      >
        <Reveal className="hv3-frame hv3-row py-20 md:py-28">
          <Gloss
            mark="II · Witness, Preserve"
            entries={[
              { term: "Source", value: "Manifesto v0.2 · V", href: "/manifesto" },
              { term: "And", value: "Community Rights · Source authority", href: "/community-rights" },
              { term: "Specimen", value: "Synthetic. No real person." },
            ]}
          />
          <div id="preserve" className="grid gap-12 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:gap-16">
            <div className="hv3-rise">
              <h2 id="hv3-witness-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
                Every memory <em>has a source.</em>
              </h2>
              <p className="mt-7 max-w-[30rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                It begins with a person. Keeping it whole means keeping who gave it, who holds authority over it, and what each use permits.
              </p>
              <blockquote className="mt-10 max-w-[28rem] border-l border-[var(--tiro-accent)] pl-5 font-[family-name:var(--font-display)] text-xl italic leading-snug text-[var(--tiro-text-soft)]">
                &ldquo;There is a difference between speaking for someone and allowing someone to be heard.&rdquo;
              </blockquote>
            </div>
            <div className="hv3-rise min-w-0" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
              {record && authority && language ? (
                <CatalogueCard
                  card={{
                    recordId: record.recordId,
                    href: `${SPECIMEN_ROUTE}/${record.recordId}`,
                    title: record.title,
                    source: record.source.label,
                    sourceNote: record.source.note,
                    authority: { value: authority.value, evidence: authority.evidence },
                    language: { value: language.value, evidence: language.evidence },
                    uses: record.uses,
                    aiProcessing: record.aiProcessing,
                  }}
                />
              ) : null}
            </div>
          </div>
        </Reveal>
      </section>

      {/* III · Discover */}
      <section id="discover" aria-labelledby="hv3-discover-title" className="bg-[var(--tiro-bg-deep)]" style={{ "--hv3-bg": "var(--tiro-bg-deep)" } as React.CSSProperties}>
        <Reveal className="hv3-frame hv3-row py-20 md:py-28">
          <Gloss
            mark="III · Discover"
            entries={[
              { term: "Source", value: "Community Rights · Provenance as permanent record", href: "/community-rights" },
              { term: "Accounts", value: "Synthetic. Illustrative, not archival." },
            ]}
          />
          <div className="min-w-0">
            <div className="hv3-rise">
              <h2 id="hv3-discover-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
                Connection <em>without collapse.</em>
              </h2>
              <p className="mt-7 max-w-[34rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                When accounts disagree, both are kept. Each keeps its own way back to its source.
              </p>
            </div>
            {accounts ? (
              <div className="hv3-rise mt-14 md:mt-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
                <TwoAccounts data={accounts} moreHref="/living-trace#discover" />
              </div>
            ) : null}
          </div>
        </Reveal>
      </section>

      {/* IV · Respect and Participate */}
      <section id="respect" aria-labelledby="hv3-respect-title" className="border-t border-[var(--tiro-border)]">
        <Reveal className="hv3-frame hv3-row pb-16 pt-20 md:pt-28">
          <Gloss
            mark="IV · Respect, Participate"
            entries={[
              { term: "Source", value: "Community Rights & Cultural Data Stewardship", href: "/community-rights" },
              { term: "Status", value: "Manifesto v0.2 · IV", href: "/manifesto" },
            ]}
          />
          <div className="min-w-0">
            <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-16">
              <div className="hv3-rise">
                <h2 id="hv3-respect-title" className="lt-display text-[2.5rem] sm:text-5xl md:text-6xl">
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

              {/* The sealed card: the same catalogue card, restricted. */}
              {restricted?.state === "restricted-notice" ? (
                <div className="hv3-rise min-w-0 xl:pt-4" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
                  <article aria-labelledby="hv3-sealed-title" data-sealed="true" className="hv3-card tiro-register-paper">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{restricted.notice.reference}</span>
                      <span className="lt-label !text-[10px] text-[var(--tiro-accent)]">Restricted · synthetic</span>
                    </header>
                    <div className="hv3-card-rule" aria-hidden="true" />
                    <h3 id="hv3-sealed-title" className="lt-display text-2xl leading-tight">
                      Not available for public access.
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-soft)]">{restricted.notice.notice}</p>
                    <span className="hv3-card-hole" aria-hidden="true" />
                  </article>
                  <p className="mt-5 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                    This card does not turn. Its rights authority authorized the notice and nothing more, so nothing more is sent to the page.
                  </p>
                </div>
              ) : null}
            </div>

            <div id="participate" className="hv3-rise mt-24 grid gap-10 md:mt-28 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] xl:gap-16">
              <div>
                <h3 className="lt-label text-[var(--tiro-accent)]">Take part</h3>
                <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-[var(--tiro-text-muted)]">
                  Node Zero is TIRO&apos;s founding portal and institutional prototype. It becomes an operational custodian only once its readiness
                  gates are met.
                </p>
                <Link href="/pilot" className="tiro-link mt-5 inline-block text-sm">
                  A pilot is forming: start a conversation
                </Link>
              </div>
              <ul className="border-b border-[var(--tiro-border)]">
                {PATHS.map((path, i) => (
                  <li key={path.href}>
                    <Link href={path.href} className="hv3-path">
                      <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                      <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-3xl">
                        {path.title}
                        <span aria-hidden="true" className="hv3-arrow ml-3 text-[var(--tiro-accent)]">
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
        </Reveal>

        {/* The last line: only the open future remains. */}
        <div className="pb-14 pt-6">
          <p className="hv3-frame font-[family-name:var(--font-display)] text-2xl italic text-[var(--tiro-text-soft)] md:text-3xl">
            TIRO is being built for people we will never meet.
          </p>
          <p className="hv3-frame lt-label mt-2">
            <Link href="/manifesto" className="hover:text-[var(--tiro-text)]">
              Manifesto v0.2 · VI. The Long View
            </Link>
          </p>
          <div className="mt-6">
            <TimeScale variant="closing" />
          </div>
        </div>
      </section>
    </main>
  );
}
