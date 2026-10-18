import Link from "next/link";
import { Badge, Empty, Notice, PageTitle, Section, StatusBadge } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { PLAYBOOKS } from "@/lib/flightDeck/cases";
import { requirePage } from "../guard";

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const params = await searchParams;
  const { open, resolved, today } = await rt.store.read((tx) => {
    const all = tx.list("cases").map((c) => ({ ...c, name: c.prospectId ? (tx.get("prospects", c.prospectId)?.displayName ?? null) : null }));
    return {
      open: all.filter((c) => c.status !== "resolved").sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
      resolved: all.filter((c) => c.status === "resolved").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20),
      today: tx.nowIso.slice(0, 10),
    };
  });
  return (
    <>
      <PageTitle eyebrow="Exceptions" title="Things that must not drift into ordinary outreach">
        Material sent by mistake, opt-outs, deletion and access requests, complaints, mistaken submissions, lost messages, doubtful researched contacts, and
        incidents. Each has a checklist and a deadline, and most hold outreach to the person until resolved. Cases record how something was handled, never what it
        said.
      </PageTitle>
      <Notice params={params} />
      {can(actor, "edit-relationships") || can(actor, "pause") ? (
        <p className="mb-8">
          <Link href="/flight-deck/cases/new" className="fd-button" data-tone="primary">
            Open a case
          </Link>
        </p>
      ) : null}
      <Section title={`Open (${open.length})`}>
        {open.length === 0 ? <Empty>No open cases.</Empty> : null}
        {open.map((c) => (
          <Link key={c.id} href={`/flight-deck/cases/${c.id}`} className="fd-row grid gap-2 px-1 text-sm md:grid-cols-[minmax(0,2fr)_auto_auto] md:items-center">
            <span>
              <span className="block">{PLAYBOOKS[c.kind].label}</span>
              <span className="block text-xs text-[var(--tiro-text-muted)]">
                {c.name ?? (c.prospectId ? "Erased person" : "No person linked")} · {c.steps.filter((s) => s.doneAt).length} of {c.steps.length} steps
              </span>
            </span>
            {c.dueOn < today ? (
              <Badge tone="blocked" glyph="!">
                Overdue · {c.dueOn}
              </Badge>
            ) : (
              <Badge tone="attention">Due {c.dueOn}</Badge>
            )}
            {c.holdsOutreach ? <StatusBadge status="held" /> : <StatusBadge status={c.status === "contained" ? "running" : "open"} />}
          </Link>
        ))}
      </Section>
      <Section title="Recently resolved">
        {resolved.length === 0 ? <Empty>None.</Empty> : null}
        {resolved.map((c) => (
          <Link key={c.id} href={`/flight-deck/cases/${c.id}`} className="fd-row flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
            <span>
              {PLAYBOOKS[c.kind].label} · {c.outcome}
            </span>
            <StatusBadge status="done" />
          </Link>
        ))}
      </Section>
    </>
  );
}
