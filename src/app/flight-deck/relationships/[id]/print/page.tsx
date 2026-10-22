import Link from "next/link";
import { notFound } from "next/navigation";
import { when } from "@/components/flight-deck/ui";
import { AccessDenied } from "@/lib/flightDeck/access";
import { operatorDirectory } from "@/lib/flightDeck/identities";
import { exportProspect } from "@/lib/flightDeck/prospects";
import { STAGE_LABELS } from "@/lib/flightDeck/workflow";
import { requirePage } from "../../../guard";

// Printable summary for one relationship. Permission-bound and audited.
export default async function PrintProspect({ params }: { params: Promise<{ id: string }> }) {
  const { rt, actor } = await requirePage();
  const { displayNameFor } = await operatorDirectory(rt.identity);
  const { id } = await params;
  const data = await rt.store
    .transaction((tx) => (tx.get("prospects", id) ? exportProspect(tx, actor, id) : null))
    .catch((e) => {
      if (e instanceof AccessDenied) {
        return "denied" as const;
      }
      throw e;
    });
  if (data === "denied") {
    return <p role="alert">Your role does not permit exports.</p>;
  }
  if (!data) {
    notFound();
  }
  const p = data.prospect;
  return (
    <article className="max-w-3xl text-sm leading-relaxed">
      <p className="fd-noprint mb-6 flex gap-4 text-xs">
        <Link href={`/flight-deck/relationships/${p.id}`} className="tiro-link">
          ← Back
        </Link>
        <span className="text-[var(--tiro-text-muted)]">Use your browser&apos;s Print command.</span>
      </p>
      <p className="lt-label mb-2">Flight Deck · relationship summary · {data.synthetic ? "SYNTHETIC DEMO DATA" : "CONFIDENTIAL"}</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{p.displayName}</h1>
      <p className="mt-2 text-[var(--tiro-text-muted)]">
        Generated {when(data.generatedAt)}. Operational contact record only: not an archival source, not verified authority, not consent to collect.
      </p>
      <dl className="mt-6">
        {[
          ["Stage", STAGE_LABELS[p.stage]],
          ["Authority", "Unverified"],
          ["Interest (self-described)", p.participationInterest],
          ["Email", p.email ?? "—"],
          ["Organization / region", `${p.organizationName ?? "—"} / ${p.region ?? "—"}`],
          ["Source", `${p.source}${p.sourceEvidenceUrl ? ` · ${p.sourceEvidenceUrl}` : ""}`],
          ["Owner", displayNameFor(p.ownerId)],
          ["Next action", p.nextAction ?? "—"],
          ["Retention", `${p.retentionClass} · review by ${p.retainUntil ?? "—"}`],
        ].map(([k, v]) => (
          <div key={k} className="tiro-kv">
            <dt className="k">{k}</dt>
            <dd className="v break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <h2 className="lt-label mt-8 mb-2">Contact permissions</h2>
      <ul className="list-disc pl-5">
        {data.permissions.map((x) => (
          <li key={x.id}>
            {x.purpose}: {x.state} ({x.basis}, {when(x.capturedAt)})
          </li>
        ))}
      </ul>
      <h2 className="lt-label mt-8 mb-2">Submissions</h2>
      <ul className="list-disc pl-5">
        {data.submissions.map((s) => (
          <li key={s.id}>
            {when(s.submittedAt)}: topics {s.topics.length ? s.topics.join(", ") : "(none chosen)"} <span className="text-[var(--tiro-text-muted)]">[notice {s.noticeVersion}]</span>
          </li>
        ))}
      </ul>
      <h2 className="lt-label mt-8 mb-2">Interactions</h2>
      <ul className="list-disc pl-5">
        {data.interactions.map((i) => (
          <li key={i.id}>
            {when(i.occurredAt)} · {i.direction} · {i.channel}: {i.summary}
          </li>
        ))}
      </ul>
      <h2 className="lt-label mt-8 mb-2">Open and recent tasks</h2>
      <ul className="list-disc pl-5">
        {data.tasks.map((t) => (
          <li key={t.id}>
            [{t.status}] {t.title} {t.dueOn ? `(due ${t.dueOn})` : ""}
          </li>
        ))}
      </ul>
    </article>
  );
}
