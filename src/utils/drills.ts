export interface DrillGuide {
  name: string
  duration: string
  form: string[]
}

/**
 * Pre-run activation: abbreviated Myrtl (~3 min).
 * Wakes up glutes/hips before they need to fire during the run.
 */
export const PRE_RUN_ACTIVATION: DrillGuide[] = [
  {
    name: 'Clam Shell',
    duration: '10 reps each side',
    form: [
      'Lie on your side, knees bent 90°, feet together.',
      'Open your top knee like a clam shell while keeping your feet touching.',
      'Squeeze and hold at the top for 1 second.',
      'Fires up the glute medius — your primary hip stabilizer while running.',
    ],
  },
  {
    name: 'Donkey Kick',
    duration: '10 reps each side',
    form: [
      'On all fours, hands under shoulders, knees under hips.',
      'Keeping your knee bent, drive one foot toward the ceiling.',
      'Squeeze your glute at the top. Don\'t arch your lower back.',
      'Activates your glute max for hip extension — the power behind every stride.',
    ],
  },
  {
    name: 'Fire Hydrant',
    duration: '10 reps each side',
    form: [
      'On all fours. Lift one knee out to the side, keeping it bent 90°.',
      'Raise until your thigh is roughly parallel to the ground.',
      'Keep your hips level — don\'t shift your weight to the other side.',
      'Wakes up the hip abductors that keep your pelvis stable on trails.',
    ],
  },
]

/**
 * Post-run full Myrtl routine (~10 min).
 * Full hip strengthening and mobility after muscles are warm.
 */
export const MYRTL_ROUTINE: DrillGuide[] = [
  {
    name: 'Lateral Leg Raise',
    duration: '10 reps each side',
    form: [
      'Lie on your side, legs straight. Lift your top leg to about 45°.',
      'Lower slowly with control. Don\'t swing.',
      'Keep your hips stacked — don\'t roll backward.',
      'Targets your glute medius, which stabilizes your pelvis on every running stride.',
    ],
  },
  {
    name: 'Clam Shell',
    duration: '10 reps each side',
    form: [
      'Lie on your side, knees bent 90°, feet together.',
      'Open your top knee like a clam shell while keeping your feet touching.',
      'Squeeze and hold at the top for 1 second.',
      'Don\'t let your hips roll backward. Your core stays still.',
    ],
  },
  {
    name: 'Donkey Kick',
    duration: '10 reps each side',
    form: [
      'On all fours, hands under shoulders, knees under hips.',
      'Keeping your knee bent, drive one foot toward the ceiling.',
      'Squeeze your glute at the top. Don\'t arch your lower back.',
      'Return with control. All the movement comes from your hip.',
    ],
  },
  {
    name: 'Fire Hydrant',
    duration: '10 reps each side',
    form: [
      'On all fours. Lift one knee out to the side, keeping it bent 90°.',
      'Raise until your thigh is roughly parallel to the ground.',
      'Keep your hips level — don\'t shift your weight to the other side.',
      'Lower with control.',
    ],
  },
  {
    name: 'Hip Circle (Forward)',
    duration: '10 reps each side',
    form: [
      'On all fours. Lift one knee and make forward circles with it.',
      'Keep the circles controlled and as big as your range allows.',
      'This mobilizes the hip joint through its full range of motion.',
    ],
  },
  {
    name: 'Hip Circle (Backward)',
    duration: '10 reps each side',
    form: [
      'Same position. Reverse the circles — go backward.',
      'You may feel one direction is tighter than the other. That\'s normal.',
    ],
  },
  {
    name: 'Single-Leg Bridge',
    duration: '10 reps each side',
    form: [
      'Lie on your back, one foot flat on the ground, other leg extended toward the ceiling.',
      'Push through your planted foot to lift your hips.',
      'Squeeze your glute at the top for 1-2 seconds.',
      'Lower slowly. Keep your hips level throughout.',
      'This builds the single-leg hip stability crucial for trail running.',
    ],
  },
  {
    name: 'Prone Flutter Kick',
    duration: '20 reps (10 per leg)',
    form: [
      'Lie face down, arms at your sides or under your forehead.',
      'Lift both legs slightly off the ground.',
      'Alternate small kicks — like swimming flutter kick.',
      'Keep your glutes engaged. Don\'t hyperextend your lower back.',
    ],
  },
]

