import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Tiro Foundation",
  description:
    "Custodial systems for memory, consent, and human continuity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-[#0b0c10]/70 backdrop-blur-md">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-sm text-white/70">
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.28em] text-white/45 transition-colors hover:text-white/80"
            >
              TIRO
            </Link>

            <div className="flex items-center gap-5 md:gap-8">
              <Link className="transition-colors hover:text-white" href="/">
                Home
              </Link>
              <Link className="transition-colors hover:text-white" href="/manifesto">
                Manifesto
              </Link>
              <Link className="transition-colors hover:text-white" href="/memory-project">
                Memory Project
              </Link>
            </div>
          </nav>
        </header>

        {children}
      </body>
    </html>
  );
}
