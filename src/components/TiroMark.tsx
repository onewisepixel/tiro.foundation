type TiroMarkProps = {
  variant?: "primary" | "micro";
  className?: string;
};

export default function TiroMark({ variant = "primary", className }: TiroMarkProps) {
  if (variant === "micro") {
    return (
      <svg
        viewBox="0 0 90 202"
        role="img"
        aria-label="TIRO"
        className={className}
      >
        <title>TIRO mark, micro variant</title>
        <circle cx="45" cy="20" r="5" fill="currentColor" />
        <line x1="45" y1="25" x2="45" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M20,60 L70,66 L47,135 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line x1="47" y1="135" x2="47" y2="182" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 90 202" role="img" aria-label="TIRO" className={className}>
      <title>TIRO mark</title>
      <circle cx="45" cy="20" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="45" cy="20" r="2.6" fill="currentColor" />
      <line x1="45" y1="29" x2="45" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M20,60 L70,66 L47,135 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line x1="47" y1="135" x2="47" y2="182" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
