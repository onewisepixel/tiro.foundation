import Link from "next/link";
import { CopyButton, SubmitButton } from "@/components/flight-deck/client";
import { Notice, PageTitle, Return, Section, when } from "@/components/flight-deck/ui";
import { buildBriefing, digestText } from "@/lib/flightDeck/briefing";
import { OPERATOR_IDS } from "@/lib/flightDeck/identities";
import { markReviewCompleteAction } from "../actions";
import { requirePage } from "../guard";

export default async function DigestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const params = await searchParams;
  const since = await rt.store.read((tx) => tx.settings().lastReviewAt ?? new Date(tx.now.getTime() - 7 * 86_400_000).toISOString());
  const events = await rt.store.auditSince(since);
  const { b, lastReview, exceptions, conversations } = await rt.store.read((tx) => ({
    b: buildBriefing(tx, { operatorIds: OPERATOR_IDS, events }),
    lastReview: tx.settings().lastReviewAt,
    exceptions: tx.list("tasks", (t) => t.status === "open" && ["permission-review", "retention-review"].includes(t.type)).length + tx.list("prospects", (p) => p.stage === "needs-review").length + tx.list("cases", (c) => c.status !== "resolved").length,
    conversations: tx.list("prospects", (p) => p.stage === "conversation-scheduled" || p.stage === "consultation-underway").length,
  }));
  const text = digestText(b);
  const approvals = b.pendingApprovals.outreach + b.pendingApprovals.content + b.pendingApprovals.campaign;

  const BLOCKS = [
    { minutes: 30, title: "Approve or revise content and outreach", count: `${approvals} awaiting`, href: "/flight-deck/approvals" },
    { minutes: 90, title: "Conversations with interested people and prospective partners", count: `${conversations} scheduled or underway`, href: "/flight-deck/relationships?stage=conversation-scheduled" },
    { minutes: 60, title: "Resolve permission, consultation, and operational exceptions", count: `${exceptions} open · ${b.blockers.length} blocked`, href: "/flight-deck/health" },
    { minutes: 60, title: "Progress review and strategic choices", count: `${b.nextActions.length} top actions`, href: "/flight-deck" },
  ];

  return (
    <>
      <PageTitle eyebrow="Weekly review" title="About four hours, in four blocks">
        Last review: {lastReview ? when(lastReview) : "never"}. Generate the digest, work through the blocks, then mark the review complete so the next briefing starts
        from now.
      </PageTitle>
      <Notice params={params} />

      <Section title="This week's blocks (a plan, not a timer)">
        <ol className="grid gap-3 md:grid-cols-2">
          {BLOCKS.map((block, i) => (
            <li key={block.title}>
              <Link href={block.href} className="fd-panel block h-full hover:border-[var(--tiro-accent)]">
                <span className="lt-label">
                  {i + 1} · about {block.minutes} min
                </span>
                <span className="mt-2 block text-[var(--tiro-text)]">{block.title}</span>
                <span className="mt-1 block text-xs text-[var(--tiro-text-muted)]">{block.count}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Digest preview" aside={<CopyButton text={text} label="Copy digest" />}>
        <p className="mb-3 text-xs text-[var(--tiro-text-muted)]">
          Generated now, on this machine. Automatic delivery is off: no email provider and no schedule have been approved. It names people by display name only and
          never includes notes or addresses.
        </p>
        <pre className="fd-panel tiro-register-paper overflow-x-auto whitespace-pre-wrap font-[family-name:var(--font-code)] text-xs leading-relaxed">{text}</pre>
      </Section>

      <form action={markReviewCompleteAction}>
        <Return to="/flight-deck/digest" />
        <SubmitButton tone="primary">Mark this week&apos;s review complete</SubmitButton>
      </form>
    </>
  );
}
