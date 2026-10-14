/**
 * The pure half of the sitemap's `<lastmod>` stamping (initiative 006); the
 * Vite plugin that reads git is scripts/deploy/vite-plugin-sitemap-lastmod.ts.
 * No Node imports here, so the app's tests can import it.
 */

/**
 * The source files whose last commit dates each sitemap URL's `<lastmod>`,
 * keyed by the URL's path. A page changes when its HTML or the code that
 * renders its words changes. A URL missing from this map is stamped with the
 * build date, and sitemap-lastmod.test.ts fails until it is added.
 */
export const SITEMAP_SOURCES: Record<string, readonly string[]> = {
  '/': ['index.html', 'src/landing'],
  '/tools/fueling.html': ['tools/fueling.html', 'src/tools/FuelingPlanner.tsx', 'src/tools/ToolShell.tsx', 'src/tools/toolMath.ts'],
  '/tools/predictor.html': ['tools/predictor.html', 'src/tools/Predictor.tsx', 'src/tools/ToolShell.tsx', 'src/tools/toolMath.ts'],
  '/tools/heat.html': ['tools/heat.html', 'src/tools/HeatPlanner.tsx', 'src/tools/ToolShell.tsx', 'src/tools/toolMath.ts'],
  '/tools/mileage.html': ['tools/mileage.html', 'src/tools/MileagePlanner.tsx', 'src/tools/ToolShell.tsx', 'src/tools/mileageMath.ts'],
}

/** A W3C date (YYYY-MM-DD), the form the sitemap protocol accepts. */
const W3C_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Give every `<url>` in a sitemap a `<lastmod>`, replacing any it has.
 *
 * @param xml The sitemap source.
 * @param lastmodFor The date for a URL's `<loc>`, as YYYY-MM-DD.
 * @returns The sitemap with a `<lastmod>` straight after each `<loc>`.
 */
export function stampSitemap(xml: string, lastmodFor: (loc: string) => string): string {
  return xml.replace(/<url>([\s\S]*?)<\/url>/g, (_whole, inner: string) => {
    const loc = inner.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1]
    if (!loc) return _whole
    const date = lastmodFor(loc)
    if (!W3C_DATE.test(date)) throw new Error(`lastmod for ${loc} is not a YYYY-MM-DD date: ${date}`)
    const rest = inner.replace(/\s*<lastmod>[\s\S]*?<\/lastmod>/g, '').replace(/\s*<loc>[\s\S]*?<\/loc>/, '')
    return `<url><loc>${loc}</loc><lastmod>${date}</lastmod>${rest}</url>`
  })
}

/** The path part of an absolute URL (`https://attune.coach/tools/x.html` → `/tools/x.html`). */
export function pathOf(loc: string): string {
  return new URL(loc).pathname
}
