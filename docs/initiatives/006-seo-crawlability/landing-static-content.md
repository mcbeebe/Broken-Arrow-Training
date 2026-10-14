# 006 — Root page: crawlable text and JSON-LD

Part of [initiative 006](intent.md) (its intent and registry row arrive with the
tools-and-sitemap PR). Decisions for the root page.

**What ships.** In a build with `VITE_LANDING_ENABLED=true`, `index.html` gets
the hero's `<h1>`, subhead and lead and each section's `<h2>` and intro inside
`#root`, plus `Organization` and `WebApplication` JSON-LD. Both are generated
from `src/landing/content.ts` (`scripts/deploy/landing-static.ts`); nothing is
retyped. With the switch off, nothing is injected and `#root` stays empty.

**Hidden, not visible.** The landing CSS loads only with the page's chunk, so
visible static text paints first as unstyled browser-default text (measured at
390 px with the page chunk blocked: a wall of 18 px serif-less lines, then a
jump when React replaces it), and a signed-in visitor the guard forwards would
flash it too. The block is visually hidden (clip pattern, inline style, no
`display:none`), so first paint is what it was: blank. The cost: Google may
weigh visually hidden text less. It renders JavaScript and sees the mounted
page's real text anyway; the static copy is for crawlers that do not.
**Measured:** the mounted page is pixel-identical (1280 and 390 px) to a build
without the block.

**Offer.** `offers` is price 0, described by the page's own FAQ answer ("Attune
is free during the beta."), because the meta description and FAQ say so. It
carries no end date and no rating, review or `isAccessibleForFree`: the beta is
invite-only.

**If the page chunk fails to load,** `renderFallback` now replaces `#root`'s
children instead of appending, so the fallback `<h1>` isn't a second one.
