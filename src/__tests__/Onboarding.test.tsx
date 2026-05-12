import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Onboarding from '../components/Onboarding'
import type { OnboardingConfig } from '../hooks/useOnboarding'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function clickContinue() {
  const btn = screen.getByRole('button', { name: /continue|create my plan/i })
  fireEvent.click(btn)
}

function clickFinish() {
  const btn = screen.getByRole('button', { name: /create my plan/i })
  fireEvent.click(btn)
}

function getContinueButton() {
  return screen.queryByRole('button', { name: /continue/i }) as HTMLButtonElement | null
}

// Walks every step picking the "happy path" answers needed to reach the final
// step, optionally overriding values. Returns the captured config from onComplete.
function walkHappyPath(overrides: Partial<{
  raceType: 'Trail / Road Race' | 'Hyrox' | 'General Fitness'
  raceDistance: string
  experience: string
  daysPerWeek: number
  longRunDay: string
  weakStation: string
  anchorOption: string
  anchorTime: string
  anchorBpm: string
  weeklyMileage: string
  injury: string
  equipment: string[]
  strength: string
  crossTraining: string[]
  trainingTimes: string[]
  scheduleNote: string
  wearable: string
  name: string
  age: string
  maxHR: string
  ftp: string
}> = {}): OnboardingConfig {
  const o = {
    raceType: 'Trail / Road Race',
    raceDistance: 'Marathon',
    experience: 'Intermediate',
    daysPerWeek: 5,
    longRunDay: 'Saturday',
    weakStation: 'Wall Balls',
    anchorOption: 'race_5k',
    anchorTime: '21:30',
    weeklyMileage: '20',
    injury: 'No injuries',
    equipment: ['Track', 'Trails'],
    strength: '2x',
    crossTraining: ['Cycling'],
    trainingTimes: ['Early morning'],
    scheduleNote: '',
    wearable: 'Garmin Watch',
    name: 'Jenn',
    age: '41',
    maxHR: '',
    ftp: '',
    ...overrides,
  }

  const onComplete = vi.fn()
  render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)

  // Step 0: Race type
  fireEvent.click(screen.getByText(o.raceType))
  clickContinue()

  // Step 1: Race name + date
  const raceNameInput = screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i)
  fireEvent.change(raceNameInput, { target: { value: 'Test Race' } })
  clickContinue()

  // Step 2 (trail only): Race distance — skipped for hyrox/general via visibleSteps
  if (o.raceType === 'Trail / Road Race') {
    // Distance options use exact-match labels for short names (5K, 10K, Marathon)
    const target = o.raceDistance === 'Marathon'
      ? screen.getByText(/^Marathon$/)
      : o.raceDistance === '5K'
        ? screen.getByText(/^5K$/)
        : screen.getByText(o.raceDistance)
    fireEvent.click(target)
    clickContinue()
  }

  // Step 3: Experience
  fireEvent.click(screen.getByText(o.experience))
  clickContinue()

  // Step 4: Days per week
  fireEvent.click(screen.getByText(`${o.daysPerWeek} Days`))
  clickContinue()

  // Step 5: Long run day OR weak station
  if (o.raceType === 'Hyrox') {
    fireEvent.click(screen.getByText(o.weakStation))
  } else {
    fireEvent.click(screen.getByText(o.longRunDay))
  }
  clickContinue()

  // Step 6: Fitness baseline (anchor + mileage + injury)
  const anchorSelect = screen.getByRole('combobox')
  fireEvent.change(anchorSelect, { target: { value: o.anchorOption } })
  if (o.anchorOption !== 'none') {
    if (o.anchorOption === 'lthr') {
      const bpmInput = screen.getByPlaceholderText('bpm')
      fireEvent.change(bpmInput, { target: { value: o.anchorBpm ?? '' } })
    } else {
      const timeInput = screen.getByPlaceholderText(/mm:ss|hh:mm:ss/)
      fireEvent.change(timeInput, { target: { value: o.anchorTime } })
    }
  }
  if (o.weeklyMileage) {
    const mileageInput = screen.getByPlaceholderText('e.g. 20')
    fireEvent.change(mileageInput, { target: { value: o.weeklyMileage } })
  }
  fireEvent.click(screen.getByText(o.injury))
  clickContinue()

  // Step 7: Equipment access (multi-select)
  o.equipment.forEach(label => fireEvent.click(screen.getByText(label)))
  clickContinue()

  // Step 8: Strength + cross-training
  fireEvent.click(screen.getByRole('button', { name: o.strength }))
  o.crossTraining.forEach(label => fireEvent.click(screen.getByText(label)))
  clickContinue()

  // Step 9: Schedule & constraints
  o.trainingTimes.forEach(label => fireEvent.click(screen.getByText(label)))
  if (o.scheduleNote) {
    const textarea = screen.getByPlaceholderText(/Travel May/)
    fireEvent.change(textarea, { target: { value: o.scheduleNote } })
  }
  clickContinue()

  // Step 10: Wearable
  fireEvent.click(screen.getByText(o.wearable))
  clickContinue()

  // Step 11: Personal data
  const nameInput = screen.getByPlaceholderText('e.g. Jenn')
  fireEvent.change(nameInput, { target: { value: o.name } })
  const ageInput = screen.getByPlaceholderText('e.g. 41')
  fireEvent.change(ageInput, { target: { value: o.age } })
  if (o.maxHR) {
    const maxHRLabel = screen.getByText(/Max Heart Rate/)
    const maxHRInput = maxHRLabel.parentElement!.querySelector('input')!
    fireEvent.change(maxHRInput, { target: { value: o.maxHR } })
  }
  if (o.ftp) {
    const ftpInput = screen.getByPlaceholderText(/250.*watts/)
    fireEvent.change(ftpInput, { target: { value: o.ftp } })
  }
  clickFinish()

  expect(onComplete).toHaveBeenCalledTimes(1)
  return onComplete.mock.calls[0][0] as OnboardingConfig
}

