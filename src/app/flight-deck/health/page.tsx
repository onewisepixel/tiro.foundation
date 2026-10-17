import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, day, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { displayNameFor } from "@/lib/flightDeck/identities";
import { liftSuppressionAction, pauseAction, resetSeedAction, retryJobAction, runJobsAction } from "../actions";
import { requirePage } from "../guard";

export default async function HealthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const params = await searchParams;
  const here = "/flight-deck/health";
  const d = await rt.store.read((tx) => {
    const soon = new Date(tx.now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const jobs = tx.list("jobs").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      settings: tx.settings(),
      jobs: jobs.filter((j) => ["queued", "running", "held", "failed", "dead"].includes(j.status)),
      lastSuccess: jobs.find((j) => j.status === "succeeded" || j.status === "simulated") ?? null,
      suppressions: tx.list("suppressions").sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)),
      retention: tx.list("prospects", (p) => !!p.retainUntil && p.retainUntil <= soon).sort((a, b) => (a.retainUntil ?? "").localeCompare(b.retainUntil ?? "")),
      retentionTasks: tx.list("tasks", (t) => t.type === "retention-review" && t.status === "open").map((t) => ({ ...t, name: t.prospectId ? (tx.get("prospects", t.prospectId)?.displayName ?? "(erased)") : "—" })),
      funnel: tx.list("funnel").sort((a, b) => b.day.localeCompare(a.day)).slice(0, 40),
      prospectCount: tx.list("prospects").length,
    };
  });
  const flags = rt.flags;

  const integrations: [string, string, "done" | "blocked" | "attention"][] = [
    ["Identity provider", "Not configured. Local demo test identities only; refused outside localhost.", "blocked"],
    ["Operations store", `Local JSON file on this machine (synthetic). Not production persistence. ${d.prospectCount} prospect records.`, "attention"],
    ["Public interest form", flags.publicForm ? "Open in local demo only (synthetic store). Closed on every deployment." : "Closed.", flags.publicForm ? "attention" : "blocked"],
    ["Email delivery", flags.outboundEmail ? `Dry-run outbox (${rt.providers.email.name}): writes files under .flight-deck/outbox, sends nothing.` : "No provider. Jobs are held; send by hand and attest.", "blocked"],
    ["Social publishing", flags.socialPublishing ? `Dry-run outbox (${rt.providers.social.name}): publishes nothing.` : "No platform connected. Publish by hand and attest.", "blocked"],
    ["Background jobs", "No durable job runner. Jobs run only when someone presses “Run due jobs”.", "blocked"],
    ["Newsletter sending", "Not built. Requires a provider, an approved schedule, and a working unsubscribe.", "blocked"],
    ["Privacy notice", "Draft, not legally reviewed (pilot-privacy-draft-0.1).", "blocked"],
    ["Archive intake", "Not built in Flight Deck 0.1, and no switch exists to enable it.", "blocked"],
  ];

  return (
    <>
      <PageTitle eyebrow="Health" title="Operations, integrations, and safety controls" />
      <Notice params={params} />

      <Section title="Outbound activity">
        {d.settings.allOutboundPaused ? (
          <p role="status" className="mb-3 text-sm">
            <Badge tone="blocked" glyph="‖">
              Paused
            </Badge>{" "}
            since {when(d.settings.pausedAt)} by {displayNameFor(d.settings.pausedBy)}. Nothing is dispatched or attested while paused.
          </p>
        ) : (
          <p className="mb-3 text-sm">
            <Badge tone="done" glyph="●">
              Running
            </Badge>{" "}
            Every dispatch is still checked against approval, suppression, and permission when it runs.
          </p>
        )}
        <form action={pauseAction} className="flex flex-wrap gap-3">
          <Return to={here} />
          {d.settings.allOutboundPaused ? (
            can(actor, "resume") ? (
              <>
                <input type="hidden" name="pause" value="no" />
                <SubmitButton tone="primary">Resume outbound activity</SubmitButton>
              </>
            ) : (
              <p className="text-xs text-[var(--tiro-text-muted)]">Only the founder can resume.</p>
            )
          ) : (
            <>
              <input type="hidden" name="pause" value="yes" />
              <SubmitButton tone="danger">Pause all outbound activity</SubmitButton>
            </>
          )}
        </form>
      </Section>

      <Section title="Integrations: what is live">
        <ul>
          {integrations.map(([name, text, tone]) => (
            <li key={name} className="fd-row grid gap-2 text-sm md:grid-cols-[12rem_minmax(0,1fr)]">
              <span className="flex items-center gap-2">
                <Badge tone={tone} glyph={tone === "blocked" ? "■" : "◌"}>
                  {tone === "blocked" ? "Off" : "Local only"}
                </Badge>
                {name}
              </span>
              <span className="text-[var(--tiro-text-muted)]">{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Dispatch queue"
        aside={
          can(actor, "dispatch") ? (
            <form action={runJobsAction}>
              <Return to={here} />
              <SubmitButton>Run due jobs now</SubmitButton>
            </form>
          ) : null
        }
      >
        <p className="mb-3 text-xs text-[var(--tiro-text-muted)]">
          Last job completed: {d.lastSuccess ? `${when(d.lastSuccess.updatedAt)} (${d.lastSuccess.status === "simulated" ? "dry run" : "provider confirmed"})` : "none"}. Errors are shown as
          codes only.
        </p>
        {d.jobs.length === 0 ? <Empty>No jobs waiting, held, or failed.</Empty> : null}
        {d.jobs.map((j) => (
          <div key={j.id} className="fd-row flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={j.status} /> {j.kind} · v{j.subjectVersion} · {j.holdReason ?? j.lastErrorCode ?? "—"} · attempts {j.attempts}/{j.maxAttempts}
              {j.nextAttemptAt ? ` · next ${when(j.nextAttemptAt)}` : ""}
            </span>
            {["failed", "dead", "held"].includes(j.status) && can(actor, "dispatch") ? (
              <form action={retryJobAction}>
                <Return to={here} />
                <input type="hidden" name="id" value={j.id} />
                <SubmitButton>Retry</SubmitButton>
              </form>
            ) : null}
          </div>
        ))}
      </Section>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title={`Suppressed recipients (${d.suppressions.filter((s) => !s.liftedAt).length} active)`}>
          <p className="mb-2 text-xs text-[var(--tiro-text-muted)]">Stored as keyed hashes, not addresses. Checked at dispatch time and they override any approval.</p>
          {d.suppressions.length === 0 ? <Empty>None.</Empty> : null}
          {d.suppressions.map((s) => (
            <div key={s.id} className="fd-row flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                <span className="fd-hash">{s.emailKey.slice(0, 12)}…</span> · {s.scope} · {s.basis} · {day(s.effectiveAt)}
                {s.liftedAt ? ` · lifted ${day(s.liftedAt)}` : ""}
              </span>
              {!s.liftedAt && can(actor, "settings") ? (
                <form action={liftSuppressionAction}>
                  <Return to={here} />
                  <input type="hidden" name="id" value={s.id} />
                  <button className="tiro-link">Lift (only if they asked)</button>
                </form>
              ) : null}
            </div>
          ))}
        </Section>

        <Section title="Retention queue">
          {d.retentionTasks.length === 0 && d.retention.length === 0 ? <Empty>Nothing due for retention review in the next 30 days.</Empty> : null}
          {d.retentionTasks.map((t) => (
            <Link key={t.id} href={t.prospectId ? `/flight-deck/relationships/${t.prospectId}` : here} className="fd-row block px-1 text-xs">
              {t.name}: {t.title} · due {day(t.dueOn)}
            </Link>
          ))}
          {d.retention.map((p) => (
            <Link key={p.id} href={`/flight-deck/relationships/${p.id}`} className="fd-row block px-1 text-xs">
              {p.displayName}: retention review by {p.retainUntil} ({p.retentionClass})
            </Link>
          ))}
        </Section>
      </div>

      <Section title="Form and abuse counters (aggregate, no identifiers)">
        {d.funnel.length === 0 ? <Empty>No form activity.</Empty> : null}
        <ul className="grid gap-x-6 text-xs md:grid-cols-2">
          {d.funnel.map((f) => (
            <li key={f.id} className="tiro-kv">
              <span className="k !text-[var(--tiro-text-soft)]">
                {f.day} · {f.event}
                {f.category ? ` · ${f.category}` : ""}
                {f.referral ? ` · via ${f.referral}` : ""}
              </span>
              <span className="v">{f.count}</span>
            </li>
          ))}
        </ul>
      </Section>

      {can(actor, "settings") ? (
        <Section title="Local demo data">
          <form action={resetSeedAction} className="flex flex-wrap items-end gap-3">
            <Return to={here} />
            <Field label="Type RESET to replace the local store with fresh synthetic fixtures" htmlFor="confirm">
              <input id="confirm" name="confirm" autoComplete="off" className="tiro-input" />
            </Field>
            <SubmitButton tone="danger">Reset to synthetic seed</SubmitButton>
          </form>
        </Section>
      ) : null}
    </>
  );
}
