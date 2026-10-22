import Link from "next/link";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { payloadFor } from "@/lib/flightDeck/approvals";
import { operatorDirectory } from "@/lib/flightDeck/identities";
import { contactEligibility } from "@/lib/flightDeck/permissions";
import { decideAction } from "../actions";
import { requirePage } from "../guard";

type Item = {
  type: "outreach" | "content" | "campaign";
  id: string;
  href: string;
  heading: string;
  consequence: string;
  lines: [string, string][];
  body: string | null;
  hash: string;
  version: number;
  warnings: string[];
  submittedAt: string;
};

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { activeReviewers } = await operatorDirectory(rt.identity);
  const params = await searchParams;
  const items = await rt.store.read((tx) => {
    const out: Item[] = [];
    for (const d of tx.list("outreach", (x) => x.status === "needs-review")) {
      const p = tx.require("prospects", d.prospectId);
      const v = d.versions.find((x) => x.version === d.currentVersion)!;
      const e = contactEligibility(tx, p, d.purpose);
      const pay = payloadFor(tx, "outreach", d.id);
      out.push({
        type: "outreach",
        id: d.id,
        href: `/flight-deck/outreach/${d.id}`,
        heading: `${d.purpose === "first-contact" ? "First contact" : d.purpose === "follow-up" ? "Single follow-up" : "Reply"} to ${p.displayName}`,
        consequence: "Approving permits this exact email, to this address, on this schedule, once. Any edit voids it.",
        lines: [
          ["To", `${p.displayName} <${p.email ?? "none"}>`],
          ["Subject", v.subject],
          ["Schedule", d.scheduledFor ? when(d.scheduledFor) : "When queued"],
          ["Basis", e.ok ? `${e.permission.basis} (${e.permission.purpose})` : `NOT PERMITTED: ${e.reason}`],
        ],
        body: v.body,
        hash: pay.hash,
        version: pay.version,
        warnings: [...(e.ok ? [] : ["No current permission for this kind of message: approval will be refused."]), ...(p.authorityStatus === "unverified" && d.purpose === "first-contact" ? ["Authority is unverified. Do not ask them to confirm authority by email."] : [])],
        submittedAt: d.updatedAt,
      });
    }
    for (const c of tx.list("content", (x) => x.status === "needs-review")) {
      const v = c.versions.find((x) => x.version === c.currentVersion)!;
      const pay = payloadFor(tx, "content", c.id);
      out.push({
        type: "content",
        id: c.id,
        href: `/flight-deck/content/${c.id}`,
        heading: `${c.channel} post: ${c.title}`,
        consequence: "Approving permits publication of this exact text, on this channel, with this asset and schedule. It does not publish anything.",
        lines: [
          ["Channel", c.channel],
          ["Origin", c.originCategory],
          ["Source", c.sourceReference],
          ["Asset", c.assetDescription ?? "None"],
          ["Asset permission", c.assetPermission ?? "—"],
          ["Schedule", c.scheduledFor ? when(c.scheduledFor) : "Unscheduled"],
        ],
        body: v.body,
        hash: pay.hash,
        version: pay.version,
        warnings: c.originCategory === "evidence" ? ["Evidence: confirm the asset's authorization covers this channel and audience."] : [],
        submittedAt: c.updatedAt,
      });
    }
    for (const c of tx.list("campaigns", (x) => x.status === "needs-review")) {
      const pay = payloadFor(tx, "campaign", c.id);
      out.push({
        type: "campaign",
        id: c.id,
        href: "/flight-deck/campaigns",
        heading: `Campaign: ${c.name}`,
        consequence: "Approving the campaign scope does not make any recipient eligible; every message still needs its own approval.",
        lines: [
          ["Purpose", c.purpose],
          ["Audience", c.audience],
          ["Limits", `${c.postsPerWeekCap} posts / ${c.introductionsPerWeekCap} introductions per week`],
          ["Reviews", `consent ${c.consentReviewStatus}, legal ${c.legalReviewStatus}`],
        ],
        body: null,
        hash: pay.hash,
        version: pay.version,
        warnings: [],
        submittedAt: c.updatedAt,
      });
    }
    return out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  });

  return (
    <>
      <PageTitle eyebrow="Approvals" title="Everything with an external consequence">
        Each decision is bound to the fingerprint shown: the exact content, recipient or destination, channel, and schedule you are looking at. If anything changes
        before you decide, the decision is refused.
      </PageTitle>
      <Notice params={params} />
      {!can(actor, "approve") ? (
        <p className="mb-6 text-sm text-[var(--tiro-text-muted)]">Your role can see this queue but cannot decide.</p>
      ) : null}
      <Section title={`Awaiting a decision (${items.length})`}>
        {items.length === 0 ? <Empty>Nothing awaiting approval.</Empty> : null}
        <div className="space-y-6">
          {items.map((item) => (
            <article key={`${item.type}-${item.id}`} className="fd-panel" aria-labelledby={`h-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 id={`h-${item.id}`} className="font-[family-name:var(--font-display)] text-xl">
                  <Link href={item.href} className="hover:text-[var(--tiro-accent)]">
                    {item.heading}
                  </Link>
                </h3>
                <Badge>
                  {item.type} · v{item.version}
                </Badge>
              </div>
              <dl className="mt-3 text-xs">
                {item.lines.map(([k, v]) => (
                  <div key={k} className="tiro-kv">
                    <dt className="k">{k}</dt>
                    <dd className="v">{v}</dd>
                  </div>
                ))}
              </dl>
              {item.body ? (
                <div className="tiro-register-paper mt-4 p-4">
                  <div className="fd-pre !text-sm">{item.body}</div>
                </div>
              ) : null}
              {item.warnings.map((w) => (
                <p key={w} className="mt-3 flex gap-2 text-sm text-[var(--tiro-accent)]">
                  <span aria-hidden="true">▲</span>
                  {w}
                </p>
              ))}
              <p className="fd-hash mt-3">Fingerprint {item.hash}</p>
              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">{item.consequence}</p>
              {can(actor, "approve") ? (
                <form action={decideAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <Return to="/flight-deck/approvals" />
                  <input type="hidden" name="type" value={item.type} />
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="hash" value={item.hash} />
                  <Field label="Second reviewer (optional)" htmlFor={`sr-${item.id}`}>
                    <select id={`sr-${item.id}`} name="secondReviewerId" className="tiro-input" defaultValue="">
                      <option value="">None</option>
                      {activeReviewers.filter((i) => i.id !== actor.id).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="submit" name="outcome" value="approved" className="fd-button" data-tone="primary">
                    Approve this exact version
                  </button>
                  <button type="submit" name="outcome" value="revision-requested" className="fd-button">
                    Request revision
                  </button>
                  <button type="submit" name="outcome" value="rejected" className="fd-button" data-tone="danger">
                    Reject
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </Section>
      <p className="text-xs text-[var(--tiro-text-muted)]">Approval never sends or publishes. Dispatch is a separate step, and every gate is checked again then.</p>
    </>
  );
}

