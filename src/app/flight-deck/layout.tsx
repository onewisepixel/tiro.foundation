import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlightDeckNav } from "@/components/flight-deck/client";
import { SyntheticBanner } from "@/components/flight-deck/ui";
import { getActor, getRuntime } from "@/lib/flightDeck/runtime";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Flight Deck — TIRO (private)",
  robots: { index: false, follow: false },
};

// Private operations instrument. The proxy already answers 404 outside a
// local-demo request; this checks again on the server for every render.
export default async function FlightDeckLayout({ children }: { children: React.ReactNode }) {
  const rt = await getRuntime();
  if (!rt) {
    notFound();
  }
  const actor = await getActor();
  const approvals = actor
    ? await rt.store.read((tx) => tx.list("outreach", (d) => d.status === "needs-review").length + tx.list("content", (d) => d.status === "needs-review").length + tx.list("campaigns", (c) => c.status === "needs-review").length)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--tiro-bg)] pt-[61px] text-[var(--tiro-text)]">
      <SyntheticBanner />
      {actor ? (
        <div className="sticky top-[61px] z-30 border-b border-[var(--tiro-border)] bg-[var(--tiro-bg)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-[var(--lt-gutter)] md:px-6">
            <FlightDeckNav approvals={approvals} />
            <form action={signOut} className="fd-noprint flex items-center gap-3 py-2 text-xs text-[var(--tiro-text-muted)]">
              <span>
                {actor.displayName} · <span className="uppercase tracking-[0.06em]">{actor.role}</span>
              </span>
              <button type="submit" className="tiro-link">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <main id="flight-deck" className="mx-auto max-w-6xl px-[var(--lt-gutter)] pb-24 pt-8 md:px-6 md:pt-10">
        {children}
      </main>
    </div>
  );
}
