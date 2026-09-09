/**
 * Formatting for the console. Nothing here may import server-only code.
 *
 * `formatBytes` and `initials` are daimon's — akouo and loculus needed the same
 * two, and each app's copy handled an edge the other got wrong. Re-exported
 * rather than imported directly at each call site so `@/lib/format` stays this
 * app's one formatting entry point.
 */

export { formatBytes, initials } from '@aether-zone/daimon/format';
