import type { Metadata } from "next";
import Link from "next/link";
import CatalogueCard from "@/components/preview/home-v4/CatalogueCard";
import PierEnd from "@/components/preview/home-v4/PierEnd";
import { PLACES } from "@/components/preview/home-v4/places";
import SiteSection from "@/components/preview/home-v4/SiteSection";
import Sources, { FIXTURE_STATUS, MANIFESTO_STATUS, RIGHTS_STATUS, type Source } from "@/components/preview/home-v4/Sources";
import TwoAccounts, { type Account, type Disagreement } from "@/components/preview/home-v4/TwoAccounts";
import Reveal from "@/components/trace/Reveal";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";
import { projectGraph, resolveRecord, SPECIMEN_ROUTE, type ProjectedGraph } from "@/lib/livingTrace/projection";
import "./home-v4.css";

// HOMEPAGE V4 — DESIGN EXPLORATION, NOT THE LIVE HOMEPAGE.
//
// "A section through an imagined site." Ideas from TIRO's speculative site
// studies (a canopy on many supports, terraces facing the water, buildings
// raised on piles, boardwalks between pavilions, a threshold between the
// road and the sea), translated into the survey line-work of v3.1 rather
// than reproduced. The six movements become six places; the generational
// scale becomes the ground: the recorded past seated on the terraces, the
// mark on the stage at now, open water ahead.
//
// The content of v3.1 (sources, catalogue card, two accounts, sealed card,
// paths, closing line) is kept, each section opening with its place. The
// drawing is labelled speculative and cited like every other source.
// Demonstration material is the synthetic Living Trace archive, read only
// through its projection. Not linked from navigation; not indexed.
export const metadata: Metadata = {
  title: "Homepage v4 (exploration) — The Tiro Foundation",
  description: "A design exploration of the TIRO homepage. Not the live homepage.",
  robots: { index: false, follow: false },
};

const MANIFESTO = { title: "Manifesto v0.2", href: "/manifesto", status: MANIFESTO_STATUS };
const RIGHTS = { title: "Community Rights & Cultural Data Stewardship", href: "/community-rights", status: RIGHTS_STATUS };
const FIGURE: Source = { title: "Fig. 1, after TIRO's speculative site studies", section: "Section through an imagined site", status: "Speculative · not a building plan" };

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

// The place(s) a section stands in, as on the drawing's key.
function Kicker({ places }: { places: number[] }) {
  return (
    <p className="hv4-kicker">
      {places.map((n) => {
        const p = PLACES.find((x) => x.n === n)!;
        return (
          <span key={n}>
            <span className="hv4-badge" aria-hidden="true">
              {String(n).padStart(2, "0")}
            </span>
            <span>
              {p.name} <em>· {p.gloss}</em>
            </span>
          </span>
        );
      })}
    </p>
  );
}

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

