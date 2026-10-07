/**
 * Initiative 003 PR 4: the landing page's interactions, driven through the
 * rendered page the way a visitor would.
 *
 * The first block ports docs/initiatives/003-landing-page/reference/
 * interaction_tests.cjs (15 of its 19 cases; the palette case doesn't apply
 * because one palette ships, and its 3 form cases are covered by
 * InviteForm.test.tsx), as PR 4b changed them: one personality at a time, and
 * one outcome per athlete. The rest are plan.md § PR 4's and PR 4b's additions.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingPage } from '../../landing/LandingPage'
import { COACH, MAKE, PLAN, SPORTS, changesToday } from '../../landing/content'

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
  const reply = () => root.querySelector('[data-coach-reply]')!.textContent
  const question = () => root.querySelector('[data-coach-question]')!.textContent
  const limit = () => root.querySelector<HTMLElement>('[data-coach-limit]')!
  const ask = () => screen.getByRole('button', { name: COACH.askAnother })
  const reset = () => screen.getByRole('button', { name: COACH.reset })
  return { user, root, tabs, chartToggle, traits, live, chart, nameInput, pressed, status, shownName, shownStatus, bars, reply, question, limit, ask, reset }
}

const tab = (label: string) => ({ name: label })

describe('ported from reference/interaction_tests.cjs', () => {
  it('coach: approve swaps buttons for confirmation', async () => {
    const { user, root } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    expect(screen.queryByRole('button', { name: COACH.approve })).toBeNull()
    expect(screen.queryByRole('button', { name: COACH.keep })).toBeNull()
    expect(within(root.querySelector('#coach')!).getByRole('status', { name: COACH.approved })).toHaveTextContent(COACH.approved)
  })

  it('coach: blank name falls back', async () => {
    const { user, nameInput, root, shownName } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), '   ')
    expect(shownName()).toBe(COACH.fallbackName)
    expect(root.querySelector('[data-coach-initial]')!.textContent).toBe('Y')
  })

  it('coach: a personality replaces the last and summarizes (PR 4b: pick one)', async () => {
    const { user, traits, shownStatus } = setup()
    expect(shownStatus()).toBe('Your coach. Warm.')
    await user.click(traits.getByRole('button', { name: 'Funny' }))
    expect(shownStatus()).toBe('Your coach. Funny.')
  })

  it('coach: picking the chosen personality again keeps it (there is always one)', async () => {
    const { user, traits, shownStatus, pressed } = setup()
    await user.click(traits.getByRole('button', { name: 'Warm' }))
    expect(shownStatus()).toBe('Your coach. Warm.')
    expect(pressed(traits)).toEqual(['Warm'])
  })

  it('tabs: four athletes in order', () => {
    const { tabs, pressed } = setup()
    expect(tabs.getAllByRole('button').map(b => b.textContent)).toEqual(['Running', 'Trail', 'HYROX', 'Fitness'])
    expect(pressed(tabs)).toEqual(['Running'])
  })

  it('tabs: each athlete has distinct planned/today copy', async () => {
    const { user, tabs, live, root } = setup()
    const seen = new Set<string>()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      expect(live()).toHaveTextContent(s.planned)
      expect(live()).toHaveTextContent(s.today)
      expect(live()).toHaveTextContent(s.why)
      expect(root.textContent).toContain(s.who)
      seen.add(s.today)
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
  it('each athlete has their own morning: readings, ring and readiness line', async () => {
    const { user, tabs, live, root } = setup()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      for (const m of s.metrics) expect(live()).toHaveTextContent(`${m.value}`)
      expect([...live().querySelectorAll('[data-tone]')].map(d => [d.textContent, d.getAttribute('data-tone')])).toEqual(
        s.metrics.map(m => [m.note, m.tone]),
      )
      expect(root.querySelector('[data-ring]')!.getAttribute('data-ring')).toBe(String(s.readiness.value))
      expect(live()).toHaveTextContent(s.readiness.title)
    }
  })

  it('a changed session is struck through and labelled “Adjusted for today”; one that stands is not', async () => {
    const { user, tabs, root } = setup()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      const plan = root.querySelector<HTMLElement>('[data-morning-plan]')!
      if (changesToday(s.outcome)) {
        expect(plan.querySelector('s'), s.id).toHaveTextContent(s.planned)
        expect(plan).toHaveTextContent('Adjusted for today')
      } else {
        expect(plan.querySelector('s'), s.id).toBeNull()
        expect(plan).not.toHaveTextContent('Adjusted for today')
      }
    }
  })

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
    expect(chart().getAttribute('aria-label')).toBe(`${PLAN.chartLabel.race} ${PLAN.week9.changed}`)
    await user.click(chartToggle.getByRole('button', tab(PLAN.toggle.fit)))
    // No race is the Fitness athlete, whose session stands.
    expect(chart().getAttribute('aria-label')).toBe(`${PLAN.chartLabel.fit} ${PLAN.week9.same}`)
    expect(root.textContent).toContain(PLAN.intro.fit)
    for (const p of PLAN.phases.fit) expect(root.textContent).toContain(p)
  })

  it('week 9 is cut back with a dashed outline only when the morning changed today', async () => {
    const { user, tabs, bars, root, chart } = setup()
    for (const s of SPORTS) {
      await user.click(tabs.getByRole('button', tab(s.tab)))
      const today = bars()[PLAN.todayIndex]
      const caption = root.querySelector('figcaption')!
      if (changesToday(s.outcome)) {
        expect(today.h, s.id).toBeLessThan(today.planned)
        expect(chart().querySelector('[data-bar-outline]')).not.toBeNull()
        expect(caption).toHaveTextContent(PLAN.captionOutline)
      } else {
        expect(today.h, s.id).toBe(today.planned)
        expect(chart().querySelector('[data-bar-outline]')).toBeNull()
        expect(caption).not.toHaveTextContent(PLAN.captionOutline)
        expect(chart().getAttribute('aria-label')).toContain(PLAN.week9.same)
      }
      expect(caption).toHaveTextContent(PLAN.captionExample)
      expect(today.label).toHaveTextContent(PLAN.todayLabel)
    }
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
    expect(document.activeElement).toBe(within(root.querySelector('#coach')!).getByRole('status', { name: COACH.approved }))
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

  it('the status line is exactly “Your coach. Warm.” by default', () => {
    expect(setup().shownStatus()).toBe('Your coach. Warm.')
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

  it('shows the five personalities in order, exactly one pressed', async () => {
    const { user, traits, pressed } = setup()
    expect(traits.getAllByRole('button').map(b => b.textContent)).toEqual(MAKE.traits.map(t => t.label))
    await user.click(traits.getByRole('button', { name: 'Old School' }))
    expect(pressed(traits)).toEqual(['Old School'])
  })

  it.each(MAKE.traits.map(t => [t.label, t.id] as const))('%s answers every question in its own words', async (label, id) => {
    // One personality change plus two questions is exactly the try limit.
    const { user, traits, reply, ask } = setup()
    if (id !== 'warm') await user.click(traits.getByRole('button', { name: label }))
    for (const [i, q] of COACH.questions.entries()) {
      if (i > 0) await user.click(ask())
      expect(reply()).toBe(q.replies[id])
    }
  })

  it('no two personalities say the same thing', () => {
    for (const q of COACH.questions) expect(new Set(Object.values(q.replies)).size).toBe(MAKE.traits.length)
  })
})

describe('ask something else, reset and the try limit', () => {
  it('cycles the questions and keeps the chosen voice', async () => {
    const { user, traits, question, reply, ask } = setup()
    await user.click(traits.getByRole('button', { name: 'Direct' }))
    await user.click(ask())
    expect(question()).toBe(COACH.questions[1].athlete)
    expect(reply()).toBe(COACH.questions[1].replies.direct)
  })

  it('shows Approve only with a proposal', async () => {
    const { user, ask } = setup()
    expect(screen.getByRole('button', { name: COACH.approve })).toBeInTheDocument()
    await user.click(ask())
    expect(screen.queryByRole('button', { name: COACH.approve })).toBeNull()
    expect(screen.queryByText(COACH.proposalHeading)).toBeNull()
    await user.click(ask())
    expect(screen.getByRole('button', { name: COACH.approve })).toBeInTheDocument()
    expect(screen.getAllByText('Long run, 90 min').length).toBeGreaterThan(0)
  })

  it('a new question brings back its own Approve', async () => {
    const { user, ask } = setup()
    await user.click(screen.getByRole('button', { name: COACH.approve }))
    await user.click(ask())
    await user.click(ask())
    expect(screen.getByRole('button', { name: COACH.approve })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: COACH.approved })).toBeNull()
  })

  it('Reset goes back to Mira, Warm, the first question, not approved', async () => {
    const { user, traits, nameInput, ask, reset, shownName, shownStatus, question } = setup()
    await user.clear(nameInput())
    await user.type(nameInput(), 'Kip')
    await user.click(traits.getByRole('button', { name: 'Funny' }))
    await user.click(ask())
    await user.click(reset())
    expect(shownName()).toBe(MAKE.defaultName)
    expect(nameInput().value).toBe(MAKE.defaultName)
    expect(shownStatus()).toBe('Your coach. Warm.')
    expect(question()).toBe(COACH.questions[0].athlete)
    expect(screen.getByRole('button', { name: COACH.approve })).toBeInTheDocument()
  })

  it(`after ${COACH.tryLimit} changes, offers an invite and stops changing`, async () => {
    const { user, traits, ask, reply, limit, nameInput, pressed } = setup()
    expect(limit().textContent).toBe('')
    await user.click(traits.getByRole('button', { name: 'Funny' }))
    await user.click(ask())
    expect(limit().textContent).toBe('')
    await user.click(traits.getByRole('button', { name: 'Data Nerd' }))
    expect(limit()).toHaveTextContent(`${COACH.limitBefore}${COACH.limitLink}${COACH.limitTail}${MAKE.defaultName}${COACH.limitEnd}`)
    expect(within(limit()).getByRole('link', { name: COACH.limitLink })).toHaveAttribute('href', '#join')

    const before = reply()
    await user.click(traits.getByRole('button', { name: 'Old School' }))
    await user.click(ask())
    expect(reply()).toBe(before)
    expect(pressed(traits)).toEqual(['Data Nerd'])
    expect(ask()).toHaveAttribute('aria-disabled', 'true')
    expect(traits.getByRole('button', { name: 'Old School' })).toHaveAttribute('aria-disabled', 'true')
    expect(traits.getByRole('button', { name: 'Data Nerd' })).not.toHaveAttribute('aria-disabled')

    // The name is free, and the message follows it.
    await user.clear(nameInput())
    await user.type(nameInput(), 'Kip')
    expect(limit()).toHaveTextContent('to keep talking to Kip.')
  })

  it('Reset after the limit puts the demo back but gives no tries back', async () => {
    const { user, traits, ask, reset, limit, shownStatus } = setup()
    await user.click(ask())
    await user.click(ask())
    await user.click(ask())
    await user.click(reset())
    expect(shownStatus()).toBe('Your coach. Warm.')
    expect(limit().textContent).not.toBe('')
    await user.click(traits.getByRole('button', { name: 'Funny' }))
    expect(shownStatus()).toBe('Your coach. Warm.')
  })

  it('the limit message is a polite status region that exists before it fills in', () => {
    const { limit } = setup()
    expect(limit()).toHaveAttribute('role', 'status')
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

  it.each(['{Enter}', ' '])('tabs, chart toggle, personalities, Approve, Ask and Reset all work with %j', async key => {
    const { user, tabs, chartToggle, traits, pressed, status, root, ask, reset, question } = setup()
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
    expect(within(root.querySelector('#coach')!).getByRole('status', { name: COACH.approved })).toHaveTextContent(COACH.approved)

    ask().focus()
    await user.keyboard(key)
    expect(question()).toBe(COACH.questions[1].athlete)

    reset().focus()
    await user.keyboard(key)
    expect(question()).toBe(COACH.questions[0].athlete)
  })

  it('the coach name is typed from the keyboard', async () => {
    const { user, nameInput, root } = setup()
    nameInput().focus()
    await user.keyboard('{Control>}a{/Control}Ada')
    expect(root.querySelector('#coach')).toHaveTextContent('Ada')
  })
})
