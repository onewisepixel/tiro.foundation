"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";

const NAV = [
  { href: "/flight-deck", label: "Now" },
  { href: "/flight-deck/relationships", label: "Relationships" },
  { href: "/flight-deck/outreach", label: "Outreach" },
  { href: "/flight-deck/campaigns", label: "Campaigns" },
  { href: "/flight-deck/content", label: "Content" },
  { href: "/flight-deck/approvals", label: "Approvals" },
  { href: "/flight-deck/activity", label: "Activity" },
  { href: "/flight-deck/health", label: "Health" },
];

export function FlightDeckNav({ approvals }: { approvals: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Flight Deck" className="fd-nav w-full min-w-0 max-w-full overflow-x-auto lg:w-auto">
      <ul className="flex min-w-max gap-1 font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.06em]">
        {NAV.map((item) => {
          const active = item.href === "/flight-deck" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative inline-flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[var(--tiro-text-soft)] hover:text-[var(--tiro-text)]"
              >
                {item.label}
                {item.label === "Approvals" && approvals > 0 ? (
                  <span className="border border-[var(--tiro-accent)] px-1 text-[10px] text-[var(--tiro-accent)]">
                    {approvals}
                    <span className="sr-only"> awaiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SubmitButton({ children, tone, disabled }: { children: React.ReactNode; tone?: "primary" | "danger"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="fd-button" data-tone={tone} disabled={pending || disabled} aria-disabled={pending || disabled}>
      {pending ? "Working…" : children}
    </button>
  );
}

// Copies the exact approved text for a manual send. Copying is not
// sending, and is not recorded as such.
export function CopyButton({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="fd-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {label}
      </button>
      <span aria-live="polite" className="text-xs text-[var(--tiro-text-muted)]">
        {state === "copied" ? "Copied. Not sent." : state === "failed" ? "Copy failed; select the text instead." : ""}
      </span>
    </span>
  );
}
