import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StageBadge, StatusBadge, day, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { DEMO_IDENTITIES, displayNameFor } from "@/lib/flightDeck/identities";
import { contactEligibility } from "@/lib/flightDeck/permissions";
import { MESSAGE_TEMPLATES } from "@/lib/flightDeck/templates";
import { PUBLIC_TOPICS } from "@/lib/flightDeck/pilotCopy";
import { PLAYBOOKS } from "@/lib/flightDeck/cases";
import { BLOCK_REASONS, TASK_TYPES } from "@/lib/flightDeck/types";
import { allowedTransitions, STAGE_LABELS } from "@/lib/flightDeck/workflow";
import {
  createOutreachFromTemplate,
  createTaskAction,
  editProspectAction,
  eraseAction,
  recordInteractionAction,
  resolveTaskAction,
  reviewBasisAction,
  transitionAction,
  withdrawAction,
} from "../../actions";
import { requirePage } from "../../guard";

const TOPIC_LABEL: Record<string, string> = Object.fromEntries(PUBLIC_TOPICS.map((t) => [t.value, t.label]));

const INTEREST = { "interested-contributor": "Potential contributor", "community-partner": "Community representative / partner", "specialist-volunteer": "Researcher / archivist / translator / volunteer", institution: "Institution" } as const;
const PURPOSE = { "direct-response": "Reply about their inquiry", "pilot-follow-up": "Pilot outreach and one follow-up", newsletter: "Occasional updates" } as const;
const BASIS = { "form-request-reply": "Ticked “TIRO may reply” on the form", "form-opt-in": "Ticked the separate updates opt-in", "documented-public-business-contact": "Documented public business contact", "referral-introduction": "Referral or introduction" } as const;
const ELIGIBILITY: Record<string, string> = { "case-open": "Case open: held", "no-address": "No address", withdrawn: "Withdrawn", suppressed: "Opted out", "permission-pending-review": "Basis not reviewed", "permission-expired": "Permission expired", "no-permission": "No permission" };

