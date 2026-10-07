/** Types for check-site-layout.mjs, so TypeScript tests can import it. */

/** Gzipped size limit for the root entry's static import closure. */
export declare const GUARD_BUDGET_BYTES: number

/** Gzipped size limit for everything the landing page loads (JS + CSS). */
export declare const PAGE_BUDGET_BYTES: number

/** Size limit for each app screenshot the landing page shows. */
export declare const SCREEN_BUDGET_BYTES: number

/** Size limit for all of the landing page's app screenshots together. */
export declare const SCREENS_TOTAL_BUDGET_BYTES: number

/** The read-only filesystem the checker needs. */
export interface ReadOnlyFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}

/**
 * Check a built site.
 *
 * @param distDir The Vite output directory.
 * @param fs Read-only filesystem; defaults to node:fs.
 * @returns One message per problem; empty when the layout is good.
 */
export declare function checkSiteLayout(distDir: string, fs?: ReadOnlyFs): string[]