export default function HomeV4() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");
  const record = specimen?.state === "public" ? specimen.record : null;
  const authority = record?.capacities.find((c) => c.capacity === "Source authority");
  const language = record?.context.find((c) => c.field === "Language");
  const accounts = disagreement(graph);
  const witnessBg = "color-mix(in srgb, var(--tiro-accent) 5%, var(--tiro-bg))";

  return (
    <main className="hv4 relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      {/* I · Encounter: the statement over open water, the site beneath. */}
      <section id="encounter" aria-labelledby="hv4-encounter-title" className="hv4-hero">
        <div className="hv4-frame hv4-hero-text">
          <div>
            <p className="lt-label mb-6 text-[var(--tiro-accent)]">The Tiro Foundation · Node Zero</p>
            <h1 id="hv4-encounter-title" className="lt-display max-w-[17ch] text-[2.55rem] sm:text-[3.4rem] lg:text-[3.6rem] xl:text-[4.1rem]">
              There is enlightenment in exploration, <em className="text-[var(--tiro-text-soft)]">but empathy is essential.</em>
            </h1>
            <p className="mt-7 max-w-[30rem] text-lg leading-relaxed text-[var(--tiro-text-muted)] md:text-xl">
              Building the systems to preserve cultural memory, with communities as principals.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link href="/memory-project" className="hv4-cta">
                Explore the Memory Project <span aria-hidden="true" className="hv4-arrow">→</span>
              </Link>
              <Link href="/manifesto" className="tiro-link text-sm">
                Read the Manifesto
              </Link>
            </div>
          </div>
        </div>

        <SiteSection />

        <div className="hv4-frame pb-16 pt-10 md:pb-20">
          <div className="max-w-xl">
            <Sources
              section="I"
              sources={[
                { ...MANIFESTO, section: "Opening line · §IV The Principle of the Node" },
                FIGURE,
              ]}
            />
          </div>
        </div>
      </section>

      {/* II · Witness and Preserve: the terraces and the raised archive. */}
      <section
        id="witness"
        aria-labelledby="hv4-witness-title"
        className="border-t border-[var(--tiro-border)]"
        style={{ background: witnessBg, "--hv4-section-bg": witnessBg, "--hv4-bg": witnessBg } as React.CSSProperties}
      >
        <Reveal className="hv4-frame hv4-row py-20 md:py-28">
          <Sources
            section="II"
            sources={[
              { ...MANIFESTO, section: "§V The Witness" },
              { ...RIGHTS, section: "Source authority" },
              { title: "DEMO-LT-0001", href: record ? `${SPECIMEN_ROUTE}/${record.recordId}` : undefined, section: "Living Trace demonstration", status: FIXTURE_STATUS },
            ]}
          />
          <div id="preserve" className="grid min-w-0 gap-12 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-14">
            <div className="hv4-rise">
              <Kicker places={[2, 3]} />
              <h2 id="hv4-witness-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
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
            <div className="hv4-rise min-w-0 xl:pt-12" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
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

      {/* III · Discover: the boardwalks. */}
      <section id="discover" aria-labelledby="hv4-discover-title" className="bg-[var(--tiro-bg-deep)]" style={{ "--hv4-bg": "var(--tiro-bg-deep)" } as React.CSSProperties}>
        <Reveal className="hv4-frame hv4-row py-20 md:py-28">
          <Sources
            section="III"
            sources={[
              { ...RIGHTS, section: "Provenance as permanent record" },
              { title: "Living Trace relationship graph", href: "/living-trace#discover", section: "Records DEMO-LT-0001, -0004", status: FIXTURE_STATUS },
            ]}
          />
          <div className="min-w-0">
            <div className="hv4-rise">
              <Kicker places={[4]} />
              <h2 id="hv4-discover-title" className="lt-display text-[2.5rem] sm:text-6xl md:text-[4.25rem]">
                Connection <em>without collapse.</em>
              </h2>
              <p className="mt-7 max-w-[34rem] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
                When accounts disagree, both are kept. Each keeps its own way back to its source.
              </p>
            </div>
            {accounts ? (
              <div className="hv4-rise mt-12 md:mt-14" style={{ "--lt-delay": "160ms" } as React.CSSProperties}>
                <TwoAccounts data={accounts} moreHref="/living-trace#discover" />
              </div>
            ) : null}
          </div>
        </Reveal>
      </section>

      {/* IV · Respect and Participate: the closed room and the pier's end. */}
      <section id="respect" aria-labelledby="hv4-respect-title" className="border-t border-[var(--tiro-border)]">
        <Reveal className="hv4-frame hv4-row pt-20 md:pt-28">
          <Sources
            section="IV"
            sources={[
              { ...RIGHTS, section: "Custody, not ownership · Consent · Access is not entitlement" },
              { ...MANIFESTO, section: "§IV The Principle of the Node · §VI The Long View" },
              { title: "DEMO-LT-0002", href: `${SPECIMEN_ROUTE}/DEMO-LT-0002`, section: "Living Trace demonstration", status: FIXTURE_STATUS },
            ]}
          />
          <div className="min-w-0">
            <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-14">
              <div className="hv4-rise">
                <Kicker places={[5]} />
                <h2 id="hv4-respect-title" className="lt-display text-[2.5rem] sm:text-5xl md:text-6xl">
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

              {/* The closed room: preserved, not published. Only the fixture's
                  permitted notice reaches the page. */}
              {restricted?.state === "restricted-notice" ? (
                <div className="hv4-rise min-w-0 xl:pt-14" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
                  <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SyntheticPill />
                    <span className="text-sm text-[var(--tiro-text-muted)]">A fictional record and a fictional authority.</span>
                  </p>
                  <article aria-labelledby="hv4-sealed-title" data-sealed="true" className="hv4-card tiro-register-paper">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{restricted.notice.reference}</span>
                      <span className="lt-label !text-[10px] text-[var(--tiro-accent)]">Restricted</span>
                    </header>
                    <div className="hv4-card-rule" aria-hidden="true" />
                    <h3 id="hv4-sealed-title" className="lt-display text-2xl leading-tight">
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
                    <span className="hv4-card-hole" aria-hidden="true" />
                  </article>
                  <p className="mt-5 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                    This room has no public door: the page receives the notice and nothing else. An undiscoverable record would not appear here at
                    all.
                  </p>
                </div>
              ) : null}
            </div>

            <div id="participate" className="hv4-rise mt-24 md:mt-28">
              <Kicker places={[6]} />
              <div className="grid gap-10 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] xl:gap-14">
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
                      <Link href={path.href} className="hv4-path">
                        <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                        <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-3xl">
                          {path.title}
                          <span aria-hidden="true" className="hv4-arrow ml-3 text-[var(--tiro-accent)]">
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
          </div>
        </Reveal>

        {/* The pier's end: a plumb line from the statement to the open origin. */}
        <div className="hv4-frame hv4-row pt-24 md:pt-32">
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
            <div className="hv4-close-plumb" aria-hidden="true" />
          </div>
        </div>
        <PierEnd />
        <div className="h-12 md:h-16" />
      </section>
    </main>
  );
}
