// Voice / source — personhood and testimony.
//
// With no consent-cleared recording, the honest rendering of a voice is
// its absence: a flat line of evenly spaced, silent ticks with the words
// "no audio attached", never an invented waveform implying a recording
// exists. When real, consented media exists, the same frame would hold
// an opt-in player (never autoplay) whose waveform follows playback, with
// the transcript beside it.
type VoiceSourceProps = {
  mediaNote: string;
  transcriptNote: string;
  accessNote: string;
};

function SilentWaveform() {
  const ticks = Array.from({ length: 48 }, (_, i) => i);
  return (
    <svg viewBox="0 0 480 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true" focusable="false">
      <line x1="0" y1="20" x2="480" y2="20" stroke="var(--tiro-mineral-line)" strokeWidth="1" opacity="0.5" vectorEffect="non-scaling-stroke" />
      {ticks.map((i) => (
        <line
          key={i}
          x1={5 + i * 10}
          x2={5 + i * 10}
          y1="17"
          y2="23"
          stroke="var(--tiro-mineral-line)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
      ))}
    </svg>
  );
}

export default function VoiceSource({ mediaNote, transcriptNote, accessNote }: VoiceSourceProps) {
  const rows = [
    { label: "Listen", value: "No audio attached", note: mediaNote },
    { label: "Read", value: "No transcript", note: transcriptNote },
    { label: "Access notes", value: "Demonstration fields only", note: accessNote },
  ];
  return (
    <figure className="border border-[var(--tiro-border)] bg-[var(--tiro-raised)] p-4 md:p-5">
      <SilentWaveform />
      <figcaption className="sr-only">Voice: no audio attached to this record.</figcaption>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="lt-label">{row.label}</dt>
            <dd className="mt-1 text-sm text-[var(--tiro-text-soft)]">{row.value}</dd>
            <dd className="mt-1 text-xs leading-relaxed text-[var(--tiro-text-muted)]">{row.note}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
