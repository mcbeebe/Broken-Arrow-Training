import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Onboarding from '../components/Onboarding'
import type { OnboardingConfig } from '../hooks/useOnboarding'

function clickContinue() {
  const btn = screen.getByRole('button', { name: /continue/i })
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
  render(<Onboarding onComplete={onComplete} />)

  // Step 0: Race type
  fireEvent.click(screen.getByText(o.raceType))
  clickContinue()

  // Step 1: Race name + date
  const raceNameInput = screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i)
  fireEvent.change(raceNameInput, { target: { value: 'Test Race' } })
  clickContinue()

  // Step 2: Experience
  fireEvent.click(screen.getByText(o.experience))
  clickContinue()

  // Step 3: Days per week
  fireEvent.click(screen.getByText(`${o.daysPerWeek} Days`))
  clickContinue()

  // Step 4: Long run day OR weak station
  if (o.raceType === 'Hyrox') {
    fireEvent.click(screen.getByText(o.weakStation))
  } else {
    fireEvent.click(screen.getByText(o.longRunDay))
  }
  clickContinue()

  // Step 5: Fitness baseline (anchor + mileage + injury)
  // Set anchor type via select
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
  // Weekly mileage
  if (o.weeklyMileage) {
    const mileageInput = screen.getByPlaceholderText('e.g. 20')
    fireEvent.change(mileageInput, { target: { value: o.weeklyMileage } })
  }
  // Injury
  fireEvent.click(screen.getByText(o.injury))
  clickContinue()

  // Step 6: Equipment access (multi-select)
  o.equipment.forEach(label => fireEvent.click(screen.getByText(label)))
  clickContinue()

  // Step 7: Strength + cross-training
  fireEvent.click(screen.getByRole('button', { name: o.strength }))
  o.crossTraining.forEach(label => fireEvent.click(screen.getByText(label)))
  clickContinue()

  // Step 8: Schedule & constraints
  o.trainingTimes.forEach(label => fireEvent.click(screen.getByText(label)))
  if (o.scheduleNote) {
    const textarea = screen.getByPlaceholderText(/Travel May/)
    fireEvent.change(textarea, { target: { value: o.scheduleNote } })
  }
  clickContinue()

  // Step 9: Wearable
  fireEvent.click(screen.getByText(o.wearable))
  clickContinue()

  // Step 10: Personal data
  const nameInput = screen.getByPlaceholderText('e.g. Jenn')
  fireEvent.change(nameInput, { target: { value: o.name } })
  const ageInput = screen.getByPlaceholderText('e.g. 41')
  fireEvent.change(ageInput, { target: { value: o.age } })
  if (o.maxHR) {
    // The max-HR input has a dynamic placeholder; grab it by label proximity.
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    it('captures all answers and emits a complete OnboardingConfig', () => {
      const cfg = walkHappyPath()

      expect(cfg).toMatchObject({
        raceType: 'trail',
        raceName: 'Test Race',
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

  describe('days per week', () => {
    it('allows 7 days/week', () => {
      const cfg = walkHappyPath({ daysPerWeek: 7 })
      expect(cfg.trainingDaysPerWeek).toBe(7)
    })

    it.each([3, 4, 5, 6, 7])('shows %i days option', (n) => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} />)
      // Advance to step 3
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
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
    it('disables Continue on step 5 until injury status is selected', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} />)
      // Advance to step 5
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      fireEvent.click(screen.getByText('5 Days'))
      clickContinue()
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()

      // On step 5 — anchor and mileage filled but no injury picked yet
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('No injuries'))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on step 6 until at least one equipment is chosen', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} />)
      // Advance through to step 6
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      fireEvent.click(screen.getByText('5 Days'))
      clickContinue()
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()
      fireEvent.click(screen.getByText('No injuries'))
      clickContinue()

      // On step 6 — no equipment picked yet
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Track'))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on step 7 until strength frequency is selected', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} />)
      // Advance to step 7
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      fireEvent.click(screen.getByText('5 Days'))
      clickContinue()
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()
      fireEvent.click(screen.getByText('No injuries'))
      clickContinue()
      fireEvent.click(screen.getByText('Track'))
      clickContinue()

      // On step 7 — strength not picked
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('disables Continue on step 8 until at least one training time is picked', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} />)
      // Advance to step 8
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'X' } })
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      fireEvent.click(screen.getByText('5 Days'))
      clickContinue()
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()
      fireEvent.click(screen.getByText('No injuries'))
      clickContinue()
      fireEvent.click(screen.getByText('Track'))
      clickContinue()
      fireEvent.click(screen.getByRole('button', { name: 'None' }))
      clickContinue()

      // On step 8
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Early morning'))
      expect(getContinueButton()?.disabled).toBe(false)
    })
  })

  describe('Hyrox branch', () => {
    it('uses weakStation instead of longRunDay on step 4', () => {
      const cfg = walkHappyPath({ raceType: 'Hyrox', weakStation: 'Sled Push' })
      expect(cfg.raceType).toBe('hyrox')
      expect(cfg.weakStation).toBe('Sled Push')
      expect(cfg.longRunDay).toBeUndefined()
    })
  })

  describe('progress bar', () => {
    it('uses 11 total steps', () => {
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} />)
      const progressFill = container.querySelector('.bg-teal-500.rounded-full') as HTMLElement
      // step 0 of 11 → width = 1/11 ≈ 9.09%
      expect(progressFill.style.width).toMatch(/^9\.09/)
    })
  })

  describe('skip button', () => {
    it('fires onSkip when the X button in the header is clicked', () => {
      const onComplete = vi.fn()
      const onSkip = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} onSkip={onSkip} />)
      // Skip is the only header button whose svg path starts with "M4 4l10 10" (the X).
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
