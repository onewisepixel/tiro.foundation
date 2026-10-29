import Link from "next/link";
import { NAV_GROUPS } from "@/lib/navigation";

// Every destination, under the four groups of the global navigation
// (src/lib/navigation.ts, decision 42).
export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--tiro-border)] bg-[var(--tiro-bg)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-subtle)] md:flex-row md:items-start md:justify-between">
        <p className="uppercase tracking-[0.2em]">
          The Tiro Foundation — Node Zero
        </p>

        <nav aria-label="Site" className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 uppercase tracking-[0.16em] text-[var(--tiro-text-muted)]">{group.label}</p>
              <ul className="grid gap-1.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="uppercase tracking-[0.08em] transition-colors hover:text-[var(--tiro-text)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
