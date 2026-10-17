// Small, server-renderable building blocks for the Flight Deck instrument.
// Every state is shown as a word with a glyph; tone (colour) only repeats it.
import { ERROR_TEXT, NOTICE_TEXT } from "@/lib/flightDeck/messages";
import type { Stage } from "@/lib/flightDeck/types";
import { STAGE_CAVEATS, STAGE_LABELS } from "@/lib/flightDeck/workflow";

type Tone = "neutral" | "attention" | "blocked" | "done";

export function Badge({ tone = "neutral", glyph, children }: { tone?: Tone; glyph?: string; children: React.ReactNode }) {
  return (
    <span className="fd-badge" data-tone={tone === "neutral" ? undefined : tone}>
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone; glyph: string }> = {
  draft: { label: "Draft", tone: "neutral", glyph: "○" },
  "needs-review": { label: "Needs review", tone: "attention", glyph: "◐" },
  approved: { label: "Approved (exact version)", tone: "done", glyph: "✓" },
  scheduled: { label: "Queued for dispatch", tone: "attention", glyph: "⏱" },
  "manual-ready": { label: "Ready to send by hand", tone: "attention", glyph: "✉" },
  sent: { label: "Sent", tone: "done", glyph: "✓" },
  published: { label: "Published", tone: "done", glyph: "✓" },
  failed: { label: "Failed", tone: "blocked", glyph: "✕" },
  held: { label: "Held: gate failed", tone: "blocked", glyph: "■" },
  archived: { label: "Archived", tone: "neutral", glyph: "–" },
  active: { label: "Active", tone: "done", glyph: "●" },
  paused: { label: "Paused", tone: "blocked", glyph: "‖" },
  closed: { label: "Closed", tone: "neutral", glyph: "–" },
  queued: { label: "Queued", tone: "attention", glyph: "⏱" },
  running: { label: "Running", tone: "attention", glyph: "↻" },
  succeeded: { label: "Provider confirmed", tone: "done", glyph: "✓" },
  simulated: { label: "Dry run only (not sent)", tone: "neutral", glyph: "◌" },
  cancelled: { label: "Cancelled", tone: "neutral", glyph: "–" },
  dead: { label: "Failed after retries", tone: "blocked", glyph: "✕" },
  open: { label: "Open", tone: "attention", glyph: "○" },
  done: { label: "Done", tone: "done", glyph: "✓" },
  escalated: { label: "Escalated", tone: "blocked", glyph: "▲" },
  "pending-review": { label: "Basis awaiting review", tone: "attention", glyph: "◐" },
  withdrawn: { label: "Withdrawn", tone: "blocked", glyph: "■" },
  expired: { label: "Expired", tone: "neutral", glyph: "–" },
  confirmed: { label: "Provider confirmed", tone: "done", glyph: "✓" },
  attested: { label: "Attested by a person", tone: "done", glyph: "✓" },
  invalidated: { label: "Invalidated", tone: "blocked", glyph: "✕" },
  consumed: { label: "Used", tone: "neutral", glyph: "✓" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone, glyph: "·" };
  return (
    <Badge tone={s.tone} glyph={s.glyph}>
      {s.label}
    </Badge>
  );
}

const STAGE_TONE: Partial<Record<Stage, Tone>> = {
  "needs-review": "blocked",
  withdrawn: "blocked",
  suppressed: "blocked",
  declined: "neutral",
  closed: "neutral",
  duplicate: "neutral",
  received: "attention",
};

export function StageBadge({ stage, withCaveat = false }: { stage: Stage; withCaveat?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-1">
      <Badge tone={STAGE_TONE[stage] ?? "neutral"} glyph={STAGE_TONE[stage] === "blocked" ? "■" : "○"}>
        {STAGE_LABELS[stage]}
      </Badge>
      {withCaveat && STAGE_CAVEATS[stage] ? <span className="text-xs leading-snug text-[var(--tiro-text-muted)]">{STAGE_CAVEATS[stage]}</span> : null}
    </span>
  );
}

export function Notice({ params }: { params: Record<string, string | string[] | undefined> }) {
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;
  if (error) {
    return (
      <p role="alert" className="mb-6 flex gap-3 border-l-2 border-[var(--tiro-contested)] bg-[var(--tiro-surface)] py-3 pl-4 pr-3 text-sm text-[var(--tiro-text)]">
        <span aria-hidden="true" className="text-[var(--tiro-contested)]">
          ✕
        </span>
        <span>
          <span className="sr-only">Error: </span>
          {ERROR_TEXT[error] ?? ERROR_TEXT.error}
        </span>
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="mb-6 flex gap-3 border-l-2 border-[var(--tiro-mineral-line)] bg-[var(--tiro-surface)] py-3 pl-4 pr-3 text-sm text-[var(--tiro-text)]">
        <span aria-hidden="true" className="text-[var(--tiro-mineral)]">
          ✓
        </span>
        {NOTICE_TEXT[notice] ?? NOTICE_TEXT.saved}
      </p>
    );
  }
  return null;
}

export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="lt-label mb-2 text-[var(--tiro-accent)]">{eyebrow}</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight md:text-4xl">{title}</h1>
      {children ? <div className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--tiro-text-muted)]">{children}</div> : null}
    </div>
  );
}

export function Section({ title, id, children, aside }: { title: string; id?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const hid = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section aria-labelledby={`${hid}-h`} className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--tiro-border)] pb-2">
        <h2 id={`${hid}-h`} className="lt-label !text-[var(--tiro-text-soft)]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-[var(--tiro-text-muted)]">{children}</p>;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="tiro-field-label !text-sm">
        {label}
      </label>
      {children}
      {hint ? <span className="tiro-field-hint !text-xs">{hint}</span> : null}
    </div>
  );
}

export function Return({ to }: { to: string }) {
  return <input type="hidden" name="returnTo" value={to} />;
}

export function when(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

export function SyntheticBanner() {
  return (
    <p className="border-b border-[var(--tiro-accent)] bg-[var(--tiro-surface)] px-[var(--lt-gutter)] py-2 text-center font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.12em] text-[var(--tiro-accent)] md:px-6">
      <span aria-hidden="true">◌ </span>Local demo · synthetic data only · nothing leaves this machine
    </p>
  );
}
