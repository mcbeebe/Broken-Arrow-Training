import { describe, it, expect } from 'vitest'
import { parseRoutine, getExerciseGuide, guideMatchedExercises, calibrateGuideWeight } from '../utils/exercises'

describe('calibrateGuideWeight — scales default loads to lifting background', () => {
  it('leaves weights unchanged for experienced lifters', () => {
    expect(calibrateGuideWeight('20-30 lb dumbbell (focus on control, not load)', 'experienced'))
      .toBe('20-30 lb dumbbell (focus on control, not load)')
  })

  it('leaves weights unchanged when no level is given (seed athletes)', () => {
    expect(calibrateGuideWeight('95-115 lb (moderate — muscular endurance focus)'))
      .toBe('95-115 lb (moderate — muscular endurance focus)')
  })

  it('halves loads for new lifters, rounding to the nearest 5 lb', () => {
    // 20*0.5=10, 30*0.5=15
    expect(calibrateGuideWeight('20-30 lb dumbbell', 'new')).toBe('10-15 lb dumbbell')
    // 95*0.5=47.5→50, 115*0.5=57.5→60
    expect(calibrateGuideWeight('95-115 lb', 'new')).toBe('50-60 lb')
  })

  it('scales recreational loads to ~75%', () => {
    // 20*0.75=15, 30*0.75=22.5→25(round half up of 4.5)→ Math.round(22.5/5)=Math.round(4.5)=5 → 25
    expect(calibrateGuideWeight('20-30 lb dumbbell', 'recreational')).toBe('15-25 lb dumbbell')
  })

  it('keeps a 5 lb floor and never produces 0', () => {
    expect(calibrateGuideWeight('5 lb', 'new')).toBe('5 lb')
  })

  it('passes bodyweight prescriptions through untouched', () => {
    expect(calibrateGuideWeight('Bodyweight', 'new')).toBe('Bodyweight')
  })
})

describe('parseRoutine — Custom AI-coach routines match guides', () => {
  it('matches "Push-ups 3×8 · Med ball Russian twists 3×20 · Dead hang 2×15s · Plank 3×45s"', () => {
    const out = parseRoutine('Push-ups 3×8 · Med ball Russian twists 3×20 · Dead hang 2×15s · Plank 3×45s')
    expect(out).toHaveLength(4)
    expect(out[0].guide?.name).toBe('Push-Up')
    expect(out[1].guide?.name).toBe('Russian Twists')
    expect(out[2].guide?.name).toBe('Dead Hang')
    expect(out[3].guide?.name).toBe('Plank')
  })

  it('matches "Myrtl routine" and "Foam roll quads/calves 10 min"', () => {
    const out = parseRoutine('Myrtl routine · Foam roll quads/calves 10 min')
    expect(out).toHaveLength(2)
    expect(out[0].guide?.name).toBe('Myrtl Hip Routine')
    expect(out[1].guide?.name).toBe('Foam Roll (quads / calves)')
  })

  it('exposes alternates on the dead hang guide', () => {
    const guide = getExerciseGuide('Dead hang 2×15s')
    expect(guide).not.toBeNull()
    expect(guide!.alternates).toBeDefined()
    expect(guide!.alternates!.length).toBeGreaterThanOrEqual(3)
    const equipment = guide!.alternates!.map(a => a.equipment.toLowerCase())
    // Athlete asked for DB / med ball / ab wheel — verify dumbbell alt is present
    expect(equipment.some(e => e.includes('dumbbell'))).toBe(true)
    // And at least one bodyweight option for athletes without equipment
    expect(equipment.some(e => e.includes('bodyweight'))).toBe(true)
  })

  it('exposes alternates on Russian twists guide with DB option', () => {
    const guide = getExerciseGuide('Med ball Russian twists 3×20')
    expect(guide?.alternates).toBeDefined()
    const names = guide!.alternates!.map(a => a.name.toLowerCase())
    expect(names.some(n => n.includes('db') || n.includes('dumbbell'))).toBe(true)
  })

  it('exposes alternates on the Myrtl routine for athletes without the full sequence', () => {
    const guide = getExerciseGuide('Myrtl routine')
    expect(guide?.alternates).toBeDefined()
    expect(guide!.alternates!.length).toBeGreaterThanOrEqual(2)
  })

  it('exposes alternates on foam rolling for athletes without a roller', () => {
    const guide = getExerciseGuide('Foam roll quads/calves 10 min')
    expect(guide?.alternates).toBeDefined()
    const equipment = guide!.alternates!.map(a => a.equipment.toLowerCase())
    expect(equipment.some(e => e.includes('ball'))).toBe(true)
    expect(equipment.some(e => e.includes('gun'))).toBe(true)
  })

  it('preserves existing exercises (push-up still resolves)', () => {
    const guide = getExerciseGuide('Push-up')
    expect(guide?.name).toBe('Push-Up')
    expect(guide?.alternates).toBeDefined()
  })
})

describe('Hyrox station guides', () => {
  it('every generator station fragment resolves a guide', () => {
    expect(getExerciseGuide('SkiErg 500m')?.name).toBe('SkiErg')
    expect(getExerciseGuide('Sled push 25m')?.name).toBe('Sled Push')
    expect(getExerciseGuide('Sled pull 25m')?.name).toBe('Sled Pull')
    expect(getExerciseGuide('Burpee broad jumps 40m')?.name).toBe('Burpee Broad Jumps')
    expect(getExerciseGuide('Row 500m')?.name).toBe('Rowing (Erg)')
    expect(getExerciseGuide('Farmer carry 100m')?.name).toBe('Farmer Carry')
    expect(getExerciseGuide('Sandbag lunges 50m')?.name).toBe('Sandbag Lunges')
    expect(getExerciseGuide('Wall balls 75 (6 kg)')?.name).toBe('Wall Balls')
  })

  it('station guides carry race-spec cues and home alternates', () => {
    const wb = getExerciseGuide('Wall balls 30 (6 kg)')!
    expect(wb.form.join(' ')).toMatch(/Race spec/i)
    expect(wb.alternates!.length).toBeGreaterThanOrEqual(2)
    const sled = getExerciseGuide('Sled push 25m')!
    expect(sled.alternates!.some(a => /hill/i.test(a.name))).toBe(true)
  })

  it('rowing keys never false-match other movements', () => {
    expect(getExerciseGuide('DB row 3×10')?.name).toBe('Dumbbell Row')
    expect(getExerciseGuide('Narrow push-up 3×10')?.name).toBe('Push-Up')
  })

  it('guideMatchedExercises drops instruction fragments, keeps movements', () => {
    const out = guideMatchedExercises('SkiErg 500m · 90 sec rest between stations · Competition sled weight')
    expect(out).toHaveLength(1)
    expect(out[0].guide?.name).toBe('SkiErg')
  })
})
