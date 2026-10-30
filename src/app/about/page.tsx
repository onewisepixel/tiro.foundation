import type { Metadata } from "next";
import Link from "next/link";
import "@/components/archive/archive.css";
import "./about.css";

export const metadata: Metadata = {
  title: "About — The Tiro Foundation",
  description:
    "Mission, custodial paradigm, and governance posture of The Tiro Foundation.",
};

const governance = [
  {
    label: "Ethics oversight",
    description:
      "Sensitive collections are intended to be reviewed by an ethics board before publication, not after the fact.",
  },
  {
    label: "Regional stewards",
    description:
      "Local stewards are intended to hold context and authority over material from their own communities.",
  },
  {
    label: "Transparency and appeals",
    description:
      "Takedown and appeal processes are intended to be documented and available to contributors and subjects alike.",
  },
];

// A short page, read in one pass, so no local bar: its two sections are
// headings with stable anchors (/about#governance), set as a finding aid,
// the heading beside its text on wide screens.
export default function AboutPage() {
  return (
    <main id="top" className="la ab bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header className="la-frame ab-wrap ab-head">
        <p className="la-eyebrow">About</p>
        <h1 className="ab-h1 mt-6">A permanent, neutral custodian</h1>
        <p className="ab-intro mt-8">
          The Tiro Foundation exists to preserve endangered cultural and
          linguistic memory — not as a platform that owns what it records,
          but as one node among many possible custodians: a person, a
          village, a library, or TIRO itself.
        </p>
      </header>

      <div className="la-frame ab-wrap">
        <section id="custodial-paradigm" aria-labelledby="custodial-paradigm-title" className="ab-section">
          <h2 id="custodial-paradigm-title" className="ab-h2">
            Custodial Paradigm
          </h2>
          <div className="ab-body">
            <p className="ab-statement">
              Custody is not ownership. Recording a memory does not grant the
              right to reinterpret, monetize, or erase it. TIRO&apos;s systems are
              built to be witnesses before they are interpreters — pointing
              back to the human source rather than synthesizing themselves into
              an authority over it.
            </p>
          </div>
        </section>

        <section id="governance" aria-labelledby="governance-title" className="ab-section">
          <h2 id="governance-title" className="ab-h2">
            Governance
          </h2>
          <div className="ab-body">
            <p className="ab-note">
              TIRO&apos;s governance is still forming. The following states the
              standard TIRO intends to meet — it is not a record of appointed
              roles or completed procedures.
            </p>
            <div className="ab-items">
              {governance.map((item) => (
                <div key={item.label} className="ab-item">
                  <h3 className="ab-h3">{item.label}</h3>
                  <p className="ab-text">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Further reading" className="ab-onward">
          <p>
            For the full statement of principles, read the founding manifesto.
            For the archive itself, visit the Memory Project.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <Link href="/manifesto" className="la-more">
              Read Manifesto v0.2
            </Link>
            <Link href="/memory-project" className="la-more">
              Enter the Memory Project
            </Link>
            <Link href="/community-rights" className="la-more">
              Community Rights &amp; Stewardship
            </Link>
            <Link href="/contact" className="la-more">
              Contact TIRO
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
