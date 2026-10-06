/**
 * Landing page content. Initiative 003 PR 3 fills this file with every
 * string from docs/initiatives/003-landing-page/copy.md; PR 1 needs only the
 * section ids, because the legacy entry guard derives its anchors from them.
 */

/** In-page section ids, in page order. Each is a valid `#anchor` on `/`. */
export const SECTION_IDS = ['top', 'join', 'how', 'you', 'coach', 'tools'] as const

export type SectionId = (typeof SECTION_IDS)[number]
