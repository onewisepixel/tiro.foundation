import type { ReactNode } from "react";
import BfcacheRevalidator from "@/components/BfcacheRevalidator";

// Scoped to /memories and /memories/[id] only — the two pages whose
// content depends on live, revocable permission state and must never be
// shown stale from the browser's back/forward cache. See
// BfcacheRevalidator.tsx and src/proxy.ts for the full mechanism.
export default function MemoriesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BfcacheRevalidator />
      {children}
    </>
  );
}
