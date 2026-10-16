"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import TiroMark from "@/components/TiroMark";

const navItems = [
  { href: "/manifesto", label: "Manifesto" },
  { href: "/about", label: "About" },
  { href: "/memory-project", label: "Memory Project" },
  { href: "/nodes", label: "Nodes" },
  { href: "/community-rights", label: "Community Rights" },
];

const THEME_EVENT = "tiro-theme-change";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getThemeSnapshot(): "light" | "dark" {
  const current = document.documentElement.getAttribute("data-theme");
  if (current === "light" || current === "dark") {
    return current;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "dark";
}

export default function TopNav() {
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);

  // The narrow-screen menu closes on Escape and when a link is chosen.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = theme === "dark" ? "light" : "dark";
    root.classList.add("theme-transition");
    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));

    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 240);
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-40 border-b border-[var(--tiro-border)] bg-[var(--tiro-bg)]">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-muted)]">
        <Link href="/" className="group flex items-center gap-2.5">
          <TiroMark variant="primary" className="h-[30px] w-auto text-[var(--tiro-mark)]" />
          <span className="font-[family-name:var(--font-logo)] text-[15px] font-medium uppercase tracking-[0.14em] text-[var(--tiro-text)] transition-colors group-hover:text-[var(--tiro-accent)]">
            TIRO
          </span>
        </Link>

        <div className="hidden items-center gap-6 lg:flex xl:gap-7">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? "text-[var(--tiro-accent)]"
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
            className="border border-[var(--tiro-border)] bg-[var(--tiro-surface)] px-3 py-1.5 uppercase tracking-[0.08em] text-[var(--tiro-text-soft)] transition-colors hover:border-[var(--tiro-accent)] hover:bg-[var(--tiro-surface-strong)] hover:text-[var(--tiro-text)]"
            aria-label="Toggle light and dark mode"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <button
          type="button"
          className="border border-[var(--tiro-border)] px-3 py-1.5 uppercase tracking-[0.08em] text-[var(--tiro-text-soft)] lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="tiro-nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </nav>

      {menuOpen ? (
        <div id="tiro-nav-menu" className="border-t border-[var(--tiro-border)] bg-[var(--tiro-bg)] lg:hidden">
          <ul className="mx-auto max-w-6xl px-6 py-3 font-[family-name:var(--font-code)] text-sm">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 border-b border-[var(--tiro-border)] py-3.5 uppercase tracking-[0.08em] ${
                      active ? "text-[var(--tiro-accent)]" : "text-[var(--tiro-text-soft)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-[var(--tiro-accent)]" : "bg-[var(--tiro-border-strong)]"}`}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/contact" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 border-b border-[var(--tiro-border)] py-3.5 uppercase tracking-[0.08em] text-[var(--tiro-text-soft)]">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--tiro-border-strong)]" />
                Contact
              </Link>
            </li>
            <li className="py-3.5">
              <button
                type="button"
                onClick={toggleTheme}
                className="border border-[var(--tiro-border)] px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-[var(--tiro-text-soft)]"
                aria-label="Toggle light and dark mode"
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
