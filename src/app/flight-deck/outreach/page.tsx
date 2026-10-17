import Link from "next/link";
import { Empty, Notice, PageTitle, Section, StatusBadge, when } from "@/components/flight-deck/ui";
import type { DraftStatus } from "@/lib/flightDeck/types";
import { requirePage } from "../guard";

const GROUPS: { title: string; statuses: DraftStatus[] }[] = [
  { title: "Needs attention (held or failed)", statuses: ["held", "failed"] },
  { title: "Awaiting review", statuses: ["needs-review"] },
  { title: "Approved: ready to queue or send by hand", statuses: ["approved", "manual-ready", "scheduled"] },
  { title: "Drafts", statuses: ["draft"] },
  { title: "Sent", statuses: ["sent"] },
];

export default async function OutreachPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const params = await searchParams;
  const drafts = await rt.store.read((tx) =>
    tx
      .list("outreach", (d) => d.status !== "archived")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((d) => ({ ...d, name: tx.get("prospects", d.prospectId)?.displayName ?? "—", subject: d.versions.find((v) => v.version === d.currentVersion)!.subject })),
  );
  return (
    <>
      <PageTitle eyebrow="Outreach" title="One message at a time">
        Every first message, reply, and follow-up is approved individually, for its exact text, recipient and schedule. At most one follow-up per person. No sequences,
        no bulk sends. Start a draft from a relationship page.
      </PageTitle>
      <Notice params={params} />
      {GROUPS.map((g) => {
        const rows = drafts.filter((d) => g.statuses.includes(d.status));
        return (
          <Section key={g.title} title={`${g.title} (${rows.length})`}>
            {rows.length === 0 ? (
              <Empty>None.</Empty>
            ) : (
              rows.map((d) => (
                <Link key={d.id} href={`/flight-deck/outreach/${d.id}`} className="fd-row grid gap-2 px-1 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center">
                  <span>
                    <span className="block">{d.subject}</span>
                    <span className="block text-xs text-[var(--tiro-text-muted)]">
                      To {d.name} · {d.purpose.replace("-", " ")} · v{d.currentVersion}
                      {d.origin === "template" ? " · from template" : ""}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--tiro-text-muted)]">Updated {when(d.updatedAt)}</span>
                  <StatusBadge status={d.status} />
                </Link>
              ))
            )}
          </Section>
        );
      })}
    </>
  );
}
