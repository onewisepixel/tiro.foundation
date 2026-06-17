"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/memory-project", label: "Memory Project" },
  { href: "/nodes", label: "Nodes" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TopNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") {
      setTheme(current);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const fallbackTheme = prefersDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", fallbackTheme);
    setTheme(fallbackTheme);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = theme === "dark" ? "light" : "dark";
    root.classList.add("theme-transition");
    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);

    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 240);
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-40 border-b border-[var(--tiro-border)] bg-[color-mix(in_srgb,var(--tiro-bg)_78%,transparent)] backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-sm text-[var(--tiro-text-muted)]">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.28em] text-[var(--tiro-text-subtle)] transition-colors hover:text-[var(--tiro-text-soft)]"
        >
          TIRO
        </Link>

        <div className="flex items-center gap-4 md:gap-7">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`transition-colors ${
                  active
                    ? "text-[var(--tiro-text)] underline decoration-[var(--tiro-text-subtle)] underline-offset-6"
                    : "hover:text-[var(--tiro-text)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[var(--tiro-text-soft)] transition-colors hover:bg-[var(--tiro-surface-strong)] hover:text-[var(--tiro-text)]"
            aria-label="Toggle light and dark mode"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </nav>
    </header>
  );
}
