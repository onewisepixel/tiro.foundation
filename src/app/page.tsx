import Link from "next/link";
import { RestrictedRecordNotice, UndiscoverableExplainer } from "@/components/trace/Boundary";
import Constellation from "@/components/trace/Constellation";
import Movement, { MovementTitle } from "@/components/trace/Movement";
import OriginHero, { type MovementLink } from "@/components/trace/OriginHero";
import RecordSpecimen from "@/components/trace/RecordSpecimen";
import Reveal from "@/components/trace/Reveal";
import { projectGraph, relationsFor, resolveRecord, SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";

// The homepage as six optional movements (Encounter → Participate) on one
// spine: the mark's resonance line, continued. Each movement keeps the
// shared grammar and speaks in its own register:
//   Encounter   origin, quiet, anticipation      the mark, monumental
//   Witness     humanity, intimacy, presence     warm field, one voice, narrow measure
//   Preserve    structure, materiality, trust    the Paper register: one bright record
//   Discover    expansion, plurality             full-bleed constellation; the spine hands over
//   Respect     restraint, boundaries            quiet field, no motion, wide margins
//   Participate continuity, openness             the spine branches to real actions
// Navigation stays persistent (TopNav) and the hero's "On this page"
// index jumps straight to any movement; no movement is a gate. Every
// demonstration is synthetic and labeled.
const MOVEMENTS: MovementLink[] = [
  { id: "encounter", index: "00", name: "Encounter" },
  { id: "witness", index: "01", name: "Witness" },
  { id: "preserve", index: "02", name: "Preserve" },
  { id: "discover", index: "03", name: "Discover" },
  { id: "respect", index: "04", name: "Respect" },
  { id: "participate", index: "05", name: "Participate" },
];

const ACTIONS = [
  {
    href: "/manifesto",
    title: "Understand the mission",
    body: "Read Manifesto v0.2: memory, intelligence, stewardship, and the principle of the node.",
  },
  {
    href: "/memory-project",
    title: "Explore the prototype",
    body: "See how the Memory Project is being built, including its demonstration records.",
  },
  {
    href: "/community-rights",
    title: "Read the stewardship policy",
    body: "Community Rights & Cultural Data Stewardship: communities remain the principals.",
  },
  {
    href: "/contact",
    title: "Reach a steward",
    body: "Partnership, contribution, and questions about custody and consent.",
  },
];

const WITNESS_COMMITMENTS = [
  ["A voice is never autoplayed", "Audio plays only when you choose it, and never as ambience."],
  ["Always a text path", "Public recordings carry captions or a transcript."],
  ["It can be withheld", "A rights authority may restrict a voice, and the interface says so plainly."],
];

export default function Home() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");

  return (
    <main className="relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      <OriginHero movements={MOVEMENTS} />

      {/* 01 Witness: the trace from the mark arrives at a person. */}
      <Movement
        id="witness"
        index="01"
        name="Witness"
        register="witness"
        header={
          <MovementTitle id="witness" size="xl">
            Before a record, <em>there is a person.</em>
          </MovementTitle>
        }
      >
        <p className="mt-10 max-w-[34rem] font-[family-name:var(--font-display)] text-xl leading-relaxed text-[var(--tiro-text-soft)] md:text-2xl">
          A memory reaches an archive through someone: a voice, a recollection, a way of saying things that does not
          survive translation intact. TIRO&apos;s systems should lead people toward that human source, not stand in for it.
        </p>
        <figure className="mt-16 max-w-3xl md:mt-24">
          <blockquote className="lt-display text-[2rem] italic leading-[1.15] text-[var(--tiro-text)] md:text-5xl">
            &ldquo;There is a difference between speaking for someone and allowing someone to be heard.&rdquo;
          </blockquote>
          <figcaption className="lt-label mt-6">
            <Link href="/manifesto" className="hover:text-[var(--tiro-text)]">
              Manifesto v0.2 · V. The Witness
            </Link>
          </figcaption>
        </figure>
        <ul className="mt-16 grid max-w-4xl gap-6 border-t border-[var(--tiro-border)] pt-8 sm:grid-cols-3 md:mt-24">
          {WITNESS_COMMITMENTS.map(([title, body]) => (
            <li key={title}>
              <p className="text-sm font-medium text-[var(--tiro-text-soft)]">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{body}</p>
            </li>
          ))}
        </ul>
      </Movement>

      {/* 02 Preserve: the page turns to paper. */}
      <Movement
        id="preserve"
        index="02"
        name="Preserve"
        register="preserve"
        header={
          <>
            <MovementTitle id="preserve">A memory, with its context intact.</MovementTitle>
            <p className="mb-12 mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
              Structure is how custody becomes accountable. A record names its source and who holds authority over it,
              states what each use permits, and shows how every claim about it is known.
            </p>
          </>
        }
      >
        {specimen?.state === "public" ? (
          <>
            <RecordSpecimen record={specimen.record} relations={relationsFor(graph, specimen.record.recordId)} compact />
            <Link href={`${SPECIMEN_ROUTE}/${specimen.record.recordId}`} className="tiro-link mt-6 inline-block text-sm">
              Open the full specimen record
            </Link>
          </>
        ) : null}
      </Movement>

      {/* 03 Discover: the trace hands over to the constellation. */}
      <Movement
        id="discover"
        index="03"
        name="Discover"
        register="discover"
        header={
          <>
            <MovementTitle id="discover" size="xl">
              Connection <em>without collapse.</em>
            </MovementTitle>
            <p className="mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
              Records connect through the places, languages, and events they share, and through accounts that disagree.
              Each connection keeps its accounts apart, and each account keeps its own way back to its source.
            </p>
          </>
        }
        wide={
          <div className="mx-auto w-full max-w-[90rem] px-[var(--lt-gutter)] md:px-6">
            <Constellation graph={graph} initialEdgeId="c-ab-when" />
          </div>
        }
      />

      {/* 04 Respect: quiet. No motion, wide margins, nothing to unlock. */}
      <Movement
        id="respect"
        index="04"
        name="Respect"
        register="respect"
        header={
          <>
            <MovementTitle id="respect">
              A boundary is <em>an act of care.</em>
            </MovementTitle>
            <p className="mb-14 mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
              Preservation does not require publication. Some knowledge is entrusted for restricted access or preservation
              only, and sometimes stewardship means preserving something without revealing it.
            </p>
          </>
        }
      >
        <div className="grid max-w-5xl items-start gap-10 lg:grid-cols-2">
          <div>
            {restricted?.state === "restricted-notice" ? <RestrictedRecordNotice notice={restricted.notice} headingLevel={3} /> : null}
            <Link href={`${SPECIMEN_ROUTE}/DEMO-LT-0002`} className="tiro-link mt-5 inline-block text-sm">
              See this notice as its own record page
            </Link>
          </div>
          <UndiscoverableExplainer />
        </div>
        <p className="lt-label mt-14">Cultural authority precedes curiosity</p>
        <p className="mt-3 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          These states are enforced in the data a page receives, not drawn over it. Both examples are synthetic. Read{" "}
          <Link href="/community-rights" className="tiro-link !text-[var(--tiro-text-soft)]">
            Community Rights &amp; Cultural Data Stewardship
          </Link>{" "}
          for the policy they implement.
        </p>
      </Movement>

      {/* 05 Participate: the spine branches, one trace to each real action,
          and ends at an open origin: the next record has not been made. */}
      <Movement
        id="participate"
        index="05"
        name="Participate"
        register="participate"
        end
        header={
          <>
            <MovementTitle id="participate">Where TIRO is today, and how to take part.</MovementTitle>
            <p className="mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
              Node Zero is TIRO&apos;s founding web portal and institutional prototype. It becomes an operational custodian
              only after its readiness gates are met: evidenced permissions, trained stewards, restricted-access controls,
              withdrawal handling, verified restoration, and a complete preservation export.
            </p>
          </>
        }
      >
        <Reveal as="ul" className="mt-14 max-w-3xl">
          {ACTIONS.map((action, i) => (
            <li key={action.href} className="lt-branch" style={{ "--lt-delay": `${i * 140}ms` } as React.CSSProperties}>
              <Link href={action.href} className="group block border-b border-[var(--tiro-border)] py-6 transition-colors hover:bg-[var(--tiro-surface)] md:px-4">
                <span className="block font-[family-name:var(--font-display)] text-2xl text-[var(--tiro-text)] md:text-3xl">
                  {action.title}
                  <span aria-hidden="true" className="ml-3 inline-block text-[var(--tiro-accent)] transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
                <span className="mt-2 block max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">{action.body}</span>
              </Link>
            </li>
          ))}
        </Reveal>
        <p className="mt-16 font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
          Custody is not ownership. Systems should witness before they interpret.
        </p>
      </Movement>
    </main>
  );
}
