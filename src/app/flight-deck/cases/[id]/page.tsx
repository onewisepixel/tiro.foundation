import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton, SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, day, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { PLAYBOOKS, REDACTABLE } from "@/lib/flightDeck/cases";
import { displayNameFor } from "@/lib/flightDeck/identities";
import { CASE_TEMPLATES } from "@/lib/flightDeck/templates";
import { caseStepAction, redactAction, resolveCaseAction } from "../../actions";
import { requirePage } from "../../guard";

const FIELD_LABEL: Record<string, string> = { displayName: "Name", organizationName: "Organization", region: "Region", contactReason: "Reason for contact", nextAction: "Next action" };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { id } = await params;
  const sp = await searchParams;
  const data = await rt.store.read((tx) => {
    const c = tx.get("cases", id);
    if (!c) {
      return null;
    }
    const p = c.prospectId ? tx.get("prospects", c.prospectId) : null;
    return { c, p, interactions: p ? tx.list("interactions", (i) => i.prospectId === p.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : [], today: tx.nowIso.slice(0, 10) };
  });
  if (!data) {
    notFound();
  }
  const { c, p } = data;
  const playbook = PLAYBOOKS[c.kind];
  const here = `/flight-deck/cases/${c.id}`;
  const open = c.status !== "resolved";
  const template = CASE_TEMPLATES[c.kind];
  const filled = template ? { subject: template.subject, body: template.body.replaceAll("[name]", p?.displayName ?? "[name]") } : null;

  return (
    <>
      <p className="mb-4 text-xs">
        <Link href="/flight-deck/cases" className="tiro-link">
          ← Exceptions
        </Link>
      </p>
      <PageTitle eyebrow={`Exception · received ${when(c.receivedAt)} via ${c.receivedVia}`} title={playbook.label}>
        {playbook.purpose}
      </PageTitle>
      <Notice params={sp} />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <StatusBadge status={c.status === "resolved" ? "done" : c.status === "contained" ? "running" : "open"} />
        {open ? (
          c.dueOn < data.today ? (
            <Badge tone="blocked" glyph="!">
              Overdue · due {c.dueOn}
            </Badge>
          ) : (
            <Badge tone="attention">Due {c.dueOn}</Badge>
          )
        ) : (
          <Badge tone="done">Outcome: {c.outcome}</Badge>
        )}
        {c.holdsOutreach && open ? (
          <Badge tone="blocked" glyph="■">
            Outreach to this person is held
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Handling note">
            <p className="text-sm">{c.summary}</p>
            <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">
              Opened by {displayNameFor(c.ownerId)}. {p ? "" : c.prospectId === null ? "No person is linked (or their record was erased)." : ""}
            </p>
          </Section>

          <Section title="Checklist">
            <ol className="space-y-1">
              {playbook.steps.map((step, i) => {
                const state = c.steps.find((s) => s.key === step.key);
                return (
                  <li key={step.key} className="fd-row flex flex-wrap items-start justify-between gap-3 text-sm">
                    <span className="flex gap-3">
                      <span aria-hidden="true" className={state?.doneAt ? "text-[var(--tiro-mineral)]" : "text-[var(--tiro-text-muted)]"}>
                        {state?.doneAt ? "✓" : `${i + 1}.`}
                      </span>
                      <span>
                        <span className="block">{step.label}</span>
                        <span className="mt-1 block text-xs text-[var(--tiro-text-muted)]">
                          {state?.doneAt ? `Done ${when(state.doneAt)} by ${displayNameFor(state.doneBy)}` : step.automatic ? "Completes automatically when the action happens." : "Not done yet."}
                        </span>
                      </span>
                    </span>
                    {open && !state?.doneAt && !step.automatic && can(actor, "edit-relationships") ? (
                      <form action={caseStepAction}>
                        <Return to={here} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="version" value={c.version} />
                        <input type="hidden" name="step" value={step.key} />
                        <SubmitButton>Mark done</SubmitButton>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {p && c.kind === "deletion-request" && open ? (
              <p className="mt-3 text-sm">
                Erase from{" "}
                <Link href={`/flight-deck/relationships/${p.id}`} className="tiro-link">
                  the relationship page
                </Link>{" "}
                (founder only); this case updates itself.
              </p>
            ) : null}
          </Section>

          {filled ? (
            <Section title="Reply to send by hand" aside={<CopyButton text={`${filled.subject}\n\n${filled.body}`} label="Copy reply" />}>
              <div className="fd-panel tiro-register-paper">
                <p className="mb-3 font-semibold">{filled.subject}</p>
                <div className="fd-pre !text-sm">{filled.body}</div>
              </div>
              <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Fill any [bracketed] parts. Send from custodians@tiro.foundation, then mark the matching step done. Copying is not sending.</p>
            </Section>
          ) : null}
        </div>

        <div>
          <Section title="Person">
            {p ? (
              <Link href={`/flight-deck/relationships/${p.id}`} className="tiro-link text-sm">
                {p.displayName}
              </Link>
            ) : (
              <Empty>None linked.</Empty>
            )}
          </Section>

          {p && open && can(actor, "edit-relationships") ? (
            <Section title="Redact a field">
              <p className="mb-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
                If material that should never have been recorded sits in a field, replace it. The audit trail records that a field was redacted, not what it held.
              </p>
              <form action={redactAction} className="space-y-3">
                <Return to={here} />
                <input type="hidden" name="caseId" value={c.id} />
                <input type="hidden" name="target" value="prospect" />
                <input type="hidden" name="targetId" value={p.id} />
                <Field label="Field on the person's record" htmlFor="field">
                  <select id="field" name="field" className="tiro-input">
                    {REDACTABLE.prospect.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton tone="danger">Redact field</SubmitButton>
              </form>
              {data.interactions.length ? (
                <ul className="mt-5">
                  {data.interactions.map((i) => (
                    <li key={i.id} className="fd-row flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>
                        Interaction {day(i.occurredAt)} · {i.direction}
                      </span>
                      <form action={redactAction}>
                        <Return to={here} />
                        <input type="hidden" name="caseId" value={c.id} />
                        <input type="hidden" name="target" value="interaction" />
                        <input type="hidden" name="targetId" value={i.id} />
                        <input type="hidden" name="field" value="summary" />
                        <button className="tiro-link">Redact summary</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Section>
          ) : null}

          {open && can(actor, "edit-relationships") ? (
            <Section title="Resolve">
              <form action={resolveCaseAction} className="space-y-3">
                <Return to={here} />
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="version" value={c.version} />
                <Field label="Outcome" htmlFor="outcome">
                  <select id="outcome" name="outcome" className="tiro-input">
                    {playbook.outcomes.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                <SubmitButton tone="primary">Resolve case</SubmitButton>
                <p className="text-xs text-[var(--tiro-text-muted)]">
                  Every step must be done first, except for “not verified” or “escalated”.
                  {c.kind === "complaint" || c.kind === "sensitive-disclosure" || c.kind === "incident" ? " This kind is resolved by the founder." : ""}
                </p>
              </form>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
