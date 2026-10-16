import Link from "next/link";
import { RestrictedRecordNotice, UndiscoverableExplainer } from "@/components/trace/Boundary";
import Constellation from "@/components/trace/Constellation";
import Movement, { MovementTitle } from "@/components/trace/Movement";
import OriginHero, { type MovementLink } from "@/components/trace/OriginHero";
import OriginPoint from "@/components/trace/OriginPoint";
import RecordSpecimen from "@/components/trace/RecordSpecimen";
import { projectGraph, relationsFor, resolveRecord, SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";

// The homepage as six optional movements (Encounter → Participate) on one
// spine. Navigation stays persistent (TopNav) and the hero's "On this
// page" index lets returning visitors jump straight to any movement; no
// movement is a gate. Every demonstration below is synthetic and labeled.
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

export default function Home() {
  const graph = projectGraph();
  const specimen = resolveRecord("DEMO-LT-0001");
  const restricted = resolveRecord("DEMO-LT-0002");

  return (
    <main className="relative bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      <OriginHero movements={MOVEMENTS} />

      <Movement id="witness" index="01" name="Witness">
        <MovementTitle id="witness">
          Before a record, <em>there is a person.</em>
        </MovementTitle>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <p className="max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            A memory reaches an archive through someone: a voice, a recollection, a way of saying things that does not
            survive translation intact. TIRO&apos;s systems should lead people toward that human source, not stand in
            for it.
          </p>
          <figure className="border-l border-[var(--tiro-accent)] pl-6">
            <blockquote className="font-[family-name:var(--font-display)] text-2xl italic leading-snug text-[var(--tiro-text-soft)] md:text-3xl">
              There is a difference between speaking for someone and allowing someone to be heard.
            </blockquote>
            <figcaption className="lt-label mt-4">
              <Link href="/manifesto" className="hover:text-[var(--tiro-text)]">
                Manifesto v0.2 · V. The Witness
              </Link>
            </figcaption>
          </figure>
        </div>
        <ul className="mt-12 grid gap-6 border-t border-[var(--tiro-border)] pt-8 sm:grid-cols-3">
          {[
            ["A voice is never autoplayed", "Audio plays only when you choose it, and never as ambience."],
            ["Always a text path", "Public recordings carry captions or a transcript."],
            ["It can be withheld", "A rights authority may restrict a voice, and the interface says so plainly."],
          ].map(([title, body]) => (
            <li key={title}>
              <p className="text-sm font-medium text-[var(--tiro-text-soft)]">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{body}</p>
            </li>
          ))}
        </ul>
      </Movement>

      <Movement id="preserve" index="02" name="Preserve" tone="deep">
        <MovementTitle id="preserve">A memory, with its context intact.</MovementTitle>
        <p className="mb-12 mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
          Structure is how custody becomes accountable. A record names its source and who holds authority over it,
          states what each use permits, and shows how every claim about it is known.
        </p>
        {specimen?.state === "public" ? (
          <>
            <RecordSpecimen record={specimen.record} relations={relationsFor(graph, specimen.record.recordId)} compact />
            <Link href={`${SPECIMEN_ROUTE}/${specimen.record.recordId}`} className="tiro-link mt-6 inline-block text-sm">
              Open the full specimen record
            </Link>
          </>
        ) : null}
      </Movement>

      <Movement id="discover" index="03" name="Discover">
        <MovementTitle id="discover">Connection without collapse.</MovementTitle>
        <p className="mb-12 mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
          Records connect through people, places, languages, and accounts that disagree. Every link has a type, a basis,
          and a path back to its origin. An interpretation is never drawn as fact.
        </p>
        <Constellation graph={graph} initialEdgeId="e-a-context" />
      </Movement>

      <Movement id="respect" index="04" name="Respect" tone="deep">
        <MovementTitle id="respect">
          A boundary is <em>an act of care.</em>
        </MovementTitle>
        <p className="mb-12 mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
          Preservation does not require publication. Some knowledge is entrusted for restricted access or preservation
          only, and sometimes stewardship means preserving something without revealing it.
        </p>
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            {restricted?.state === "restricted-notice" ? <RestrictedRecordNotice notice={restricted.notice} headingLevel={3} /> : null}
            <Link href={`${SPECIMEN_ROUTE}/DEMO-LT-0002`} className="tiro-link mt-5 inline-block text-sm">
              See this notice as its own record page
            </Link>
          </div>
          <UndiscoverableExplainer />
        </div>
        <p className="lt-label mt-10">Cultural authority precedes curiosity</p>
        <p className="mt-3 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          These states are enforced in the data a page receives, not drawn over it. Both examples are synthetic. Read{" "}
          <Link href="/community-rights" className="tiro-link !text-[var(--tiro-text-soft)]">
            Community Rights &amp; Cultural Data Stewardship
          </Link>{" "}
          for the policy they implement.
        </p>
      </Movement>

      <Movement id="participate" index="05" name="Participate" last>
        <MovementTitle id="participate">Where TIRO is today, and how to take part.</MovementTitle>
        <p className="mt-8 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
          Node Zero is TIRO&apos;s founding web portal and institutional prototype. It becomes an operational custodian
          only after its readiness gates are met: evidenced permissions, trained stewards, restricted-access controls,
          withdrawal handling, verified restoration, and a complete preservation export.
        </p>
        <ul className="mt-12 grid gap-px border border-[var(--tiro-border)] bg-[var(--tiro-border)] sm:grid-cols-2">
          {ACTIONS.map((action) => (
            <li key={action.href} className="bg-[var(--tiro-bg)]">
              <Link href={action.href} className="group flex h-full gap-4 p-6 transition-colors hover:bg-[var(--tiro-surface)] md:p-8">
                <OriginPoint size={18} className="mt-1" />
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-xl text-[var(--tiro-text)] md:text-2xl">
                    {action.title}
                    <span aria-hidden="true" className="ml-2 inline-block text-[var(--tiro-accent)] transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-[var(--tiro-text-muted)]">{action.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-12 font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
          Custody is not ownership. Systems should witness before they interpret.
        </p>
      </Movement>
    </main>
  );
}
