"use client";

import { useState } from "react";

// A citation a researcher can copy. The text is always visible and
// selectable; the button is a convenience, and says plainly whether the
// copy worked.
export default function CopyCitation({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={copy} className="mv1-button">
        Copy citation
      </button>
      <span role="status" className="text-sm text-[var(--tiro-text-muted)]">
        {status === "copied" ? "Copied to the clipboard." : status === "failed" ? "Copying is unavailable here. Select the text above instead." : ""}
      </span>
    </div>
  );
}
