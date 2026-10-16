import type { Metadata } from "next";
import Link from "next/link";
import TiroMark from "@/components/TiroMark";
import { RestrictedRecordNotice, UndiscoverableExplainer } from "@/components/trace/Boundary";
import ConstellationIsland from "@/components/trace/ConstellationIsland";
import ConstellationPreview from "@/components/trace/ConstellationPreview";
import { EvidenceLegend } from "@/components/trace/EvidenceTag";
import OriginPoint from "@/components/trace/OriginPoint";
import PaletteScope from "@/components/trace/PaletteScope";
import RecordSpecimen from "@/components/trace/RecordSpecimen";
import TemporalRail from "@/components/trace/TemporalRail";
import { projectGraph, relationsFor, resolveRecord } from "@/lib/livingTrace/projection";

export const metadata: Metadata = {
  title: "The Living Trace (design proof) — The Tiro Foundation",
  description:
    "Design language 0.2 proposal: the three proof scenes (Origin, Record, Boundary) and the visual grammar behind them. Synthetic demonstrations only.",
};

function Annotations({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-10 gap-y-5 border-t border-[var(--tiro-border)] pt-6 md:grid-cols-2">
      {items.map(([term, body]) => (
        <div key={term}>
          <dt className="text-sm font-medium text-[var(--tiro-text-soft)]">{term}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProofHeader({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <header className="mb-10 max-w-3xl">
      <p className="lt-label mb-4 text-[var(--tiro-accent)]">{eyebrow}</p>
      <h2 id={`${id}-title`} className="lt-display text-4xl md:text-5xl">
        {title}
      </h2>
      <div className="mt-5 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">{children}</div>
    </header>
  );
}

const SWATCHES: { name: string; token: string; role: string }[] = [
  { name: "Field", token: "--tiro-bg", role: "Immersive field" },
  { name: "Raised", token: "--tiro-raised", role: "Panels, inspectors" },
  { name: "Text", token: "--tiro-text", role: "Reading surface ink" },
  { name: "Accent", token: "--tiro-accent", role: "Origin and its own line" },
  { name: "Mineral", token: "--tiro-mineral", role: "Relationships between records" },
  { name: "Contested", token: "--tiro-contested", role: "Disagreeing accounts" },
];

export default function LivingTracePage() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");

  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-[57px] text-[var(--tiro-text)]">
      <PaletteScope>
        <section aria-labelledby="lt-intro" className="px-[var(--lt-gutter)] pb-16 pt-16 md:px-6 md:pb-24 md:pt-24">
          <div className="mx-auto max-w-6xl">
            <p className="lt-label mb-5 text-[var(--tiro-accent)]">Design language 0.2 · Proposal for founder review</p>
            <h1 id="lt-intro" className="lt-display max-w-4xl text-5xl md:text-7xl">
              The Living Trace
            </h1>
            <p className="mt-6 max-w-[var(--lt-measure)] text-lg leading-relaxed text-[var(--tiro-text-muted)]">
              From one human testimony to a constellation of cultural memory. A working metaphor, not an official slogan:
              a point is an origin, a line is a relationship with a known basis, a boundary is consent and community
              authority, and every trace stays connected to its source.
            </p>
            <p className="mt-6 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
              Everything on this page is a synthetic demonstration. It is excluded from search indexes and from every
              record count. The narrative version runs on the{" "}
              <Link href="/" className="tiro-link !text-[var(--tiro-text-soft)]">
                homepage
              </Link>
              .
            </p>
            <nav aria-label="Sections" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {[
                ["#grammar", "Grammar"],
                ["#origin", "A · Origin"],
                ["#record", "B · Record"],
                ["#boundary", "C · Boundary"],
                ["#discover", "Discover"],
                ["#tokens", "Tokens"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="tiro-link">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        {/* ---------- Grammar ---------- */}
        <section id="grammar" aria-labelledby="grammar-title" className="scroll-mt-28 bg-[var(--tiro-bg-deep)] px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <ProofHeader id="grammar" eyebrow="Six primitives, one grammar" title="These are not decorations.">
              Each primitive has one meaning and is used only for it. A visible connection always carries a type and a
              path back to its source; uncertainty is drawn differently from attestation.
            </ProofHeader>
            <ul className="grid gap-px border border-[var(--tiro-border)] bg-[var(--tiro-border)] sm:grid-cols-2 lg:grid-cols-3">
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <div className="flex h-12 items-center gap-4">
                  <OriginPoint size={26} />
                  <OriginPoint size={26} absent />
                </div>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">01 Origin</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  A source, person, record, or place. Drawn from the mark&apos;s own circumpunct. Hollow and dotted where an
                  origin is expected but not on record.
                </p>
              </li>
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <svg viewBox="0 0 160 48" className="h-12 w-40" aria-hidden="true">
                  <line x1="4" y1="14" x2="156" y2="14" stroke="var(--tiro-mineral-line)" strokeWidth="1.5" />
                  <line x1="4" y1="34" x2="156" y2="34" stroke="var(--tiro-mineral-line)" strokeWidth="1.25" strokeDasharray="5 5" />
                </svg>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">02 Trace</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  A typed, evidence-linked relationship. Continuous only when the basis is recorded or attested.
                </p>
              </li>
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <svg viewBox="0 0 160 48" className="h-12 w-40" aria-hidden="true">
                  <path d="M10 36 Q 40 6 70 18 T 150 12" fill="none" stroke="var(--tiro-mineral-line)" strokeWidth="1.25" />
                  <path d="M70 18 Q 96 44 130 38" fill="none" stroke="var(--tiro-mineral-line)" strokeWidth="1.25" strokeDasharray="5 5" />
                  {[
                    [10, 36],
                    [70, 18],
                    [150, 12],
                    [130, 38],
                  ].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="var(--tiro-text-soft)" />
                  ))}
                </svg>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">03 Constellation</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  Plural records, navigable and never merged. Always paired with a text list of the same relationships.
                </p>
              </li>
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <div className="flex h-12 items-center">
                  <span className="lt-boundary block h-9 w-28" aria-hidden="true" />
                </div>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">04 Boundary</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  Consent and community authority, including absence. A quiet double rule, never a padlock, blur, or unlock
                  button. Enforced in data, not CSS.
                </p>
              </li>
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <div className="h-12 overflow-hidden">
                  <TemporalRail entries={[{ at: "v0.1", event: "Created", actor: "—", evidence: "recorded" }]} />
                </div>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">05 Time</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  Versions, continuity, and change: a record&apos;s own history, never a claim that a culture is linear.
                </p>
              </li>
              <li className="bg-[var(--tiro-bg-deep)] p-6">
                <svg viewBox="0 0 160 48" className="h-12 w-40" aria-hidden="true">
                  <line x1="4" y1="24" x2="156" y2="24" stroke="var(--tiro-mineral-line)" strokeDasharray="2 4" />
                  {Array.from({ length: 16 }, (_, i) => (
                    <line key={i} x1={8 + i * 9.6} x2={8 + i * 9.6} y1="20" y2="28" stroke="var(--tiro-mineral-line)" opacity="0.6" />
                  ))}
                </svg>
                <p className="lt-label mt-4 text-[var(--tiro-text)]">06 Voice</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  Human presence, never wallpaper. Without consented audio, the honest waveform is a silent one. Always
                  opt-in, always with a text path.
                </p>
              </li>
            </ul>
            <h3 className="lt-label mb-5 mt-14 text-[var(--tiro-text)]">Evidence states: how a trace is drawn</h3>
            <EvidenceLegend />
          </div>
        </section>

        {/* ---------- Proof A ---------- */}
        <section id="origin" aria-labelledby="origin-title" className="scroll-mt-28 px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <ProofHeader id="origin" eyebrow="Proof A · Narrative" title="The Origin">
              The approved mark, unaltered, is the opening composition. Its resonance line keeps going: it becomes the
              spine of the homepage, and each movement begins at its own origin point on that line.
            </ProofHeader>
            <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <figure className="relative mx-auto flex h-[22rem] w-full max-w-xs justify-center" aria-labelledby="origin-anatomy">
                <div className="relative w-[4.5rem]">
                  <TiroMark className="h-auto w-full text-[var(--tiro-mark)]" />
                  <span aria-hidden="true" className="absolute left-[calc(50%+1.6px)] top-[146px] h-[11rem] w-px bg-gradient-to-b from-[var(--tiro-accent)] to-[var(--tiro-mineral-line)]" />
                  <span aria-hidden="true" className="absolute left-[calc(50%+1.6px)] top-[calc(146px+7rem)] -translate-x-1/2 rounded-full bg-[var(--tiro-bg)] p-1">
                    <OriginPoint size={18} tone="mineral" />
                  </span>
                </div>
                <figcaption id="origin-anatomy" className="sr-only">
                  The TIRO mark, with its resonance line continued downward to the first movement&apos;s origin point.
                </figcaption>
              </figure>
              <Annotations
                items={[
                  ["Origin", "The mark's circumpunct: where a memory, and the visit, begins."],
                  ["Transmission", "The mark's triangle, left exactly as approved."],
                  ["Resonance → trace", "The mark's last line continues as the page's spine. One line, from origin onward."],
                  ["Movement origin", "Each of the six movements starts on the spine, so the page is itself a trace."],
                  ["Statement", "TIRO's founding premise, not a new slogan: “There is enlightenment in exploration, but empathy is essential.”"],
                  ["Without motion", "The spine draws downward once on load. With reduced motion it is simply present. Nothing waits on animation."],
                ]}
              />
            </div>
            <Link href="/" className="tiro-button mt-12">
              View Proof A on the homepage
            </Link>
          </div>
        </section>

        {/* ---------- Proof B ---------- */}
        <section id="record" aria-labelledby="record-title" className="scroll-mt-28 bg-[var(--tiro-bg-deep)] px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <ProofHeader id="record" eyebrow="Proof B · Interface" title="The Record">
              A working archival view in the Paper register: source, authority, consent and access, context, transcript,
              provenance, and related records, each claim carrying its evidence state. Synthetic, and labeled before
              anything else.
            </ProofHeader>
            {specimen?.state === "public" ? (
              <RecordSpecimen
                record={specimen.record}
                relations={relationsFor(graph, specimen.record.recordId)}
                chainHref={(edgeId) => `/living-trace?edge=${edgeId}#discover`}
              />
            ) : null}
            <div className="mt-12">
              <Annotations
                items={[
                  ["Notice first", "The synthetic label precedes every field that looks like an archival claim (docs/ethos.txt §6.1)."],
                  ["Capacities kept apart", "Source authority, rights holder, collector, contributor, subject, and signer are separate rows (§3.2)."],
                  ["Purpose does not transfer", "Each of the eight uses in §3.3 has its own state. Only “granted” is drawn solid."],
                  ["Absence made visible", "No audio is shown as a silent waveform, not an invented one. Unknown values say “not specified.”"],
                  ["Every link typed", "Related records show relation type, evidence state, basis, who asserted it, and a source-chain link."],
                  ["Two statuses", "Publication and custody are independent (§12), so they are shown separately."],
                ]}
              />
            </div>
          </div>
        </section>

        {/* ---------- Proof C ---------- */}
        <section id="boundary" aria-labelledby="boundary-title" className="scroll-mt-28 px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <ProofHeader id="boundary" eyebrow="Proof C · Stewardship" title="The Boundary">
              What a visitor is permitted to know, and nothing more. Two states, enforced by what the server sends rather
              than by what the browser hides.
            </ProofHeader>
            <div className="grid items-start gap-8 lg:grid-cols-2">
              {restricted?.state === "restricted-notice" ? <RestrictedRecordNotice notice={restricted.notice} headingLevel={3} /> : null}
              <UndiscoverableExplainer />
            </div>
            <div className="mt-12">
              <Annotations
                items={[
                  ["Allow-list projection", "src/lib/livingTrace/projection.ts builds every public object field by field. A field added later is withheld by default."],
                  ["Same 404", "An undiscoverable record has no generated page; dynamicParams = false gives it the same 404 as an ID that never existed."],
                  ["No counts", "Nothing reports how many records are withheld. A count would disclose that they exist."],
                  ["Not in the graph", "A relationship to a restricted record is metadata about it, so restricted records never appear in Discover."],
                  ["No notice, no record", "A restricted record without an authorized notice is treated as undiscoverable."],
                  ["Proved by tests", "projection.test.ts plants canary strings in restricted data and fails if any projection carries one."],
                ]}
              />
            </div>
            <Link href="/living-trace/records/DEMO-LT-0002" className="tiro-link mt-8 inline-block text-sm">
              Open the restricted notice as its own record page
            </Link>
          </div>
        </section>

        {/* ---------- Discover ---------- */}
        <section id="discover" aria-labelledby="discover-title" className="scroll-mt-28 bg-[var(--tiro-bg-deep)] px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-[90rem]">
            <ProofHeader id="discover" eyebrow="Movement 03 · Interaction" title="Connection without collapse">
              Select any relationship or point, in the drawing or the list, to see its accounts, who made each claim, who
              recorded it, and each account&apos;s own chain back to its source. The selection is kept in the address, so it can
              be linked to.
            </ProofHeader>
            <ConstellationIsland initialEdgeId="c-ab-when" syncUrl>
              <ConstellationPreview graph={graph} />
            </ConstellationIsland>
            <div className="mt-14">
              <Annotations
                items={[
                  ["Accounts, not facts", "A relationship holds one or more attributed accounts. A disagreement keeps every account, each with its own origin; none is merged or corrected away."],
                  ["Claimant ≠ recorder", "Who made each claim is shown apart from who recorded or interpreted the relationship. A curator who notes a disagreement decides nothing."],
                  ["Provenance is not connectivity", "Chains follow source links only (source of the account, translated from). Two records meeting at a place are connected, not corroborated."],
                  ["Independence is checked", "Accounts that trace to the same origin are reported as not independent, however many there are."],
                  ["The claim is the unit of disclosure", "A restricted record's notice authorizes nothing about its claims. A claim appears as “withheld” only with its own grants for existence AND association with that relationship; otherwise it leaves no trace. A withheld claim never decides what a relationship says: a disagreement that rests on one is not shown at all."],
                  ["Built to grow", "Nodes are placed by a deterministic layered layout (origins → records → derived → shared context), tested with 30-record collections. There are no hand-placed coordinates."],
                ]}
              />
            </div>
          </div>
        </section>

        {/* ---------- Tokens ---------- */}
        <section id="tokens" aria-labelledby="tokens-title" className="scroll-mt-28 px-[var(--lt-gutter)] py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <ProofHeader id="tokens" eyebrow="Foundations" title="Tokens and type roles">
              Swatches render live from the tokens, so the palette switch above changes them. Contrast ratios for both
              palettes, in both themes, are listed in docs/design/living-trace.md.
            </ProofHeader>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {SWATCHES.map((s) => (
                <li key={s.token}>
                  <div className="h-16 border border-[var(--tiro-border-strong)]" style={{ background: `var(${s.token})` }} />
                  <p className="mt-2 text-sm text-[var(--tiro-text-soft)]">{s.name}</p>
                  <p className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-text-muted)]">{s.token}</p>
                  <p className="text-xs text-[var(--tiro-text-muted)]">{s.role}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-14 grid gap-8 border-t border-[var(--tiro-border)] pt-8 md:grid-cols-3">
              <div>
                <dt className="lt-label">Editorial · Spectral</dt>
                <dd className="lt-display mt-3 text-3xl">
                  Listen <em>with care.</em>
                </dd>
                <dd className="mt-2 text-xs text-[var(--tiro-text-muted)]">Statements and attributed quotations only.</dd>
              </div>
              <div>
                <dt className="lt-label">Interface · Karla</dt>
                <dd className="mt-3 text-base text-[var(--tiro-text)]">A restrained interface stays legible for decades.</dd>
                <dd className="mt-2 text-xs text-[var(--tiro-text-muted)]">Body, navigation, fields, and controls.</dd>
              </div>
              <div>
                <dt className="lt-label">Catalog · Space Mono</dt>
                <dd className="lt-label mt-3 text-[var(--tiro-text)]">Sources. Context. Consent.</dd>
                <dd className="mt-2 text-xs text-[var(--tiro-text-muted)]">Labels and identifiers, sparingly. Never paragraphs.</dd>
              </div>
            </dl>
          </div>
        </section>
      </PaletteScope>
    </main>
  );
}
