import type { Metadata } from "next";
import Link from "next/link";
import HeroStrands from "@/components/preview/home-v5/HeroStrands";
import RecordLayers from "@/components/preview/home-v5/RecordLayers";
import Thread from "@/components/preview/home-v5/Thread";
import TwoAccounts, { type Account, type Disagreement } from "@/components/preview/home-v5/TwoAccounts";
import Reveal from "@/components/trace/Reveal";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";
import { projectGraph, resolveRecord, SPECIMEN_ROUTE, type ProjectedGraph } from "@/lib/livingTrace/projection";
import "@/components/archive/archive.css";
import "./home-v5.css";

// HOMEPAGE V5 — "THE LIVING ARCHIVE". DESIGN EXPLORATION, NOT THE LIVE HOMEPAGE.
//
// A journey through the institution, held together by one line: the
// mark's resonance line, which leaves the hero figure and becomes the
// page's thread (Thread.tsx), with a node at every section.
//
//   Hero        Memory deserves a future. Strands pass through the mark and
//               leave as Source, Authority, Consent: what every record keeps.
//   Why         The founding statement, set as an inscription; the loss TIRO
//               exists to resist (Manifesto v0.2, I).
//   What        The record, in exploded view: its layers separate on request.
//   How         Connection without collapse: two accounts, both kept.
//   Who decides Custody is not ownership; a restricted record is one sheet,
//               with nothing beneath it sent to the page.
//   Take part   Where TIRO is today, and four ways in.
//   Close       TIRO is being built for people we will never meet.
//
// Doctrine is quoted, not paraphrased, wherever it is stated; every quote
// names its source. Demonstration material is the synthetic Living Trace
// archive, read only through its projection. Not linked from navigation;
// not indexed.
export const metadata: Metadata = {
  title: "Homepage v5, The Living Archive (exploration) — The Tiro Foundation",
  description: "A design exploration of the TIRO homepage. Not the live homepage.",
  robots: { index: false, follow: false },
};

const WAYS_IN = [
  { n: "01", name: "Witness", line: "Remember who shared it.", href: "#record-source" },
  { n: "02", name: "Preserve", line: "Honor the terms of care.", href: "#record-terms" },
  { n: "03", name: "Discover", line: "Explore connections responsibly.", href: "#discover" },
];

const PRINCIPLES = [
  { title: "Consent is explicit, traceable, revocable.", body: "Consent is captured per record and scoped to specific uses." },
  { title: "Purpose does not transfer.", body: "Permission for one use does not imply permission for another." },
  { title: "Access is not entitlement.", body: "Preservation does not require publication." },
];

const PATHS = [
  { href: "/memory-project", title: "Explore the Memory Project", body: "How it is being built, and its demonstration records." },
  { href: "/manifesto", title: "Read the Manifesto", body: "Memory, intelligence, stewardship, and the principle of the node." },
  { href: "/pilot", title: "Talk about the pilot", body: "For communities and contributors: a pilot is forming." },
  { href: "/contact", title: "Partner or support", body: "For institutions and supporters: partnership, contribution, and questions about custody and consent." },
];

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

