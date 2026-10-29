"use client";

import { useRef, useState } from "react";

// "A memory can be preserved without being taken from the people to whom it
// belongs", drawn. The source and its authority stay outside TIRO's custody
// frame in every state; only what consent governs changes: whether the
// record reaches an audience, and on what basis it is kept.
//
// The three states follow the proposed lifecycle in docs/ethos.txt §12
// (publication and custody are independent). An illustration of a proposed
// process, not a live system. The control is a radio group (arrow keys);
// the caption below states the same thing the drawing shows.
type State = "published" | "preserved" | "withdrawn";

const STATES: { key: State; label: string; title: string; body: string }[] = [
  {
    key: "published",
    label: "Published",
    title: "Published with consent",
    body: "Specified material reaches an authorized audience through named channels. Every other use still needs its own permission.",
  },
  {
    key: "preserved",
    label: "Preserved only",
    title: "Preserved, not published",
    body: "Kept, copied for integrity, and migrated within the terms of custody, with no public access. Preservation does not require publication.",
  },
  {
    key: "withdrawn",
    label: "Withdrawn",
    title: "Consent withdrawn",
    body: "Public access and future distribution stop within TIRO-controlled systems. Anything kept after that needs a basis disclosed when consent was given.",
  },
];

export default function ConsentLifecycle() {
  const [state, setState] = useState<State>("published");
  const radios = useRef<Partial<Record<State, HTMLButtonElement | null>>>({});
  const current = STATES.find((s) => s.key === state)!;
  const open = state === "published";

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) {
      return;
    }
    e.preventDefault();
    const next = STATES[(i + delta + STATES.length) % STATES.length].key;
    setState(next);
    radios.current[next]?.focus();
  };

  return (
    <figure className="mv1-lifecycle" data-state={state}>
      <div role="radiogroup" aria-label="What consent says" className="mv1-seg">
        {STATES.map((s, i) => (
          <button
            key={s.key}
            ref={(el) => {
              radios.current[s.key] = el;
            }}
            type="button"
            role="radio"
            aria-checked={state === s.key}
            tabIndex={state === s.key ? 0 : -1}
            className="mv1-seg-option"
            onClick={() => setState(s.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <svg viewBox="0 0 720 270" className="mv1-lifecycle-svg" aria-hidden="true" focusable="false">
        {/* Outside custody: the source and its authority. */}
        <g>
          <circle cx={78} cy={92} r={10} className="mv1-lc-origin" />
          <circle cx={78} cy={92} r={3.2} className="mv1-lc-dot" />
          <text x={78} y={128} textAnchor="middle" className="mv1-lc-label">
            SOURCE
          </text>
          <rect x={70} y={172} width={16} height={16} transform="rotate(45 78 180)" className="mv1-lc-authority" />
          <text x={78} y={218} textAnchor="middle" className="mv1-lc-label">
            AUTHORITY
          </text>
        </g>

        {/* The tether: never cut, in any state. */}
        <path d="M90,92 C190,92 250,135 318,135" className="mv1-lc-tether" />
        <path d="M90,180 C190,180 250,140 318,138" className="mv1-lc-decides" />

        {/* TIRO's custody. */}
        <rect x={238} y={34} width={232} height={204} className="mv1-lc-custody" />
        <text x={252} y={58} className="mv1-lc-label mv1-lc-label-accent">
          TIRO · CUSTODIAN
        </text>
        <path d="M354,104 L408,135 L354,166 L300,135 Z" className="mv1-lc-record" data-retained={state !== "withdrawn"} />
        <text x={354} y={200} textAnchor="middle" className="mv1-lc-label">
          {state === "withdrawn" ? "KEPT ONLY ON A DISCLOSED BASIS" : "RECORD, PRESERVED"}
        </text>

        {/* Access: governed by consent. */}
        <line x1={410} y1={135} x2={state === "published" ? 610 : 520} y2={135} className="mv1-lc-access" data-open={open} />
        {open ? null : (
          <g className="mv1-lc-gate">
            <line x1={526} x2={526} y1={118} y2={152} />
            <line x1={534} x2={534} y1={118} y2={152} />
          </g>
        )}
        <circle cx={630} cy={135} r={9} className="mv1-lc-audience" data-open={open} />
        <text x={630} y={170} textAnchor="middle" className="mv1-lc-label">
          AUDIENCE
        </text>
        <text x={630} y={186} textAnchor="middle" className="mv1-lc-sub">
          {open ? "authorized, named channels" : "no public access"}
        </text>
      </svg>

      <figcaption>
        <div aria-live="polite">
          <p key={state} className="la-enter font-[family-name:var(--font-display)] text-xl text-[var(--tiro-text)]">
            {current.title}
          </p>
          <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-[var(--tiro-text-muted)]">{current.body}</p>
        </div>
        <p className="mt-4 max-w-[36rem] text-sm leading-relaxed text-[var(--tiro-text-soft)]">
          In every state the source and its authority stay outside TIRO&apos;s custody, still connected to the record. Custody is not ownership.
        </p>
        <p className="mv1-fineprint mt-4">Illustration of a proposed process, pending adoption. Not a live system.</p>
      </figcaption>
    </figure>
  );
}
