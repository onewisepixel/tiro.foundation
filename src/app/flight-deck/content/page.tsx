import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Empty, Field, Notice, PageTitle, Return, Section, StatusBadge, day } from "@/components/flight-deck/ui";
import { can } from "@/lib/flightDeck/access";
import { CONTENT_TEMPLATES } from "@/lib/flightDeck/templates";
import { createContentFromTemplate } from "../actions";
import { requirePage } from "../guard";

const ORIGIN = { evidence: "Evidence", demonstration: "Demonstration", abstraction: "Abstraction" } as const;

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt, actor } = await requirePage();
  const params = await searchParams;
  const items = await rt.store.read((tx) => tx.list("content", (c) => c.status !== "archived").sort((a, b) => (a.scheduledFor ?? "9").localeCompare(b.scheduledFor ?? "9") || a.createdAt.localeCompare(b.createdAt)));
  return (
    <>
      <PageTitle eyebrow="Content" title="Editorial calendar">
        Channel-specific copy, each with its origin (evidence, demonstration, or abstraction) and its source. Nothing is published without approval of the exact
        version, and nothing is shown as published without a receipt. No invented metrics, partners, quotes, or tax claims.
      </PageTitle>
      <Notice params={params} />
      <Section title={`Drafts and schedule (${items.length})`}>
        {items.length === 0 ? <Empty>No content yet.</Empty> : null}
        {items.map((c) => (
          <Link key={c.id} href={`/flight-deck/content/${c.id}`} className="fd-row grid gap-2 px-1 text-sm md:grid-cols-[minmax(0,2fr)_auto_auto_auto] md:items-center">
            <span>
              <span className="block">{c.title}</span>
              <span className="block text-xs text-[var(--tiro-text-muted)]">
                {c.sourceReference} · v{c.currentVersion}
              </span>
            </span>
            <Badge>{c.channel}</Badge>
            <Badge>{ORIGIN[c.originCategory]}</Badge>
            <span className="flex items-center gap-2">
              <span className="text-xs text-[var(--tiro-text-muted)]">{c.scheduledFor ? day(c.scheduledFor) : "unscheduled"}</span>
              <StatusBadge status={c.status} />
            </span>
          </Link>
        ))}
      </Section>
      {can(actor, "edit-drafts") ? (
        <Section title="New draft">
          <form action={createContentFromTemplate} className="flex flex-wrap items-end gap-3">
            <Return to="/flight-deck/content" />
            <Field label="Start from" htmlFor="templateKey">
              <select id="templateKey" name="templateKey" className="tiro-input">
                <option value="">Blank draft</option>
                {CONTENT_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    Template: {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton>Create draft</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-[var(--tiro-text-muted)]">Templates are deterministic text drawn from TIRO&apos;s accepted public documents. No model generates content in 0.1.</p>
        </Section>
      ) : null}
    </>
  );
}
