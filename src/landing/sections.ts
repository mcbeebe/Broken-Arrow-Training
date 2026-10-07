/**
 * The landing page's in-page section ids. Its own module because the root
 * page's guard (legacyEntry.ts) needs only this: importing content.ts there
 * would put every word of the page into the guard's 10 KB static closure,
 * downloaded by every installed app on its way to /app/.
 */

/** In-page section ids, in page order. Each is a valid `#anchor` on `/`. */
export const SECTION_IDS = ['top', 'join', 'how', 'you', 'coach', 'tools'] as const

export type SectionId = (typeof SECTION_IDS)[number]
