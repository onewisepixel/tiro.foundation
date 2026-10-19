import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Notice, PageTitle, Return, Section } from "@/components/flight-deck/ui";
import { checkRecovery } from "@/lib/flightDeck/recovery";
import { getActor, getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { reconcileAction } from "../actions";

// The only console page served while recovery is unverified (guard.ts).
// It shows the recovery status and nothing else: no names, no records, no
// counts, so an unverified (possibly restored) copy exposes nothing.
const REASON: Record<string, string> = {
  "journal-ahead": "the database is missing protective decisions the log holds (after a restore, or an interrupted write). The scheduled worker replays them automatically",
  "restore-in-progress": "this database is a restored copy and has not yet been checked against the log. The scheduled worker does this automatically",
  "journal-mismatch": "the database's latest protective decision does not match the log. Check that this copy points at the right log, then verify",
  "journal-integrity": "the protective log failed its integrity check. A founder must investigate before recovery can run (operations.md §6)",
  "sink-unavailable": "the protective log cannot be reached, so this database cannot be checked",
};

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = await getConsoleRuntime();
  if (!rt) {
    notFound();
  }
  const params = await searchParams;
  const actor = await getActor(rt);
  const status = await checkRecovery(rt.store).catch(() => null);
  const reason = status && !status.ok ? status.reason : status ? null : "sink-unavailable";

  return (
    <div className="max-w-3xl">
      <PageTitle eyebrow="Flight Deck · recovery" title={reason ? "Paused until recovery is verified" : "Recovery verified"}>
        Opt-outs, erasures, and operator changes are kept in a log outside the database. Until this database has been checked against that log, Flight Deck shows no records and
        contacts no one.
      </PageTitle>
      <Notice params={params} />
      <Section title="Status">
        <p className="mb-4 text-sm">
          {reason ? (
            <Badge tone="blocked" glyph="■">
              Paused: {REASON[reason] ?? reason}
            </Badge>
          ) : (
            <Badge tone="done" glyph="✓">
              Verified: the database matches the protective log
            </Badge>
          )}
        </p>
        {reason && actor?.role === "founder" ? (
          <form action={reconcileAction}>
            <Return to="/flight-deck/recovery" />
            <SubmitButton tone="primary">Verify and replay now</SubmitButton>
            <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">When it succeeds, everyone is signed out, you included, and signs in again.</p>
          </form>
        ) : null}
        {!actor ? (
          <Link href="/flight-deck/sign-in" className="tiro-link text-sm">
            Sign in
          </Link>
        ) : !reason ? (
          <Link href="/flight-deck" className="tiro-link text-sm">
            Go to the console
          </Link>
        ) : null}
      </Section>
    </div>
  );
}
