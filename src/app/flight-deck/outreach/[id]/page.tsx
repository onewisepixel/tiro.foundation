import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton, SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { currentApproval, payloadFor } from "@/lib/flightDeck/approvals";
import { displayNameFor } from "@/lib/flightDeck/identities";
import { contactEligibility } from "@/lib/flightDeck/permissions";
import { archiveDraftAction, editOutreachAction, manualSendAction, queueDispatchAction, submitForReviewAction } from "../../actions";
import { requirePage } from "../../guard";

const ELIGIBILITY: Record<string, string> = { "case-open": "An open case holds outreach to this person", "no-address": "No address on record", withdrawn: "Withdrawn: no contact permitted", suppressed: "Opted out of this kind of message", "permission-pending-review": "Contact basis not yet reviewed", "permission-expired": "Permission expired", "no-permission": "No permission for this kind of message" };

export default async function OutreachDraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { id } = await params;
  const sp = await searchParams;
  const data = await rt.store.read((tx) => {
    const d = tx.get("outreach", id);
    if (!d) {
      return null;
    }
    const p = tx.require("prospects", d.prospectId);
    return {
      d,
      p,
      current: d.versions.find((v) => v.version === d.currentVersion)!,
      payload: payloadFor(tx, "outreach", id),
      approval: currentApproval(tx, "outreach", id),
      eligibility: contactEligibility(tx, p, d.purpose),
      approvals: tx.list("approvals", (a) => a.subjectType === "outreach" && a.subjectId === id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
      jobs: tx.list("jobs", (j) => j.subjectId === id),
      receipts: tx.list("receipts", (r) => r.subjectId === id),
      campaign: d.campaignId ? tx.get("campaigns", d.campaignId) : null,
    };
  });
  if (!data) {
    notFound();
  }
  const { d, p, current, approval } = data;
  const here = `/flight-deck/outreach/${d.id}`;
  const locked = ["sent", "archived"].includes(d.status);
  const scheduledLocal = d.scheduledFor ? d.scheduledFor.slice(0, 16) : "";

  return (
    <>
      <p className="mb-4 text-xs">
        <Link href="/flight-deck/outreach" className="tiro-link">
          ← Outreach
        </Link>
      </p>
      <PageTitle eyebrow={`Outreach · ${d.purpose.replace("-", " ")} · email`} title={current.subject} />
      <Notice params={sp} />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <StatusBadge status={d.status} />
        {approval.ok ? (
          <Badge tone="done" glyph="✓">
            Approval valid for v{approval.approval.subjectVersion} until {when(approval.approval.expiresAt)}
          </Badge>
        ) : (
          <Badge glyph="○">No valid approval for this version</Badge>
        )}
        {data.eligibility.ok ? (
          <Badge tone="done" glyph="✓">
            Permitted to write: {data.eligibility.permission.purpose.replace("-", " ")}
          </Badge>
        ) : (
          <Badge tone="blocked" glyph="✕">
            {ELIGIBILITY[data.eligibility.reason] ?? data.eligibility.reason}
          </Badge>
        )}
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title={`Exact message (version ${current.version})`}>
            <div className="fd-panel tiro-register-paper">
              <dl className="mb-4 text-xs">
                <div className="tiro-kv">
                  <dt className="k">To</dt>
                  <dd className="v">
                    {p.displayName} &lt;{p.email ?? "no address"}&gt;
                  </dd>
                </div>
                <div className="tiro-kv">
                  <dt className="k">Subject</dt>
                  <dd className="v">{current.subject}</dd>
                </div>
                <div className="tiro-kv">
                  <dt className="k">Schedule</dt>
                  <dd className="v">{d.scheduledFor ? when(d.scheduledFor) : "Not scheduled (send when approved)"}</dd>
                </div>
              </dl>
              <div className="fd-pre">{current.body}</div>
            </div>
            <p className="fd-hash mt-2">Approval fingerprint (content, recipient, channel, schedule): {data.payload.hash}</p>
            {/\[[^\]]+\]/.test(current.body + current.subject) ? (
              <p className="mt-3 text-sm text-[var(--tiro-accent)]">
                <span aria-hidden="true">▲ </span>This draft still contains [bracketed] placeholders. Fill them before sending it for review.
              </p>
            ) : null}
          </Section>

          {!locked && can(actor, "edit-drafts") ? (
            <Section title="Edit">
              <p className="mb-3 text-xs text-[var(--tiro-text-muted)]">Saving any change creates a new version and voids any approval and queued dispatch for this message.</p>
              <form action={editOutreachAction} className="space-y-4">
                <Return to={here} />
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="version" value={d.version} />
                <Field label="Subject" htmlFor="subject">
                  <input id="subject" name="subject" defaultValue={current.subject} maxLength={160} required className="tiro-input" />
                </Field>
                <Field label="Body" htmlFor="body">
                  <textarea id="body" name="body" defaultValue={current.body} rows={14} maxLength={4000} required className="tiro-input" />
                </Field>
                <Field label="Schedule (UTC, optional)" htmlFor="scheduledFor">
                  <input id="scheduledFor" name="scheduledFor" type="datetime-local" defaultValue={scheduledLocal} className="tiro-input max-w-xs" />
                </Field>
                <SubmitButton>Save new version</SubmitButton>
              </form>
            </Section>
          ) : null}

          <Section title="Version history">
            {d.versions
              .slice()
              .reverse()
              .map((v) => (
                <details key={v.version} className="fd-row text-sm">
                  <summary className="cursor-pointer">
                    v{v.version} · {when(v.editedAt)} · {displayNameFor(v.editedBy)}
                    {v.version === d.currentVersion ? " · current" : ""}
                  </summary>
                  <p className="mt-2 font-semibold">{v.subject}</p>
                  <div className="fd-pre mt-1 text-[var(--tiro-text-soft)]">{v.body}</div>
                </details>
              ))}
          </Section>
        </div>

        <div>
          <Section title="Next step">
            <div className="space-y-4">
              {["draft", "held", "failed"].includes(d.status) && can(actor, "edit-drafts") ? (
                <form action={submitForReviewAction}>
                  <Return to={here} />
                  <input type="hidden" name="type" value="outreach" />
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton tone="primary">Send for review</SubmitButton>
                </form>
              ) : null}
              {d.status === "needs-review" ? (
                <p className="text-sm">
                  Awaiting a decision in{" "}
                  <Link href="/flight-deck/approvals" className="tiro-link">
                    Approvals
                  </Link>
                  .
                </p>
              ) : null}
              {approval.ok && d.status !== "sent" ? (
                <>
                  {d.status !== "scheduled" && can(actor, "dispatch") ? (
                    <form action={queueDispatchAction}>
                      <Return to={here} />
                      <input type="hidden" name="type" value="outreach" />
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton>Queue for dispatch</SubmitButton>
                      <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">
                        Every gate is checked again when the job runs. With no email provider configured, the job is held and the message becomes ready to send by hand.
                      </p>
                    </form>
                  ) : null}
                  <div className="fd-panel">
                    <p className="text-sm">Send by hand</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                      Copy the approved text, send it from custodians@tiro.foundation, then record it here. Copying is not sending.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CopyButton text={p.email ?? ""} label="Copy address" />
                      <CopyButton text={current.subject} label="Copy subject" />
                      <CopyButton text={current.body} label="Copy body" />
                    </div>
                    {can(actor, "dispatch") ? (
                      <form action={manualSendAction} className="mt-4 space-y-3">
                        <Return to={here} />
                        <input type="hidden" name="id" value={d.id} />
                        <label className="tiro-check text-sm">
                          <input type="checkbox" name="attest" value="yes" required />I sent exactly version {current.version} to this address myself.
                        </label>
                        <SubmitButton tone="primary">Record as sent by hand</SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </>
              ) : null}
              {d.status === "sent" ? <p className="text-sm">Sent. A follow-up reminder was created on the relationship.</p> : null}
              {!locked && can(actor, "edit-drafts") ? (
                <form action={archiveDraftAction}>
                  <Return to={here} />
                  <input type="hidden" name="type" value="outreach" />
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton tone="danger">Archive draft</SubmitButton>
                </form>
              ) : null}
            </div>
          </Section>

          <Section title="Recipient">
            <Link href={`/flight-deck/relationships/${p.id}`} className="tiro-link text-sm">
              {p.displayName}
            </Link>
            {data.campaign ? <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Campaign: {data.campaign.name} ({data.campaign.status})</p> : null}
          </Section>

          <Section title="Approvals">
            {data.approvals.length === 0 ? <Empty>No decisions yet.</Empty> : null}
            {data.approvals.map((a) => (
              <div key={a.id} className="fd-row text-xs">
                <p className="flex flex-wrap items-center gap-2">
                  {a.outcome} · v{a.subjectVersion} · {displayNameFor(a.approverId)} <StatusBadge status={a.state} />
                </p>
                <p className="mt-1 text-[var(--tiro-text-muted)]">
                  {when(a.decidedAt)}
                  {a.invalidatedReason ? ` · ${a.invalidatedReason}` : ""}
                </p>
                <p className="fd-hash mt-1">{a.payloadHash}</p>
              </div>
            ))}
          </Section>

          <Section title="Dispatch and receipts">
            {data.jobs.length === 0 && data.receipts.length === 0 ? <Empty>Nothing dispatched.</Empty> : null}
            {data.jobs.map((j) => (
              <div key={j.id} className="fd-row flex flex-wrap items-center gap-2 text-xs">
                Job v{j.subjectVersion} <StatusBadge status={j.status} /> {j.holdReason ?? j.lastErrorCode ?? ""} · attempts {j.attempts}/{j.maxAttempts}
              </div>
            ))}
            {data.receipts.map((r) => (
              <div key={r.id} className="fd-row flex flex-wrap items-center gap-2 text-xs">
                Receipt v{r.subjectVersion} <StatusBadge status={r.result} /> {r.route}
                {r.attestedBy ? ` by ${displayNameFor(r.attestedBy)}` : ""} · {when(r.at)}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </>
  );
}