export const RUNNING_DRILLS: DrillGuide[] = [
  {
    name: 'High Knees',
    duration: '2 × 30 meters',
    form: [
      'Drive your knees up to hip height with each step.',
      'Stay on the balls of your feet. Quick ground contact.',
      'Pump your arms — opposite arm, opposite leg.',
      'Focus on posture: tall torso, slight forward lean.',
    ],
  },
  {
    name: 'Butt Kicks',
    duration: '2 × 30 meters',
    form: [
      'Jog forward, flicking your heels up to touch your butt.',
      'Keep your knees pointing down — the motion is behind you.',
      'Quick cadence. Stay light on your feet.',
      'Builds hamstring firing speed for the running cycle.',
    ],
  },
  {
    name: 'A-Skip',
    duration: '2 × 30 meters',
    form: [
      'Skip forward, driving one knee up to hip height on each skip.',
      'The other leg pushes off the ground with a quick hop.',
      'Opposite arm drives with the knee.',
      'Focus on rhythm and height, not speed.',
      'This is the #1 drill for running form — it teaches knee drive and hip extension.',
    ],
  },
  {
    name: 'B-Skip',
    duration: '2 × 30 meters',
    form: [
      'Same as A-Skip, but after driving your knee up, extend your leg forward and "paw" back.',
      'The pawing motion mimics pulling the ground beneath you.',
      'Builds the hip extension power that propels you uphill.',
    ],
  },
  {
    name: 'Carioca (Grapevine)',
    duration: '2 × 30 meters each direction',
    form: [
      'Move laterally, crossing your trailing foot in front, then behind.',
      'Keep your hips facing forward while your legs cross.',
      'Let your arms rotate naturally for balance.',
      'Builds hip mobility and coordination for technical trail.',
    ],
  },
  {
    name: 'Strides',
    duration: '4 × 20 seconds (80-100m)',
    form: [
      'Accelerate smoothly to about 85-90% effort over 80-100 meters.',
      'Focus on smooth, relaxed speed — not straining.',
      'Decelerate gradually. Walk back to start.',
      'These activate fast-twitch fibers and reinforce good form.',
      'NOT sprinting — think "controlled fast." You should look smooth.',
    ],
  },
]

export interface RunSegment {
  label: string
  duration: string
  effort: string
  cues: string[]
}

