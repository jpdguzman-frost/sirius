/**
 * Types for the one seam build.js exposes to TypeScript callers.
 *
 * build.js is plain ESM (the frontend has no bundler and no TypeScript), and
 * tsconfig keeps `allowJs` off, so `test/helpers/source.ts` needs this
 * declaration to import the composer instead of reassembling the template.
 */

/** The shipped Ractive template: layout + partial registry + per-tab views. */
export function composeTemplate(): string;
