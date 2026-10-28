import type { Metadata } from "next";
import Link from "next/link";
import Concordance, { type ConcordanceRow } from "@/components/preview/memory-v1/Concordance";
import ConsentLifecycle from "@/components/preview/memory-v1/ConsentLifecycle";
import { RECORDS_BASE } from "@/components/preview/memory-v1/layers";
import LocalNav from "@/components/preview/memory-v1/LocalNav";
import MethodLayers from "@/components/preview/memory-v1/MethodLayers";
import Reveal from "@/components/trace/Reveal";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";
import { USE_CATEGORIES } from "@/lib/livingTrace/evidence";
import { listDiscoverable, projectGraph, relationsFor, SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";
import "./memory-v1.css";

// MEMORY PROJECT v1 — THE FIRST ROOM BEYOND THE ENTRANCE.
// DESIGN EXPLORATION, NOT THE LIVE /memory-project PAGE.
//
// The v5 language, in an inner-page rhythm. The page opens with a finding
// aid (the archival description of a collection) describing the project
// itself, honestly: what it is, what it will hold, what exists today, and
// how it is arranged. A local bar keeps the visitor oriented. Then:
//   Why          the loss the project exists to resist (Manifesto I, II)
//   Method       a record in five layers, and one kept apart
//   Records      the synthetic specimens, as the disclosure rules list them
//   Consent      use by use; custody is not ownership, drawn
//   Accounts     a record's relationships, each with its own attribution
//   Status       in development; the readiness gates (Manifesto IV)
//   Take part    by audience
//
// Doctrine is quoted, not paraphrased, wherever it is stated. Every
// demonstration reads the synthetic Living Trace archive through its
// projection: restricted records show only their authorized notice, and
// undiscoverable records appear nowhere. Not linked from navigation; not
// indexed.
export const metadata: Metadata = {
  title: "The Memory Project (preview) — The Tiro Foundation",
  description: "A design exploration of the Memory Project page. Not the live page.",
  robots: { index: false, follow: false },
};

const SPECIMEN = "DEMO-LT-0001";

const SECTIONS = [
  { id: "why", label: "Why" },
  { id: "method", label: "Method" },
  { id: "records", label: "Records" },
  { id: "consent", label: "Consent" },
  { id: "accounts", label: "Accounts" },
  { id: "status", label: "Status" },
  { id: "take-part", label: "Take part" },
];

const KINDS = ["Languages", "Oral histories", "Stories", "Songs", "Practices", "Testimony", "Context"];

const GATES = [
  "Evidenced permissions",
  "Trained stewards",
  "Restricted-access controls",
  "Withdrawal handling",
  "Verified restoration",
  "A complete preservation export",
];

const PATHS = [
  { for: "Communities", title: "Talk about the proposed pilot", body: "Start a conversation. The pilot is to be scoped with participating communities.", href: "/pilot" },
  { for: "Researchers", title: "Examine the record structure", body: "Fields, provenance, and a citation format, shown in a synthetic specimen.", href: `${RECORDS_BASE}/${SPECIMEN}` },
  { for: "Institutions and partners", title: "Contact a steward", body: "Partnership, contribution, and questions about custody and consent.", href: "/contact" },
  { for: "Everyone", title: "Read the stewardship policy", body: "Community Rights & Cultural Data Stewardship: the standard every record follows.", href: "/community-rights" },
];

const toPreview = (href: string | null) => (href ? href.replace(SPECIMEN_ROUTE, RECORDS_BASE) : null);

export default function MemoryProjectPreview() {
  const graph = projectGraph();
  const listing = listDiscoverable();
  const rows: ConcordanceRow[] = relationsFor(graph, SPECIMEN)
    .filter((r) => !r.edge.provenance || r.edge.relation !== "Source of the account")
    .map((r) => ({ ...r, otherHref: toPreview(r.otherHref) }));

  return (
    <main id="top" className="mv1 bg-[var(--tiro-bg)] pt-[63px] text-[var(--tiro-text)]">
      <LocalNav items={SECTIONS} cta={{ href: `${RECORDS_BASE}/${SPECIMEN}`, label: "Examine a record" }} />

      {/* Arrival: the promise, and the project's own finding aid. */}
      <header className="mv1-frame mv1-hero">
        <div>
          <p className="mv1-crumbs">
            <Link href="/preview/home-v5">The Living Archive</Link> <span aria-hidden="true">/</span>{" "}
            <span className="text-[var(--tiro-accent)]">The Memory Project</span>
          </p>
          <h1 className="mv1-h1 mt-8">A memory can be preserved without being taken from the people to whom it belongs.</h1>
          <p className="mv1-lede mt-8 max-w-[34rem]">
            The Memory Project is how TIRO intends to keep that promise: preserving cultural and linguistic memory with its source communities,
            with every record held together with its source, its authority, and its terms of care.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Link href={`${RECORDS_BASE}/${SPECIMEN}`} className="mv1-cta">
              Examine a specimen record <span aria-hidden="true">→</span>
            </Link>
            <Link href="/community-rights" className="mv1-more">
              Read Community Rights
            </Link>
          </div>
        </div>

        <aside aria-labelledby="mv1-aid-title" className="mv1-aid tiro-register-paper">
          <p id="mv1-aid-title" className="mv1-eyebrow">
            Finding aid
          </p>
          <dl className="mt-9">
            <div>
              <dt className="mv1-dt">Title</dt>
              <dd className="font-[family-name:var(--font-display)] !text-lg !text-[var(--tiro-text)]">The Memory Project</dd>
            </div>
            <div>
              <dt className="mv1-dt">Held by</dt>
              <dd>The Tiro Foundation · Node Zero</dd>
            </div>
            <div>
              <dt className="mv1-dt">Status</dt>
              <dd>In development. Not yet an operating collection.</dd>
            </div>
            <div>
              <dt className="mv1-dt">Extent</dt>
              <dd>
                Synthetic demonstration records only.{" "}
                <a href="#records" className="mv1-more !text-[0.9375rem]">
                  See them
                </a>
              </dd>
            </div>
            <div>
              <dt className="mv1-dt">Scope</dt>
              <dd>Languages, oral histories, stories, songs, practices, testimony, and the context through which people give these meaning.</dd>
            </div>
            <div>
              <dt className="mv1-dt">Proposed first collection</dt>
              <dd>An Igbo oral-memory pilot in Nigeria, to be scoped with participating communities.</dd>
            </div>
            <div>
              <dt className="mv1-dt">Access</dt>
              <dd>Set record by record, by each record&apos;s source and rights authority, use by use.</dd>
            </div>
            <div>
              <dt className="mv1-dt">Arrangement</dt>
              <dd>
                <ol className="mv1-arrangement">
                  {SECTIONS.map((s, i) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`}>
                        <span>{i + 1}</span>
                        <span>{s.label}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          </dl>
          <p className="mv1-fineprint mt-4">Scope and proposed collection: Manifesto v0.2, II.</p>
        </aside>
      </header>

      {/* 1 · Why */}
      <section id="why" aria-labelledby="mv1-why" className="mv1-section">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">1 · Why it exists</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-why" className="mv1-h2">
              Some of this knowledge is documented. <em>Much of it is not.</em>
            </h2>
            <div>
              <p className="mv1-body">
                &ldquo;Human knowledge has never existed exclusively in libraries, institutions, databases, or written records. It lives in voices. In
                rituals. In names. In songs.&rdquo;
              </p>
              <Link href="/manifesto" className="mv1-cite">
                Manifesto v0.2 · I. Memory
              </Link>
            </div>
          </div>
          <div className="mv1-rise mt-14" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            <p className="mv1-eyebrow !text-[var(--tiro-text-muted)]">What it intends to preserve</p>
            <ul className="mv1-kinds mt-5">
              {KINDS.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <p className="mt-6 font-[family-name:var(--font-display)] text-xl italic text-[var(--tiro-text-soft)]">
              It is living knowledge, not merely historical data.
            </p>
            <Link href="/manifesto" className="mv1-cite">
              Manifesto v0.2 · II. Intelligence
            </Link>
          </div>
        </Reveal>
      </section>

      {/* 2 · Method */}
      <section id="method" aria-labelledby="mv1-method" className="mv1-section mv1-deep">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">2 · The method</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-method" className="mv1-h2">
              A record in five layers, <em>and one kept apart.</em>
            </h2>
            <p className="mv1-body">
              A memory is held together with who shared it, who decides, the terms under which it may be used, and how it came to be held. What is
              made from it is kept apart, and attributed.
            </p>
          </div>
          <div className="mv1-rise mt-14" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            <MethodLayers specimenId={SPECIMEN} />
          </div>
        </Reveal>
      </section>

      {/* 3 · Records */}
      <section id="records" aria-labelledby="mv1-records" className="mv1-section">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">3 · The demonstration records</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-records" className="mv1-h2">
              Examine a specimen.
            </h2>
            <div>
              <p className="mb-4">
                <SyntheticPill />
              </p>
              <p className="mv1-body">
                These records are synthetic. They show how a record is structured and governed. No real person, community, place, testimony, or
                consent is represented.
              </p>
            </div>
          </div>
          <ul className="mv1-catalogue mv1-rise mt-12" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            {listing.map((entry) =>
              entry.state === "public" ? (
                <li key={entry.recordId}>
                  <Link href={`${RECORDS_BASE}/${entry.recordId}`}>
                    <span className="mv1-catalogue-id">{entry.recordId}</span>
                    <span className="mv1-catalogue-title">{entry.title}</span>
                    <span className="mv1-catalogue-state">
                      Public · synthetic <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              ) : (
                <li key={entry.reference}>
                  <Link href={`${RECORDS_BASE}/${entry.reference}`}>
                    <span className="mv1-catalogue-id">{entry.reference}</span>
                    <span className="mv1-catalogue-title text-[var(--tiro-text-muted)]">Restricted. Only an authorized notice is shown.</span>
                    <span className="mv1-catalogue-state">
                      Notice only <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
          <p className="mv1-body mt-6 !text-sm">
            A record that is not discoverable appears nowhere: not listed, not counted, and not marked as hidden.
          </p>
        </Reveal>
      </section>

      {/* 4 · Consent */}
      <section id="consent" aria-labelledby="mv1-consent" className="mv1-section mv1-deep">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">4 · Consent and access</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-consent" className="mv1-h2">
              Consent is given <em>use by use.</em>
            </h2>
            <div>
              <p className="mv1-body">
                &ldquo;Preservation does not require publication.&rdquo; &ldquo;Permission for one use does not imply permission for another.&rdquo;
              </p>
              <Link href="/community-rights" className="mv1-cite">
                Community Rights &amp; Cultural Data Stewardship
              </Link>
            </div>
          </div>
          <div className="mv1-consent mv1-rise mt-14" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            <ConsentLifecycle />
            <div>
              <h3 className="mv1-eyebrow !text-[var(--tiro-text-muted)]">Eight uses, each decided on its own</h3>
              <ul className="mv1-uses mt-4">
                {USE_CATEGORIES.map((u) => (
                  <li key={u.key}>
                    <span className="block text-[var(--tiro-text)]">{u.label}</span>
                    <span className="mt-0.5 block text-sm text-[var(--tiro-text-muted)]">{u.boundary}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 5 · Accounts */}
      <section id="accounts" aria-labelledby="mv1-accounts" className="mv1-section">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">5 · Many accounts</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-accounts" className="mv1-h2">
              Accounts can disagree, <em>and each stays whole.</em>
            </h2>
            <div>
              <p className="mv1-body">
                A record may be disputed, translated, interpreted, and connected to others. Each account keeps its own attribution. &ldquo;TIRO
                distinguishes the record from TIRO&apos;s interpretation of the record.&rdquo;
              </p>
              <Link href="/community-rights" className="mv1-cite">
                Community Rights · Provenance as permanent record
              </Link>
            </div>
          </div>
          <div className="mv1-rise mt-12" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <SyntheticPill />
              <span className="text-sm text-[var(--tiro-text-muted)]">The relationships of {SPECIMEN}. Open any of them to see who claims it.</span>
            </p>
            <Concordance rows={rows} idPrefix="mv1-overview" />
            <Link href="/living-trace#discover" className="mv1-more mt-6">
              See every relationship in the full synthetic map<span aria-hidden="true"> →</span>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* 6 · Status */}
      <section id="status" aria-labelledby="mv1-status" className="mv1-section mv1-deep">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">6 · Where it stands</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-status" className="mv1-h2">
              In development, <em>not yet a collection.</em>
            </h2>
            <div className="mv1-body">
              <p>
                Node Zero is TIRO&apos;s founding web portal and institutional prototype. An Igbo oral-memory pilot in Nigeria is the proposed first
                bounded collection, to be scoped with participating communities. Neither becomes an operational custodian merely by being named.
              </p>
              <Link href="/manifesto" className="mv1-cite">
                Manifesto v0.2 · II · IV
              </Link>
            </div>
          </div>
          <div className="mv1-rise mt-12" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            <h3 className="mv1-eyebrow !text-[var(--tiro-text-muted)]">Readiness requires</h3>
            <ul className="mv1-gates mt-4">
              {GATES.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <p className="mv1-body mt-5 !text-sm">Real material is received only after these are evidenced. Until then, every record here is a demonstration.</p>
          </div>
        </Reveal>
      </section>

      {/* 7 · Take part */}
      <section id="take-part" aria-labelledby="mv1-take-part" className="mv1-section">
        <Reveal className="mv1-frame">
          <p className="mv1-eyebrow">7 · Take part</p>
          <div className="mv1-section-head mv1-rise mt-6">
            <h2 id="mv1-take-part" className="mv1-h2">
              Help shape it <em>before it begins.</em>
            </h2>
            <p className="mv1-body">The project is being designed now. Communities, researchers, and institutions can each find a way in.</p>
          </div>
          <ul className="mv1-paths mv1-rise mt-12" style={{ "--lt-delay": "140ms" } as React.CSSProperties}>
            {PATHS.map((p) => (
              <li key={p.title}>
                <Link href={p.href} className="mv1-path">
                  <span className="mv1-path-for">{p.for}</span>
                  <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)]">
                    {p.title} <span aria-hidden="true" className="text-[var(--tiro-accent)]">→</span>
                  </span>
                  <span className="text-sm leading-relaxed text-[var(--tiro-text-muted)]">{p.body}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <Link href="/preview/home-v5" className="mv1-more">
              Return to the Living Archive
            </Link>
            <Link href="/manifesto" className="mv1-more">
              Read the Manifesto
            </Link>
          </p>
        </Reveal>
      </section>
    </main>
  );
}
