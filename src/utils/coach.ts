import type {
  ReadinessScore, PlannedDay, PerformanceMetrics,
  TrainingStateInfo, SleepData, BodyBatteryData,
  CoachRecommendation, CoachTimeOfDay,
} from '../types'

/**
 * Morning recommendation — what to do with today's workout.
 */
export function generateMorningCoach(
  todayScore: ReadinessScore | null,
  todayWorkout: PlannedDay | undefined,
  weekDays: PlannedDay[],
  todayIndex: number,
  performance: PerformanceMetrics | null,
  sleepData: SleepData | undefined,
  trainingState: TrainingStateInfo | null,
): CoachRecommendation {
  const inputs: string[] = []

  // If no readiness data, give basic guidance
  if (!todayScore || !todayWorkout) {
    return {
      timeOfDay: 'morning',
      headline: todayWorkout ? `Today: ${todayWorkout.workout}` : 'No workout today',
      body: todayWorkout
        ? `Execute ${todayWorkout.workout} as planned. Connect Garmin for personalized coaching.`
        : 'Rest day. Focus on recovery.',
      inputs: ['No readiness data available'],
    }
  }

  // Gather context
  const { status, trainingState: state, components, displayScore } = todayScore
  inputs.push(`Readiness: ${status} (${displayScore}/100)`)

  if (sleepData) {
    const hrs = (sleepData.durationSeconds / 3600).toFixed(1)
    inputs.push(`Sleep: ${hrs}h`)
  }

  if (performance) {
    inputs.push(`Form (TSB): ${performance.tsb >= 0 ? '+' : ''}${performance.tsb.toFixed(0)}`)
    if (performance.acwr > 0) inputs.push(`ACWR: ${performance.acwr.toFixed(2)}`)
  }

  if (trainingState) {
    inputs.push(`Training State: ${state}`)
  }

  const workoutName = todayWorkout.workout
  const workoutType = todayWorkout.type

  // Rest/travel days
  if (workoutType === 'rest' || workoutType === 'travel' || workoutType === 'limited') {
    if (status === 'RED') {
      return {
        timeOfDay: 'morning',
        headline: 'Rest — your body needs it',
        body: `Recovery metrics are low (${displayScore}/100). Today's rest day is well-timed. Focus on hydration, nutrition, and sleep tonight.`,
        inputs,
      }
    }
    return {
      timeOfDay: 'morning',
      headline: workoutType === 'rest' ? 'Rest Day' : `${workoutName}`,
      body: `Scheduled recovery day. ${status === 'PEAK' ? 'You feel great — save that energy for tomorrow.' : 'Let your body rebuild.'}`,
      inputs,
    }
  }

  // PEAK + State A: go all-in
  if (status === 'PEAK' && state === 'A') {
    return {
      timeOfDay: 'morning',
      headline: `Peak day — go all-in on ${workoutName}`,
      body: `You're at peak recovery (${displayScore}/100). This is the day to push. Execute at full planned intensity.${workoutType === 'quality' ? ' Hit your interval targets — your body is primed for it.' : ''}`,
      action: { type: 'execute', label: 'Execute as planned', detail: 'Full intensity' },
      inputs,
    }
  }

  // GREEN + State A: execute as planned
  if (status === 'GREEN' && state === 'A') {
    return {
      timeOfDay: 'morning',
      headline: `Green light — ${workoutName} as planned`,
      body: `Good recovery (${displayScore}/100). Execute your ${workoutName} as written.${components.sleep >= 1 ? ' Good sleep is fueling today.' : ''}`,
      action: { type: 'execute', label: 'Execute as planned', detail: 'Normal intensity' },
      inputs,
    }
  }

  // GREEN + State B/C: maintain volume, reduce intensity
  if (status === 'GREEN' && (state === 'B' || state === 'C')) {
    return {
      timeOfDay: 'morning',
      headline: `Proceed with caution — ${workoutName}`,
      body: `Recovery is adequate (${displayScore}/100) but you're not fully recovered (State ${state}). Keep planned volume but reduce intensity by 10-15%. Stay in Z1-3.`,
      action: { type: 'modify', label: 'Reduce intensity', detail: '-10-15% effort, Z1-3' },
      inputs,
    }
  }

  // YELLOW: propose swap or reduce
  if (status === 'YELLOW') {
    // For quality/long sessions, try to find a swap target
    if (workoutType === 'quality' || workoutType === 'long') {
      const swapTarget = findSwapTarget(weekDays, todayIndex)
      if (swapTarget !== null) {
        const targetDay = weekDays[swapTarget]
        return {
          timeOfDay: 'morning',
          headline: `Consider swapping ${workoutName} → ${targetDay.day}`,
          body: `Moderate recovery (${displayScore}/100). Your ${workoutName} would be better served when you're fresher. Swap with ${targetDay.day}'s ${targetDay.workout}?${components.sleep <= -1 ? ' Last night\'s sleep was short — that\'s likely the driver.' : ''}`,
          action: {
            type: 'swap',
            label: `Swap with ${targetDay.day}`,
            detail: `Move ${workoutName} to ${targetDay.day}`,
            swapFromIndex: todayIndex,
            swapToIndex: swapTarget,
          },
          inputs,
        }
      }
      // No swap target available
      return {
        timeOfDay: 'morning',
        headline: `Dial back ${workoutName}`,
        body: `Moderate recovery (${displayScore}/100).${workoutType === 'quality' ? ' Drop to Z2 steady run at planned duration. No intervals today.' : ' Cut 15-20% of planned distance. Stay in Z1-2.'}`,
        action: { type: 'modify', label: 'Reduce intensity', detail: workoutType === 'quality' ? 'Z2 steady only' : '-15-20% distance' },
        inputs,
      }
    }

    // For strength
    if (workoutType === 'strength') {
      return {
        timeOfDay: 'morning',
        headline: 'Lighter strength session today',
        body: `Moderate recovery (${displayScore}/100). Reduce sets/weight by ~25% and focus on mobility work.`,
        action: { type: 'modify', label: 'Reduce load', detail: '-25% sets/weight' },
        inputs,
      }
    }

    // For regular runs and other
    return {
      timeOfDay: 'morning',
      headline: `Easy effort only — ${workoutName}`,
      body: `Moderate recovery (${displayScore}/100). Keep the session but stay strictly in Z1-2. No tempo efforts.`,
      action: { type: 'modify', label: 'Z1-2 only', detail: 'Easy effort' },
      inputs,
    }
  }

  // RED: skip or swap
  if (status === 'RED') {
    if (state === 'D') {
      return {
        timeOfDay: 'morning',
        headline: 'Deload — rest or gentle movement only',
        body: `Very low recovery (${displayScore}/100) with extended fatigue pattern (State D). Complete rest or 20-30 min gentle walk/yoga. No structured training. Focus on sleep and nutrition.`,
        action: { type: 'skip', label: 'Skip workout', detail: 'Rest or gentle walk only' },
        inputs,
      }
    }

    // Try to find a swap
    const swapTarget = findSwapTarget(weekDays, todayIndex)
    if (swapTarget !== null && weekDays[swapTarget].type === 'rest') {
      const targetDay = weekDays[swapTarget]
      return {
        timeOfDay: 'morning',
        headline: `Skip ${workoutName} — swap with ${targetDay.day}`,
        body: `Low recovery (${displayScore}/100).${components.sleep <= -1 ? ' You didn\'t sleep well last night.' : ''} Recommend swapping today's ${workoutName} with ${targetDay.day}'s rest day. Take today easy and come back stronger.`,
        action: {
          type: 'swap',
          label: `Swap with ${targetDay.day}`,
          detail: `Rest today, ${workoutName} on ${targetDay.day}`,
          swapFromIndex: todayIndex,
          swapToIndex: swapTarget,
        },
        inputs,
      }
    }

    return {
      timeOfDay: 'morning',
      headline: `Skip ${workoutName} — rest instead`,
      body: `Low recovery (${displayScore}/100).${components.sleep <= -1 ? ' Poor sleep is a major factor.' : ''} Replace with a 20-30 min easy walk or full rest.`,
      action: { type: 'skip', label: 'Skip workout', detail: 'Easy walk or rest' },
      inputs,
    }
  }

  // Fallback
  return {
    timeOfDay: 'morning',
    headline: `Today: ${workoutName}`,
    body: `Recovery score: ${displayScore}/100. Execute as planned with mindful pacing.`,
    inputs,
  }
}

