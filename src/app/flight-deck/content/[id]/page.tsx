import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton, SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { currentApproval, payloadFor } from "@/lib/flightDeck/approvals";
import { operatorDirectory } from "@/lib/flightDeck/identities";
import { CHANNELS_CONTENT, ORIGIN_CATEGORIES } from "@/lib/flightDeck/types";
import { archiveDraftAction, editContentAction, manualPublishAction, queueDispatchAction, submitForReviewAction } from "../../actions";
import { requirePage } from "../../guard";

const ORIGIN_TEXT = {
  evidence: "Evidence: authentic material, published with authorization and its provenance.",
  demonstration: "Demonstration: synthetic, labeled before anything that looks like a claim.",
  abstraction: "Abstraction: original geometry or text; depicts no person, place, or culture.",
} as const;

export default async function ContentDraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { displayNameFor } = await operatorDirectory(rt.identity);
  const { id } = await params;
  const sp = await searchParams;
  const data = await rt.store.read((tx) => {
    const c = tx.get("content", id);
    if (!c) {
      return null;
    }
    return {
      c,
      current: c.versions.find((v) => v.version === c.currentVersion)!,
      payload: payloadFor(tx, "content", id),
      approval: currentApproval(tx, "content", id),
      approvals: tx.list("approvals", (a) => a.subjectType === "content" && a.subjectId === id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
      jobs: tx.list("jobs", (j) => j.subjectId === id),
      receipts: tx.list("receipts", (r) => r.subjectId === id),
      campaigns: tx.list("campaigns"),
    };
  });
  if (!data) {
    notFound();
  }
  const { c, current, approval } = data;
  const here = `/flight-deck/content/${c.id}`;
  const locked = ["published", "archived"].includes(c.status);

  return (
    <>
      <p className="mb-4 text-xs">
        <Link href="/flight-deck/content" className="tiro-link">
          ← Content
        </Link>
      </p>
      <PageTitle eyebrow={`Content · ${c.channel} · ${c.origin === "template" ? "from template" : "written by hand"}`} title={c.title} />
      <Notice params={sp} />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <StatusBadge status={c.status} />
        <Badge>{c.originCategory}</Badge>
        {approval.ok ? (
          <Badge tone="done" glyph="✓">
            Approval valid for v{approval.approval.subjectVersion} until {when(approval.approval.expiresAt)}
          </Badge>
        ) : (
          <Badge glyph="○">No valid approval for this version</Badge>
        )}
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title={`Exact post (version ${current.version})`}>
            <div className="fd-panel tiro-register-paper">
              <div className="fd-pre">{current.body}</div>
            </div>
            <dl className="mt-3 text-xs">
              <div className="tiro-kv">
                <dt className="k">Origin</dt>
                <dd className="v">{ORIGIN_TEXT[c.originCategory]}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Source</dt>
                <dd className="v">{c.sourceReference}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Asset</dt>
                <dd className="v">{c.assetDescription ?? "None (text only)"}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Asset permission</dt>
                <dd className="v">{c.assetPermission ?? "—"}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Route / schedule</dt>
                <dd className="v">
                  {c.publicationRoute} · {c.scheduledFor ? when(c.scheduledFor) : "unscheduled"}
                </dd>
              </div>
            </dl>
            <p className="fd-hash mt-2">Approval fingerprint: {data.payload.hash}</p>
          </Section>

          {!locked && can(actor, "edit-drafts") ? (
            <Section title="Edit">
              <p className="mb-3 text-xs text-[var(--tiro-text-muted)]">Any change (text, channel, origin, source, asset, schedule) voids the approval.</p>
              <form action={editContentAction} className="grid gap-4 md:grid-cols-2">
                <Return to={here} />
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="version" value={c.version} />
                <div className="md:col-span-2">
                  <Field label="Title (internal)" htmlFor="title">
                    <input id="title" name="title" defaultValue={c.title} maxLength={160} required className="tiro-input" />
                  </Field>
                </div>
                <Field label="Channel" htmlFor="channel">
                  <select id="channel" name="channel" defaultValue={c.channel} className="tiro-input">
                    {CHANNELS_CONTENT.map((ch) => (
                      <option key={ch}>{ch}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Origin" htmlFor="originCategory">
                  <select id="originCategory" name="originCategory" defaultValue={c.originCategory} className="tiro-input">
                    {ORIGIN_CATEGORIES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Source reference" htmlFor="sourceReference" hint="The accepted public document or evidence this draws on.">
                    <input id="sourceReference" name="sourceReference" defaultValue={c.sourceReference} maxLength={200} required className="tiro-input" />
                  </Field>
                </div>
                <Field label="Asset description" htmlFor="assetDescription">
                  <input id="assetDescription" name="assetDescription" defaultValue={c.assetDescription ?? ""} maxLength={300} className="tiro-input" />
                </Field>
                <Field label="Asset permission" htmlFor="assetPermission" hint="Required for evidence.">
                  <input id="assetPermission" name="assetPermission" defaultValue={c.assetPermission ?? ""} maxLength={300} className="tiro-input" />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Text" htmlFor="body">
                    <textarea id="body" name="body" defaultValue={current.body} rows={12} maxLength={3000} required className="tiro-input" />
                  </Field>
                </div>
                <Field label="Schedule (UTC, optional)" htmlFor="scheduledFor">
                  <input id="scheduledFor" name="scheduledFor" type="datetime-local" defaultValue={c.scheduledFor?.slice(0, 16) ?? ""} className="tiro-input" />
                </Field>
                <div className="self-end">
                  <SubmitButton>Save new version</SubmitButton>
                </div>
              </form>
            </Section>
          ) : null}
        </div>

        <div>
          <Section title="Next step">
            <div className="space-y-4">
              {["draft", "held", "failed"].includes(c.status) && can(actor, "edit-drafts") ? (
                <form action={submitForReviewAction}>
                  <Return to={here} />
                  <input type="hidden" name="type" value="content" />
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton tone="primary">Send for review</SubmitButton>
                </form>
              ) : null}
              {c.status === "needs-review" ? (
                <p className="text-sm">
                  Awaiting a decision in{" "}
                  <Link href="/flight-deck/approvals" className="tiro-link">
                    Approvals
                  </Link>
                  .
                </p>
              ) : null}
              {approval.ok && c.status !== "published" ? (
                <>
                  {c.status !== "scheduled" && can(actor, "dispatch") ? (
                    <form action={queueDispatchAction}>
                      <Return to={here} />
                      <input type="hidden" name="type" value="content" />
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton>Queue for publication</SubmitButton>
                      <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">No social platform is connected. The job will be held and the post marked ready to publish by hand.</p>
                    </form>
                  ) : null}
                  <div className="fd-panel">
                    <p className="text-sm">Publish by hand</p>
                    <div className="mt-3">
                      <CopyButton text={current.body} label="Copy post text" />
                    </div>
                    {can(actor, "dispatch") ? (
                      <form action={manualPublishAction} className="mt-4 space-y-3">
                        <Return to={here} />
                        <input type="hidden" name="id" value={c.id} />
                        <Field label="Link to the published post (https, optional)" htmlFor="externalUrl">
                          <input id="externalUrl" name="externalUrl" type="url" className="tiro-input" />
                        </Field>
                        <label className="tiro-check text-sm">
                          <input type="checkbox" name="attest" value="yes" required />I published exactly version {current.version} on {c.channel} myself.
                        </label>
                        <SubmitButton tone="primary">Record as published by hand</SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </>
              ) : null}
              {!locked && can(actor, "edit-drafts") ? (
                <form action={archiveDraftAction}>
                  <Return to={here} />
                  <input type="hidden" name="type" value="content" />
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton tone="danger">Archive</SubmitButton>
                </form>
              ) : null}
            </div>
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
              </div>
            ))}
          </Section>

          <Section title="Publication receipts">
            {data.receipts.length === 0 && data.jobs.length === 0 ? <Empty>Not published. No metrics are recorded or shown.</Empty> : null}
            {data.jobs.map((j) => (
              <div key={j.id} className="fd-row flex flex-wrap items-center gap-2 text-xs">
                Job <StatusBadge status={j.status} /> {j.holdReason ?? j.lastErrorCode ?? ""}
              </div>
            ))}
            {data.receipts.map((r) => (
              <div key={r.id} className="fd-row text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.result} /> {r.route}
                  {r.attestedBy ? ` by ${displayNameFor(r.attestedBy)}` : ""} · {when(r.at)}
                </span>
                {r.externalUrl ? <span className="mt-1 block break-all text-[var(--tiro-text-muted)]">{r.externalUrl}</span> : null}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </>
  );
}
