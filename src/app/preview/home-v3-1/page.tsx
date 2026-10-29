import type { Metadata } from "next";
import Link from "next/link";
import CatalogueCard from "@/components/preview/home-v3-1/CatalogueCard";
import Sources, { FIXTURE_STATUS, MANIFESTO_STATUS, RIGHTS_STATUS, type Source } from "@/components/preview/home-v3-1/Sources";
import TimeScale from "@/components/preview/home-v3-1/TimeScale";
import TwoAccounts, { type Account, type Disagreement } from "@/components/preview/home-v3-1/TwoAccounts";
import Reveal from "@/components/trace/Reveal";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";
import { projectGraph, resolveRecord, SPECIMEN_ROUTE, type ProjectedGraph } from "@/lib/livingTrace/projection";
import "./home-v3-1.css";

// HOMEPAGE V3.1 — DESIGN EXPLORATION, NOT THE LIVE HOMEPAGE.
//
// A refinement of v3 ("Written for people we will never meet"). Same four
// sections, six movements, quotations, and motifs; tightened:
//   - the hero and the scale share one axis: a plumb line drops from the
//     statement to the mark, which stands on the present
//   - the scale is an instrument: keyboard-operable, legible, and the past
//     (recorded) and future (open) drawn as distinct line kinds
//   - each section's sources name the document, the part, and its actual
//     status; the reader's "consulted" date is gone
//   - the catalogue card reads from the human source to its conditions
//   - synthetic fixtures are named as fictional where they speak of
//     authority
// Demonstration material is the synthetic Living Trace archive, read only
// through its projection. Not linked from navigation; not indexed.
export const metadata: Metadata = {
  title: "Homepage v3.1 (exploration) — The Tiro Foundation",
  description: "A design exploration of the TIRO homepage. Not the live homepage.",
  robots: { index: false, follow: false },
};

const MANIFESTO = { title: "Manifesto v0.2", href: "/manifesto", status: MANIFESTO_STATUS };
const RIGHTS = { title: "Community Rights & Cultural Data Stewardship", href: "/community-rights", status: RIGHTS_STATUS };

const HERO_SOURCES: Source[] = [{ ...MANIFESTO, section: "Opening line · §VI The Long View" }];

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

// The contested relationship between two records, assembled only from the
// projected graph: its two attributed accounts, the event both describe,
// and each account's own source link.
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
  return { event: node(event.to)!.label, relation: edge.relation, summary: edge.summary, recordedBy: edge.recordedBy, accounts: [accounts[0], accounts[1]] };
}

