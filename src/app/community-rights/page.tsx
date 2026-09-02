import type { Metadata } from "next";
import Link from "next/link";

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

export default function CommunityRightsPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-6">Community Rights &amp; Cultural Data Stewardship</p>
          <h1 className="mb-6 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            Communities remain the principals. TIRO is the custodian.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            This policy states how TIRO handles what communities and
            contributors entrust to it. It governs every record in the
            Memory Project and is grounded in TIRO&apos;s founding doctrine,
            not a separate or lesser standard applied after the fact.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="border-t border-[var(--tiro-border)]">
            {principles.map((principle) => (
              <div
                key={principle.label}
                className="grid grid-cols-1 gap-2 border-b border-[var(--tiro-border)] py-7 md:grid-cols-[minmax(200px,260px)_1fr] md:gap-8"
              >
                <h2 className="font-[family-name:var(--font-display)] text-lg italic text-[var(--tiro-text-soft)]">
                  {principle.label}
                </h2>
                <div>
                  <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                    {principle.description}
                  </p>
                  {principle.emphasis ? (
                    <p className="mt-4 font-[family-name:var(--font-display)] text-base italic text-[var(--tiro-text)] md:text-lg">
                      {principle.emphasis}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24">
        <div className="tiro-card mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-5">Requesting a Correction, Restriction, or Withdrawal</p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            Every published memory record states its record ID, Source
            Authority, consent scope, and applicable withdrawal terms under
            Provenance &amp; Consent. To request a correction, dispute a
            detail, change an access restriction, or withdraw consent for a
            record already in the archive, contact TIRO with that record ID.
          </p>
          <Link href="/contact" className="tiro-link mt-6 inline-block text-sm">
            Contact TIRO
          </Link>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-3xl">
          <p className="mb-6 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
            This policy will be formalized as part of TIRO&apos;s constitutional
            documents. Until then, it states the standard TIRO already holds
            itself to.
          </p>
          <div className="flex flex-wrap gap-6">
            <Link href="/manifesto" className="tiro-link text-sm">
              Read the Manifesto v0.2
            </Link>
            <Link href="/memory-project" className="tiro-link text-sm">
              The Memory Project
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