export function parseIntervalWorkout(detail: string, zone: string): RunSegment[] {
  const segments: RunSegment[] = []

  // Always start with warm-up
  segments.push({
    label: 'Warm-Up',
    duration: '10-15 min',
    effort: 'Z1 — very easy jog',
    cues: [
      'Start walking, then gradually pick up to an easy jog.',
      'Include 4-5 leg swings per side and light dynamic stretches.',
      'By the end, you should feel loose and warm — breathing slightly elevated.',
    ],
  })

  // Parse hill repeats: "4×90 sec uphill @ Z3"
  const hillMatch = detail.match(/(\d+)\s*[×x]\s*(\d+)\s*sec\s*(?:uphill|max effort)/i)
  if (hillMatch) {
    const reps = parseInt(hillMatch[1])
    const seconds = parseInt(hillMatch[2])
    for (let i = 1; i <= reps; i++) {
      segments.push({
        label: `Hill Repeat ${i} of ${reps}`,
        duration: `${seconds} sec uphill`,
        effort: zone.includes('Z4') ? 'Z4 — hard, powerful' : 'Z3 — comfortably hard',
        cues: [
          'Lean slightly forward into the hill. Shorten your stride.',
          'Drive your knees and pump your arms. Strong, rhythmic effort.',
          zone.includes('Z4') ? 'This is HARD — you should only be able to say a few words.' : 'Comfortably hard — short sentences only.',
          i === reps ? 'Last one — give it everything you\'ve got.' : 'Save something for the next rep.',
        ],
      })
      segments.push({
        label: `Recovery ${i}`,
        duration: 'Jog/walk back down (2-3 min)',
        effort: 'Z1 — easy',
        cues: ['Walk or very easy jog back to the bottom.', 'Full recovery before the next rep. HR should drop below 130.'],
      })
    }
  }

  // Parse tempo intervals: "3×5 min @ Z3"
  const tempoMatch = detail.match(/(\d+)\s*[×x]\s*(\d+)\s*min\s*@?\s*Z(\d)/i)
  if (tempoMatch && !hillMatch) {
    const reps = parseInt(tempoMatch[1])
    const mins = parseInt(tempoMatch[2])
    for (let i = 1; i <= reps; i++) {
      segments.push({
        label: `Tempo Interval ${i} of ${reps}`,
        duration: `${mins} min`,
        effort: `Z${tempoMatch[3]} — sustained push`,
        cues: [
          'Settle into a rhythm you can hold for the full interval.',
          'Breathing is heavy but controlled. Short sentences.',
          'Focus on form: tall posture, relaxed shoulders, quick feet.',
          i === 1 ? 'Don\'t go out too hard — build into the effort.' : '',
        ].filter(Boolean),
      })
      const restMatch = detail.match(/(\d+)\s*min\s*easy\s*between/i)
      const restMin = restMatch ? restMatch[1] : '3'
      if (i < reps) {
        segments.push({
          label: `Recovery ${i}`,
          duration: `${restMin} min easy`,
          effort: 'Z1-2 — easy jog',
          cues: ['Easy jog. Shake out your arms. Let HR come down.'],
        })
      }
    }
  }

  // Parse sustained climb: "30 min Z3–4 sustained climb"
  const sustainedMatch = detail.match(/(\d+)\s*min\s*Z\d[–-]\d\s*sustained/i)
  if (sustainedMatch && !hillMatch && !tempoMatch) {
    segments.push({
      label: 'Sustained Climb',
      duration: `${sustainedMatch[1]} min`,
      effort: 'Z3-4 — hard, steady effort',
      cues: [
        'Find a consistent climbing rhythm you can hold the entire time.',
        'Use poles if you have them — practice the plant cadence.',
        'Short steps, slight forward lean, drive with your glutes.',
        'This simulates the long climbs at Broken Arrow.',
      ],
    })
  }

  // Parse race-pace intervals: "4×6 min @ Z3–4 uphill"
  const racePaceMatch = detail.match(/(\d+)\s*[×x]\s*(\d+)\s*min\s*@?\s*Z\d[–-]\d\s*uphill/i)
  if (racePaceMatch && !hillMatch && !tempoMatch) {
    const reps = parseInt(racePaceMatch[1])
    const mins = parseInt(racePaceMatch[2])
    for (let i = 1; i <= reps; i++) {
      segments.push({
        label: `Race-Pace Rep ${i} of ${reps}`,
        duration: `${mins} min uphill`,
        effort: 'Z3-4 — race effort',
        cues: [
          'This is what race day will feel like. Settle into it.',
          'Poles if you have them. Practice your race-day rhythm.',
          'Focus on sustainable power, not max effort.',
          i === reps ? 'Final rep — finish strong but controlled.' : '',
        ].filter(Boolean),
      })
      if (i < reps) {
        segments.push({
          label: `Recovery ${i}`,
          duration: 'Jog/walk down (3-4 min)',
          effort: 'Z1 — easy',
          cues: ['Easy jog or walk back down. Full recovery.'],
        })
      }
    }
  }

  // Cool-down
  segments.push({
    label: 'Cool-Down',
    duration: '10 min',
    effort: 'Z1 — easy jog to walk',
    cues: [
      'Easy jog, gradually slowing to a walk.',
      'Light stretching: calves, quads, hip flexors (30 sec each).',
      'This is when your body starts recovering. Don\'t skip it.',
    ],
  })

  return segments
}

/**
 * Determine which day in a week should get the drills/Myrtl add-on.
 * Prefer easy run days (type 'run') earlier in the week.
 */
export function getDrillDay(weekNum: number): string {
  // Recommend drills on easy run days — typically Tue or Wed
  const drillDays: Record<number, string> = {
    1: 'Tue 4/14',   // Easy run
    2: 'Tue 4/21',   // Easy run
    3: 'Wed 4/30',   // Easy run
    4: 'Tue 5/6',    // Easy run
    5: 'Thu 5/15',   // Easy run + strides
    6: 'Wed 5/21',   // Easy run
    7: 'Tue 5/27',   // Easy run
    8: 'Tue 6/3',    // Easy run + strides
    9: 'Tue 6/10',   // Easy run
    10: 'Mon 6/16',  // Easy shakeout
  }
  return drillDays[weekNum] || ''
}
