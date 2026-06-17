import Link from "next/link";

export default function Home() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[var(--tiro-bg)] text-[var(--tiro-text)]"
      style={{ fontFamily: "var(--font-geist-sans, sans-serif)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div className="ambient-orb" />
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pb-14 pt-32 md:pb-16 md:pt-44">
        <div className="flex w-full max-w-5xl flex-col items-center text-center md:items-start md:pl-10 md:text-left">
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-[var(--tiro-text-subtle)]">
            Building the Memory Project
          </p>

          <h1 className="mb-6 text-5xl font-semibold leading-tight tracking-tight text-[var(--tiro-text)] md:text-7xl">
            The Tiro Foundation
          </h1>

          <p className="mb-12 max-w-xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            TIRO is building custodial systems for memory, consent, and human
            continuity in an age of accelerating intelligence.
          </p>

          <div className="mb-10 h-px w-16 bg-[var(--tiro-border)]" />

          <Link
            href="/memory-project"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-8 py-3 text-[var(--tiro-text)] backdrop-blur-sm transition-all duration-300 hover:bg-[var(--tiro-surface-strong)] hover:shadow-[0_0_24px_rgba(120,100,255,0.12)]"
          >
            Explore the Memory Project
          </Link>

          <Link
            href="/manifesto"
            className="mt-5 text-sm text-[var(--tiro-text-muted)] underline decoration-[var(--tiro-border)] underline-offset-4 transition-colors duration-300 hover:text-[var(--tiro-text-soft)]"
          >
            Read Manifesto v0.1
          </Link>

          <p className="mt-12 text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
            Preserving continuity between memory, intelligence, and stewardship
          </p>
        </div>
      </section>
    </main>
  );
}
