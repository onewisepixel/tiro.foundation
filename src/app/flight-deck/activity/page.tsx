import Link from "next/link";
import { Empty, Notice, PageTitle, when } from "@/components/flight-deck/ui";
import { displayNameFor } from "@/lib/flightDeck/identities";
import { requirePage } from "../guard";

const HREF: Record<string, (id: string) => string> = {
  prospect: (id) => `/flight-deck/relationships/${id}`,
  outreach: (id) => `/flight-deck/outreach/${id}`,
  content: (id) => `/flight-deck/content/${id}`,
  campaign: () => "/flight-deck/campaigns",
  job: () => "/flight-deck/health",
};

const PAGE = 150;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const params = await searchParams;
  const page = Math.max(0, Number(typeof params.page === "string" ? params.page : 0) || 0);
  const { events, total, live } = await rt.store.read((tx) => {
    const all = tx.list("audit").sort((a, b) => b.at.localeCompare(a.at));
    const ids = new Set([...tx.list("prospects").map((p) => p.id), ...tx.list("outreach").map((d) => d.id), ...tx.list("content").map((c) => c.id)]);
    return { events: all.slice(page * PAGE, (page + 1) * PAGE), total: all.length, live: ids };
  });
  return (
    <>
      <PageTitle eyebrow="Activity" title="Append-only record of what happened">
        Who, in what capacity, did what to which record, and when. Events hold codes and opaque ids only: never a message, a note, an address, or a token. They
        cannot be edited or deleted. An event may outlive the record it refers to.
      </PageTitle>
      <Notice params={params} />
      {events.length === 0 ? <Empty>No activity.</Empty> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead className="lt-label">
            <tr className="border-b border-[var(--tiro-border)]">
              <th scope="col" className="py-2 pr-3 font-normal">When</th>
              <th scope="col" className="py-2 pr-3 font-normal">Who</th>
              <th scope="col" className="py-2 pr-3 font-normal">Action</th>
              <th scope="col" className="py-2 pr-3 font-normal">Object</th>
              <th scope="col" className="py-2 font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-[var(--tiro-border)] align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-[var(--tiro-text-muted)]">{when(e.at)}</td>
                <td className="py-2 pr-3">
                  {displayNameFor(e.actorId)} <span className="text-[var(--tiro-text-muted)]">({e.actorRole})</span>
                </td>
                <td className="py-2 pr-3 font-[family-name:var(--font-code)]">{e.action}</td>
                <td className="py-2 pr-3">
                  {e.objectId && HREF[e.objectType] && (live.has(e.objectId) || e.objectType === "campaign" || e.objectType === "job") ? (
                    <Link href={HREF[e.objectType](e.objectId)} className="tiro-link">
                      {e.objectType} {e.objectId.slice(-6)}
                    </Link>
                  ) : (
                    <span className="text-[var(--tiro-text-muted)]">
                      {e.objectType} {e.objectId ? `${e.objectId.slice(-6)}${live.has(e.objectId) ? "" : " (gone)"}` : ""}
                    </span>
                  )}
                </td>
                <td className="py-2 font-[family-name:var(--font-code)] text-[var(--tiro-text-muted)]">{e.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 flex gap-4 text-xs">
        {page > 0 ? (
          <Link className="tiro-link" href={`/flight-deck/activity?page=${page - 1}`}>
            Newer
          </Link>
        ) : null}
        {(page + 1) * PAGE < total ? (
          <Link className="tiro-link" href={`/flight-deck/activity?page=${page + 1}`}>
            Older
          </Link>
        ) : null}
        <span className="text-[var(--tiro-text-muted)]">{total} events</span>
      </p>
    </>
  );
}
