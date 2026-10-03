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
const spectral = localFont({
  src: [
    { path: "../fonts/spectral-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/spectral-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/spectral-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/spectral-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/spectral-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/spectral-600-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
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
  src: [
    { path: "../fonts/space-mono-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/space-mono-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-code",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "../fonts/space-grotesk-500-normal.woff2",
  weight: "500",
  style: "normal",
  variable: "--font-logo",
  display: "swap",
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
        <TopNav />

        {children}

        <Footer />
      </body>
    </html>
  );
}
