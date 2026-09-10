import type { ReactNode } from 'react';

/**
 * Icons are inline SVG — the convention across aether-zone's apps.
 *
 * They size themselves rather than leaning on a parent's `[&>svg]:size-*` rule.
 * Kosmos's `SidenavItem` wraps an icon in a `size-4` span but sets nothing on
 * the svg, and a bare `Button` wraps it in nothing at all — an svg with a
 * viewBox and no width would be left to the browser's replaced-element default.
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

function SearchIcon() {
  return (
    <svg {...svg}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

/**
 * One entry, because mneme is one screen.
 *
 * The rail matches akouo's and loculus's chrome rather than being earned by the
 * number of destinations; a second entry appears when there is a second screen.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Search', icon: <SearchIcon /> },
];

/** Exact match for the index route, prefix match for the rest. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function CollapseIcon() {
  return (
    <svg {...svg}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg {...svg}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function SignOutIcon() {
  return (
    <svg {...svg}>
      <path d="M15 17v1.5A2.5 2.5 0 0 1 12.5 21h-6A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3h6A2.5 2.5 0 0 1 15 5.5V7" />
      <path d="M10 12h11M18 9l3 3-3 3" />
    </svg>
  );
}
