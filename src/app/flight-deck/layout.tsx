import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlightDeckNav } from "@/components/flight-deck/client";
import { SyntheticBanner } from "@/components/flight-deck/ui";
import { getActor, getBootstrapRuntime, getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { signOut } from "./actions";
import "./flight-deck.css";

export const metadata: Metadata = {
  title: "Flight Deck — TIRO (private)",
  robots: { index: false, follow: false },
};

// Private operations instrument. The proxy already answers 404 outside a
// local-demo request; this checks again on the server for every render.
export default async function FlightDeckLayout({ children }: { children: React.ReactNode }) {
  // Before the console gate only sign-in and the gate page exist; each
  // page enforces that itself. The navigation appears only once open.
  const rt = await getBootstrapRuntime();
  if (!rt) {
    notFound();
  }
  const consoleOpen = !!(await getConsoleRuntime());
  const actor = await getActor(rt);
  const approvals = actor && consoleOpen
    ? await rt.store.read((tx) => tx.list("outreach", (d) => d.status === "needs-review").length + tx.list("content", (d) => d.status === "needs-review").length + tx.list("campaigns", (c) => c.status === "needs-review").length)
    : 0;

  return (
    <div className="fd-shell min-h-screen bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      {rt.store.synthetic ? <SyntheticBanner environment={rt.mode === "local-demo" ? "local-demo" : "staging"} /> : null}
      {actor && consoleOpen ? (
        <div className="fd-bar top-[var(--la-header)]">
          <div className="fd-bar-inner">
            <FlightDeckNav approvals={approvals} />
            <form action={signOut} className="fd-noprint fd-who">
              <span>
                {actor.displayName} · <span className="fd-role">{actor.role}</span>
              </span>
              <button type="submit" className="tiro-link">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <main id="flight-deck" className="fd-main">
        {children}
      </main>
    </div>
  );
}
