/**
 * Initiative 003 PR 4: the landing page's interactions, driven through the
 * rendered page the way a visitor would.
 *
 * The first block ports docs/initiatives/003-landing-page/reference/
 * interaction_tests.cjs (15 of its 19 cases; the palette case doesn't apply
 * because one palette ships, and its 3 form cases are covered by
 * InviteForm.test.tsx). The rest are plan.md § PR 4's additions.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingPage } from '../../landing/LandingPage'
import { COACH, MAKE, PLAN, SPORTS } from '../../landing/content'

function setup() {
  const user = userEvent.setup()
  const utils = render(<LandingPage />)
  const root = utils.container
  const tabs = within(root.querySelector<HTMLElement>('[role="group"][aria-labelledby="morning-tabs"]')!)
  const chartToggle = within(screen.getByRole('group', { name: PLAN.toggleLabel }))
  const traits = within(root.querySelector<HTMLElement>('[role="group"][aria-labelledby="coach-traits"]')!)
  const live = () => root.querySelector<HTMLElement>('[aria-live="polite"]')!
  const chart = () => root.querySelector<HTMLElement>('[role="img"]')!
  const nameInput = () => root.querySelector<HTMLInputElement>('#coach-name')!
  const pressed = (scope: typeof tabs) =>
    scope.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)
  const status = () => root.querySelector('#coach')!.textContent ?? ''
  /** The demo header's name line and status line, exactly as shown. */
  const shownName = () => root.querySelector('[data-coach-name]')!.textContent
  const shownStatus = () => root.querySelector('[data-coach-status]')!.textContent
  /** Planned (outline) and actual heights of each week, in px. */
  const bars = () =>
    [...chart().querySelectorAll<HTMLElement>('[data-bar]')].map(b => {
      const outline = b.parentElement!.querySelector<HTMLElement>('[data-bar-outline]')
      return {
        today: b.dataset.bar === 'today',
        h: parseInt(b.style.height, 10),
        planned: parseInt((outline ?? b).style.height, 10),
        label: b.parentElement!.querySelector<HTMLElement>('[data-bar-label]'),
      }
    })
  return { user, root, tabs, chartToggle, traits, live, chart, nameInput, pressed, status, shownName, shownStatus, bars }
}

const tab = (label: string) => ({ name: label })

