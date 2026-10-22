import Link from "next/link";
import { Empty, Notice, PageTitle, StageBadge, day } from "@/components/flight-deck/ui";
import { operatorDirectory } from "@/lib/flightDeck/identities";
import { STAGES, type Stage } from "@/lib/flightDeck/types";
import { STAGE_LABELS } from "@/lib/flightDeck/workflow";
import { requirePage } from "../guard";

export default async function RelationshipsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const { displayNameFor } = await operatorDirectory(rt.identity);
  const params = await searchParams;
  const stage = typeof params.stage === "string" && (STAGES as readonly string[]).includes(params.stage) ? (params.stage as Stage) : null;
  const { rows, counts } = await rt.store.read((tx) => {
    const all = tx.list("prospects");
    const counts = new Map<Stage, number>();
    for (const p of all) {
      counts.set(p.stage, (counts.get(p.stage) ?? 0) + 1);
    }
    const rows = all
      .filter((p) => !stage || p.stage === stage)
      .sort((a, b) => (b.lastInboundAt ?? b.createdAt).localeCompare(a.lastInboundAt ?? a.createdAt))
      .map((p) => ({ ...p, openTasks: tx.list("tasks", (t) => t.prospectId === p.id && t.status === "open").length }));
    return { rows, counts };
  });

  return (
    <>
      <PageTitle eyebrow="Relationships" title="Prospective contributors and partners">
        Operational contact records only. Nothing here is an archival source, a verified authority, or consent to collect. There is no public directory.
      </PageTitle>
      <Notice params={params} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/flight-deck/relationships/new" className="fd-button" data-tone="primary">
          Add a researched or referred contact
        </Link>
      </div>
      <nav aria-label="Filter by stage" className="mb-6 flex flex-wrap gap-2 text-xs">
        <Link href="/flight-deck/relationships" aria-current={!stage ? "true" : undefined} className={`fd-badge ${!stage ? "!border-[var(--tiro-accent)] !text-[var(--tiro-accent)]" : ""}`}>
          All ({[...counts.values()].reduce((a, b) => a + b, 0)})
        </Link>
        {STAGES.filter((s) => counts.get(s)).map((s) => (
          <Link key={s} href={`/flight-deck/relationships?stage=${s}`} aria-current={stage === s ? "true" : undefined} className={`fd-badge ${stage === s ? "!border-[var(--tiro-accent)] !text-[var(--tiro-accent)]" : ""}`}>
            {STAGE_LABELS[s]} ({counts.get(s)})
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>No relationships{stage ? " at this stage" : ""}.</Empty>
      ) : (
        <ul className="border-t border-[var(--tiro-border)]">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/flight-deck/relationships/${p.id}`} className="fd-row grid gap-2 px-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] md:items-center">
                <span>
                  <span className="block text-[var(--tiro-text)]">{p.displayName}</span>
                  <span className="block text-xs text-[var(--tiro-text-muted)]">
                    {p.organizationName ?? (p.kind === "organization" ? "Organization" : "Person")} · {p.source.replace("-", " ")}
                  </span>
                </span>
                <span>
                  <StageBadge stage={p.stage} />
                </span>
                <span className="text-xs text-[var(--tiro-text-muted)]">
                  {p.nextAction ?? "No next action"}
                  {p.nextActionDue ? ` · ${day(p.nextActionDue)}` : ""} · {displayNameFor(p.ownerId)} · {p.openTasks} open task{p.openTasks === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
