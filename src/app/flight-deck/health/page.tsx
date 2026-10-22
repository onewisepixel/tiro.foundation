import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, day, when } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { privacyNoticeIsDraft, PRIVACY_NOTICE_VERSION } from "@/lib/flightDeck/config";
import { operatorDirectory } from "@/lib/flightDeck/identities";
import { computeAlerts } from "@/lib/flightDeck/worker";
import { confirmLiftAction, liftSuppressionAction, operatorAction, pauseAction, reconcileAction, resetSeedAction, retryJobAction, runWorkerAction } from "../actions";
import { checkRecovery } from "@/lib/flightDeck/recovery";
import { requirePage } from "../guard";

type Tone = "done" | "blocked" | "attention";
const TONE_LABEL: Record<Tone, string> = { done: "Live", blocked: "Off", attention: "Local only" };

export default async function HealthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const { displayNameFor } = await operatorDirectory(rt.identity);
  const params = await searchParams;
  const here = "/flight-deck/health";
  // Detects a stale or inconsistent database every time Health is opened.
  const recovery = await checkRecovery(rt.store).catch(() => null);
  const head = await rt.store.protectiveHead();
  const pendingLifts = await rt.store.read((tx) => tx.list("tasks", (t) => t.status === "open" && (t.dedupeKey ?? "").startsWith("lift-confirm:")).map((t) => t.dedupeKey!.slice("lift-confirm:".length)));
  const production = rt.mode === "production";
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
      runs: tx.list("workerRuns").sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8),
      alerts: computeAlerts(tx, { expectWorker: production || rt.flags.backgroundJobs, logConfigured: !!rt.store.protectiveSink }),
    };
  });
  const operators = rt.identity ? await rt.identity.listOperators() : null;
  const gates = rt.identity ? await rt.identity.gates() : [];
  const lastRun = d.runs[0];
  const lastRunText = lastRun ? `${when(lastRun.startedAt)} (${lastRun.outcome})` : "never";

  const integrations: [string, string, Tone][] = [
    ["Identity", production ? "Cognito user pool (MFA required by the pool); only the named operators below." : "Local demo test identities; refused outside localhost.", production ? "done" : "attention"],
    ["Operations store", `${rt.storeLabel}. ${d.prospectCount} prospect records.${rt.store.synthetic ? " Synthetic data only." : ""}`, production ? "done" : "attention"],
    ["Rate limiting", rt.limiterLabel, production ? "done" : "attention"],
    ["Scheduled worker", production ? `Runs when the scheduler calls it. Last run: ${lastRunText}.` : `Runs when someone presses “Run worker tick now”. Last run: ${lastRunText}.`, production && lastRun?.outcome === "ok" ? "done" : "attention"],
    ["Restore ledger", rt.ledgerSink ? `Written after each worker run (${rt.ledgerSink.label}).` : "Not configured. Production needs a separate, versioned, write-once object store.", rt.ledgerSink && production ? "done" : rt.ledgerSink ? "attention" : "blocked"],
    ["Public interest form", production ? (privacyNoticeIsDraft() ? "Closed: the privacy notice is still a draft." : "Closed unless its gate is recorded.") : rt.flags.publicForm ? "Open in local demo only (synthetic store)." : "Closed.", rt.flags.publicForm && !production ? "attention" : "blocked"],
    ["Email delivery", production ? "Disabled by decision. Send approved messages by hand and record them." : rt.flags.outboundEmail ? `Dry-run outbox (${rt.providers.email.name}): sends nothing.` : "No provider. Jobs are held; send by hand and record them.", "blocked"],
    ["Social publishing", "Manual by decision: publish approved posts yourself and record them.", "blocked"],
    ["Privacy notice", `Draft, not legally reviewed (${PRIVACY_NOTICE_VERSION}).`, "blocked"],
    ["Archive intake", "Not built in Flight Deck, and no switch exists to enable it.", "blocked"],
  ];

  return (
    <>
      <PageTitle eyebrow="Health" title="Operations, integrations, and safety controls" />
      <Notice params={params} />

      {d.alerts.length ? (
        <Section title="Needs attention">
          <ul className="space-y-2">
            {d.alerts.map((a) => (
              <li key={a.key} className="text-sm">
                <Badge tone={a.severity === "action" ? "blocked" : "attention"} glyph={a.severity === "action" ? "■" : "▲"}>
                  {a.severity === "action" ? "Action" : "Warning"}
                </Badge>{" "}
                {a.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Recovery and the protective log">
        <p className="mb-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
          Opt-outs, lifts, erasures, operator deactivations, role changes and gate approvals are written to a log outside the database before they take effect. If the
          database is ever behind that log (after a restore, or an interrupted write), all contact stops until the missing events are replayed and verified.
        </p>
        <dl className="mb-3 text-sm">
          <div className="tiro-kv">
            <dt className="k">Log</dt>
            <dd className="v">{rt.store.protectiveSink?.label ?? "not configured"}</dd>
          </div>
          <div className="tiro-kv">
            <dt className="k">Database includes events up to</dt>
            <dd className="v">#{head.seq}</dd>
          </div>
          <div className="tiro-kv">
            <dt className="k">Status</dt>
            <dd className="v">
              {recovery?.ok ? (
                <Badge tone="done" glyph="✓">
                  Verified: contact allowed
                </Badge>
              ) : (
                <Badge tone="blocked" glyph="■">
                  Contact blocked: {recovery ? recovery.reason : "log unreachable"}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {actor.role === "founder" ? (
          <form action={reconcileAction}>
            <Return to={here} />
            <SubmitButton tone={recovery?.ok ? undefined : "primary"}>Verify and replay now</SubmitButton>
          </form>
        ) : null}
        {pendingLifts.length ? (
          <div className="mt-4">
            <p className="text-sm">Lifted opt-outs back in force after a recovery (a founder must confirm each lift again, only if the person asked):</p>
            {pendingLifts.map((id) => (
              <div key={id} className="fd-row flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="fd-hash">{id}</span>
                {can(actor, "settings") ? (
                  <form action={confirmLiftAction}>
                    <Return to={here} />
                    <input type="hidden" name="suppressionId" value={id} />
                    <SubmitButton>Confirm lift again</SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Section>

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
            Every dispatch is still checked against approval, suppression, open cases, and permission when it runs.
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

      <Section title="What is live">
        <ul>
          {integrations.map(([name, text, tone]) => (
            <li key={name} className="fd-row grid gap-2 text-sm md:grid-cols-[13rem_minmax(0,1fr)]">
              <span className="flex items-center gap-2">
                <Badge tone={tone} glyph={tone === "blocked" ? "■" : tone === "done" ? "●" : "◌"}>
                  {TONE_LABEL[tone]}
                </Badge>
                {name}
              </span>
              <span className="text-[var(--tiro-text-muted)]">{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Scheduled worker"
        aside={
          can(actor, "dispatch") ? (
            <form action={runWorkerAction}>
              <Return to={here} />
              <SubmitButton>Run worker tick now</SubmitButton>
            </form>
          ) : null
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
          Each tick runs due jobs (every gate re-checked, pause honoured), opens retention and expired-approval tasks, escalates overdue cases, purges old rate-limit
          windows, and writes the restore ledger. Only one tick runs at a time. It never sends anything without a provider.
        </p>
        {d.runs.length === 0 ? <Empty>No runs yet.</Empty> : null}
        <ul>
          {d.runs.map((r) => (
            <li key={r.id} className="fd-row flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={r.outcome === "ok" ? "done" : r.outcome === "failed" ? "failed" : r.outcome === "paused" ? "paused" : "running"} />
              {when(r.startedAt)} · {r.jobsClaimed} job{r.jobsClaimed === 1 ? "" : "s"} · {r.tasksCreated} task{r.tasksCreated === 1 ? "" : "s"} opened
              {r.errorCode ? ` · ${r.errorCode}` : ""}
            </li>
          ))}
        </ul>
      </Section>

      {operators ? (
        <Section title="Operators">
          <p className="mb-3 text-xs leading-relaxed text-[var(--tiro-text-muted)]">
            Only people listed here can use Flight Deck, and only while active. Changes apply on their next request. Operators are added with the operator script
            (each must also exist in the Cognito pool), not from this page.
          </p>
          {operators.map((o) => (
            <div key={o.id} className="fd-row flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {o.displayName}{" "}
                <span className="text-xs text-[var(--tiro-text-muted)]">
                  · {o.email} · {o.role}
                  {o.active ? "" : " · deactivated"}
                </span>
              </span>
              {can(actor, "settings") && o.active ? (
                <form action={operatorAction} className="flex flex-wrap items-center gap-2">
                  <Return to={here} />
                  <input type="hidden" name="id" value={o.id} />
                  <label className="sr-only" htmlFor={`role-${o.id}`}>
                    Role for {o.displayName}
                  </label>
                  <select id={`role-${o.id}`} name="role" defaultValue={o.role} className="tiro-input !mt-0 !w-auto !py-1.5 text-xs">
                    <option value="founder">founder</option>
                    <option value="operator">operator</option>
                    <option value="reviewer">reviewer</option>
                  </select>
                  {o.id !== actor.id ? (
                    <button name="op" value="role" className="fd-button">
                      Change role
                    </button>
                  ) : null}
                  <button name="op" value="revoke" className="fd-button">
                    Sign out everywhere
                  </button>
                  {o.id !== actor.id ? (
                    <button name="op" value="deactivate" className="fd-button" data-tone="danger">
                      Deactivate
                    </button>
                  ) : null}
                </form>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {production ? (
        <Section title="Launch gates">
          <ul className="text-sm">
            {(["console", "public-form"] as const).map((gate) => {
              const g = gates.find((x) => x.gate === gate);
              return (
                <li key={gate} className="fd-row">
                  {gate}: {g ? `recorded by ${g.approvedBy} on ${day(g.approvedAt)}` : "not recorded"}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Gates are recorded deliberately with the gate script, never from this page.</p>
        </Section>
      ) : null}

      <Section title="Dispatch queue">
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

      {can(actor, "settings") && rt.resetToSeed ? (
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
