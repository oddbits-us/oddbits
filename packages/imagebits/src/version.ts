/**
 * Single source of truth for the package version.
 *
 * Imported by both the Node entry (`src/index.ts`) and the browser entry
 * (`src/browser.ts`) so neither has to redeclare it.
 *
 * Kept in sync with package.json by release-please via the `extra-files`
 * entry in `release-please-config.json`. Do not edit manually.
 */
export const VERSION = '0.1.1'; // x-release-please-version