describe('ported from reference/interaction_tests.cjs', () => {
  it('coach: approve swaps buttons for confirmation', async () => {
    const { user, root } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    expect(screen.queryByRole('button', { name: COACH.approve })).toBeNull()
    expect(screen.queryByRole('button', { name: COACH.keep })).toBeNull()
    expect(within(root.querySelector('#coach')!).getByRole('status')).toHaveTextContent(COACH.approved)
  })

  it('coach: blank name falls back', async () => {
    const { user, nameInput, root, shownName } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), '   ')
    expect(shownName()).toBe(COACH.fallbackName)
    expect(root.querySelector('[data-coach-initial]')!.textContent).toBe('Y')
  })

  it('coach: traits toggle and summarize', async () => {
    const { user, traits, status } = setup()
    expect(status()).toContain('Your coach. Warm, Direct.')
    await user.click(traits.getByRole('button', { name: 'Funny' }))
    expect(status()).toContain('Your coach. Funny, Warm, Direct.')
  })

  it('coach: no traits prompts to pick', async () => {
    const { user, traits, shownStatus } = setup()
    await user.click(traits.getByRole('button', { name: 'Warm' }))
    await user.click(traits.getByRole('button', { name: 'Direct' }))
    // copy.md: the prompt alone, without “Your coach.” (the reference HTML differs; copy.md wins).
    expect(shownStatus()).toBe(COACH.noTraits)
  })

  it('tabs: four athletes in order', () => {
    const { tabs, pressed } = setup()
    expect(tabs.getAllByRole('button').map(b => b.textContent)).toEqual(['Running', 'Trail', 'HYROX', 'Fitness'])
    expect(pressed(tabs)).toEqual(['Running'])
  })

  it('tabs: each athlete has distinct planned/adjusted copy', async () => {
    const { user, tabs, live, root } = setup()
    const seen = new Set<string>()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      expect(live()).toHaveTextContent(s.planned)
      expect(live()).toHaveTextContent(s.adjusted)
      expect(live()).toHaveTextContent(s.why)
      expect(root.textContent).toContain(s.who)
      seen.add(s.adjusted)
      expect(live().textContent).toContain(s.adjusted)
    }
    expect(seen.size).toBe(4)
  })

  it('tabs: Fitness switches chart to No race', async () => {
    const { user, tabs, chartToggle, pressed, root } = setup()
    await user.click(tabs.getByRole('button', tab('Fitness')))
    expect(pressed(chartToggle)).toEqual([PLAN.toggle.fit])
    expect(root.textContent).toContain(PLAN.intro.fit)
  })

  it('tabs: HYROX keeps Racing chart', async () => {
    const { user, tabs, chartToggle, pressed, root } = setup()
    await user.click(tabs.getByRole('button', tab('HYROX')))
    expect(pressed(chartToggle)).toEqual([PLAN.toggle.race])
    expect(root.textContent).toContain(SPORTS.find(s => s.id === 'hyrox')!.who)
  })

  it('chart: No race toggle moves hero to Fitness', async () => {
    const { user, tabs, chartToggle, pressed } = setup()
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.fit)))
    expect(pressed(tabs)).toEqual(['Fitness'])
  })

  it('chart: Racing toggle from Fitness returns to Running', async () => {
    const { user, tabs, chartToggle, pressed } = setup()
    await user.click(tabs.getByRole('button', tab('Fitness')))
    expect(pressed(chartToggle)).toEqual([PLAN.toggle.fit])
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.race)))
    expect(pressed(tabs)).toEqual(['Running'])
  })

  it('chart: Racing toggle keeps current race sport', async () => {
    const { user, tabs, chartToggle, pressed } = setup()
    await user.click(tabs.getByRole('button', tab('Trail')))
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.race)))
    expect(pressed(tabs)).toEqual(['Trail'])
  })

  it('chart: 16 bars, only week 9 is today and lower than planned', () => {
    const { bars } = setup()
    const b = bars()
    expect(b).toHaveLength(16)
    expect(b.filter(x => x.today)).toHaveLength(1)
    expect(b.findIndex(x => x.today)).toBe(8)
    expect(b[8].h).toBeLessThan(b[8].planned)
    expect(parseInt(b[8].label!.style.bottom, 10)).toBeGreaterThan(b[8].planned)
  })

  it('chart: fitness plan has an easier week every 4th week', async () => {
    const { user, chartToggle, bars } = setup()
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.fit)))
    const h = bars().map(x => x.planned)
    // The race data dips at some of these weeks too; make sure this is the No race chart.
    expect(h).toEqual(PLAN.bars.fit.map(v => Math.round((v / PLAN.max) * PLAN.plot)))
    for (const i of [3, 7, 11, 15]) expect(h[i], `week ${i + 1}`).toBeLessThan(h[i - 1])
  })

  it('chart: race plan tapers over the last 3 weeks', () => {
    const h = setup().bars().map(x => x.planned)
    expect(h[13]).toBeLessThan(h[12])
    expect(h[14]).toBeLessThan(h[13])
    expect(h[15]).toBeLessThan(h[14])
  })

  it('chart: bar heights fit the 236px plot with room for the label', async () => {
    const { user, chartToggle, bars } = setup()
    for (const mode of [PLAN.toggle.race, PLAN.toggle.fit]) {
      await user.click(chartToggle.getByRole('button', tab(mode)))
      expect(chartToggle.getByRole('button', tab(mode))).toHaveAttribute('aria-pressed', 'true')
      for (const b of bars()) {
        expect(b.planned).toBeLessThanOrEqual(PLAN.plot)
        if (b.today) expect(parseInt(b.label!.style.bottom, 10)).toBeLessThanOrEqual(236 - 16)
      }
    }
  })
})

describe('tabs', () => {
  it('aria-pressed follows the selection, one at a time', async () => {
    const { user, tabs, pressed } = setup()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      expect(pressed(tabs)).toEqual([s.tab])
    }
  })

  it('the chart caption follows the sport', async () => {
    const { user, tabs, root } = setup()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      expect(root.querySelector('figcaption')).toHaveTextContent(s.chartCaption)
    }
  })
})

describe('chart', () => {
  it('the toggle changes the label, the intro and the phases', async () => {
    const { user, chartToggle, chart, root } = setup()
    expect(chart().getAttribute('aria-label')).toBe(PLAN.chartLabel.race)
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.fit)))
    expect(chart().getAttribute('aria-label')).toBe(PLAN.chartLabel.fit)
    expect(root.textContent).toContain(PLAN.intro.fit)
    for (const p of PLAN.phases.fit) expect(root.textContent).toContain(p)
  })

  it('every bar is drawn at round(v / 88 * 200) in both modes', async () => {
    const { user, chartToggle, bars } = setup()
    for (const [mode, data] of [[PLAN.toggle.race, PLAN.bars.race], [PLAN.toggle.fit, PLAN.bars.fit]] as const) {
      await user.click(chartToggle.getByRole('button', tab(mode)))
      expect(bars().map(b => b.planned)).toEqual(data.map(v => Math.round((v / PLAN.max) * PLAN.plot)))
    }
  })
})

