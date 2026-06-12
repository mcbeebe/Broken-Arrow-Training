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

// The race-name step now also requires a description (10+ chars) + a goal.
// Fills both so nav tests can advance past it. Placeholders are stable across flows.
function fillRaceContext() {
  fireEvent.change(screen.getByPlaceholderText(/Terrain, elevation/i), { target: { value: 'Hilly trail with lots of vert and heat.' } })
  fireEvent.change(screen.getByPlaceholderText(/finish strong/i), { target: { value: 'Finish strong' } })
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
  generalGoal: string
  cardioModality: string
  experience: string
  daysPerWeek: number
  longRunDay: string
  weakStation: string
  anchorOption: string
  anchorTime: string
  anchorBpm: string
  weeklyMileage: string
  injury: string
  injuryArea: string
  injuryTimeframe: string
  injuryNote: string
  equipment: string[]
  strength: string
  strengthExperience: string
  crossFrequency: string
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
    generalGoal: 'Build Muscle',
    cardioModality: 'Running',
    experience: 'Intermediate',
    daysPerWeek: 5,
    longRunDay: 'Saturday',
    weakStation: 'Wall Balls',
    anchorOption: 'race_5k',
    anchorTime: '21:30',
    weeklyMileage: '20',
    injury: 'No injuries',
    injuryArea: '',
    injuryTimeframe: '',
    injuryNote: '',
    equipment: ['Track', 'Trails'],
    strength: '2x',
    strengthExperience: 'Some experience',
    crossFrequency: '1x',
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

  // Step 1: Race name + date + description (required, 10+ chars) + goal
  const raceNameInput = screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i)
  fireEvent.change(raceNameInput, { target: { value: 'Test Race' } })
  fireEvent.change(screen.getByPlaceholderText(/Terrain, elevation/i), { target: { value: 'Rolling hills with lots of climbing and hot weather.' } })
  fireEvent.change(screen.getByPlaceholderText(/finish strong/i), { target: { value: 'Finish strong and enjoy it' } })
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

  // Step 2b (general only): goal selection — shown for General Fitness via visibleSteps
  if (o.raceType === 'General Fitness') {
    fireEvent.click(screen.getByText(o.generalGoal))
    clickContinue()
    // Step 2c (general only): primary cardio modality
    fireEvent.click(screen.getByText(o.cardioModality))
    clickContinue()
  }

  // Step 3: Experience
  fireEvent.click(screen.getByText(o.experience))
  clickContinue()

  // Step 3b: Detail level — pre-selected from the experience answer; advance.
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
  // Injury follow-ups only render for returning/current.
  if (o.injury !== 'No injuries') {
    if (o.injuryArea) {
      fireEvent.change(screen.getByLabelText('Injury area'), { target: { value: o.injuryArea } })
    }
    if (o.injuryTimeframe) {
      fireEvent.change(screen.getByLabelText('Injury timeframe'), { target: { value: o.injuryTimeframe } })
    }
    if (o.injuryNote) {
      const noteInput = screen.getByPlaceholderText(/still some pain/i)
      fireEvent.change(noteInput, { target: { value: o.injuryNote } })
    }
  }
  clickContinue()

  // Step 7: Equipment access (multi-select)
  o.equipment.forEach(label => fireEvent.click(screen.getByText(label)))
  clickContinue()

  // Step 8: Strength + cross-training. Both frequency selectors use the
  // same button text ("None"/"1x"/"2x"/"3+") so we disambiguate via the
  // aria-label set on each ("Strength 1x" vs "Cross-training 1x"). The
  // modality checkboxes only render when cross-training frequency > 0.
  fireEvent.click(screen.getByRole('button', { name: `Strength ${o.strength}` }))
  // Lifting-background question only renders when strength > 0.
  if (o.strength !== 'None') {
    fireEvent.click(screen.getByText(o.strengthExperience))
  }
  fireEvent.click(screen.getByRole('button', { name: `Cross-training ${o.crossFrequency}` }))
  if (o.crossFrequency !== 'None') {
    o.crossTraining.forEach(label => fireEvent.click(screen.getByText(label)))
  }
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
  // Profile advances to the optional menopause step (athletes 40+), then to the
  // pre-submit Review step. Skip the menopause step when it appears.
  clickContinue()
  if (screen.queryByText(/a quick personal note/i)) {
    clickContinue() // menopause → review (skipped, no selection)
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
      fillRaceContext()
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
      fillRaceContext()
      clickContinue()
      expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
      expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()
    })

    it('skips the race-distance step for General Fitness (goal step instead)', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText(/General Fitness/))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Summer Fitness/), { target: { value: 'Block' } })
      fillRaceContext()
      clickContinue()
      // Distance is skipped; general fitness goes to the goal step instead.
      expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
      expect(screen.getByText(/what's your main goal/i)).toBeInTheDocument()
      // Goal step → cardio step → experience.
      fireEvent.click(screen.getByText('Build Muscle'))
      clickContinue()
      expect(screen.getByText(/what's your main cardio/i)).toBeInTheDocument()
      fireEvent.click(screen.getByText('Running'))
      clickContinue()
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

    it('captures the selected goal for General Fitness', () => {
      const cfg = walkHappyPath({ raceType: 'General Fitness', generalGoal: 'Lose Fat' })
      expect(cfg.raceType).toBe('general')
      expect(cfg.generalGoal).toBe('lose_fat')
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
      fillRaceContext()
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
      fillRaceContext()
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
      fillRaceContext()
      clickContinue()
      // race-distance step
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      // detail level (pre-selected from experience)
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

    it('makes cross-training optional (None means no modalities)', () => {
      const cfg = walkHappyPath({ crossFrequency: 'None', crossTraining: [] })
      expect(cfg.crossTrainingDaysPerWeek).toBe(0)
      expect(cfg.crossTrainingModes).toBeUndefined()
    })

    it('captures multiple cross-training modes', () => {
      const cfg = walkHappyPath({
        crossFrequency: '2x',
        crossTraining: ['Cycling', 'Swimming', 'Yoga / Mobility'],
      })
      expect(cfg.crossTrainingDaysPerWeek).toBe(2)
      expect(cfg.crossTrainingModes).toEqual(['cycling', 'swimming', 'yoga'])
    })

    it.each([
      ['None', 0],
      ['1x', 1],
      ['2x', 2],
      ['3+', 3],
    ])('captures cross-training frequency %s as %i', (label, expected) => {
      const cfg = walkHappyPath({
        crossFrequency: label,
        crossTraining: label === 'None' ? [] : ['Cycling'],
      })
      expect(cfg.crossTrainingDaysPerWeek).toBe(expected)
    })
  })

  describe('strength experience', () => {
    it.each([
      ['New to lifting', 'new'],
      ['Some experience', 'recreational'],
      ['Experienced lifter', 'experienced'],
    ])('captures %s as %s', (label, expected) => {
      const cfg = walkHappyPath({ strength: '2x', strengthExperience: label })
      expect(cfg.strengthExperience).toBe(expected)
    })

    it('omits strengthExperience when no strength days are selected', () => {
      const cfg = walkHappyPath({ strength: 'None' })
      expect(cfg.strengthDaysPerWeek).toBe(0)
      expect(cfg.strengthExperience).toBeUndefined()
    })

    it('hides the lifting-background question until strength > 0', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'X' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue() // detail level
      fireEvent.click(screen.getByText('5 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('No injuries')); clickContinue()
      fireEvent.click(screen.getByText('Track')); clickContinue()

      // On STEP_STRENGTH. No strength frequency picked yet → no question.
      expect(screen.queryByText(/lifting experience/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Strength None' }))
      expect(screen.queryByText(/lifting experience/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Strength 2x' }))
      expect(screen.getByText(/lifting experience/i)).toBeInTheDocument()
    })

    it('blocks Continue when strength > 0 but no lifting background is picked', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'X' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue()
      fireEvent.click(screen.getByText('5 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('No injuries')); clickContinue()
      fireEvent.click(screen.getByText('Track')); clickContinue()

      fireEvent.click(screen.getByRole('button', { name: 'Strength 2x' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training None' }))
      // Frequencies set but no lifting background → still blocked.
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Some experience'))
      expect(getContinueButton()?.disabled).toBe(false)
    })
  })

  describe('injury follow-ups', () => {
    it('does not show follow-ups for "No injuries"', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'X' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue()
      fireEvent.click(screen.getByText('5 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('No injuries'))
      expect(screen.queryByLabelText('Injury area')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Returning from injury'))
      expect(screen.getByLabelText('Injury area')).toBeInTheDocument()
    })

    it('captures injury area, timeframe, and note for a returning athlete', () => {
      const cfg = walkHappyPath({
        injury: 'Returning from injury',
        injuryArea: 'knee',
        injuryTimeframe: 'Cleared 1-2 weeks ago',
        injuryNote: 'still cautious on downhills',
      })
      expect(cfg.injuryStatus).toBe('returning')
      expect(cfg.injuryArea).toBe('knee')
      expect(cfg.injuryTimeframe).toBe('Cleared 1-2 weeks ago')
      expect(cfg.injuryNote).toBe('still cautious on downhills')
    })

    it('omits injury detail fields when the athlete is healthy', () => {
      const cfg = walkHappyPath({ injury: 'No injuries' })
      expect(cfg.injuryArea).toBeUndefined()
      expect(cfg.injuryTimeframe).toBeUndefined()
      expect(cfg.injuryNote).toBeUndefined()
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
      fillRaceContext()
      clickContinue()
      // raceDistance
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      // experience
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      // detail level (pre-selected from experience)
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
      // strength (frequency) + cross-training (frequency = None)
      fireEvent.click(screen.getByRole('button', { name: 'Strength None' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training None' }))
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

    it('disables Continue on the strength step until both frequencies are selected', () => {
      advanceTo('strength')
      expect(getContinueButton()?.disabled).toBe(true)
      // Strength frequency alone isn't enough — cross-training frequency
      // is also required (None counts as an answer).
      fireEvent.click(screen.getByRole('button', { name: 'Strength None' }))
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training None' }))
      expect(getContinueButton()?.disabled).toBe(false)
    })

    it('blocks Continue when cross-training frequency > 0 but no modality is picked', () => {
      advanceTo('strength')
      fireEvent.click(screen.getByRole('button', { name: 'Strength None' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training 1x' }))
      // Frequency picked but no modality → still disabled.
      expect(getContinueButton()?.disabled).toBe(true)
      fireEvent.click(screen.getByText('Cycling'))
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

  describe('day-budget breakdown', () => {
    it('shows the live run/strength/cross split on the Strength step', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      // Race type → Race name → Race distance → Experience → Days → Variant → Baseline → Equipment → Strength
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'Test' } })
      fillRaceContext()
      clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      fireEvent.click(screen.getByText('Intermediate'))
      clickContinue()
      clickContinue()  // detail level (pre-selected)
      fireEvent.click(screen.getByText('5 Days'))  // 5-day budget
      clickContinue()
      fireEvent.click(screen.getByText('Saturday'))
      clickContinue()
      fireEvent.click(screen.getByText('No injuries'))
      clickContinue()
      fireEvent.click(screen.getByText('Track'))
      clickContinue()

      // We're on STEP_STRENGTH now. Default breakdown with no strength + no cross → 5 running.
      expect(screen.getByText(/Your 5-day week/)).toBeInTheDocument()
      expect(screen.getByText(/5 running.*0 strength.*0 cross/)).toBeInTheDocument()

      // Pick 2x strength + 1x cross-training (with a modality).
      fireEvent.click(screen.getByRole('button', { name: 'Strength 2x' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training 1x' }))
      fireEvent.click(screen.getByText('Cycling'))
      expect(screen.getByText(/2 running.*2 strength.*1 cross/)).toBeInTheDocument()
    })

    it('warns when extras exceed the day budget', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'Test' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue()  // detail level (pre-selected)
      fireEvent.click(screen.getByText('3 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('No injuries')); clickContinue()
      fireEvent.click(screen.getByText('Track')); clickContinue()

      // 3-day budget; pick 3x strength + 1x cross with modality → 4 extras > 3 budget → warning text.
      fireEvent.click(screen.getByRole('button', { name: 'Strength 3+' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training 1x' }))
      fireEvent.click(screen.getByText('Cycling'))
      expect(screen.getByText(/Strength \+ cross exceed/)).toBeInTheDocument()
    })
  })

  describe('review step', () => {
    it('renders a summary of key answers before Create My Plan', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      // Walk to PROFILE
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'Skyrace' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue()  // detail level (pre-selected)
      fireEvent.click(screen.getByText('5 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('Returning from injury')); clickContinue()
      fireEvent.click(screen.getByText('Track')); clickContinue()
      fireEvent.click(screen.getByRole('button', { name: 'Strength 1x' }))
      fireEvent.click(screen.getByText('Some experience'))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training None' }))
      clickContinue()
      fireEvent.click(screen.getByText('Early morning')); clickContinue()
      fireEvent.click(screen.getByText('Garmin Watch')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText('e.g. Jenn'), { target: { value: 'Jenn' } })
      // Under 40 so the optional menopause step doesn't appear before review.
      fireEvent.change(screen.getByPlaceholderText('e.g. 41'), { target: { value: '39' } })
      clickContinue()  // PROFILE → REVIEW

      // Review step renders the summary.
      expect(screen.getByText(/Review your plan setup/)).toBeInTheDocument()
      expect(screen.getByText(/Skyrace/)).toBeInTheDocument()
      // 5 - 1 strength - 0 cross = 4 running
      expect(screen.getByText(/4 running.*1 strength.*0 cross-training/)).toBeInTheDocument()
      // Injury banner explains the cap.
      expect(screen.getByText(/Capped at 4 total days/)).toBeInTheDocument()

      // Final submit fires onComplete.
      clickFinish()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('progress bar', () => {
    it('uses 13 visible steps before raceType is picked (race-distance hidden)', () => {
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      const progressFill = container.querySelector('.bg-teal-500.rounded-full') as HTMLElement
      // step 0 of 13 → width = 1/13 ≈ 7.69%
      expect(progressFill.style.width).toMatch(/^7\.69/)
    })

    it('expands to 14 visible steps after raceType=trail is picked', () => {
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race'))
      const progressFill = container.querySelector('.bg-teal-500.rounded-full') as HTMLElement
      // Still on step 0 (idx 0 of 14) → 1/14 ≈ 7.14%
      expect(progressFill.style.width).toMatch(/^7\.14/)
    })
  })

  describe('iOS blank-screen scroll reset', () => {
    // On iOS Safari, focusing an input scrolls the document up so the keyboard
    // doesn't cover it. That scroll offset survives the step change and the
    // next step's content paints above the visible viewport — a blank screen.
    // The fix resets window scroll (and blurs the active input) on every step
    // transition. These tests verify that wiring.
    it('resets window scroll when advancing to the next step', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo')
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      scrollSpy.mockClear() // ignore mount-time reset

      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()

      // scrollTo(0, 0) should have been called as part of the step transition.
      const called = scrollSpy.mock.calls.some(
        ([x, y]) => x === 0 && y === 0,
      )
      expect(called).toBe(true)
      scrollSpy.mockRestore()
    })

    it('resets window scroll when navigating back', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo')
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)

      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      // Now on race-name step. Click back.
      scrollSpy.mockClear()
      const backArrow = container.querySelector('.flex.items-center.justify-between button') as HTMLButtonElement
      fireEvent.click(backArrow)

      const called = scrollSpy.mock.calls.some(
        ([x, y]) => x === 0 && y === 0,
      )
      expect(called).toBe(true)
      scrollSpy.mockRestore()
    })

    it('resets the inner scroll container when advancing to the next step', () => {
      // Regression: the iOS fix that calls window.scrollTo(0,0) didn't
      // reset the inner overflow-y-auto container's scrollTop. If the
      // previous step's content overflowed (e.g. race-type cards on a
      // short phone) and the user scrolled, the next step's shorter
      // content would paint above the visible viewport — blank screen.
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)

      const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
      expect(scroller).toBeTruthy()
      // Simulate the user having scrolled the race-type step.
      scroller.scrollTop = 400
      expect(scroller.scrollTop).toBe(400)

      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()

      // After the step transition, the next step's container starts at
      // the top so its content is visible.
      expect(scroller.scrollTop).toBe(0)
    })

    it('blurs the focused input when the step changes', () => {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()

      // Focus an input on the race-name step (simulating user typing).
      const raceNameInput = screen.getByPlaceholderText(/Broken Arrow/) as HTMLInputElement
      raceNameInput.focus()
      expect(document.activeElement).toBe(raceNameInput)

      fireEvent.change(raceNameInput, { target: { value: 'Foo' } })
      fillRaceContext()
      clickContinue()

      // After advancing, the previously-focused input should be blurred so
      // iOS doesn't keep the document scrolled to clear the keyboard.
      expect(document.activeElement).not.toBe(raceNameInput)
    })

    it('keeps every step rendering content after navigating through the flow', () => {
      // Regression: walking forward and back through every step must keep the
      // content area populated. If a step renders blank (e.g. step index falls
      // through every conditional), this loop will fail to find the expected
      // heading on that step.
      const onComplete = vi.fn()
      const { container } = render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      const backArrow = () =>
        container.querySelector('.flex.items-center.justify-between button') as HTMLButtonElement

      fireEvent.click(screen.getByText('Trail / Road Race'))
      clickContinue()
      expect(screen.getByText(/tell us about your race/i)).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow/), { target: { value: 'Foo' } })
      fillRaceContext()
      clickContinue()
      expect(screen.getByText(/race distance/i)).toBeInTheDocument()

      fireEvent.click(screen.getByText(/^Marathon$/))
      clickContinue()
      expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()

      // Walk back through every step and confirm content is present each time.
      fireEvent.click(backArrow())
      expect(screen.getByText(/race distance/i)).toBeInTheDocument()
      fireEvent.click(backArrow())
      expect(screen.getByText(/tell us about your race/i)).toBeInTheDocument()
      fireEvent.click(backArrow())
      expect(screen.getByText(/what are you training for/i)).toBeInTheDocument()
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

  describe('menopause context (age-gated)', () => {
    // Walk the trail flow to the PROFILE step and fill name + the given age,
    // leaving the user on PROFILE ready to Continue. Returns the onComplete spy.
    function walkToProfile(age: string) {
      const onComplete = vi.fn()
      render(<Onboarding onComplete={onComplete} loadingDurationMs={0} />)
      fireEvent.click(screen.getByText('Trail / Road Race')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText(/Broken Arrow|Hyrox|Summer Fitness/i), { target: { value: 'Race' } }); fillRaceContext(); clickContinue()
      fireEvent.click(screen.getByText(/^Marathon$/)); clickContinue()
      fireEvent.click(screen.getByText('Intermediate')); clickContinue()
      clickContinue() // detail level (pre-selected)
      fireEvent.click(screen.getByText('5 Days')); clickContinue()
      fireEvent.click(screen.getByText('Saturday')); clickContinue()
      fireEvent.click(screen.getByText('No injuries')); clickContinue()
      fireEvent.click(screen.getByText('Track')); clickContinue()
      fireEvent.click(screen.getByRole('button', { name: 'Strength None' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cross-training None' }))
      clickContinue()
      fireEvent.click(screen.getByText('Early morning')); clickContinue()
      fireEvent.click(screen.getByText('Garmin Watch')); clickContinue()
      fireEvent.change(screen.getByPlaceholderText('e.g. Jenn'), { target: { value: 'Jenn' } })
      fireEvent.change(screen.getByPlaceholderText('e.g. 41'), { target: { value: age } })
      return onComplete
    }

    it('hides the menopause step for athletes under 40', () => {
      walkToProfile('38')
      clickContinue() // PROFILE → (menopause hidden) → REVIEW
      expect(screen.queryByText(/a quick personal note/i)).not.toBeInTheDocument()
      expect(screen.getByText(/review your plan setup/i)).toBeInTheDocument()
    })

    it('shows the menopause step for athletes 40+ and captures stage + symptoms', () => {
      const onComplete = walkToProfile('52')
      clickContinue() // PROFILE → MENOPAUSE
      expect(screen.getByText(/a quick personal note/i)).toBeInTheDocument()
      fireEvent.click(screen.getByText('Perimenopause'))
      fireEvent.click(screen.getByText('Hot flashes')) // follow-up appears for a real stage
      clickContinue() // MENOPAUSE → REVIEW
      clickFinish()
      expect(onComplete).toHaveBeenCalledTimes(1)
      const cfg = onComplete.mock.calls[0][0] as OnboardingConfig
      expect(cfg.menopauseStatus).toBe('perimenopause')
      expect(cfg.menopauseSymptoms).toEqual(['hot_flashes'])
    })

    it('captures the premenopausal stage (40+) for base-building', () => {
      const onComplete = walkToProfile('42')
      clickContinue() // PROFILE → MENOPAUSE (age 42 ≥ 40)
      expect(screen.getByText(/a quick personal note/i)).toBeInTheDocument()
      fireEvent.click(screen.getByText('Premenopausal'))
      clickContinue() // MENOPAUSE → REVIEW
      clickFinish()
      const cfg = onComplete.mock.calls[0][0] as OnboardingConfig
      expect(cfg.menopauseStatus).toBe('premenopause')
    })

    it('is skippable — advancing with no selection records no context', () => {
      const onComplete = walkToProfile('50')
      clickContinue() // PROFILE → MENOPAUSE
      expect(getContinueButton()?.disabled).toBe(false) // optional, never gated
      clickContinue() // MENOPAUSE → REVIEW with no selection
      clickFinish()
      const cfg = onComplete.mock.calls[0][0] as OnboardingConfig
      expect(cfg.menopauseStatus).toBeUndefined()
    })

    it('records "prefer not to say" with no symptom follow-ups', () => {
      const onComplete = walkToProfile('50')
      clickContinue()
      fireEvent.click(screen.getByText('Prefer not to say'))
      expect(screen.queryByText(/Noticing any of these/i)).not.toBeInTheDocument()
      clickContinue()
      clickFinish()
      const cfg = onComplete.mock.calls[0][0] as OnboardingConfig
      expect(cfg.menopauseStatus).toBe('prefer_not_to_say')
      expect(cfg.menopauseSymptoms).toBeUndefined()
    })

    it('omits menopause fields when the optional step is skipped', () => {
      const cfg = walkHappyPath() // age 41 → step shows but is skipped
      expect(cfg.menopauseStatus).toBeUndefined()
      expect(cfg.menopauseSymptoms).toBeUndefined()
      expect(cfg.menopauseNote).toBeUndefined()
    })
  })
})
