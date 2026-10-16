import OriginPoint from "./OriginPoint";

// One movement of a narrative page, sitting on the page's spine: the single
// trace that runs from the mark's resonance line through every movement.
// Each movement begins at its own origin point on that line. The spine is
// decorative; the hero's "On this page" index is its accessible form.
//
// register: the movement's visual register (see globals.css, "Movement
// registers"). It changes surface, density, and measure, never what a
// primitive means.
// wide: content below the header leaves the spine's column and spans the
// full frame (Discover). The spine stops at the header and resumes in the
// next movement: the trace hands over to the constellation.
// end: the last movement. The spine runs through its branches and stops
// at an open origin: the next record has not been made yet.
export type Register = "witness" | "preserve" | "discover" | "respect" | "participate";

type MovementProps = {
  id: string;
  index: string; // "01"
  name: string; // "Witness"
  register: Register;
  header: React.ReactNode;
  children?: React.ReactNode;
  wide?: React.ReactNode;
  end?: boolean;
};

export const SPINE_COLUMNS = "grid-cols-[2rem_minmax(0,1fr)] md:grid-cols-[6rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)]";

function SpineColumn({ end, stopAtMarker }: { end: boolean; stopAtMarker: boolean }) {
  return (
    <div aria-hidden="true" className="relative">
      {/* Stopped at the marker's center when the trace hands over (Discover);
          in the last movement it runs past every branch and ends at an open
          origin near the bottom. */}
      <span
        className={`lt-spine ${stopAtMarker ? "!bottom-auto h-[calc(6.1rem+13px)] md:h-[calc(7.1rem+13px)]" : end ? "!bottom-[4.5rem]" : ""}`}
      />
      <span className="absolute left-[calc(50%+var(--lt-spine-dx))] top-[6.1rem] -translate-x-1/2 rounded-full bg-[var(--lt-movement-bg)] p-1 md:top-[7.1rem]">
        <OriginPoint size={18} tone="mineral" />
      </span>
      {end ? (
        <span className="absolute bottom-[calc(4.5rem-13px)] left-[calc(50%+var(--lt-spine-dx))] -translate-x-1/2 rounded-full bg-[var(--lt-movement-bg)] p-1">
          <OriginPoint size={18} tone="accent" absent />
        </span>
      ) : null}
    </div>
  );
}

export default function Movement({ id, index, name, register, header, children, wide, end = false }: MovementProps) {
  const paper = register === "preserve";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-register={register}
      className={`lt-movement relative scroll-mt-16 ${paper ? "tiro-register-paper" : ""}`}
    >
      <div className={`mx-auto grid w-full max-w-6xl px-[var(--lt-gutter)] md:px-6 ${SPINE_COLUMNS}`}>
        <SpineColumn end={end} stopAtMarker={Boolean(wide)} />
        <div className={`min-w-0 pl-3 pt-24 md:pl-6 md:pt-28 ${wide ? "pb-10 md:pb-14" : "pb-20 md:pb-28"}`}>
          <p className="lt-label mb-5 text-[var(--tiro-accent)]">
            {index} <span aria-hidden="true">/</span> {name}
          </p>
          {header}
          {children}
        </div>
      </div>
      {wide ? (
        <div className="relative">
          {wide}
          {/* The spine resumes after the wide composition. */}
          <div className={`mx-auto grid w-full max-w-6xl px-[var(--lt-gutter)] md:px-6 ${SPINE_COLUMNS}`} aria-hidden="true">
            <div className="relative h-16 md:h-24">
              <span className="lt-spine" />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MovementTitle({ id, children, size = "lg" }: { id: string; children: React.ReactNode; size?: "lg" | "xl" }) {
  return (
    <h2
      id={`${id}-title`}
      className={`lt-display max-w-4xl ${size === "xl" ? "text-[2.6rem] sm:text-6xl md:text-7xl" : "text-[2.35rem] sm:text-5xl md:text-6xl"}`}
    >
      {children}
    </h2>
  );
}
