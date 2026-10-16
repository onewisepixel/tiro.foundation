import OriginPoint from "./OriginPoint";

// One movement of a narrative page, sitting on the page's spine: the single
// trace that runs from the mark's resonance line through every movement.
// Each movement begins at its own origin point on that line. The spine is
// decorative; the movement index in the hero is its accessible form.
type MovementProps = {
  id: string;
  index: string; // "01"
  name: string; // "Witness"
  children: React.ReactNode;
  tone?: "field" | "deep";
  last?: boolean;
};

export const SPINE_COLUMNS = "grid-cols-[2rem_minmax(0,1fr)] md:grid-cols-[6rem_minmax(0,1fr)]";

export default function Movement({ id, index, name, children, tone = "field", last = false }: MovementProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 bg-[var(--lt-movement-bg)]"
      style={{ "--lt-movement-bg": tone === "deep" ? "var(--tiro-bg-deep)" : "var(--tiro-bg)" } as React.CSSProperties}
    >
      <div className={`mx-auto grid w-full max-w-6xl px-[var(--lt-gutter)] md:px-6 ${SPINE_COLUMNS}`}>
        <div aria-hidden="true" className="relative">
          <span className="lt-spine" style={last ? { bottom: "auto", height: "7.6rem" } : undefined} />
          <span className="absolute left-[calc(50%+var(--lt-spine-dx))] top-[6.1rem] -translate-x-1/2 rounded-full bg-[var(--lt-movement-bg)] p-1 md:top-[7.1rem]">
            <OriginPoint size={18} tone={last ? "accent" : "mineral"} />
          </span>
        </div>
        <div className="min-w-0 pb-20 pl-3 pt-24 md:pb-28 md:pl-6 md:pt-28">
          <p className="lt-label mb-5 text-[var(--tiro-accent)]">
            {index} <span aria-hidden="true">/</span> {name}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}

export function MovementTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={`${id}-title`} className="lt-display max-w-4xl text-[2.35rem] sm:text-5xl md:text-6xl">
      {children}
    </h2>
  );
}
