/**
 * Initiative 003 PR 5: how public/og-image.png was made. A design record, not
 * part of the build (playwright-core is not a project dependency).
 *
 * It screenshots the landing page at 1200×630 with the switch on: the hero
 * headline and lede beside the Running “This morning” card, which is what
 * copy.md's og:image alt text describes. The header links, the invite form
 * and the athlete tabs are hidden, so the image shows no controls that do
 * nothing in a link preview.
 *
 *   VITE_LANDING_ENABLED=true npm run build && npx vite preview --port 4173 &
 *   CHROMIUM=/path/to/chrome node og-image.mjs public/og-image.png
 *
 * Then save it as an optimized RGB PNG. check-site-layout.mjs fails the build
 * unless it is a 1200×630 PNG.
 */
import { chromium } from 'playwright-core'

const out = process.argv[2] ?? 'og-image.png'
const url = process.argv[3] ?? 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('text=This morning')
await page.addStyleTag({
  content: `
  header nav, header a[href="#join"], header a[href="/app/"] { display: none !important }
  #root form { display: none !important }
`,
})
await page.evaluate(() => {
  for (const el of document.querySelectorAll('p')) if (/Already in\?/.test(el.textContent)) el.style.display = 'none'
  const label = document.getElementById('morning-tabs')
  if (!label) throw new Error('the athlete tabs’ label (#morning-tabs) is gone')
  label.style.display = 'none'
  label.nextElementSibling.style.display = 'none'
  window.scrollTo(0, 0)
})
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()
