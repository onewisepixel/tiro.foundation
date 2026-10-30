import type { Metadata } from "next";
import Link from "next/link";
import LocalNav from "@/components/archive/LocalNav";
import "@/components/archive/archive.css";
import "./community-rights.css";

export const metadata: Metadata = {
  title: "Community Rights & Cultural Data Stewardship — The Tiro Foundation",
  description:
    "Communities remain the principals. TIRO is the custodian. TIRO's policy on source authority, consent, access, and computational reuse.",
};

const principles = [
  {
    label: "Custody, not ownership",
    description:
      "Recording a memory does not make it TIRO's. To store something does not give us authority over it. Communities and contributors remain the cultural and intellectual principals of what they entrust to us; TIRO's role is custodian, not owner. Where legal intellectual-property rights can be identified, TIRO records them separately — cultural authority does not depend on TIRO's ability to establish conventional legal ownership.",
  },
  {
    label: "Source authority",
    description:
      "Every published memory record identifies its Source Authority — the person, community, or other body whose cultural or intellectual authority underlies the material — separately from whoever recorded, translated, submitted, or otherwise facilitated it. This is a standing field on every record, not an afterthought. Where authority is shared, disputed, uncertain, or cannot responsibly be assigned to a single party, the record says so.",
  },
  {
    label: "Consent: explicit, traceable, revocable",
    description:
      "Consent is captured per record and scoped to specific uses. Consent may be withdrawn. Every published record states who may request withdrawal or restriction, how to make that request, and what withdrawal means for that record. TIRO will cease publication and future distribution of the affected material within systems under its control, subject only to preservation, legal, or integrity obligations disclosed when consent is given. Consent that cannot meaningfully be changed is not meaningful consent.",
  },
  {
    label: "Access is not entitlement",
    description:
      "Preservation does not require publication. Some knowledge may be entrusted to TIRO for restricted access or preservation only — cultural, spiritual, familial, community, safety, or other legitimate restrictions may determine who can encounter a record, under what circumstances, and whether it may be made public at all. TIRO's ability to make something accessible does not create an obligation or right to do so. Sometimes stewardship means preserving something without revealing it.",
  },
  {
    label: "Provenance as permanent record",
    description:
      "Provenance notes, translator notes, disputed details, community annotations, and material uncertainties are preserved alongside the material itself — not edited away when they complicate the story. TIRO distinguishes the record from TIRO's interpretation of the record. Uncertainty and disagreement are part of the archive, not liabilities to be hidden.",
  },
  {
    label: "Purpose does not transfer",
    description:
      "Permission for one use does not imply permission for another. Preservation does not imply consent to model training, synthetic reproduction, commercial licensing, biometric analysis, voice cloning, or other materially different computational or secondary uses. TIRO will not undertake or authorize such uses unless they fall within the consent explicitly granted for that record. New capability does not create new permission.",
  },
  {
    label: "No claim of exclusivity",
    description:
      "TIRO does not require exclusive custody of what it preserves. Source communities and contributors may retain, preserve, publish, or entrust their own material elsewhere independent of whether TIRO also holds a copy. TIRO should strengthen the survival of a record, not become the condition of its survival.",
    emphasis: "A community is a node in its own right — not a dependency of TIRO's.",
  },
];

// Each principle's anchor, for citing it (/community-rights#consent).
// Written out rather than derived from the label, so a later change of
// wording never breaks a link already made to a principle. Order gives
// the clause numbers.
const CLAUSE_IDS: Record<string, string> = {
  "Custody, not ownership": "custody",
  "Source authority": "source-authority",
  "Consent: explicit, traceable, revocable": "consent",
  "Access is not entitlement": "access",
  "Provenance as permanent record": "provenance",
  "Purpose does not transfer": "purpose",
  "No claim of exclusivity": "exclusivity",
};

const clauses = principles.map((principle, index) => {
  const id = CLAUSE_IDS[principle.label];
  if (!id) throw new Error(`Community Rights: no anchor for "${principle.label}"`);
  return { ...principle, id, n: index + 1 };
});

const REQUESTS_TITLE = "Requesting a Correction, Restriction, or Withdrawal";

// The status note is short and last, so it never reaches the top of the
// view; it keeps its anchor but is not a stop on the bar.
const LOCAL_ITEMS = [
  { id: "principles", label: "Principles" },
  { id: "requests", label: "Requests" },
];

export default function CommunityRightsPage() {
  return (
    <main id="top" className="la cr bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <LocalNav title="Community Rights" items={LOCAL_ITEMS} cta={{ href: "/contact", label: "Contact TIRO" }} />

      <header className="la-frame cr-wrap cr-head">
        <p className="la-eyebrow">Community Rights &amp; Cultural Data Stewardship</p>
        <h1 className="cr-h1 mt-6">Communities remain the principals. TIRO is the custodian.</h1>
        <p className="cr-intro mt-8">
          This policy states how TIRO handles what communities and
          contributors entrust to it. It governs every record in the
          Memory Project and is grounded in TIRO&apos;s founding doctrine,
          not a separate or lesser standard applied after the fact.
        </p>

        <nav aria-label="Contents" className="cr-contents">
          <ol>
            {clauses.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`}>
                  <span className="cr-contents-n">{c.n}</span>
                  <span>{c.label}</span>
                </a>
              </li>
            ))}
          </ol>
          <a href="#requests" className="cr-contents-requests">
            <span>{REQUESTS_TITLE}</span>
            <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </header>

      <div className="la-frame cr-wrap">
        <section id="principles" aria-label="Principles" className="cr-clauses">
          {clauses.map((c) => (
            <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="cr-clause">
              <div className="cr-heading">
                <h2 id={`${c.id}-title`} className="cr-h2">
                  <span className="cr-num">{c.n}</span>{" "}
                  <span className="cr-title">{c.label}</span>
                </h2>
                <a href={`#${c.id}`} className="cr-anchor" aria-label={`Link to principle ${c.n}, ${c.label}`}>
                  #
                </a>
              </div>
              <div className="cr-body">
                <p className="cr-text">{c.description}</p>
                {c.emphasis ? <p className="cr-emphasis">{c.emphasis}</p> : null}
              </div>
            </section>
          ))}
        </section>

        <section id="requests" aria-labelledby="requests-title" className="cr-requests">
          <div className="cr-heading">
            <h2 id="requests-title" className="cr-requests-title">
              {REQUESTS_TITLE}
            </h2>
            <a href="#requests" className="cr-anchor" aria-label={`Link to ${REQUESTS_TITLE}`}>
              #
            </a>
          </div>
          <p className="cr-text">
            Every published memory record states its record ID, Source
            Authority, consent scope, and applicable withdrawal terms under
            Provenance &amp; Consent. To request a correction, dispute a
            detail, change an access restriction, or withdraw consent for a
            record already in the archive, contact TIRO with that record ID.
          </p>
          <Link href="/contact" className="la-cta mt-8">
            Contact TIRO <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section id="status" aria-label="Status of this policy" className="cr-status">
          <p>
            This policy will be formalized as part of TIRO&apos;s constitutional
            documents. Until then, it states the standard TIRO already holds
            itself to.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <Link href="/manifesto" className="la-more">
              Read the Manifesto v0.2
            </Link>
            <Link href="/memory-project" className="la-more">
              The Memory Project
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
