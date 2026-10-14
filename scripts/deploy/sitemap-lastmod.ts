/**
 * The pure half of the sitemap's `<lastmod>` stamping (initiative 006); the
 * Vite plugin that reads git is scripts/deploy/vite-plugin-sitemap-lastmod.ts.
 * No Node imports here, so the app's tests can import it.
 */

/**
 * What `src/tools/toolMath.ts` computes with (its imports): the numbers on the
 * fueling, predictor and heat pages come from these, so a change to them is a
 * change to what the page says.
 */
const TOOL_MATH = [
  'src/tools/toolMath.ts',
  'src/utils/fueling.ts',
  'src/utils/parseTime.ts',
  'src/engines/planGenerator',
  'src/engines/terrain/locomotion/minetti.ts',
] as const

/** The same for `src/tools/mileageMath.ts`: the mileage page prints the plan engine's output. */
const MILEAGE_MATH = [
  'src/tools/mileageMath.ts',
  'src/engines/planGenerator',
  'src/data/methods',
  'src/utils/planDates.ts',
  'src/hooks/useOnboarding.ts',
] as const

/**
 * The source files whose last commit dates each sitemap URL's `<lastmod>`,
 * keyed by the URL's path. A page changes when its HTML or the code that
 * renders its words changes. A URL missing from this map is stamped with the
 * build date, and sitemap-lastmod.test.ts fails until it is added.
 */
export const SITEMAP_SOURCES: Record<string, readonly string[]> = {
  '/': ['index.html', 'src/landing', 'tailwind.landing.config.js', 'public/landing', 'public/fonts'],
  '/tools/fueling.html': ['tools/fueling.html', 'src/tools/FuelingPlanner.tsx', 'src/tools/ToolShell.tsx', ...TOOL_MATH],
  '/tools/predictor.html': ['tools/predictor.html', 'src/tools/Predictor.tsx', 'src/tools/ToolShell.tsx', ...TOOL_MATH],
  '/tools/heat.html': ['tools/heat.html', 'src/tools/HeatPlanner.tsx', 'src/tools/ToolShell.tsx', ...TOOL_MATH],
  '/tools/mileage.html': ['tools/mileage.html', 'src/tools/MileagePlanner.tsx', 'src/tools/ToolShell.tsx', ...MILEAGE_MATH],
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
