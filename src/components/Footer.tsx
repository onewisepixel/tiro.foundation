import Link from "next/link";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/memory-project", label: "Memory Project" },
  { href: "/community-rights", label: "Community Rights" },
  { href: "/contact", label: "Contact" },
];

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--tiro-border)] bg-[var(--tiro-bg)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 font-[family-name:var(--font-code)] text-xs text-[var(--tiro-text-subtle)] md:flex-row md:items-center md:justify-between">
        <p className="uppercase tracking-[0.2em]">
          The Tiro Foundation — Node Zero
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="uppercase tracking-[0.08em] transition-colors hover:text-[var(--tiro-text)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
