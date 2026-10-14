# 006 — Make the public pages crawlable

**Date:** 2026-10-14 · **Status:** Open
**Artifacts:** intent.md (this)

## Problem

Every public page is an empty shell that a script fills in. The root page is
a 3.4 KB file with an empty `<div id="root">`; the four free tools are 1.4 KB
shells with a title and a description and nothing else. A crawler that does
not run JavaScript, or runs it late, sees no heading, no text and no
structured data. The tools have no canonical URL and no share tags, so a
shared link has no preview. The sitemap carries no `<lastmod>`.

## Proposed outcome

Checkable when all of these are true:

- **Tools.** Each `tools/*.html` ships, in its own HTML, a canonical link,
  Open Graph and Twitter tags using the existing `/og-image.png`, an `<h1>`
  and a one-sentence description inside `#root`, and `WebApplication`
  JSON-LD. React replaces the static text on mount (no hydration), so the
  mounted page is unchanged; before the script runs a visitor sees the plain
  heading and description, unstyled, for a moment.
- **Sitemap.** Every `<url>` in the built `sitemap.xml` has a `<lastmod>`,
  stamped from the AUTHOR date of the last commit that touched the page's
  sources, including the engines a tool computes with (`SITEMAP_SOURCES`). It
  needs git history: deploy.yml checks out with `fetch-depth: 0`, and a build
  in CI without it fails rather than stamping the build date (a local build
  warns and uses the build date).
- **Root page** (separate PR, and only when the landing page is launched).
  The built `index.html` carries the hero heading, each section's heading and
  intro, and `Organization` / `WebApplication` JSON-LD, all generated from
  `src/landing/content.ts`. When the landing switch is off, nothing is
  injected.
- **Held by checks.** `check-site-layout.mjs` and `seo.test.ts` fail when a
  page loses any of the above.

## Affected parties / surfaces

- **Surface:** the built head and body markup of `/` and `/tools/*.html`, and
  `sitemap.xml`. Both ship through `deploy.yml` to attune.coach.
- **Not touched:** the app (`/app/`, which stays `noindex`; robots.txt still
  blocks nothing), the guard's behaviour, the landing page's words.

## Out of scope

- Rich-result eligibility (ratings, reviews, offers on the tools). No claims
  beyond what each page already says.
- Server-rendering the whole landing page or the tools' interiors.