describe('Onboarding', () => {
  describe('happy path', () => {
    it('captures all answers and emits a complete OnboardingConfig', () => {
      const cfg = walkHappyPath()

      expect(cfg).toMatchObject({
        raceType: 'trail',
        raceName: 'Test Race',
        raceDistance: 'marathon',
        experienceLevel: 'intermediate',
        trainingDaysPerWeek: 5,
        longRunDay: 'Saturday',
        wearable: 'garmin',
        athleteName: 'Jenn',
        age: 41,
      })
    })

    it('captures all NEW fields correctly', () => {
      const cfg = walkHappyPath()

      expect(cfg.fitnessAnchor).toEqual({ type: 'race_5k', valueSeconds: 1290 })
      expect(cfg.currentWeeklyMileage).toBe(20)
      expect(cfg.injuryStatus).toBe('none')
      expect(cfg.equipmentAccess).toEqual(['track', 'trails'])
      expect(cfg.strengthDaysPerWeek).toBe(2)
      expect(cfg.crossTrainingModes).toEqual(['cycling'])
      expect(cfg.preferredTrainingTimes).toEqual(['early_am'])
    })

    it('estimates max HR from age when maxHR is left blank', () => {
      const cfg = walkHappyPath({ age: '40', maxHR: '' })
      expect(cfg.maxHR).toBe(180) // 220 - 40
    })

    it('uses provided maxHR when supplied', () => {
      const cfg = walkHappyPath({ age: '40', maxHR: '195' })
      expect(cfg.maxHR).toBe(195)
    })
  })

  describe('race-distance step (Q1)', () => {
    it('shows the race-distance step when raceType is trail/road', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/Trail \/ Road Race/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      expect(screen.getByText(/race distance/i)).toBeInTheDocument()
      expect(screen.getByText(/^Marathon$/)).toBeInTheDocument()
      expect(screen.getByText(/100 Mile/)).toBeInTheDocument()
    })

    it('skips the race-distance step for Hyrox', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/^Hyrox$/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Hyrox San Francisco/), { target: { value: 'Hyrox SF' } })
      clickContinue()
      expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
      expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()
    })

    it('skips the race-distance step for General Fitness', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/General Fitness/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Summer Fitness/), { target: { value: 'Block' } })
      clickContinue()
      expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
      expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()
    })

    it('omits raceDistance when raceType is Hyrox', () => {
      const cfg = walkHappyPath({ raceType: 'Hyrox', weakStation: 'Wall Balls' })
      expect(cfg.raceType).toBe('hyrox')
      expect(cfg.raceDistance).toBeUndefined()
    })

    it('omits raceDistance when raceType is General Fitness', () => {
      const cfg = walkHappyPath({ raceType: 'General Fitness' })
      expect(cfg.raceType).toBe('general')
      expect(cfg.raceDistance).toBeUndefined()
    })

    it('captures the user-selected race distance for trail races', () => {
      const cfg = walkHappyPath({ raceDistance: '50K Ultra' })
      expect(cfg.raceDistance).toBe('50k')
    })

    it('Back from experience returns to race-distance for trail', () => {
      render(<Onboarding onComplete={vi.fn()} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/Trail \/ Road Race/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'Foo' } })
      clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      // Now on experience step. Click back arrow.
      const backArrow = document.querySelector('.fixed .flex.items-center.justify-between button') as HTMLButtonElement
      fireEvent.click(backArrow)
      expect(screen.getByText(/race distance/i)).toBeInTheDocument()
    })

    it('Back from experience returns to race-name for hyrox (race-distance skipped)', () => {
      render(<Onboarding onComplete={vi.fn()} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/^Hyrox$/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Hyrox San Francisco/), { target: { value: 'Foo' } })
      clickContinue()
      const backArrow = document.querySelector('.fixed .flex.items-center.justify-between button') as HTMLButtonElement
      fireEvent.click(backArrow)
      expect(screen.getByText(/tell us about your race/i)).toBeInTheDocument()
      expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
    })
  })

  describe('days per week', () => {
    it('allows 7 days/week', () => {
      const cfg = walkHappyPath({ daysPerWeek: 7 })
      expect(cfg.trainingDaysPerWeek).toBe(7)
    })

    it.each([3, 4, 5, 6, 7])('shows %i days option', (n) => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      // race-distance step
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      expect(screen.getByText(`${n} Days`)).toBeInTheDocument()
    })
  })

  describe('fitness anchor', () => {
    it('emits fitnessAnchor=undefined when anchor type is "none"', () => {
      const cfg = walkHappyPath({ anchorOption: 'none' })
      expect(cfg.fitnessAnchor).toBeUndefined()
    })

    it('emits fitnessAnchor=undefined when time field is left empty', () => {
      const cfg = walkHappyPath({ anchorOption: 'race_5k', anchorTime: '' })
      expect(cfg.fitnessAnchor).toBeUndefined()
    })

    it('emits fitnessAnchor=undefined when time field has malformed input', () => {
      const cfg = walkHappyPath({ anchorOption: 'race_5k', anchorTime: 'abc' })
      expect(cfg.fitnessAnchor).toBeUndefined()
    })

    it('parses an hh:mm:ss marathon time correctly', () => {
      const cfg = walkHappyPath({ anchorOption: 'race_marathon', anchorTime: '3:30:15' })
      expect(cfg.fitnessAnchor).toEqual({ type: 'race_marathon', valueSeconds: 12615 })
    })

    it('captures LTHR as bpm', () => {
      const cfg = walkHappyPath({ anchorOption: 'lthr', anchorBpm: '165' })
      expect(cfg.fitnessAnchor).toEqual({ type: 'lthr', bpm: 165 })
    })

    it('captures self-reported easy pace as seconds', () => {
      const cfg = walkHappyPath({ anchorOption: 'easy_pace', anchorTime: '9:15' })
      expect(cfg.fitnessAnchor).toEqual({ type: 'easy_pace', valueSeconds: 555 })
    })
  })

  describe('weekly mileage', () => {
    it('omits currentWeeklyMileage when blank', () => {
      const cfg = walkHappyPath({ weeklyMileage: '' })
      expect(cfg.currentWeeklyMileage).toBeUndefined()
    })

    it('parses decimal mileage', () => {
      const cfg = walkHappyPath({ weeklyMileage: '12.5' })
      expect(cfg.currentWeeklyMileage).toBe(12.5)
    })
  })

  describe('injury status', () => {
    it.each([
      ['No injuries', 'none'],
      ['Returning from injury', 'returning'],
      ['Currently injured', 'current'],
    ])('captures %s as %s', (label, expected) => {
      const cfg = walkHappyPath({ injury: label })
      expect(cfg.injuryStatus).toBe(expected)
    })
  })

  describe('equipment', () => {
    it('captures multiple equipment selections', () => {
      const cfg = walkHappyPath({ equipment: ['Track', 'Hills', 'Gym'] })
      expect(cfg.equipmentAccess).toEqual(['track', 'hills', 'gym'])
    })

    it('toggles selection off when clicked twice', () => {
      const cfg = walkHappyPath({ equipment: ['Track', 'Track', 'Hills'] })
      expect(cfg.equipmentAccess).toEqual(['hills'])
    })
  })

  describe('strength & cross-training', () => {
    it.each([
      ['None', 0],
      ['1x', 1],
      ['2x', 2],
      ['3+', 3],
    ])('captures strength frequency %s as %i', (label, expected) => {
      const cfg = walkHappyPath({ strength: label })
      expect(cfg.strengthDaysPerWeek).toBe(expected)
    })

    it('makes cross-training optional', () => {
      const cfg = walkHappyPath({ crossTraining: [] })
      expect(cfg.crossTrainingModes).toBeUndefined()
    })

    it('captures multiple cross-training modes', () => {
      const cfg = walkHappyPath({ crossTraining: ['Cycling', 'Swimming', 'Yoga / Mobility'] })
      expect(cfg.crossTrainingModes).toEqual(['cycling', 'swimming', 'yoga'])
    })
  })

  describe('schedule & constraints', () => {
    it('captures multiple training-time preferences', () => {
      const cfg = walkHappyPath({ trainingTimes: ['Early morning', 'Evening'] })
      expect(cfg.preferredTrainingTimes).toEqual(['early_am', 'evening'])
    })

    it('omits scheduleConstraintsNote when textarea is empty', () => {
      const cfg = walkHappyPath({ scheduleNote: '' })
      expect(cfg.scheduleConstraintsNote).toBeUndefined()
    })

    it('captures the constraint note when provided', () => {
      const cfg = walkHappyPath({ scheduleNote: 'Travel May 15-22, no equipment' })
      expect(cfg.scheduleConstraintsNote).toBe('Travel May 15-22, no equipment')
    })

    it('trims whitespace-only note to undefined', () => {
      const cfg = walkHappyPath({ scheduleNote: '   ' })
      expect(cfg.scheduleConstraintsNote).toBeUndefined()
    })
  })

  describe('gating / Continue button', () => {
    function advanceTo(stepName: 'baseline' | 'equipment' | 'strength' | 'schedule') {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      // raceType
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      // raceName
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      // raceDistance
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      // experience
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      // days
      fireEvent.click(screen.getByText('5 Days'))
      clickContinue()
      // variant (long-run day)
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()
      if (stepName === 'baseline') return
      // baseline (injury)
      fireEvent.click(screen.getByText('No injuries'))
      clickContinue()
      if (stepName === 'equipment') return
      // equipment
      fireEvent.click(screen.getByText('Track'))
      clickContinue()
      if (stepName === 'strength') return
      // strength
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      clickContinue()
    }

    it('disables Continue on the baseline step until injury status is selected', () => {
      advanceTo('baseline')
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('No injuries'))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on the equipment step until at least one item is chosen', () => {
      advanceTo('equipment')
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Track'))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on the strength step until strength frequency is selected', () => {
      advanceTo('strength')
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on the schedule step until at least one training time is picked', () => {
      advanceTo('schedule')
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Early morning'))
      expect(getContinueButton()?.disabled).toBe(false)
    })
  })

  describe('Hyrox branch', () => {
    it('uses weakStation instead of longRunDay on the variant step', () => {
      const cfg = walkHappyPath({ raceType: 'Hyrox', weakStation: 'Sled Push' })
      expect(cfg.raceType).toBe('hyrox')
      expect(cfg.weakStation).toBe('Sled Push')
      expect(cfg.longRunDay).toBeUndefined()
    })
  })

  describe('progress bar', () => {
    it('uses 11 visible steps before raceType is picked (race-distance hidden)', () => {
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      const progressFill = container.querySelector('.bg-teal-500.rounded-full') as HTMLElement
      // step 0 of 11 → width = 1/11 ≈ 9.09%
      expect(progressFill.style.width).toMatch(/^9\.09/)
    })

    it('expands to 12 visible steps after raceType=trail is picked', () => {
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race'))
      const progressFill = container.querySelector('.bg-teal-500.rounded-full') as HTMLElement
      // Still on step 0 (idx 0 of 12) → 1/12 ≈ 8.33%
      expect(progressFill.style.width).toMatch(/^8\.33/)
    })
  })

  describe('skip button', () => {
    it('fires onSkip when the X button in the header is clicked', () => {
      const onComplete = vi.fn()
      const onSkip = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} onSkip={onSkip} loadingDurationMs={0} />)
      const buttons = Array.from(container.querySelectorAll('button'))
      const skipBtn = buttons.find(b =>
        b.querySelector('svg path[d^="M4 4l10 10"]') !== null
      )
      expect(skipBtn).toBeDefined()
      fireEvent.click(skipBtn!)
      expect(onSkip).toHaveBeenCalledTimes(1)
    })
  })
})
