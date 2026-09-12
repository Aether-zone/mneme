/**
 * Inline SVG icons, the convention across the aether-zone frontends.
 *
 * They size themselves rather than leaning on a parent rule: kosmos wraps an
 * icon slot in a `size-4` span but sets nothing on the svg inside it, and a
 * bare `Button` wraps it in nothing at all — an svg with a viewBox and no width
 * would be left to the browser's replaced-element default in there.
 *
 * kosmos depends on `react-icons` and uses Ionicons internally, but it does not
 * re-export them, and taking a direct dependency on the icon set to draw two
 * glyphs is more than this app needs.
 */
const svg = {
  className: 'size-4',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const;

export function SunIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...svg}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
