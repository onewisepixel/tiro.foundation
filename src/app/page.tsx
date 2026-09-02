import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] text-[var(--tiro-text)]">
      <section className="flex min-h-screen items-center px-6 pb-14 pt-32 md:pb-16 md:pt-44">
        <div className="mx-auto flex w-full max-w-5xl flex-col md:pl-4">
          <p className="tiro-eyebrow mb-6">Building the Memory Project</p>

          <h1 className="mb-8 max-w-3xl font-[family-name:var(--font-display)] text-5xl font-medium italic leading-[1.1] tracking-tight text-[var(--tiro-text)] md:text-7xl">
            The Tiro Foundation
          </h1>

          <p className="mb-12 max-w-xl text-base leading-relaxed text-[var(--tiro-text-muted)] md:text-lg">
            TIRO is a permanent, neutral custodian of endangered cultural and
            linguistic memory — building custodial systems for memory,
            consent, and human continuity in an age of accelerating
            intelligence.
          </p>

          <hr className="tiro-rule mb-10 w-16" />

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/memory-project" className="tiro-button">
              Explore the Memory Project
            </Link>

            <Link href="/manifesto" className="tiro-link text-sm">
              Read Manifesto v0.1
            </Link>
          </div>

          <p className="mt-16 font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
            Custody is not ownership. Systems should witness before they interpret.
          </p>
        </div>
      </section>
    </main>
  );
}
