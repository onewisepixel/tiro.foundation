import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact — The Tiro Foundation",
  description: "Reach The Tiro Foundation for partnership and contribution inquiries.",
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-28 pt-8 md:pb-36 md:pt-12">
        <div className="mx-auto max-w-3xl">
          <p className="tiro-eyebrow mb-6">Contact</p>
          <h1 className="mb-8 font-[family-name:var(--font-display)] text-4xl italic leading-tight tracking-tight md:text-6xl">
            Reach a steward
          </h1>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            Partnership inquiries, contribution proposals, and questions about
            custody and consent are welcome. TIRO is a small, deliberate
            operation — expect a considered reply, not an instant one.
          </p>

          <a
            href="mailto:custodians@tiro.foundation"
            className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--tiro-text)] transition-colors hover:text-[var(--tiro-accent)]"
          >
            custodians@tiro.foundation
          </a>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-[var(--tiro-text-muted)]">
            Interested in TIRO&apos;s pilot?{" "}
            <Link href="/pilot" className="tiro-link">
              Read what it is and is not
            </Link>{" "}
            before writing. We are not collecting recordings, stories, or other material yet.
          </p>

          <hr className="tiro-rule my-10 w-16" />

          <p className="max-w-xl text-sm leading-relaxed text-[var(--tiro-text-muted)]">
            If you are writing about a memory record already in the archive —
            a correction, a consent withdrawal, or a dispute — please
            reference the record ID shown on that page.
          </p>
        </div>
      </section>
    </main>
  );
}
