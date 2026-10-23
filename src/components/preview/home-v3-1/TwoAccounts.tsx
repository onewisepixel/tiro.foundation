"use client";

import Link from "next/link";
import { useState } from "react";
import { EVIDENCE } from "@/lib/livingTrace/evidence";
import { EvidenceStroke } from "@/components/trace/EvidenceTag";
import OriginPoint from "@/components/trace/OriginPoint";
import { SyntheticPill } from "@/components/trace/SyntheticNotice";

// Discover, as one relationship rather than a graph: two synthetic
// accounts of the same event that disagree. They are joined by the
// disagreement (contested: two strands, both kept) and by the event they
// describe, but each runs down to its own source, and the two lines to
// source never meet. Connection without collapse, drawn as an H.
//
// Everything shown comes from the projected graph (page.tsx); choosing an
// account traces its own chain and dims the other.
export type Account = {
  key: string;
  record: string;
  recordHref: string | null;
  position: string;
  assertedBy: string;
  source: string;
};

export type Disagreement = {
  event: string;
  relation: string;
  summary: string;
  recordedBy: string;
  accounts: [Account, Account];
};

export default function TwoAccounts({ data, moreHref }: { data: Disagreement; moreHref: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const picked = data.accounts.find((a) => a.key === chosen) ?? null;
  const other = picked ? data.accounts.find((a) => a.key !== picked.key)! : null;
  const dim = (a: Account) => chosen !== null && chosen !== a.key;

  return (
    <div role="group" aria-labelledby="hv31-accounts-label">
      <p id="hv31-accounts-label" className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SyntheticPill />
        <span className="text-sm text-[var(--tiro-text-muted)]">Two invented accounts of one invented event.</span>
      </p>
      {/* The shared event, bracketed down to each account. */}
      <p className="text-center">
        <span className="inline-flex items-center gap-2 border border-[var(--tiro-border-strong)] px-3 py-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-2 rotate-45 border border-[var(--tiro-text-soft)]" />
          <span className="lt-label text-[var(--tiro-text-soft)]">{data.event}</span>
        </span>
      </p>
      <div className="hv31-accounts h-9 md:h-12" aria-hidden="true">
        <div className="relative" data-dim={picked?.key === data.accounts[1].key}>
          <span className="absolute bottom-0 left-1/2 top-1/2 w-px bg-[var(--tiro-mineral-line)]" />
          <span className="absolute left-1/2 right-0 top-1/2 h-px bg-[var(--tiro-mineral-line)]" />
        </div>
        <div className="relative">
          <span className="absolute left-1/2 top-0 h-1/2 w-px bg-[var(--tiro-mineral-line)]" />
          <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--tiro-mineral-line)]" />
        </div>
        <div className="relative" data-dim={picked?.key === data.accounts[0].key}>
          <span className="absolute bottom-0 left-1/2 top-1/2 w-px bg-[var(--tiro-mineral-line)]" />
          <span className="absolute left-0 right-1/2 top-1/2 h-px bg-[var(--tiro-mineral-line)]" />
        </div>
      </div>

      <div className="hv31-accounts">
        {data.accounts.map((a, i) => (
          <div key={a.key} className={i === 0 ? "col-start-1" : "col-start-3"} style={{ gridRow: 1 }}>
            <button type="button" className="hv31-account" aria-pressed={chosen === a.key} data-dim={dim(a)} onClick={() => setChosen((c) => (c === a.key ? null : a.key))}>
              <span className="lt-label block !text-[10px] text-[var(--tiro-accent)]"><span className="hidden md:inline">Account · </span>{a.record}</span>
              <span className="lt-display mt-2 block text-lg leading-snug text-[var(--tiro-text)] md:text-2xl">&ldquo;{a.position}&rdquo;</span>
              <span className="mt-2 block text-xs text-[var(--tiro-text-muted)]">{a.assertedBy}</span>
            </button>
          </div>
        ))}
        {/* The disagreement: two strands, both kept. */}
        <div className="col-start-2 flex flex-col items-center justify-center gap-2 px-1" style={{ gridRow: 1 }} aria-hidden="true">
          <span className="hidden text-center font-[family-name:var(--font-code)] text-[10px] uppercase tracking-[0.14em] text-[var(--tiro-contested)] md:block">
            {EVIDENCE.contested.label}
          </span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" focusable="false">
            <line x1="0" y1="2" x2="100" y2="2" stroke="var(--tiro-contested)" strokeWidth="1.25" strokeDasharray="10 4 2 4" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="6" x2="100" y2="6" stroke="var(--tiro-contested)" strokeWidth="1.25" strokeDasharray="10 4 2 4" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="hidden text-center text-[11px] leading-snug text-[var(--tiro-text-muted)] md:block">both kept</span>
        </div>

        {/* Each account's own line to its own source. They never meet. */}
        {data.accounts.map((a, i) => (
          <div key={`${a.key}-chain`} className={`flex flex-col items-center ${i === 0 ? "col-start-1" : "col-start-3"}`} style={{ gridRow: 2 }} data-dim={dim(a)}>
            <span className="hv31-chain h-14 md:h-20" data-lit={chosen === a.key} aria-hidden="true" />
            <span className="flex items-center gap-2">
              <OriginPoint size={18} tone="accent" />
              <span className="text-sm text-[var(--tiro-text-soft)]">{a.source}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-start gap-3 border-t border-[var(--tiro-border)] pt-5" aria-live="polite">
        <span className="pt-1.5">
          <EvidenceStroke evidence="contested" width={22} />
        </span>
        {picked && other ? (
          <p key={picked.key} className="hv31-enter max-w-[40rem] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
            <span className="text-[var(--tiro-text)]">{picked.record}</span> traces to <span className="text-[var(--tiro-text)]">{picked.source}</span> alone. It shares an event
            with {other.record}, and a disagreement, but no source.{" "}
            {picked.recordHref ? (
              <Link href={picked.recordHref} className="tiro-link">
                Open {picked.record}
              </Link>
            ) : null}
          </p>
        ) : (
          <p className="max-w-[40rem] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
            <span className="text-[var(--tiro-text)]">{data.relation}.</span> {data.summary} Choose an account to follow it to its source.
          </p>
        )}
      </div>
      <p className="mt-2 pl-[34px] text-xs text-[var(--tiro-text-subtle)]">Recorded by: {data.recordedBy}</p>
      <Link href={moreHref} className="tiro-link mt-6 inline-block pl-[34px] text-sm">
        Explore the full relationship map (synthetic)
      </Link>
    </div>
  );
}