describe('coach demo', () => {
  it('“Keep my plan” does nothing in the demo', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: COACH.keep }))
    expect(screen.getByRole('button', { name: COACH.approve })).toBeInTheDocument()
  })

  it('Approve moves focus to the confirmation, not off the page', async () => {
    const { user, root } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    expect(document.activeElement).toBe(within(root.querySelector('#coach')!).getByRole('status'))
  })

  it('the focused confirmation has an accessible name (role="status" takes none from its text)', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    expect(screen.getByRole('status', { name: COACH.approved })).toBe(document.activeElement)
  })

  it('typing a name after approving does not pull focus back to the confirmation', async () => {
    const { user, nameInput } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    await user.click(nameInput())
    await user.type(nameInput(), 'x')
    expect(document.activeElement).toBe(nameInput())
  })

  it('the input and mic stay disabled', () => {
    const { root } = setup()
    expect(root.querySelector<HTMLInputElement>('#coach-ask')!.disabled).toBe(true)
    expect(screen.getByRole('button', { name: COACH.micLabel })).toBeDisabled()
  })
})

describe('persona', () => {
  it('the header shows the name trimmed', async () => {
    const { user, nameInput, shownName, root } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), '  kip  ')
    expect(shownName()).toBe('kip')
    expect(root.querySelector('[data-coach-initial]')!.textContent).toBe('K')
  })

  it('the status line is exactly “Your coach. Warm, Direct.” by default', () => {
    expect(setup().shownStatus()).toBe('Your coach. Warm, Direct.')
  })

  it('the name updates the header, the initial and the placeholder', async () => {
    const { user, nameInput, root } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), 'kip')
    expect(root.querySelector('#coach')).toHaveTextContent('kip')
    expect(root.querySelector('[data-coach-initial]')).toHaveTextContent('K')
    expect(root.querySelector<HTMLInputElement>('#coach-ask')!.placeholder).toBe('Ask kip anything')
  })

  it('stops at 30 characters, like the app', async () => {
    const { user, nameInput } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), 'x'.repeat(40))
    expect(nameInput().value).toHaveLength(MAKE.nameMaxLength)
  })

  it('lists traits in the canonical order, whatever order they were picked in', async () => {
    const { user, traits, status } = setup()
    await user.click(traits.getByRole('button', { name: 'Warm' }))
    await user.click(traits.getByRole('button', { name: 'Direct' }))
    for (const label of ['Chill', 'Funny', 'Data Nerd']) await user.click(traits.getByRole('button', { name: label }))
    expect(status()).toContain('Your coach. Funny, Data Nerd, Chill.')
  })

  it('aria-pressed follows each trait', async () => {
    const { user, traits, pressed } = setup()
    await user.click(traits.getByRole('button', { name: 'Strict' }))
    await user.click(traits.getByRole('button', { name: 'Warm' }))
    expect(pressed(traits)).toEqual(['Strict', 'Direct'])
  })
})

describe('keyboard', () => {
  it('every control is reachable by Tab, in page order, and none is skipped', async () => {
    const { user, root } = setup()
    const controls = [
      ...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), summary'),
    ].filter(el => !el.closest('[aria-hidden="true"]'))
    const reached: HTMLElement[] = []
    for (let i = 0; i < controls.length; i++) {
      await user.tab()
      reached.push(document.activeElement as HTMLElement)
    }
    expect(reached).toEqual(controls)
  })

  it.each(['{Enter}', ' '])('tabs, chart toggle, traits and Approve all work with %j', async key => {
    const { user, tabs, chartToggle, traits, pressed, status, root } = setup()
    tabs.getByRole('button', tab('HYROX')).focus()
    await user.keyboard(key)
    expect(pressed(tabs)).toEqual(['HYROX'])

    chartToggle.getByRole('button', tab(PLAN.toggle.fit)).focus()
    await user.keyboard(key)
    expect(pressed(tabs)).toEqual(['Fitness'])

    traits.getByRole('button', { name: 'Funny' }).focus()
    await user.keyboard(key)
    expect(status()).toContain('Funny')

    screen.getByRole('button', { name: COACH.approve }).focus()
    await user.keyboard(key)
    expect(within(root.querySelector('#coach')!).getByRole('status')).toHaveTextContent(COACH.approved)
  })

  it('the coach name is typed from the keyboard', async () => {
    const { user, nameInput, root } = setup()
    nameInput().focus()
    await user.keyboard('{Control>}a{/Control}Ada')
    expect(root.querySelector('#coach')).toHaveTextContent('Ada')
  })
})
