"use client";

import Link from "next/link";
import { useState } from "react";
import { USE_CATEGORIES, USE_GRANT_LABEL, type EvidenceState, type UseCategory, type UseGrant } from "@/lib/livingTrace/evidence";
import EvidenceTag from "@/components/trace/EvidenceTag";
import OriginPoint from "@/components/trace/OriginPoint";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// Witness → Preserve: one synthetic specimen, compact. Three questions a
// visitor might ask of any memory are answered by the record's own fields;
// choosing a question lights the field that answers it. The full specimen
// (every field) stays on its own page.
export type RecordPreviewData = {
  recordId: string;
  href: string;
  title: string;
  source: { label: string; note: string };
  authority: { value: string; evidence: EvidenceState };
  language: { value: string; evidence: EvidenceState };
  uses: Record<UseCategory, UseGrant>;
};

type FieldKey = "source" | "authority" | "uses";

const QUESTIONS: { key: FieldKey; ask: string; answer: string }[] = [
  { key: "source", ask: "Who gave it?", answer: "The human source, identified as they choose. Never replaced by whoever recorded it." },
  { key: "authority", ask: "Who holds authority over it?", answer: "Recorded separately from the source, and stated as unknown when it is unknown." },
  { key: "uses", ask: "What may be done with it?", answer: "Each use is granted or not on its own. Permission for one never implies another." },
];

function summarizeUses(uses: Record<UseCategory, UseGrant>) {
  const counts = new Map<UseGrant, number>();
  for (const grant of Object.values(uses)) {
    counts.set(grant, (counts.get(grant) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([grant, n]) => `${n} ${USE_GRANT_LABEL[grant].toLowerCase()}`)
    .join(" · ");
}

export default function RecordPreview({ record }: { record: RecordPreviewData }) {
  const [lit, setLit] = useState<FieldKey | null>(null);
  const [usesOpen, setUsesOpen] = useState(false);

  const choose = (key: FieldKey) => {
    const next = lit === key ? null : key;
    setLit(next);
    if (next === "uses") {
      setUsesOpen(true);
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      <div className="hv2-rise" style={{ "--lt-delay": "120ms" } as React.CSSProperties}>
        <p className="lt-label mb-3">Ask of any memory</p>
        <ul className="border-b border-[var(--tiro-border)]">
          {QUESTIONS.map((q, i) => (
            <li key={q.key}>
              <button type="button" className="hv2-question" aria-pressed={lit === q.key} aria-controls={`hv2-field-${q.key}`} onClick={() => choose(q.key)}>
                <span className="font-[family-name:var(--font-code)] text-[11px] text-[var(--tiro-accent)]">0{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-[family-name:var(--font-display)] text-xl text-[var(--tiro-text)] md:text-2xl">{q.ask}</span>
                  {lit === q.key ? (
                    <span className="hv2-panel-enter mt-1.5 block text-sm leading-relaxed text-[var(--tiro-text-muted)]">{q.answer}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--tiro-text-muted)]">Choose a question to see the field that answers it.</p>
      </div>

      <div className="hv2-rise min-w-0" style={{ "--lt-delay": "240ms" } as React.CSSProperties}>
        {/* The record hangs from its source. */}
        <div aria-hidden="true" className="flex items-center gap-2.5 pl-[1.05rem]">
          <OriginPoint size={18} tone="accent" />
          <span className="lt-label">{record.source.label}</span>
        </div>
        <span aria-hidden="true" className="ml-[1.6rem] block h-7 w-px bg-[var(--tiro-accent)]" />

        <article aria-labelledby="hv2-record-title" className="hv2-slip tiro-register-paper !bg-[var(--tiro-raised)]">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
            <span className="font-[family-name:var(--font-code)] text-xs tracking-[0.08em] text-[var(--tiro-text-muted)]">{record.recordId}</span>
            <SyntheticPill />
          </header>
          <h3 id="hv2-record-title" className="lt-display px-5 pb-5 text-2xl md:text-[1.75rem]">
            {record.title}
          </h3>

          <dl>
            <div id="hv2-field-source" className="hv2-field" data-lit={lit === "source"}>
              <dt className="lt-label">Source</dt>
              <dd className="text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                {record.source.label}
                <span className="mt-1 block text-[var(--tiro-text-muted)]">{record.source.note}</span>
              </dd>
            </div>
            <div id="hv2-field-authority" className="hv2-field" data-lit={lit === "authority"}>
              <dt className="lt-label">Source authority</dt>
              <dd className="text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                {record.authority.value}
                <span className="mt-1.5 block">
                  <EvidenceTag evidence={record.authority.evidence} />
                </span>
              </dd>
            </div>
            <div className="hv2-field">
              <dt className="lt-label">Language</dt>
              <dd className="text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                {record.language.value}
                <span className="mt-1.5 block">
                  <EvidenceTag evidence={record.language.evidence} />
                </span>
              </dd>
            </div>
            <div id="hv2-field-uses" className="hv2-field" data-lit={lit === "uses"}>
              <dt className="lt-label">Permitted uses</dt>
              <dd className="text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                {summarizeUses(record.uses)}
                <button
                  type="button"
                  className="tiro-link mt-1.5 block text-left text-sm"
                  aria-expanded={usesOpen}
                  aria-controls="hv2-uses-list"
                  onClick={() => setUsesOpen((open) => !open)}
                >
                  {usesOpen ? "Hide the eight uses" : "Show the eight uses"}
                </button>
                {usesOpen ? (
                  <ul id="hv2-uses-list" className="hv2-panel-enter mt-3 grid gap-x-6 sm:grid-cols-2">
                    {USE_CATEGORIES.map((use) => (
                      <li key={use.key} className="flex items-baseline justify-between gap-3 border-t border-dashed border-[var(--tiro-border)] py-1.5 text-xs">
                        <span className="text-[var(--tiro-text-muted)]">{use.label}</span>
                        <span className="shrink-0 font-[family-name:var(--font-code)] text-[var(--tiro-text)]">{USE_GRANT_LABEL[record.uses[use.key]]}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </dd>
            </div>
          </dl>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tiro-border)] px-5 py-4">
            <span className="text-xs text-[var(--tiro-text-muted)]">4 of the record&apos;s fields. The full specimen shows every one.</span>
            <Link href={record.href} className="tiro-link text-sm !text-[var(--tiro-text)]">
              Open the full specimen
            </Link>
          </footer>
        </article>
      </div>
    </div>
  );
}
