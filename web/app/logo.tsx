/**
 * The mneme mark: a thread looped through a knot.
 *
 * *Mneme* is the muse of memory, and a knotted cord is how memory was kept
 * before it was written down. Inline SVG rather than a file so it inherits
 * `currentColor` and needs no network request; this is the convention across
 * the aether-zone frontends.
 */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-6 ${className}`}
    >
      {/* The loop. */}
      <circle cx="12" cy="10" r="6" />
      {/* The knot, and the two ends left hanging. */}
      <path d="M9.5 15.5 8 21M14.5 15.5 16 21" />
      <path d="M9.5 10h5" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className="text-primary" />
      <span className="text-base font-semibold tracking-tight">mneme</span>
    </span>
  );
}
