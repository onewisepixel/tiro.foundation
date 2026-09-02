import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — The Tiro Foundation",
  description:
    "Mission, custodial paradigm, and governance posture of The Tiro Foundation.",
};

const governance = [
  {
    label: "Ethics oversight",
    description:
      "Sensitive collections are reviewed by an ethics board before publication, not after the fact.",
  },
  {
    label: "Regional stewards",
    description:
      "Local stewards hold context and authority over material from their own communities.",
  },
  {
    label: "Transparency and appeals",
    description:
      "Takedown and appeal processes are documented and available to contributors and subjects alike.",
  },
];

export default function AboutPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-6">About</p>
          <h1 className="mb-6 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            A permanent, neutral custodian
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            The Tiro Foundation exists to preserve endangered cultural and
            linguistic memory — not as a platform that owns what it records,
            but as one node among many possible custodians: a person, a
            village, a library, or TIRO itself.
          </p>
        </div>
      </section>

      <section className="px-6 pb-12 md:pb-16">
        <div className="tiro-card mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-5">Custodial Paradigm</p>
          <p className="text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
            Custody is not ownership. Recording a memory does not grant the
            right to reinterpret, monetize, or erase it. TIRO&apos;s systems are
            built to be witnesses before they are interpreters — pointing
            back to the human source rather than synthesizing themselves into
            an authority over it.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-6">Governance</p>
          <div className="border-t border-[var(--tiro-border)]">
            {governance.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-1 gap-2 border-b border-[var(--tiro-border)] py-6 md:grid-cols-[minmax(160px,220px)_1fr] md:gap-8"
              >
                <h2 className="font-[family-name:var(--font-display)] text-base italic text-[var(--tiro-text-soft)]">
                  {item.label}
                </h2>
                <p className="text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 md:pb-36">
        <div className="mx-auto max-w-3xl">
          <p className="mb-6 text-sm leading-relaxed text-[var(--tiro-text-muted)] md:text-base">
            For the full statement of principles, read the founding manifesto.
            For the archive itself, visit the Memory Project.
          </p>
          <div className="flex flex-wrap gap-6">
            <Link href="/manifesto" className="tiro-link text-sm">
              Read Manifesto v0.1
            </Link>
            <Link href="/memory-project" className="tiro-link text-sm">
              Enter the Memory Project
            </Link>
            <Link href="/contact" className="tiro-link text-sm">
              Contact TIRO
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
