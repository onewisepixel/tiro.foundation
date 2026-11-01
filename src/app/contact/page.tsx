import type { Metadata } from "next";
import Link from "next/link";
import "@/components/archive/archive.css";
import "./contact.css";

export const metadata: Metadata = {
  title: "Contact — The Tiro Foundation",
  description: "Reach The Tiro Foundation for partnership and contribution inquiries.",
};

// A quiet, one-column page: the address as its single destination, then
// the two notes on writing. Presentation only: the address is the same
// mailto: link, and there is no form.
export default function ContactPage() {
  return (
    <main id="top" className="la ct bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <div className="la-frame ct-wrap ct-page">
        <p className="la-eyebrow">Contact</p>
        <h1 className="ct-h1 mt-6">Reach a steward</h1>
        <p className="ct-intro mt-8">
          Partnership inquiries, contribution proposals, and questions about
          custody and consent are welcome. TIRO is a small, deliberate
          operation — expect a considered reply, not an instant one.
        </p>

        <p className="ct-address">
          <a href="mailto:custodians@tiro.foundation">
            custodians<wbr />@tiro.foundation
          </a>
        </p>

        <div className="ct-notes">
          <p>
            Interested in TIRO&apos;s pilot?{" "}
            <Link href="/pilot">Read what it is and is not</Link> before
            writing. We are not collecting recordings, stories, or other
            material yet.
          </p>
          <p>
            If you are writing about a memory record already in the archive —
            a correction, a consent withdrawal, or a dispute — please
            reference the record ID shown on that page.
          </p>
        </div>
      </div>
    </main>
  );
}
