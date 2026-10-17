import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { currentApproval } from "@/lib/flightDeck/approvals";
import { campaignStateAction, editCampaignAction, submitForReviewAction } from "../actions";
import { requirePage } from "../guard";

const REVIEW = ["not-started", "in-review", "cleared", "blocked"] as const;

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const params = await searchParams;
  const campaigns = await rt.store.read((tx) =>
    tx.list("campaigns").map((c) => ({
      c,
      approval: currentApproval(tx, "campaign", c.id),
      content: tx.list("content", (x) => x.campaignId === c.id && x.status !== "archived"),
      outreach: tx.list("outreach", (x) => x.campaignId === c.id && x.status !== "archived"),
    })),
  );
  return (
    <>
      <PageTitle eyebrow="Campaigns" title="Purpose, audience, and limits">
        A campaign states what outreach is for and caps how much of it there can be. The weekly numbers are planning limits, not quotas or promises. Activation needs
        cleared consent and legal review and an approval of exactly this scope, and even then each message is approved on its own.
      </PageTitle>
      <Notice params={params} />
      {campaigns.length === 0 ? <Empty>No campaigns.</Empty> : null}
      {campaigns.map(({ c, approval, content, outreach }) => (
        <Section key={c.id} title={c.name} aside={<StatusBadge status={c.status} />}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <dl className="text-sm">
                {[
                  ["Purpose", c.purpose],
                  ["Audience", c.audience],
                  ["Channels", c.channels.join(", ")],
                  ["Weekly limits", `${c.postsPerWeekCap} posts · ${c.introductionsPerWeekCap} individually approved introductions`],
                  ["How progress is counted", c.metricsDefinition],
                ].map(([k, v]) => (
                  <div key={k} className="tiro-kv">
                    <dt className="k">{k}</dt>
                    <dd className="v">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex flex-wrap gap-2">
                <Badge tone={c.consentReviewStatus === "cleared" ? "done" : c.consentReviewStatus === "blocked" ? "blocked" : "attention"}>Consent review: {c.consentReviewStatus}</Badge>
                <Badge tone={c.legalReviewStatus === "cleared" ? "done" : c.legalReviewStatus === "blocked" ? "blocked" : "attention"}>Legal review: {c.legalReviewStatus}</Badge>
                {approval.ok ? (
                  <Badge tone="done" glyph="✓">
                    Scope approved
                  </Badge>
                ) : (
                  <Badge glyph="○">Scope not approved</Badge>
                )}
              </p>
              <p className="mt-4 text-sm text-[var(--tiro-text-muted)]">
                Linked:{" "}
                <Link href="/flight-deck/content" className="tiro-link">
                  {content.length} content draft{content.length === 1 ? "" : "s"}
                </Link>
                , {outreach.length} outreach message{outreach.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="space-y-4">
              {c.status === "draft" && can(actor, "edit-relationships") ? (
                <form action={submitForReviewAction}>
                  <Return to="/flight-deck/campaigns" />
                  <input type="hidden" name="type" value="campaign" />
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton>Send scope for approval</SubmitButton>
                </form>
              ) : null}
              {can(actor, "resume") && (c.status === "approved" || c.status === "paused") ? (
                <form action={campaignStateAction}>
                  <Return to="/flight-deck/campaigns" />
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="state" value="active" />
                  <SubmitButton tone="primary">Activate</SubmitButton>
                </form>
              ) : null}
              {c.status === "active" && can(actor, "pause") ? (
                <form action={campaignStateAction}>
                  <Return to="/flight-deck/campaigns" />
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="state" value="paused" />
                  <SubmitButton tone="danger">Pause campaign</SubmitButton>
                </form>
              ) : null}
              {c.status !== "closed" && can(actor, "resume") ? (
                <form action={campaignStateAction}>
                  <Return to="/flight-deck/campaigns" />
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="state" value="closed" />
                  <SubmitButton>Close campaign</SubmitButton>
                </form>
              ) : null}
              <p className="text-xs text-[var(--tiro-text-muted)]">
                To stop everything at once, use{" "}
                <Link href="/flight-deck/health" className="tiro-link">
                  Pause all outbound
                </Link>
                .
              </p>
            </div>
          </div>
          {can(actor, "edit-relationships") && c.status !== "closed" ? (
            <details className="fd-panel mt-6">
              <summary className="cursor-pointer text-sm">Edit scope and review status</summary>
              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Changing purpose, audience, limits, or metrics returns the campaign to draft and voids its approval.</p>
              <form action={editCampaignAction} className="mt-4 grid gap-4 md:grid-cols-2">
                <Return to="/flight-deck/campaigns" />
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="version" value={c.version} />
                <div className="md:col-span-2">
                  <Field label="Name" htmlFor={`name-${c.id}`}>
                    <input id={`name-${c.id}`} name="name" defaultValue={c.name} maxLength={120} required className="tiro-input" />
                  </Field>
                </div>
                <Field label="Purpose" htmlFor={`purpose-${c.id}`}>
                  <textarea id={`purpose-${c.id}`} name="purpose" defaultValue={c.purpose} maxLength={500} rows={3} className="tiro-input" />
                </Field>
                <Field label="Audience" htmlFor={`aud-${c.id}`}>
                  <textarea id={`aud-${c.id}`} name="audience" defaultValue={c.audience} maxLength={300} rows={3} className="tiro-input" />
                </Field>
                <Field label="Posts per week (limit)" htmlFor={`ppw-${c.id}`}>
                  <select id={`ppw-${c.id}`} name="postsPerWeekCap" defaultValue={String(c.postsPerWeekCap)} className="tiro-input">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Introductions per week (limit)" htmlFor={`ipw-${c.id}`}>
                  <select id={`ipw-${c.id}`} name="introductionsPerWeekCap" defaultValue={String(c.introductionsPerWeekCap)} className="tiro-input">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="How progress is counted" htmlFor={`m-${c.id}`}>
                    <textarea id={`m-${c.id}`} name="metricsDefinition" defaultValue={c.metricsDefinition} maxLength={600} rows={2} className="tiro-input" />
                  </Field>
                </div>
                <Field label="Consent review" htmlFor={`cr-${c.id}`}>
                  <select id={`cr-${c.id}`} name="consentReviewStatus" defaultValue={c.consentReviewStatus} className="tiro-input">
                    {REVIEW.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Legal / communications review" htmlFor={`lr-${c.id}`}>
                  <select id={`lr-${c.id}`} name="legalReviewStatus" defaultValue={c.legalReviewStatus} className="tiro-input">
                    {REVIEW.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <div>
                  <SubmitButton>Save</SubmitButton>
                </div>
              </form>
            </details>
          ) : null}
        </Section>
      ))}
    </>
  );
}