export default async function ProspectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { id } = await params;
  const sp = await searchParams;
  const data = await rt.store.read((tx) => {
    const p = tx.get("prospects", id);
    if (!p) {
      return null;
    }
    const eligibility = Object.fromEntries((["reply", "first-contact", "follow-up", "newsletter"] as const).map((purpose) => [purpose, contactEligibility(tx, p, purpose)]));
    return {
      p,
      submissions: tx.list("submissions", (s) => s.prospectId === id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      permissions: tx.list("permissions", (x) => x.prospectId === id),
      interactions: tx.list("interactions", (i) => i.prospectId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      tasks: tx.list("tasks", (t) => t.prospectId === id).sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open") || (a.dueOn ?? "9").localeCompare(b.dueOn ?? "9")),
      drafts: tx.list("outreach", (d) => d.prospectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      suppressed: p.emailKey ? tx.list("suppressions", (s) => s.emailKey === p.emailKey && s.liftedAt === null) : [],
      cases: tx.list("cases", (c) => c.prospectId === id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
      eligibility,
    };
  });
  if (!data) {
    notFound();
  }
  const { p } = data;
  const here = `/flight-deck/relationships/${p.id}`;
  const transitions = allowedTransitions(p.stage);

  return (
    <>
      <p className="mb-4 text-xs">
        <Link href="/flight-deck/relationships" className="tiro-link">
          ← Relationships
        </Link>
      </p>
      <PageTitle eyebrow={`${p.kind === "organization" ? "Organization" : "Person"} · ${p.source.replace("-", " ")}${p.synthetic ? " · synthetic" : ""}`} title={p.displayName} />
      <Notice params={sp} />

      <div className="mb-8 flex flex-wrap items-start gap-3">
        <StageBadge stage={p.stage} withCaveat />
        <Badge glyph="?">Authority: unverified</Badge>
        <Badge>{INTEREST[p.participationInterest]} (self-described)</Badge>
        {data.suppressed.length ? (
          <Badge tone="blocked" glyph="■">
            Opted out: {data.suppressed.map((s) => s.scope).join(", ")}
          </Badge>
        ) : null}
        {p.blockedReason ? (
          <Badge tone="blocked" glyph="■">
            Gate: {p.blockedReason}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Next action and details">
            <dl className="mb-4">
              <div className="tiro-kv">
                <dt className="k">Next action</dt>
                <dd className="v">
                  {p.nextAction ?? "—"}
                  {p.nextActionDue ? ` · ${p.nextActionDue}` : ""}
                </dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Owner</dt>
                <dd className="v">{displayNameFor(p.ownerId)}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Email</dt>
                <dd className="v">{p.email ?? "—"}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Organization / region</dt>
                <dd className="v">
                  {p.organizationName ?? "—"} / {p.region ?? "—"}
                </dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Last inbound / outbound</dt>
                <dd className="v">
                  {when(p.lastInboundAt)} / {when(p.lastOutboundAt)}
                </dd>
              </div>
            </dl>
            {can(actor, "edit-relationships") ? (
              <details className="fd-panel">
                <summary className="cursor-pointer text-sm">Edit details, owner, next action</summary>
                <form action={editProspectAction} className="mt-4 grid gap-4 md:grid-cols-2">
                  <Return to={here} />
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="version" value={p.version} />
                  <Field label="Name" htmlFor="displayName">
                    <input id="displayName" name="displayName" defaultValue={p.displayName} className="tiro-input" required maxLength={120} />
                  </Field>
                  <Field label="Email" htmlFor="email" hint="Changing it voids every approval for this person.">
                    <input id="email" name="email" type="email" defaultValue={p.email ?? ""} className="tiro-input" maxLength={254} />
                  </Field>
                  <Field label="Organization" htmlFor="organizationName">
                    <input id="organizationName" name="organizationName" defaultValue={p.organizationName ?? ""} className="tiro-input" maxLength={160} />
                  </Field>
                  <Field label="Region" htmlFor="region">
                    <input id="region" name="region" defaultValue={p.region ?? ""} className="tiro-input" maxLength={80} />
                  </Field>
                  <Field label="Next action" htmlFor="nextAction">
                    <input id="nextAction" name="nextAction" defaultValue={p.nextAction ?? ""} className="tiro-input" maxLength={200} />
                  </Field>
                  <Field label="Due" htmlFor="nextActionDue">
                    <input id="nextActionDue" name="nextActionDue" type="date" defaultValue={p.nextActionDue ?? ""} className="tiro-input" />
                  </Field>
                  <Field label="Owner" htmlFor="ownerId">
                    <select id="ownerId" name="ownerId" defaultValue={p.ownerId ?? ""} className="tiro-input">
                      <option value="">Unassigned</option>
                      {DEMO_IDENTITIES.filter((i) => i.role !== "reviewer").map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority" htmlFor="priority">
                    <select id="priority" name="priority" defaultValue={p.priority} className="tiro-input">
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </Field>
                  <div className="md:col-span-2">
                    <SubmitButton>Save details</SubmitButton>
                  </div>
                </form>
              </details>
            ) : null}
          </Section>

          {can(actor, "edit-relationships") && transitions.length ? (
            <Section title="Change stage">
              <form action={transitionAction} className="flex flex-wrap items-end gap-3">
                <Return to={here} />
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="version" value={p.version} />
                <Field label="Move to" htmlFor="to">
                  <select id="to" name="to" className="tiro-input">
                    {transitions.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Gate (for “Needs review”)" htmlFor="blockedReason">
                  <select id="blockedReason" name="blockedReason" className="tiro-input" defaultValue="">
                    <option value="">—</option>
                    {BLOCK_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("-", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton>Change stage</SubmitButton>
              </form>
              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Withdrawn and Suppressed stop all contact immediately and cannot be reopened here.</p>
            </Section>
          ) : null}

          <Section title="What they sent (inquiry form)">
            {data.submissions.length === 0 ? (
              <Empty>No form submissions. {p.source !== "inbound-form" ? "This contact was added by TIRO." : ""}</Empty>
            ) : (
              data.submissions.map((s) => (
                <div key={s.id} className="fd-row">
                  <p className="text-xs text-[var(--tiro-text-muted)]">
                    {when(s.submittedAt)} · {s.outcome === "accepted-repeat" ? "repeat submission" : "first submission"} · form {s.formVersion} · notice {s.noticeVersion}
                    {s.referral ? ` · via ${s.referral}` : ""}
                  </p>
                  <p className="mt-2 text-sm">
                    {s.topics.length ? (
                      <>Would like to talk about: {s.topics.map((t) => TOPIC_LABEL[t] ?? t).join("; ")}</>
                    ) : (
                      <span className="text-[var(--tiro-text-muted)]">No topics chosen.</span>
                    )}
                  </p>
                </div>
              ))
            )}
          </Section>

          <Section title="Interactions">
            {data.interactions.length === 0 ? <Empty>None recorded.</Empty> : null}
            {data.interactions.map((i) => (
              <div key={i.id} className="fd-row text-sm">
                <p className="text-xs text-[var(--tiro-text-muted)]">
                  {when(i.occurredAt)} · {i.direction} · {i.channel}
                  {i.direction === "inbound" ? ` · sender ${i.sourceIntegrity === "verified-sender" ? "verified" : "not verified"}` : ""} · {displayNameFor(i.actorId)}
                </p>
                <p className="mt-1">{i.summary}</p>
              </div>
            ))}
            {can(actor, "edit-relationships") ? (
              <details className="fd-panel mt-4">
                <summary className="cursor-pointer text-sm">Record an interaction</summary>
                <form action={recordInteractionAction} className="mt-4 grid gap-4 md:grid-cols-2">
                  <Return to={here} />
                  <input type="hidden" name="prospectId" value={p.id} />
                  <Field label="Direction" htmlFor="direction">
                    <select id="direction" name="direction" className="tiro-input">
                      <option value="inbound">Inbound (they wrote or called)</option>
                      <option value="outbound">Outbound (a conversation we held)</option>
                      <option value="internal-note">Internal note</option>
                    </select>
                  </Field>
                  <Field label="Channel" htmlFor="channel">
                    <select id="channel" name="channel" className="tiro-input">
                      {["email", "call", "video", "meeting", "letter", "other"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sender integrity (inbound)" htmlFor="sourceIntegrity" hint="Attach a reply only once you are sure it came from this person.">
                    <select id="sourceIntegrity" name="sourceIntegrity" className="tiro-input">
                      <option value="verified-sender">Verified: matches the address on record</option>
                      <option value="unverified">Not verified</option>
                      <option value="not-applicable">Not applicable</option>
                    </select>
                  </Field>
                  <label className="tiro-check self-end">
                    <input type="checkbox" name="needsResponse" value="yes" />
                    Needs a response
                  </label>
                  <div className="md:col-span-2">
                    <Field label="High-level summary" htmlFor="summary" hint="What happened, in a sentence or two. Never testimony, stories, sensitive details, or pasted correspondence.">
                      <textarea id="summary" name="summary" rows={3} maxLength={600} required className="tiro-input" />
                    </Field>
                  </div>
                  <div>
                    <SubmitButton>Record</SubmitButton>
                  </div>
                </form>
              </details>
            ) : null}
          </Section>

          <Section title="Tasks">
            {data.tasks.length === 0 ? <Empty>No tasks.</Empty> : null}
            {data.tasks.map((t) => (
              <div key={t.id} className="fd-row flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block">{t.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--tiro-text-muted)]">
                    <StatusBadge status={t.status} /> {t.type} · due {day(t.dueOn)} · {displayNameFor(t.ownerId)}
                    {t.resolution ? ` · ${t.resolution}` : ""}
                  </span>
                </span>
                {(t.status === "open" || t.status === "escalated") && can(actor, "edit-relationships") ? (
                  <form action={resolveTaskAction} className="flex flex-wrap gap-2">
                    <Return to={here} />
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="version" value={t.version} />
                    <button name="outcome" value="done" className="fd-button">
                      Done
                    </button>
                    {t.status === "open" ? (
                      <button name="outcome" value="escalated" className="fd-button">
                        Escalate
                      </button>
                    ) : null}
                    <button name="outcome" value="cancelled" className="fd-button">
                      Cancel
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
            {can(actor, "edit-relationships") ? (
              <details className="fd-panel mt-4">
                <summary className="cursor-pointer text-sm">Add a task or follow-up reminder</summary>
                <form action={createTaskAction} className="mt-4 grid gap-4 md:grid-cols-2">
                  <Return to={here} />
                  <input type="hidden" name="prospectId" value={p.id} />
                  <div className="md:col-span-2">
                    <Field label="Task" htmlFor="title">
                      <input id="title" name="title" maxLength={160} required className="tiro-input" />
                    </Field>
                  </div>
                  <Field label="Type" htmlFor="type">
                    <select id="type" name="type" className="tiro-input" defaultValue="follow-up">
                      {TASK_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Due" htmlFor="dueOn">
                    <input id="dueOn" name="dueOn" type="date" className="tiro-input" />
                  </Field>
                  <Field label="Priority" htmlFor="tpriority">
                    <select id="tpriority" name="priority" className="tiro-input" defaultValue="normal">
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </Field>
                  <div className="self-end">
                    <SubmitButton>Add task</SubmitButton>
                  </div>
                </form>
              </details>
            ) : null}
          </Section>
        </div>

        <div>
          <Section title="On what basis may we write?">
            <ul className="mb-4 space-y-1 text-xs">
              {Object.entries(data.eligibility).map(([purpose, e]) => (
                <li key={purpose} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--tiro-text-soft)]">{purpose.replace("-", " ")}</span>
                  {e.ok ? (
                    <Badge tone="done" glyph="✓">
                      Permitted
                    </Badge>
                  ) : (
                    <Badge tone="blocked" glyph="✕">
                      {ELIGIBILITY[e.reason] ?? e.reason}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            {data.permissions.length === 0 ? <Empty>No contact permission on record.</Empty> : null}
            {data.permissions.map((perm) => (
              <div key={perm.id} className="fd-row text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  {PURPOSE[perm.purpose]} <StatusBadge status={perm.state} />
                </p>
                <p className="mt-1 text-xs text-[var(--tiro-text-muted)]">
                  {BASIS[perm.basis]} · {perm.captureChannel} · {when(perm.capturedAt)}
                  {perm.reviewedBy ? ` · basis reviewed by ${displayNameFor(perm.reviewedBy)}` : ""}
                  {perm.expiresAt ? ` · expires ${day(perm.expiresAt)}` : ""}
                </p>
                {perm.capturedWording ? (
                  <p className="mt-2 border-l border-[var(--tiro-border-strong)] pl-3 text-xs italic text-[var(--tiro-text-soft)]">
                    “{perm.capturedWording}” <span className="not-italic text-[var(--tiro-text-muted)]">({perm.wordingVersion})</span>
                  </p>
                ) : null}
                {perm.state === "pending-review" && can(actor, "approve") ? (
                  <form action={reviewBasisAction} className="mt-3 flex flex-wrap gap-2">
                    <Return to={here} />
                    <input type="hidden" name="permissionId" value={perm.id} />
                    <button name="decision" value="accept" className="fd-button" data-tone="primary">
                      Accept basis for one-to-one contact
                    </button>
                    <button name="decision" value="reject" className="fd-button">
                      Reject
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
            <p className="mt-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">Permission to write is not consent to collect, preserve, or publish anything.</p>
          </Section>

          {p.source !== "inbound-form" ? (
            <Section title="Source evidence">
              <dl>
                <div className="tiro-kv">
                  <dt className="k">Found at</dt>
                  <dd className="v break-all">{p.sourceEvidenceUrl ?? "—"}</dd>
                </div>
                <div className="tiro-kv">
                  <dt className="k">Observed</dt>
                  <dd className="v">{p.sourceObservedOn ?? "—"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm">{p.contactReason}</p>
            </Section>
          ) : null}

          <Section title="Outreach for this person">
            {data.drafts.length === 0 ? <Empty>No drafts.</Empty> : null}
            {data.drafts.map((d) => (
              <Link key={d.id} href={`/flight-deck/outreach/${d.id}`} className="fd-row flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                <span>
                  {d.purpose.replace("-", " ")} · v{d.currentVersion}
                </span>
                <StatusBadge status={d.status} />
              </Link>
            ))}
            {can(actor, "edit-drafts") ? (
              <form action={createOutreachFromTemplate} className="mt-4 flex flex-wrap items-end gap-3">
                <Return to={here} />
                <input type="hidden" name="prospectId" value={p.id} />
                <Field label="Draft from template" htmlFor="templateKey">
                  <select id="templateKey" name="templateKey" className="tiro-input">
                    {MESSAGE_TEMPLATES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton>Create draft</SubmitButton>
              </form>
            ) : null}
          </Section>

          <Section title="Exceptions">
            {data.cases.length === 0 ? <Empty>No cases for this person.</Empty> : null}
            {data.cases.map((c) => (
              <Link key={c.id} href={`/flight-deck/cases/${c.id}`} className="fd-row flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                <span>
                  {PLAYBOOKS[c.kind].label} · due {c.dueOn}
                </span>
                <StatusBadge status={c.status === "resolved" ? "done" : c.holdsOutreach ? "held" : "open"} />
              </Link>
            ))}
            {can(actor, "edit-relationships") ? (
              <Link href={`/flight-deck/cases/new?prospect=${p.id}`} className="fd-button mt-3">
                Open a case (opt-out, deletion, complaint, sensitive material…)
              </Link>
            ) : null}
          </Section>

          <Section title="Retention, export, withdrawal">
            <dl className="mb-4">
              <div className="tiro-kv">
                <dt className="k">Retention class</dt>
                <dd className="v">{p.retentionClass}</dd>
              </div>
              <div className="tiro-kv">
                <dt className="k">Review by</dt>
                <dd className="v">{p.retainUntil ?? "—"}</dd>
              </div>
            </dl>
            {can(actor, "export") ? (
              <p className="mb-4 flex flex-wrap gap-2">
                <Link href={`/flight-deck/relationships/${p.id}/print`} className="fd-button">
                  Printable summary
                </Link>
                <a href={`/flight-deck/export/${p.id}`} className="fd-button">
                  Export JSON
                </a>
              </p>
            ) : null}
            {can(actor, "manage-suppression") && p.stage !== "withdrawn" && p.stage !== "suppressed" ? (
              <form action={withdrawAction} className="mb-4 flex flex-wrap items-end gap-3">
                <Return to={here} />
                <input type="hidden" name="prospectId" value={p.id} />
                <Field label="They asked us to stop" htmlFor="scope">
                  <select id="scope" name="scope" className="tiro-input">
                    <option value="all">All contact</option>
                    <option value="outreach">Outreach and follow-ups</option>
                    <option value="newsletter">Updates only</option>
                  </select>
                </Field>
                <SubmitButton tone="danger">Record opt-out</SubmitButton>
              </form>
            ) : null}
            {can(actor, "delete-records") ? (
              <details className="fd-panel">
                <summary className="cursor-pointer text-sm text-[var(--tiro-contested)]">Erase this person&apos;s record</summary>
                <p className="mt-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                  Permanently removes their details, submissions, notes, interactions, tasks and drafts. This cannot be undone. Keeping the opt-out record stores only a
                  keyed hash of the address, so they are never contacted again.
                </p>
                <form action={eraseAction} className="mt-3 space-y-3">
                  <Return to={here} />
                  <input type="hidden" name="prospectId" value={p.id} />
                  <label className="tiro-check">
                    <input type="checkbox" name="keepSuppression" value="yes" defaultChecked />
                    Keep an opt-out record (recommended)
                  </label>
                  <Field label="Type ERASE to confirm" htmlFor="confirm">
                    <input id="confirm" name="confirm" autoComplete="off" className="tiro-input" />
                  </Field>
                  <SubmitButton tone="danger">Erase permanently</SubmitButton>
                </form>
              </details>
            ) : null}
          </Section>
        </div>
      </div>
    </>
  );
}
