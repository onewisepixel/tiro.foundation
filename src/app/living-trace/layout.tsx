import type { Metadata } from "next";

// Design-proof routes for The Living Trace: synthetic demonstrations and a
// design-system reference. Kept out of search indexes; nothing here is an
// archive record.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LivingTraceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
