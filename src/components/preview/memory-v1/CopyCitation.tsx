"use client";

import { useState, useSyncExternalStore } from "react";
import { cite, type CitationInput } from "@/lib/livingTrace/citation";

// A citation in TIRO Citation Standard v0.1 (provisional;
// docs/design/citation-standard-v0.1.md), with a way to copy it.
//
// The access date is the reader's own: it is filled in by the browser
// (never rendered on the server, so server and client markup agree). What
// the citation cannot yet contain, such as a persistent URL, is listed
// plainly beneath it rather than faked.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PendingCitation = DistributiveOmit<CitationInput, "accessed">;

const noop = () => () => {};
const today = () => new Date().toLocaleDateString("en-CA");

export default function CopyCitation({ input }: { input: PendingCitation }) {
  const accessed = useSyncExternalStore(noop, today, () => null);
  const { text, warnings } = cite({ ...input, accessed } as CitationInput);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  const gaps = warnings.filter((w) => !w.startsWith("No access date"));

  return (
    <div className="mv1-cite-block">
      <p className="mv1-dt">TIRO Citation Standard v0.1 · provisional</p>
      <p className="mv1-cite-text mt-2">{text}</p>
      {gaps.length > 0 ? (
        <div className="mt-3">
          <p className="mv1-dt">Not yet available</p>
          <ul className="mt-1 space-y-0.5 text-sm text-[var(--tiro-text-muted)]">
            {gaps.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="mv1-button">
          Copy citation
        </button>
        <span role="status" className="text-sm text-[var(--tiro-text-muted)]">
          {status === "copied" ? "Copied to the clipboard." : status === "failed" ? "Copying is unavailable here. Select the text above instead." : ""}
        </span>
      </div>
    </div>
  );
}
