import Link from "next/link";
import { Badge, Empty, Notice, PageTitle, Section, day, when } from "@/components/flight-deck/ui";
import { buildBriefing } from "@/lib/flightDeck/briefing";
import { OPERATOR_IDS } from "@/lib/flightDeck/identities";
import { requirePage } from "./guard";

const INTEREST = { "interested-contributor": "Potential contributor", "community-partner": "Community / partner", "specialist-volunteer": "Specialist / volunteer", institution: "Institution" } as const;

export default async function NowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const params = await searchParams;
  const b = await rt.store.read((tx) => buildBriefing(tx, { operatorIds: OPERATOR_IDS }));
  const approvals = b.pendingApprovals.outreach + b.pendingApprovals.content + b.pendingApprovals.campaign;

  return (
    <>
      <PageTitle eyebrow="Now" title="This week, at a glance">
        Activity {b.sinceLabel} ({day(b.since)} onward). Ordered by lateness, then the priority you set, then due date. Nothing here ranks people.
      </PageTitle>
      <Notice params={params} />

      {b.paused ? (
        <p role="status" className="mb-8 border-l-2 border-[var(--tiro-contested)] pl-4 text-sm">
          <strong>All outbound activity is paused.</strong> Nothing will be dispatched or attested until it is resumed on{" "}
          <Link className="tiro-link" href="/flight-deck/health">
            Health
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Next actions (top five)">
            {b.nextActions.length === 0 ? (
              <Empty>Nothing needs you right now.</Empty>
            ) : (
              <ol>
                {b.nextActions.map((a, i) => (
                  <li key={`${a.href}-${i}`}>
                    <Link href={a.href} className="fd-row flex items-start gap-4 px-1">
                      <span className="font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[var(--tiro-text)]">{a.title}</span>
                        <span className="mt-1 block text-xs text-[var(--tiro-text-muted)]">
                          {a.detail}
                          {a.dueOn ? ` · due ${a.dueOn}` : ""}
                        </span>
                      </span>
                      {a.overdue ? (
                        <Badge tone="blocked" glyph="!">
                          Overdue
                        </Badge>
                      ) : a.priority === "high" ? (
                        <Badge tone="attention" glyph="▲">
                          High
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Ready for your approval" aside={<Link href="/flight-deck/approvals" className="tiro-link text-xs">Open approvals</Link>}>
            {approvals === 0 ? (
              <Empty>Nothing awaiting approval.</Empty>
            ) : (
              <p className="text-sm text-[var(--tiro-text-soft)]">
                {b.pendingApprovals.outreach} outreach message{b.pendingApprovals.outreach === 1 ? "" : "s"}, {b.pendingApprovals.content} content draft
                {b.pendingApprovals.content === 1 ? "" : "s"}, {b.pendingApprovals.campaign} campaign{b.pendingApprovals.campaign === 1 ? "" : "s"}.
              </p>
            )}
          </Section>

          <Section title="Replies to address">
            {b.replies.length === 0 ? (
              <Empty>No replies waiting.</Empty>
            ) : (
              b.replies.map((t) => (
                <Link key={t.id} href={`/flight-deck/relationships/${t.prospectId}`} className="fd-row block px-1 text-sm">
                  {t.prospectName}: {t.title} <span className="text-[var(--tiro-text-muted)]">· due {day(t.dueOn)}</span>
                </Link>
              ))
            )}
          </Section>

          <Section title="New inquiries">
            {b.newInquiries.length === 0 ? (
              <Empty>No new inquiries {b.sinceLabel}.</Empty>
            ) : (
              b.newInquiries.map((p) => (
                <Link key={p.id} href={`/flight-deck/relationships/${p.id}`} className="fd-row flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                  <span>{p.displayName}</span>
                  <span className="text-xs text-[var(--tiro-text-muted)]">
                    {INTEREST[p.participationInterest]} · self-described · {when(p.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </Section>
        </div>

        <div>
          <Section title="Blocked by a gate">
            {b.blockers.length === 0 ? (
              <Empty>Nothing blocked.</Empty>
            ) : (
              b.blockers.map((x, i) => (
                <Link key={`${x.href}-${i}`} href={x.href} className="fd-row block px-1 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-[var(--tiro-contested)]">
                      ■
                    </span>
                    {x.title}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--tiro-text-muted)]">{x.reason}</span>
                </Link>
              ))
            )}
          </Section>

          <Section title="Commitments at risk (due within 2 days)">
            {b.atRisk.length === 0 ? (
              <Empty>None.</Empty>
            ) : (
              b.atRisk.map((t) => (
                <Link key={t.id} href={t.prospectId ? `/flight-deck/relationships/${t.prospectId}` : "/flight-deck/health"} className="fd-row block px-1 text-sm">
                  {t.title}
                  <span className="mt-1 block text-xs text-[var(--tiro-text-muted)]">
                    {t.prospectName ?? "Operations"} · due {day(t.dueOn)}
                  </span>
                </Link>
              ))
            )}
          </Section>

          <Section title={`What progressed ${b.sinceLabel}`}>
            {b.progressed.length === 0 ? (
              <Empty>Nothing recorded.</Empty>
            ) : (
              <dl>
                {b.progressed.map((p) => (
                  <div key={p.label} className="tiro-kv">
                    <dt className="k !text-[var(--tiro-text-soft)]">{p.label}</dt>
                    <dd className="v">{p.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section title="Continuing without you">
            {b.continuing.length === 0 ? (
              <Empty>Nothing is queued to continue on its own.</Empty>
            ) : (
              <dl>
                {b.continuing.map((c) => (
                  <div key={c.label} className="tiro-kv">
                    <dt className="k !text-[var(--tiro-text-soft)]">{c.label}</dt>
                    <dd className="v">{c.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <div className="fd-panel">
            <p className="text-sm text-[var(--tiro-text-soft)]">Weekly review and digest</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--tiro-text-muted)]">Generate the digest, work through the four review blocks, then mark the review complete.</p>
            <Link href="/flight-deck/digest" className="fd-button mt-3">
              Open weekly review
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-[var(--tiro-text-muted)]">Counts are operational records in this local store. They are not participants, partners, or collection results.</p>
    </>
  );
}