// A section on the thread: its node in the gutter, its content beside it.
function OnThread({ children, end = false }: { children: React.ReactNode; end?: boolean }) {
  return (
    <div className="la-frame hv5-grid">
      <div>
        <span className="hv5-node" data-thread={end ? "end" : "node"} data-end={end || undefined} aria-hidden="true" />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function HomeV5() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");
  const record = specimen?.state === "public" ? specimen.record : null;
  const accounts = disagreement(graph);
  const deep = "var(--tiro-bg-deep)";

  return (
    <main className="la hv5 bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      <Thread />

      {/* Hero */}
      <section id="encounter" aria-labelledby="hv5-title" className="hv5-hero">
        <div className="la-frame hv5-grid">
          <div aria-hidden="true" />
          <div className="min-w-0">
            <div className="hv5-hero-grid">
              <div className="pb-2 lg:pt-4">
                <p className="la-eyebrow">The Tiro Foundation / Node Zero</p>
                <h1 id="hv5-title" className="hv5-h1 mt-7">
                  <span>Memory</span> <span>deserves</span> <span>a future.</span>
                </h1>
                <p className="hv5-lede mt-8 max-w-[30rem]">We are building ways to preserve cultural memory with the communities who hold it.</p>
                <p className="hv5-principle mt-4 max-w-[30rem]">Communities remain the principals. TIRO is the custodian.</p>
                <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-5">
                  <Link href="/memory-project" className="la-cta">
                    Explore the Memory Project <span aria-hidden="true" className="hv5-arrow">→</span>
                  </Link>
                  <Link href="/community-rights" className="hv5-secondary">
                    Read our principles
                  </Link>
                </div>
              </div>
              <HeroStrands />
            </div>

            <nav aria-label="Three ways in" data-thread="turn">
              <ol className="hv5-strip">
                {WAYS_IN.map((w) => (
                  <li key={w.n}>
                    <a href={w.href}>
                      <span className="font-[family-name:var(--font-code)] text-[11px] tracking-[0.12em] text-[var(--tiro-accent)]">{w.n}</span>
                      <span className="font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.22em] text-[var(--tiro-text)]">{w.name}</span>
                      <span aria-hidden="true" />
                      <span className="font-[family-name:var(--font-display)] text-[1.05rem] text-[var(--tiro-text-muted)]">{w.line}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      </section>

      {/* Why TIRO exists */}
      <section id="why" aria-labelledby="hv5-why" className="hv5-section">
        <OnThread>
          <Reveal>
            <h2 id="hv5-why" className="la-eyebrow">
              Why TIRO exists
            </h2>
            <figure className="la-rise mt-10">
              <blockquote className="hv5-inscription max-w-[18ch]">There is enlightenment in exploration, but empathy is essential.</blockquote>
              <figcaption>
                <Link href="/manifesto" className="la-cite">
                  Founding statement · Manifesto v0.2
                </Link>
              </figcaption>
            </figure>
            <div className="la-rise mt-16 grid gap-10 md:mt-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
              <figure>
                <blockquote className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--tiro-text-soft)] md:text-[1.7rem]">
                  &ldquo;Every time a language falls silent, an elder dies unheard, an archive deteriorates, or a community loses control of its own
                  history, humanity&apos;s inheritance becomes smaller.&rdquo;
                </blockquote>
                <figcaption>
                  <Link href="/manifesto" className="la-cite">
                    Manifesto v0.2 · I. Memory
                  </Link>
                </figcaption>
              </figure>
              <div className="border-l border-[var(--tiro-accent)] pl-6 lg:self-end">
                <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--tiro-text)]">TIRO exists to resist that loss.</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-xl italic leading-snug text-[var(--tiro-text-muted)]">
                  But preservation cannot become possession.
                </p>
              </div>
            </div>
          </Reveal>
        </OnThread>
      </section>

      {/* What we are building */}
      <section id="record" aria-labelledby="hv5-record" className="hv5-section bg-[var(--tiro-bg-deep)]" style={{ "--hv5-section-bg": deep } as React.CSSProperties}>
        <OnThread>
          <Reveal>
            <p className="la-eyebrow">What we are building</p>
            <div className="la-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
              <h2 id="hv5-record" className="hv5-h2">
                Every memory <em>has a source.</em>
              </h2>
              <p className="max-w-[32rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                The Memory Project is designing records that keep a memory together with who shared it, who holds authority over it, and the terms
                under which it may be used.
              </p>
            </div>
            {record ? (
              <div className="la-rise mt-14 md:mt-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
                <RecordLayers
                  data={{
                    recordId: record.recordId,
                    href: `${SPECIMEN_ROUTE}/${record.recordId}`,
                    title: record.title,
                    summary: record.summary,
                    source: record.source,
                    authority: record.capacities.filter((c) => c.capacity === "Source authority" || c.capacity === "Legal rights holder"),
                    uses: record.uses,
                    withdrawal: record.withdrawal,
                    provenance: record.provenance,
                  }}
                />
              </div>
            ) : null}
          </Reveal>
        </OnThread>
      </section>

      {/* How it differs */}
      <section id="discover" aria-labelledby="hv5-discover" className="hv5-section">
        <OnThread>
          <Reveal>
            <p className="la-eyebrow">How it differs</p>
            <div className="la-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
              <h2 id="hv5-discover" className="hv5-h2">
                Connection <em>without collapse.</em>
              </h2>
              <p className="max-w-[32rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                When accounts disagree, both are kept. Each keeps its own way back to its source.
              </p>
            </div>
            {accounts ? (
              <div className="la-rise mt-14 md:mt-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
                <TwoAccounts data={accounts} moreHref="/living-trace#discover" />
              </div>
            ) : null}
          </Reveal>
        </OnThread>
      </section>

      {/* Who decides */}
      <section id="authority" aria-labelledby="hv5-authority" className="hv5-section bg-[var(--tiro-bg-deep)]" style={{ "--hv5-section-bg": deep } as React.CSSProperties}>
        <OnThread>
          <Reveal>
            <p className="la-eyebrow">Who decides</p>
            <div className="la-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
              <h2 id="hv5-authority" className="hv5-h2">
                Custody is <em>not ownership.</em>
              </h2>
              <div>
                <p className="max-w-[32rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                  &ldquo;Communities and contributors remain the cultural and intellectual principals of what they entrust to us; TIRO&apos;s role is
                  custodian, not owner.&rdquo;
                </p>
                <Link href="/community-rights" className="la-cite">
                  Community Rights &amp; Cultural Data Stewardship
                </Link>
              </div>
            </div>

            <div className="la-rise mt-14 grid gap-14 md:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
              <ul className="border-b border-[var(--tiro-border)]">
                {PRINCIPLES.map((p) => (
                  <li key={p.title} className="border-t border-[var(--tiro-border)] py-5">
                    <p className="font-[family-name:var(--font-display)] text-xl text-[var(--tiro-text)]">{p.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{p.body}</p>
                  </li>
                ))}
              </ul>

              {/* A restricted record: one sheet, and nothing beneath it is sent. */}
              {restricted?.state === "restricted-notice" ? (
                <figure aria-labelledby="hv5-sealed-title">
                  <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SyntheticPill />
                    <span className="text-sm text-[var(--tiro-text-muted)]">A fictional record and a fictional authority.</span>
                  </p>
                  <div className="hv5-sealed">
                    <svg viewBox="0 0 200 120" className="w-full max-w-[11rem]" aria-hidden="true" focusable="false">
                      <line x1={100} x2={100} y1={0} y2={60} stroke="var(--tiro-accent)" strokeWidth="1.25" />
                      <path d="M10,60 L100,28 L190,60 L100,92 Z" fill="var(--tiro-raised)" stroke="var(--tiro-text-subtle)" strokeWidth="1.25" />
                      <path d="M24,60 L100,33 L176,60 L100,87 Z" fill="none" stroke="var(--tiro-text-subtle)" strokeWidth="1" />
                      <circle cx={100} cy={60} r={3.5} fill="var(--tiro-accent)" />
                    </svg>
                    <div>
                      <p className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">
                        {restricted.notice.reference} · Restricted
                      </p>
                      <p id="hv5-sealed-title" className="lt-display mt-2 text-2xl leading-tight">
                        Held for preservation. Not published.
                      </p>
                    </div>
                  </div>
                  <blockquote className="mt-5 border-l border-[var(--tiro-border-strong)] pl-4 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                    {restricted.notice.notice}
                  </blockquote>
                  <figcaption className="mt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                    One layer only: the page receives this notice and nothing beneath it. The &ldquo;rights authority&rdquo; is part of the fiction. An
                    undiscoverable record would not appear here at all.
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </Reveal>
        </OnThread>
      </section>

      {/* Take part */}
      <section id="participate" aria-labelledby="hv5-participate" className="hv5-section">
        <OnThread>
          <Reveal>
            <p className="la-eyebrow">Take part</p>
            <div className="la-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
              <h2 id="hv5-participate" className="hv5-h2">
                An institution, <em>at its beginning.</em>
              </h2>
              <div className="max-w-[32rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                <p>Node Zero is TIRO&apos;s founding web portal and institutional prototype. It is not yet an operational custodian.</p>
                <p className="mt-3">
                  An Igbo oral-memory pilot in Nigeria is the proposed first bounded collection, to be scoped with participating communities.
                </p>
                <Link href="/manifesto" className="la-cite">
                  Manifesto v0.2 · II. Intelligence · IV. The Principle of the Node
                </Link>
              </div>
            </div>
            <ul className="hv5-paths la-rise mt-14" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
              {PATHS.map((p, i) => (
                <li key={p.href}>
                  <Link href={p.href} className="hv5-path">
                    <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                    <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-[1.75rem]">
                      {p.title}
                      <span aria-hidden="true" className="hv5-arrow ml-3 text-[var(--tiro-accent)]">
                        →
                      </span>
                    </span>
                    <span aria-hidden="true" />
                    <span className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">{p.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </OnThread>
      </section>

      {/* The close: the thread ends at an open origin. */}
      <section aria-label="Closing" className="pb-24 pt-8 md:pb-32">
        <OnThread end>
          <p className="font-[family-name:var(--font-display)] text-[1.75rem] italic leading-tight text-[var(--tiro-text)] md:text-[2.6rem]">
            TIRO is being built for people we will never meet.
          </p>
          <Link href="/manifesto" className="la-cite">
            Manifesto v0.2 · VI. The Long View
          </Link>
        </OnThread>
      </section>
    </main>
  );
}
