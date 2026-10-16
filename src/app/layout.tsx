import type { Metadata } from "next";
import localFont from "next/font/local";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import "./globals.css";

// Self-hosted (not next/font/google): Turbopack's Google Fonts resolution is
// network-dependent at build time and a documented source of CI flakiness —
// a transient fetch failure or Turbopack font-loader resolution error takes
// down the whole build. These are the exact same files/weights/styles
// Google Fonts served for these families (latin subset only, matching the
// previous config) downloaded once and committed, so the build is hermetic.
//
// Performance (Living Trace 0.2, measured with Lighthouse mobile): every
// file of every family used to be preloaded on every page (10 files,
// ~227 KB), competing with HTML and CSS for the throttled connection and
// delaying the Spectral headline that is the LCP element site-wide. Only
// the faces actually rendered are declared now: no Spectral 500/600 or
// Space Mono 700 is used anywhere in src/ (the files remain in
// src/fonts/ if a future design needs them). Only the faces needed for
// first paint are preloaded: Spectral 400 roman and italic (headlines)
// and Karla (body). Space Mono and Space Grotesk are small UI labels and
// swap in without a preload.
const spectral = localFont({
  src: [
    { path: "../fonts/spectral-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/spectral-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  // A metric-adjusted serif fallback: the headline (the LCP element) no
  // longer reflows when Spectral swaps in (measured CLS 0.021 -> see
  // docs/design/living-trace.md).
  adjustFontFallback: "Times New Roman",
});

// Karla ships as a single variable-font file for weights 400/500/600 — Google
// Fonts itself serves the identical file for all three weight requests, so
// one downloaded file is reused across all three @font-face declarations
// below, exactly mirroring what Google's own CSS did.
const karla = localFont({
  src: [
    { path: "../fonts/karla-variable.woff2", weight: "400", style: "normal" },
    { path: "../fonts/karla-variable.woff2", weight: "500", style: "normal" },
    { path: "../fonts/karla-variable.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

const spaceMono = localFont({
  src: [{ path: "../fonts/space-mono-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-code",
  display: "swap",
  preload: false,
});

const spaceGrotesk = localFont({
  src: "../fonts/space-grotesk-500-normal.woff2",
  weight: "500",
  style: "normal",
  variable: "--font-logo",
  display: "swap",
  preload: false,
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
  const themeInitScript = `
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var theme = stored;
        if (!theme) {
          theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        document.documentElement.setAttribute("data-theme", theme);
      } catch (e) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${spectral.variable} ${karla.variable} ${spaceMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <a href="#content" className="tiro-skip-link">
          Skip to content
        </a>
        <TopNav />

        <div id="content" tabIndex={-1} className="outline-none">
          {children}
        </div>

        <Footer />
      </body>
    </html>
  );
}