export default function HomeV31() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");
  const record = specimen?.state === "public" ? specimen.record : null;
  const authority = record?.capacities.find((c) => c.capacity === "Source authority");
  const language = record?.context.find((c) => c.field === "Language");
  const accounts = disagreement(graph);
  const witnessBg = "color-mix(in srgb, var(--tiro-accent) 5%, var(--tiro-bg))";

  return (
    <main className="hv31 relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      {/* I · Encounter */}
      <section id="encounter" aria-labelledby="hv31-encounter-title" className="pt-28">
        <div className="hv31-frame hv31-row">
          <div className="hidden lg:block">
            <Sources section="I" sources={HERO_SOURCES} />
          </div>
          <div className="min-w-0">
            <p className="lt-label mb-7 text-[var(--tiro-accent)]">The Tiro Foundation · Node Zero</p>
            <h1 id="hv31-encounter-title" className="lt-display max-w-[17ch] text-[2.55rem] sm:text-[3.6rem] lg:max-w-[22ch] lg:text-[3.9rem] xl:text-[4.35rem]">
              There is enlightenment in exploration, <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
            </h1>
            <div className="hv31-hero-lower mt-9 lg:mt-10">
              <div className="pb-10 lg:pb-14 lg:pr-8">
                <p className="max-w-[30rem] text-lg leading-relaxed text-[var(--tiro-text-muted)] md:text-xl">
                  Building the systems to preserve cultural memory, with communities as principals.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <Link href="/memory-project" className="hv31-cta">
                    Explore the Memory Project <span aria-hidden="true" className="hv31-arrow">→</span>
                  </Link>
                  <Link href="/manifesto" className="tiro-link text-sm">
                    Read the Manifesto
                  </Link>
                </div>
              </div>
              <div className="hv31-plumb" aria-hidden="true" />
            </div>
          </div>
        </div>

        <TimeScale />
        <div className="hv31-frame hv31-row pb-16 pt-6 md:pb-20">
          <div className="hidden lg:block" />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--tiro-text-soft)] md:text-xl">
              A system designed for a quarter behaves differently from one designed for a century.
            </p>
            <div className="mt-10 lg:hidden">
              <Sources section="I" sources={HERO_SOURCES} />
            </div>
          </div>
        </div>
      </section>

      {/* II · Witness and Preserve */}
      <section
        id="witness"
        aria-labelledby="hv31-witness-title"
        className="border-t border-[var(--tiro-border)]"
        style={{ background: witnessBg, "--hv31-section-bg": witnessBg } as React.CSSProperties}
      >
        <Reveal className="hv31-frame hv31-row py-20 md:py-28">
          <Sources
            section="II"
            sources={[
              { ...MANIFESTO, section: "§V The Witness" },
              { ...RIGHTS, section: "Source authority" },
              { title: "DEMO-LT-0001", href: record ? `${SPECIMEN_ROUTE}/${record.recordId}` : undefined, section: "Living Trace demonstration", status: FIXTURE_STATUS },
            ]}
          />
          <div id="preserve" className="grid min-w-0 gap-12 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-14">
            <div className="hv31-rise">
              <h2 id="hv31-witness-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
                Every memory <em>has a source.</em>
              </h2>
              <p className="mt-7 max-w-[30rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                It is entrusted by a person or a community. Keeping it whole means keeping who gave it, who holds authority over it, and what each
                use permits.
              </p>
              <blockquote className="mt-10 max-w-[28rem] border-l border-[var(--tiro-accent)] pl-5 font-[family-name:var(--font-display)] text-xl italic leading-snug text-[var(--tiro-text-soft)]">
                &ldquo;There is a difference between speaking for someone and allowing someone to be heard.&rdquo;
              </blockquote>
            </div>
            <div className="hv31-rise min-w-0" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
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
                    withdrawal: record.withdrawal,
                  }}
                />
              ) : null}
            </div>
          </div>
        </Reveal>
      </section>

      {/* III · Discover */}
      <section id="discover" aria-labelledby="hv31-discover-title" className="bg-[var(--tiro-bg-deep)]" style={{ "--hv31-bg": "var(--tiro-bg-deep)" } as React.CSSProperties}>
        <Reveal className="hv31-frame hv31-row py-20 md:py-28">
          <Sources
            section="III"
            sources={[
              { ...RIGHTS, section: "Provenance as permanent record" },
              { title: "Living Trace relationship graph", href: "/living-trace#discover", section: "Records DEMO-LT-0001, -0004", status: FIXTURE_STATUS },
            ]}
          />
          <div className="min-w-0">
            <div className="hv31-rise">
              <h2 id="hv31-discover-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
                Connection <em>without collapse.</em>
              </h2>
              <p className="mt-7 max-w-[34rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                When accounts disagree, both are kept. Each keeps its own way back to its source.
              </p>
            </div>
            {accounts ? (
              <div className="hv31-rise mt-12 md:mt-14" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
                <TwoAccounts data={accounts} moreHref="/living-trace#discover" />
              </div>
            ) : null}
          </div>
        </Reveal>
      </section>

      {/* IV · Respect and Participate */}
      <section id="respect" aria-labelledby="hv31-respect-title" className="border-t border-[var(--tiro-border)]">
        <Reveal className="hv31-frame hv31-row pt-20 md:pt-28">
          <Sources
            section="IV"
            sources={[
              { ...RIGHTS, section: "Custody, not ownership · Consent · Access is not entitlement" },
              { ...MANIFESTO, section: "§IV The Principle of the Node" },
              { title: "DEMO-LT-0002", href: `${SPECIMEN_ROUTE}/DEMO-LT-0002`, section: "Living Trace demonstration", status: FIXTURE_STATUS },
            ]}
          />
          <div className="min-w-0">
            <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-14">
              <div className="hv31-rise">
                <h2 id="hv31-respect-title" className="lt-display text-[2.5rem] sm:text-5xl md:text-6xl">
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

              {/* The sealed card: preserved, not published. Only the fixture's
                  permitted notice reaches the page. */}
              {restricted?.state === "restricted-notice" ? (
                <div className="hv31-rise min-w-0 xl:pt-3" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
                  <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SyntheticPill />
                    <span className="text-sm text-[var(--tiro-text-muted)]">A fictional record and a fictional authority.</span>
                  </p>
                  <article aria-labelledby="hv31-sealed-title" data-sealed="true" className="hv31-card tiro-register-paper">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{restricted.notice.reference}</span>
                      <span className="lt-label !text-[10px] text-[var(--tiro-accent)]">Restricted</span>
                    </header>
                    <div className="hv31-card-rule" aria-hidden="true" />
                    <h3 id="hv31-sealed-title" className="lt-display text-2xl leading-tight">
                      Held for preservation. Not published.
                    </h3>
                    <figure className="mt-4">
                      <blockquote className="border-l border-[var(--tiro-border-strong)] pl-4 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                        {restricted.notice.notice}
                      </blockquote>
                      <figcaption className="mt-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                        Notice as written in the demonstration fixture. The &ldquo;rights authority&rdquo; it names is part of the fiction.
                      </figcaption>
                    </figure>
                    <span className="hv31-card-hole" aria-hidden="true" />
                  </article>
                  <p className="mt-5 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                    This card does not turn: the page receives the notice and nothing else. An undiscoverable record would not appear here at all.
                  </p>
                </div>
              ) : null}
            </div>

            <div id="participate" className="hv31-rise mt-24 grid gap-10 md:mt-28 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] xl:gap-14">
              <div>
                <h3 className="lt-label text-[var(--tiro-accent)]">Take part</h3>
                <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-[var(--tiro-text-muted)]">
                  Node Zero is TIRO&apos;s founding web portal and institutional prototype. It is not yet an operational custodian.
                </p>
                <Link href="/pilot" className="tiro-link mt-5 inline-block text-sm">
                  A pilot is forming: start a conversation
                </Link>
              </div>
              <ul className="border-b border-[var(--tiro-border)]">
                {PATHS.map((path, i) => (
                  <li key={path.href}>
                    <Link href={path.href} className="hv31-path">
                      <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                      <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-3xl">
                        {path.title}
                        <span aria-hidden="true" className="hv31-arrow ml-3 text-[var(--tiro-accent)]">
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

        {/* The close: a plumb line from the statement to the open origin of
            what comes next, continuing the hero's instrument. */}
        <div className="hv31-frame hv31-row pt-24 md:pt-32">
          <div className="hidden lg:block" />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[1.75rem] italic leading-tight text-[var(--tiro-text)] md:text-4xl">
              TIRO is being built for people we will never meet.
            </p>
            <p className="lt-label mt-3">
              <Link href="/manifesto" className="hover:text-[var(--tiro-text)]">
                Manifesto v0.2 · §VI The Long View
              </Link>
            </p>
            <div className="hv31-close-plumb" aria-hidden="true" />
          </div>
        </div>
        <TimeScale variant="closing" />
        <div className="h-12 md:h-16" />
      </section>
    </main>
  );
}
