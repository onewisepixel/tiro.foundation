"use client";

import Link from "next/link";
import { useRef, useState } from "react";

// Respect: one demonstration, three access states. What a visitor sees is
// decided by a record's rights authority; the page shows the consequence.
// Each panel uses only what the projection already authorizes: the public
// specimen's title, and the restricted specimen's authorized notice. The
// third state is an explanation, never a placeholder for a real record.
type StateKey = "public" | "restricted" | "undiscoverable";

const TABS: { key: StateKey; label: string; caption: string }[] = [
  { key: "public", label: "Public", caption: "Its rights authority has authorized description. The authorized fields are shown." },
  { key: "restricted", label: "Restricted", caption: "Held for preservation. Only a notice its rights authority approved is shown." },
  { key: "undiscoverable", label: "Not discoverable", caption: "Nothing is shown: no title, no placeholder, no count, no “hidden item” marker." },
];

export default function AccessStates({ publicTitle, publicHref, notice }: { publicTitle: string; publicHref: string; notice: { reference: string; text: string } | null }) {
  const [active, setActive] = useState<StateKey>("public");
  const refs = useRef<Record<StateKey, HTMLButtonElement | null>>({ public: null, restricted: null, undiscoverable: null });
  const current = TABS.find((t) => t.key === active)!;

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (!delta && jump === null) {
      return;
    }
    event.preventDefault();
    const next = TABS[jump ?? (index + delta + TABS.length) % TABS.length].key;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Access state" className="flex flex-wrap gap-x-6 border-b border-[var(--tiro-border)]">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            type="button"
            role="tab"
            id={`hv2-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls="hv2-access-panel"
            tabIndex={active === tab.key ? 0 : -1}
            className="hv2-tab"
            onClick={() => setActive(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="hv2-access-panel" role="tabpanel" aria-labelledby={`hv2-tab-${active}`} className="pt-6">
        <div key={active} className="hv2-panel-enter">
          <div className="min-h-[13.5rem]">
            {active === "public" ? (
              <div className="border border-[var(--tiro-border-strong)] bg-[var(--tiro-raised)] p-5">
                <p className="lt-label text-[var(--tiro-accent)]">Public · synthetic</p>
                <p className="lt-display mt-3 text-2xl">{publicTitle}</p>
                <p className="mt-3 text-sm text-[var(--tiro-text-muted)]">Source, authority, context, and permitted uses, each with how it is known.</p>
                <Link href={publicHref} className="tiro-link mt-4 inline-block text-sm">
                  See this record
                </Link>
              </div>
            ) : null}
            {active === "restricted" && notice ? (
              <div className="lt-boundary bg-[var(--tiro-raised)] p-5">
                <p className="lt-label text-[var(--tiro-accent)]">Restricted · authorized notice · synthetic</p>
                <p className="lt-display mt-3 text-2xl">This material is not available for public access.</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--tiro-text-soft)]">{notice.text}</p>
                <p className="mt-3 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">Reference {notice.reference}</p>
              </div>
            ) : null}
            {active === "undiscoverable" ? (
              <div className="flex min-h-[13.5rem] flex-col items-center justify-center border border-dashed border-[var(--tiro-border-strong)] px-5 py-8 text-center">
                <p className="lt-label">No record object rendered</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--tiro-text-muted)]">
                  The server sends nothing, so there is nothing here to reveal. This frame is an explanation, not a record.
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{current.caption}</p>
        </div>
      </div>
    </div>
  );
}