/**
 * Evening recommendation — sleep guidance and tomorrow preview.
 */
export function generateEveningCoach(
  todayScore: ReadinessScore | null,
  tomorrowWorkout: PlannedDay | undefined,
  _sleepData: SleepData | undefined,
  bodyBattery: BodyBatteryData | undefined,
  performance: PerformanceMetrics | null,
  _trainingState: TrainingStateInfo | null,
): CoachRecommendation {
  const inputs: string[] = []

  // Calculate sleep target based on tomorrow's workout
  let sleepTargetHours = 7.0
  let sleepTargetLabel = '7+ hours'

  if (tomorrowWorkout) {
    const wt = tomorrowWorkout.type
    if (wt === 'quality' || wt === 'long' || wt === 'race') {
      sleepTargetHours = 8.0
      sleepTargetLabel = '8+ hours'
    } else if (wt === 'strength') {
      sleepTargetHours = 7.5
      sleepTargetLabel = '7.5+ hours'
    }
    inputs.push(`Tomorrow: ${tomorrowWorkout.workout}`)
  }

  // Add extra sleep if fatigued
  if (performance && performance.tsb < -20) {
    sleepTargetHours += 0.5
    sleepTargetLabel = `${sleepTargetHours}+ hours`
    inputs.push(`High fatigue (TSB ${performance.tsb.toFixed(0)}) — extra sleep needed`)
  }

  if (bodyBattery && bodyBattery.current < 40) {
    sleepTargetHours = Math.max(sleepTargetHours, 8.5)
    sleepTargetLabel = `${sleepTargetHours}+ hours`
    inputs.push(`Body Battery low (${bodyBattery.current}/100) — prioritize sleep`)
  }

  if (todayScore) {
    inputs.push(`Today's readiness: ${todayScore.status} (${todayScore.displayScore}/100)`)
  }

  // Calculate ideal bedtime
  // Assume 6:30 AM wake time for morning workouts
  const wakeHour = tomorrowWorkout?.type === 'rest' ? 7.5 : 6.5
  const bedtimeHour = wakeHour + 24 - sleepTargetHours - 0.25 // 15 min to fall asleep
  const bedHr = Math.floor(bedtimeHour % 24)
  const bedMin = Math.round((bedtimeHour % 1) * 60)
  const bedtimeStr = `${bedHr > 12 ? bedHr - 12 : bedHr}:${bedMin.toString().padStart(2, '0')} PM`

  // Build body text
  const tomorrowName = tomorrowWorkout?.workout || 'rest'
  const tomorrowType = tomorrowWorkout?.type || 'rest'

  let headline: string
  let body: string

  if (todayScore && todayScore.status === 'RED') {
    headline = 'Recovery priority tonight'
    body = `You had a tough day (${todayScore.displayScore}/100). `
    if (tomorrowType === 'quality' || tomorrowType === 'long') {
      body += `Tomorrow's ${tomorrowName} is demanding — we'll check your morning readiness before deciding. For now: aim for ${sleepTargetLabel} of sleep (lights out by ${bedtimeStr}).`
    } else {
      body += `Focus on recovery. Target ${sleepTargetLabel} of sleep (lights out by ${bedtimeStr}). Avoid screens 30 min before bed.`
    }
  } else if (todayScore && todayScore.status === 'YELLOW') {
    headline = `Get good sleep for tomorrow's ${tomorrowName}`
    body = `Moderate recovery today. Quality sleep tonight is key.${tomorrowType === 'quality' || tomorrowType === 'long' ? ` Tomorrow's ${tomorrowName} needs you fresh — ` : ' '}Target ${sleepTargetLabel} (lights out by ${bedtimeStr}).`
    if (todayScore.components.sleep <= -1) {
      body += ' Last night was short — prioritize tonight.'
    }
  } else {
    if (tomorrowType === 'rest') {
      headline = 'Rest day tomorrow — recharge'
      body = `Good day to wind down. Aim for ${sleepTargetLabel} of sleep. No alarm needed tomorrow.`
    } else if (tomorrowType === 'quality' || tomorrowType === 'long') {
      headline = `Prep for tomorrow's ${tomorrowName}`
      body = `Big session tomorrow. Get to bed by ${bedtimeStr} for ${sleepTargetLabel} of sleep. Hydrate well tonight and have a light snack if hungry.`
    } else {
      headline = `Sleep well — ${tomorrowName} tomorrow`
      body = `Target ${sleepTargetLabel} of sleep tonight (lights out by ${bedtimeStr}). Hydrate and wind down early.`
    }
  }

  // Add hydration/nutrition tip
  if (performance && performance.tsb < -15) {
    body += ' Extra protein tonight supports muscle repair.'
  }

  return {
    timeOfDay: 'evening',
    headline,
    body,
    sleepTarget: sleepTargetLabel,
    inputs,
  }
}

/**
 * Determine which recommendation to show based on time of day.
 */
export function getCoachTimeOfDay(): CoachTimeOfDay {
  return new Date().getHours() < 14 ? 'morning' : 'evening'
}

/**
 * Find a swap target day (rest/easy) later in the week.
 */
function findSwapTarget(weekDays: PlannedDay[], currentIndex: number): number | null {
  // Look for rest days first, then easy runs, then cross-training
  for (let i = currentIndex + 1; i < weekDays.length; i++) {
    if (weekDays[i].type === 'rest') return i
  }
  for (let i = currentIndex + 1; i < weekDays.length; i++) {
    if (weekDays[i].type === 'run' || weekDays[i].type === 'cross') return i
  }
  return null
}
