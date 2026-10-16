import Link from "next/link";
import type { RestrictedNotice } from "@/lib/livingTrace/projection";

// Proof C — The Boundary.
//
// What a visitor is permitted to know, and nothing more. These components
// receive only an authorized projection (src/lib/livingTrace/projection.ts);
// there is no hidden title in the markup to reveal, no blur, no padlock,
// and no "unlock" affordance. Browsing or curiosity cannot change what is
// sent, because what is withheld never reaches the browser.

function BoundaryGlyph() {
  // A closed double ring around an empty center: a boundary that holds
  // nothing visible. Kin to the origin point, deliberately without the dot.
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <circle cx="17" cy="17" r="15" fill="none" stroke="var(--tiro-text-soft)" strokeWidth="1.25" />
      <circle cx="17" cy="17" r="10" fill="none" stroke="var(--tiro-border-strong)" strokeWidth="1.25" />
    </svg>
  );
}

const NEVER_SHOWN = ["Title or description", "People, places, or dates", "Media or transcript", "Relationships to other records"];

// State A: restricted, with a notice its rights authority has authorized.
export function RestrictedRecordNotice({ notice, headingLevel = 2 }: { notice: RestrictedNotice; headingLevel?: 1 | 2 | 3 }) {
  const H = (`h${headingLevel}` as "h1" | "h2" | "h3");
  return (
    <section aria-labelledby={`${notice.reference}-boundary`} className="lt-boundary bg-[var(--tiro-raised)] p-5 md:p-8">
      <div className="flex items-start gap-4">
        <BoundaryGlyph />
        <div className="min-w-0">
          <p className="lt-label text-[var(--tiro-accent)]">Restricted · authorized notice</p>
          <H id={`${notice.reference}-boundary`} className="lt-display mt-3 text-2xl md:text-3xl">
            This material is not available for public access.
          </H>
          <p className="mt-4 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-soft)]">{notice.notice}</p>

          <dl className="mt-6 grid gap-4 border-t border-[var(--tiro-border)] pt-5 sm:grid-cols-2">
            <div>
              <dt className="lt-label">Reference</dt>
              <dd className="mt-1 font-[family-name:var(--font-code)] text-sm text-[var(--tiro-text)]">{notice.reference}</dd>
            </div>
            <div>
              <dt className="lt-label">What this page will never show</dt>
              <dd className="mt-1">
                <ul className="space-y-0.5 text-sm text-[var(--tiro-text-muted)]">
                  {NEVER_SHOWN.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>

          {notice.mayContact ? (
            <p className="mt-6 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
              If you believe you hold authority over this material, or have a question about it,{" "}
              <Link href="/contact" className="tiro-link !text-[var(--tiro-text)]">
                contact a steward
              </Link>{" "}
              with the reference above. A request does not by itself grant access.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// State B: undiscoverable. This component is an EXPLANATION for the proof
// page and homepage. It is never rendered in place of an actual
// undiscoverable record; for those, the route returns the same 404 as an
// id that never existed, and nothing at all is rendered.
export function UndiscoverableExplainer({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="lt-undiscoverable" className="lt-boundary p-5 md:p-8">
      <p className="lt-label text-[var(--tiro-accent)]">Undiscoverable</p>
      <H id="lt-undiscoverable" className="lt-display mt-3 text-2xl md:text-3xl">
        Some records are not shown at all, and not marked as hidden.
      </H>
      <div className="mt-5 border border-dashed border-[var(--tiro-border-strong)] px-5 py-8 text-center">
        <p className="lt-label">No record object rendered</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          No title, placeholder, count, or &ldquo;hidden item&rdquo; marker. The server sends nothing, so there is nothing here to reveal.
        </p>
      </div>
      <p className="mt-5 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
        Ask for an undiscoverable record by its ID and you get the same &ldquo;not found&rdquo; as for an ID that never existed.
        We can&apos;t point you to an example. Naming one would disclose that it exists.
      </p>
    </section>
  );
}
