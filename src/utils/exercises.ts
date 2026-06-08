import type { StrengthExperience } from '../hooks/useOnboarding'

export interface ExerciseAlternate {
  /** Short label for the substitute exercise. */
  name: string
  /** Equipment needed (e.g. "Dumbbells", "Med ball", "Bodyweight"). */
  equipment: string
  /** Optional swap rationale or short cue. */
  notes?: string
}

export interface ExerciseGuide {
  name: string
  aka: string
  weight: string
  rest: string
  form: string[]
  /** Same-stimulus substitutes for athletes with different equipment. */
  alternates?: ExerciseAlternate[]
}

const GUIDES: Record<string, ExerciseGuide> = {
  'db row': {
    name: 'Dumbbell Row',
    aka: 'A bent-over pulling exercise — you row a dumbbell up toward your ribs',
    weight: '15-25 lb dumbbell (one arm at a time)',
    rest: '60 sec between sets',
    form: [
      'Put your left knee and left hand on a bench. Right foot flat on the floor.',
      'Hold a dumbbell in your right hand, arm hanging straight down.',
      'Keep your back flat and roughly parallel to the floor — like a tabletop.',
      'Pull the dumbbell up to the side of your ribs, leading with your elbow.',
      'Squeeze your shoulder blade at the top. Don\'t twist your torso to heave it up.',
      'Lower under control until your arm is straight again.',
      'Do all reps on one side, then switch. Rows balance out all the pushing you do.',
    ],
    alternates: [
      { name: 'Bent-over row (both arms)', equipment: 'Two dumbbells or a barbell', notes: 'Hinge at the hips, row both weights to your ribs.' },
      { name: 'Resistance-band row', equipment: 'Band', notes: 'Anchor at chest height, step back, pull the handles to your ribs.' },
      { name: 'Inverted row', equipment: 'Bar or rings/TRX', notes: 'Bodyweight pull under a waist-height bar — scale by walking your feet in or out.' },
    ],
  },
  'farmer carry': {
    name: 'Farmer Carry',
    aka: 'Walking tall while holding a heavy weight in each hand',
    weight: '20-40 lb dumbbells or kettlebells (one in each hand)',
    rest: '60 sec between rounds',
    form: [
      'Hold a weight in each hand at your sides — like carrying two heavy suitcases.',
      'Stand tall: chest up, shoulders back and down, core braced.',
      'Walk with short, controlled steps for the prescribed time (e.g. 40 sec).',
      'Keep the weights from swinging — grip hard and stay steady.',
      'Breathe normally; don\'t hold your breath.',
      'Builds grip, core stability, and posture — direct carryover to everyday lifting and carrying.',
    ],
    alternates: [
      { name: 'Suitcase carry', equipment: 'One dumbbell', notes: 'Carry on one side only for anti-tip core work. Switch hands each round.' },
      { name: 'Front-rack carry', equipment: 'Two dumbbells', notes: 'Hold the weights at your shoulders to shift the demand onto your core.' },
      { name: 'Loaded march in place', equipment: 'Dumbbells', notes: 'No room to walk? March in place holding the weights.' },
    ],
  },
  'goblet squat': {
    name: 'Goblet Squat',
    aka: 'A squat holding a dumbbell at your chest',
    weight: '20-30 lb dumbbell (focus on control, not load)',
    rest: '60 sec between sets',
    form: [
      'Hold the dumbbell vertically at your chest, cupping the top end with both hands.',
      'Feet shoulder-width apart, toes turned out slightly (~15°).',
      'Push your hips back and down like sitting into a chair. Keep your chest tall.',
      'Go as deep as you can while keeping your heels flat — aim for thighs parallel or below.',
      'Drive through your whole foot to stand back up. Squeeze your glutes at the top.',
      'The weight at your chest helps you stay upright — use that to your advantage.',
    ],
  },
  'bb back squat': {
    name: 'Barbell Back Squat',
    aka: 'The classic squat with a barbell on your upper back',
    weight: '95-115 lb (moderate — muscular endurance focus)',
    rest: '60-90 sec between sets',
    form: [
      'Bar sits on your upper traps (high bar) — NOT on your neck bones.',
      'Feet shoulder-width, toes slightly out. Grip the bar wider than shoulders.',
      'Big breath into your belly before each rep. Brace your core hard.',
      'Push hips back and down. Knees track over your toes — don\'t let them cave in.',
      'Go to parallel or just below (hip crease at knee level).',
      'Drive up through your heels. Exhale at the top.',
      'Start each set from the rack. Always use safety bars/spotter with heavy weight.',
    ],
  },
  'back squat': {
    name: 'Barbell Back Squat',
    aka: 'The classic squat with a barbell on your upper back',
    weight: '95-115 lb (moderate — muscular endurance focus)',
    rest: '60-90 sec between sets',
    form: [
      'Bar sits on your upper traps (high bar) — NOT on your neck bones.',
      'Feet shoulder-width, toes slightly out. Grip the bar wider than shoulders.',
      'Big breath into your belly before each rep. Brace your core hard.',
      'Push hips back and down. Knees track over your toes — don\'t let them cave in.',
      'Go to parallel or just below (hip crease at knee level).',
      'Drive up through your heels. Exhale at the top.',
      'Heavier week: fewer reps, more rest. Focus on quality.',
    ],
  },
  'bb squat': {
    name: 'Barbell Back Squat',
    aka: 'The classic squat with a barbell on your upper back',
    weight: '95-115 lb (moderate — muscular endurance focus)',
    rest: '60-90 sec between sets',
    form: [
      'Bar sits on your upper traps (high bar) — NOT on your neck bones.',
      'Feet shoulder-width, toes slightly out. Grip the bar wider than shoulders.',
      'Big breath into your belly before each rep. Brace your core hard.',
      'Push hips back and down. Knees track over your toes — don\'t let them cave in.',
      'Go to parallel or just below (hip crease at knee level).',
      'Drive up through your heels. Exhale at the top.',
    ],
  },
  'bulgarian split squat': {
    name: 'Bulgarian Split Squat',
    aka: 'A single-leg squat with your back foot elevated on a bench',
    weight: 'Bodyweight or 10-15 lb dumbbells (one in each hand)',
    rest: '60 sec between sets (each leg counts as a set)',
    form: [
      'Stand 2-3 feet in front of a bench. Put the top of your back foot on the bench.',
      'Hold a dumbbell in each hand at your sides.',
      'Lower straight down until your front thigh is parallel to the floor.',
      'Keep your front knee tracking over your toes — don\'t let it drift inward.',
      'Your torso stays upright, slight forward lean is okay.',
      'Push through your front heel to stand back up.',
      'Do all reps on one leg, then switch. This builds single-leg stability for trails.',
    ],
  },
  'leg press': {
    name: 'Leg Press',
    aka: 'Machine exercise where you push a weighted sled with your feet',
    weight: '135-160 lb (machine — moderate, focus on endurance)',
    rest: '60 sec between sets',
    form: [
      'Sit in the machine with your back flat against the pad.',
      'Feet hip-width apart on the platform, positioned in the middle.',
      'Lower the sled by bending your knees toward your chest — go to about 90° knee bend.',
      'Push through your whole foot to extend. Don\'t lock your knees at the top.',
      'Keep your lower back pressed into the pad the entire time.',
      'Control the lowering phase — don\'t let the weight drop.',
    ],
  },
  'sl leg press': {
    name: 'Single-Leg Leg Press',
    aka: 'Leg press using one leg at a time — builds trail-running balance',
    weight: '70-90 lb (machine, per leg)',
    rest: '60 sec between legs',
    form: [
      'Same setup as regular leg press, but only one foot on the platform.',
      'Center your foot on the platform for stability.',
      'Lower slowly to ~90° knee bend. Push back up through your heel.',
      'Keep your hips level — don\'t let the working side drop.',
      'Do all reps on one leg, then switch.',
      'This mimics the single-leg demands of trail running.',
    ],
  },
  'rdl': {
    name: 'Romanian Deadlift (RDL)',
    aka: 'A hip hinge exercise — you bend forward at the hips while keeping your legs nearly straight. NOT a squat.',
    weight: '20-25 lb dumbbells (one in each hand)',
    rest: '60-90 sec between sets',
    form: [
      'Stand with feet hip-width. Hold dumbbells in front of your thighs (or barbell).',
      'Slight bend in your knees — keep them soft but don\'t bend more during the movement.',
      'Push your HIPS BACK (like closing a car door with your butt). Your torso tips forward.',
      'Keep the weights close to your legs as you lower. They should almost brush your shins.',
      'Lower until you feel a strong stretch in your hamstrings — usually mid-shin level.',
      'Squeeze your glutes to stand back up. Think "hips forward" not "back up."',
      'Your back stays flat the entire time — if it rounds, you\'ve gone too deep.',
      'This is THE exercise for hamstring strength. Essential for uphill power and downhill braking.',
    ],
  },
  'walking lunge': {
    name: 'Walking Lunge',
    aka: 'Stepping forward into a lunge and walking across the room',
    weight: 'Bodyweight or 15-20 lb dumbbells',
    rest: '60 sec between sets',
    form: [
      'Take a large step forward. Lower your back knee toward the floor.',
      'Front knee stays over your ankle — don\'t let it shoot past your toes.',
      'Lower until your back knee almost touches the ground.',
      'Push off your front foot to step forward into the next lunge.',
      'Keep your torso upright and core engaged throughout.',
      'This builds single-leg strength and hip stability for uneven trail terrain.',
    ],
  },
  'step-up': {
    name: 'Step-Up',
    aka: 'Stepping onto a bench or box one leg at a time',
    weight: 'Bodyweight or 15-20 lb dumbbells',
    rest: '60 sec between sets',
    form: [
      'Stand facing a bench or sturdy box (16-20 inches high).',
      'Place your entire foot on the box. Drive through that foot to step up.',
      'Don\'t push off your bottom foot — the top leg does all the work.',
      'Stand fully upright on the box, then step down with control.',
      'Alternate legs or do all reps on one side, then switch.',
      'Directly mimics the uphill climbing motion at Broken Arrow.',
    ],
  },
  'calf raise': {
    name: 'Calf Raises',
    aka: 'Rising up onto your toes to strengthen your calves',
    weight: 'Bodyweight or hold 25-35 lb dumbbell',
    rest: '45-60 sec between sets',
    form: [
      'Stand on the edge of a step with your heels hanging off.',
      'Rise up onto your toes as high as you can. Pause for 1 second at the top.',
      'Lower slowly (2-3 seconds) below the step level for a full stretch.',
      'Keep your legs straight — this targets the gastrocnemius (main calf muscle).',
      'For extra difficulty, do single-leg. Hold a wall or rail for balance.',
      'Strong calves protect your Achilles and power you uphill.',
    ],
  },
  'sl calf raise': {
    name: 'Single-Leg Calf Raise',
    aka: 'Calf raise on one leg — harder but more trail-specific',
    weight: 'Bodyweight',
    rest: '45 sec between legs',
    form: [
      'Same as regular calf raise but on one foot.',
      'Hold a wall or rail for balance.',
      'Rise up slowly, pause 1 sec, lower slowly (3 sec).',
      'Do all reps on one leg, then switch.',
    ],
  },
  'weighted calf raise': {
    name: 'Weighted Calf Raises',
    aka: 'Calf raises holding extra weight for added resistance',
    weight: '20-30 lb dumbbell in one hand',
    rest: '60 sec between sets',
    form: [
      'Stand on a step edge. Hold a dumbbell in one hand, other hand on wall for balance.',
      'Rise up onto your toes. Pause 1 sec at the top.',
      'Lower slowly (3 sec) past the step for full range of motion.',
      'Strong calves = faster uphill + protected Achilles tendons.',
    ],
  },
  'eccentric calf drop': {
    name: 'Eccentric Calf Drops',
    aka: 'A slow lowering movement for calf/Achilles health — the lowering is the exercise',
    weight: 'Bodyweight',
    rest: '30-45 sec between sets',
    form: [
      'Stand on a step with both feet. Rise up onto your toes with BOTH legs.',
      'Shift your weight to ONE leg. Now lower slowly (4-5 seconds) below the step.',
      'Use both legs to rise back up. Then lower on one leg again.',
      'The SLOW LOWERING is the exercise — this strengthens your Achilles tendon eccentrically.',
      'This is injury prevention: the #1 way to protect against Achilles tendinitis.',
    ],
  },
  'eccentric squat': {
    name: 'Eccentric Squat (4-sec lower)',
    aka: 'A squat where you lower very slowly — the lowering is the hard part',
    weight: '75-95 lb barbell (or goblet squat with 25 lb DB)',
    rest: '90 sec between sets',
    form: [
      'Set up like a normal back squat.',
      'Lower for a full 4 SECONDS — count "one-Mississippi" on the way down.',
      'Go to parallel or below, then stand up at normal speed.',
      'The slow lowering (eccentric phase) builds strength at long muscle lengths.',
      'This is critical for steep downhill running — eccentric quad strength saves your legs on descents.',
      'Fewer reps than normal squats because eccentric work is very demanding.',
    ],
  },
  'eccentric step-down': {
    name: 'Eccentric Step-Down',
    aka: 'Standing on a box and slowly lowering one foot toward the floor',
    weight: 'Bodyweight',
    rest: '45-60 sec between sets',
    form: [
      'Stand on a box or step (8-12 inches) on one leg.',
      'Slowly bend your standing knee to lower your other foot toward the floor (3-4 sec).',
      'Lightly tap the floor with your heel, then push back up.',
      'Keep your hips level — don\'t let the lowering side drop.',
      'This builds the exact eccentric quad strength needed for Shirley Canyon\'s descent.',
      'If using stairs: stand on a stair, lower your foot to the next stair down slowly.',
    ],
  },
  'nordic curl': {
    name: 'Nordic Curl',
    aka: 'A hamstring exercise where you lower your body forward from a kneeling position',
    weight: 'Bodyweight (this is HARD — use a band for assistance if needed)',
    rest: '90 sec between sets',
    form: [
      'Kneel on a pad. Anchor your ankles under something heavy (bench, partner\'s hands).',
      'Start upright. Slowly lower your body FORWARD by straightening at the knees.',
      'Keep your hips extended (don\'t bend at the waist). Your body is a straight line.',
      'Lower as far as you can control — even a few inches is effective.',
      'Catch yourself with your hands if needed, then push back up and use your hamstrings to pull yourself upright.',
      'This is one of the most effective hamstring exercises. 3-5 reps is plenty.',
      'If too hard: loop a resistance band from the anchor to your chest for assistance.',
    ],
  },
  'eccentric nordic curl': {
    name: 'Eccentric Nordic Curl',
    aka: 'Nordic curl focused on the slow lowering only',
    weight: 'Bodyweight',
    rest: '90 sec between sets',
    form: [
      'Same setup as Nordic curl. Focus on the LOWERING phase only.',
      'Lower as slowly as you can (5+ seconds).',
      'Catch yourself with your hands. Push back up to start position.',
      'You don\'t need to pull yourself back up with hamstrings — just the lowering.',
      'Even 3-5 slow eccentrics is extremely effective for hamstring strength.',
    ],
  },
  'dead bug': {
    name: 'Dead Bug',
    aka: 'A core exercise lying on your back — looks like an upside-down bug',
    weight: 'Bodyweight',
    rest: '30-45 sec between sets',
    form: [
      'Lie on your back. Arms straight up toward the ceiling. Knees bent 90° above your hips.',
      'Press your lower back into the floor — no gap between your back and the ground.',
      'Slowly extend your RIGHT arm overhead and LEFT leg out straight simultaneously.',
      'Return to start. Then extend LEFT arm and RIGHT leg.',
      'Your lower back must stay pressed to the floor the entire time.',
      'If your back arches, you\'ve gone too far. Shorten the range of motion.',
      'This builds deep core stability — essential for maintaining form on tired mountain legs.',
    ],
  },
  'plank': {
    name: 'Plank',
    aka: 'A core hold on your forearms — simple but effective',
    weight: 'Bodyweight',
    rest: '30-45 sec between sets',
    form: [
      'Forearms on the ground, elbows under your shoulders.',
      'Body in a straight line from head to heels. Don\'t let your hips sag or pike up.',
      'Squeeze your glutes and brace your core like someone\'s about to poke your stomach.',
      'Breathe normally — don\'t hold your breath.',
      'Look at the floor to keep your neck neutral.',
      'If shaking, good — that\'s your deep stabilizers working.',
    ],
  },
  'side plank': {
    name: 'Side Plank',
    aka: 'A plank on your side — targets obliques and hip stability',
    weight: 'Bodyweight',
    rest: '15-30 sec between sides',
    form: [
      'Lie on your side. Bottom forearm on the ground, elbow under your shoulder.',
      'Stack your feet or stagger them (staggered is easier).',
      'Lift your hips so your body forms a straight line.',
      'Don\'t let your hips drop forward or backward.',
      'Hold and breathe. Builds the lateral hip stability needed for trail camber.',
    ],
  },
  'bird dog': {
    name: 'Bird Dog',
    aka: 'A core exercise on all fours — opposite arm and leg extend',
    weight: 'Bodyweight',
    rest: '30 sec between sets',
    form: [
      'Start on hands and knees. Hands under shoulders, knees under hips.',
      'Extend your RIGHT arm forward and LEFT leg back simultaneously.',
      'Hold for 2-3 seconds. Keep your hips level — don\'t rotate.',
      'Return to start. Switch to LEFT arm and RIGHT leg.',
      'Move slowly and deliberately. This is about control, not speed.',
      'Builds anti-rotation core strength for uneven trail surfaces.',
    ],
  },
  'glute bridge': {
    name: 'Glute Bridge',
    aka: 'Lying on your back and pushing your hips up — activates your glutes',
    weight: 'Bodyweight (or place a 25-35 lb plate on your hips)',
    rest: '30-45 sec between sets',
    form: [
      'Lie on your back, knees bent, feet flat on the floor hip-width apart.',
      'Push through your heels to lift your hips toward the ceiling.',
      'Squeeze your glutes HARD at the top. Hold for 1-2 seconds.',
      'Lower slowly. Don\'t just drop.',
      'Your body should form a straight line from shoulders to knees at the top.',
      'Glutes are your primary uphill engine. This wakes them up.',
    ],
  },
  'weighted hip thrust': {
    name: 'Weighted Hip Thrust',
    aka: 'Like a glute bridge but with your back on a bench and a barbell on your hips',
    weight: '65-85 lb barbell across hips (use a bar pad)',
    rest: '60-90 sec between sets',
    form: [
      'Sit on the floor with your upper back against a bench. Barbell across your hip crease.',
      'Use a bar pad or folded towel for comfort.',
      'Feet flat, hip-width apart. Push through your heels to drive hips up.',
      'At the top: shins vertical, body in a straight line from shoulders to knees.',
      'Squeeze glutes hard for 1 sec at the top.',
      'Lower with control. Don\'t bounce off the bottom.',
      'The king of glute exercises. Builds the hip extension power for climbing.',
    ],
  },
  'push-up': {
    name: 'Push-Up',
    aka: 'The classic bodyweight chest/arm exercise',
    weight: 'Bodyweight',
    rest: '45-60 sec between sets',
    form: [
      'Hands slightly wider than shoulder-width. Fingers spread.',
      'Body in a straight line — same rules as plank.',
      'Lower your chest to the floor (or as close as you can). Elbows at ~45° angle.',
      'Push back up to full arm extension.',
      'If full push-ups are too hard, drop to your knees — no shame in scaling.',
    ],
    alternates: [
      { name: 'DB floor press', equipment: 'Dumbbells', notes: 'Lying on the floor, press DBs up from chest. Same horizontal-push pattern, lets you scale load precisely.' },
      { name: 'Knee push-ups', equipment: 'Bodyweight', notes: 'Same torso line, knees on floor. Reduces load by ~30%.' },
      { name: 'Incline push-ups', equipment: 'Bench / box', notes: 'Hands on a raised surface — easier the higher the surface.' },
      { name: 'DB bench press', equipment: 'Dumbbells + bench', notes: 'If you have a bench, this loads the same pattern with more leverage for heavy reps.' },
    ],
  },
  'sl deadlift': {
    name: 'Single-Leg Deadlift (SL Deadlift)',
    aka: 'An RDL on one leg — builds balance and hamstring strength',
    weight: '15-20 lb dumbbell in opposite hand',
    rest: '45-60 sec between legs',
    form: [
      'Stand on one leg. Hold a dumbbell in the OPPOSITE hand.',
      'Hinge forward at your hips (same as RDL) while your free leg goes straight back.',
      'Your body and back leg form a T-shape.',
      'Lower until the dumbbell is around mid-shin. Feel the hamstring stretch.',
      'Squeeze your glute to stand back up.',
      'It\'s okay to wobble — that\'s your stabilizers working. Use a wall for balance if needed.',
      'This builds the single-leg stability you need on technical trail.',
    ],
  },
  'bw squat': {
    name: 'Bodyweight Squat',
    aka: 'A squat using just your body weight — no equipment needed',
    weight: 'Bodyweight',
    rest: '30-45 sec between sets',
    form: [
      'Feet shoulder-width, toes slightly out.',
      'Arms out front for balance or hands behind your head.',
      'Sit back and down. Keep your chest up.',
      'Go as deep as you can with good form. Heels stay on the ground.',
      'Stand up by driving through your whole foot.',
    ],
  },
  'squat jump': {
    name: 'Squat Jump',
    aka: 'A bodyweight squat with an explosive jump at the top',
    weight: 'Bodyweight',
    rest: '60-90 sec between sets',
    form: [
      'Start in a squat position — feet shoulder-width, thighs near parallel.',
      'Explode upward as high as you can. Arms swing up for momentum.',
      'Land softly — bend your knees to absorb the impact. Don\'t land stiff-legged.',
      'Immediately sink into the next squat and jump again.',
      'This builds explosive power for steep trail climbs.',
      'Land quietly = good form. Loud landing = too stiff.',
    ],
  },
  // ── Upper body / mobility additions ────────────────────────────
  'dead hang': {
    name: 'Dead Hang',
    aka: 'Passive hang from a pull-up bar — grip strength + lat decompression',
    weight: 'Bodyweight (add a 10-20 lb DB held between feet for extra grip work)',
    rest: '60-90 sec between sets',
    form: [
      'Grip a pull-up bar with both hands, slightly wider than shoulders. Palms forward.',
      'Hang completely — let your shoulders relax up toward your ears. Breathe.',
      'Engage your core mildly so you\'re not just hanging from your spine.',
      'Aim for 15-30s holds. Build up over weeks.',
      'Release the bar before your grip fails — drop with control.',
      'No pull-up bar? See alternates below.',
    ],
    alternates: [
      { name: 'DB farmer\'s hold', equipment: 'Dumbbells', notes: 'Heavy DBs at sides, stand tall, hold for 30-45s. Same grip + postural stimulus.' },
      { name: 'DB pullover', equipment: 'Dumbbell + bench', notes: 'Lying on bench, dumbbell over chest, lower arms behind head. Hits the lat-stretch component.' },
      { name: 'Hollow body hold', equipment: 'Bodyweight', notes: 'Lie supine, lower back pressed to floor, arms overhead. 20-30s. Trains the same shoulder + core integration.' },
      { name: 'Plate pinch hold', equipment: 'Plates / heavy book', notes: 'Pinch two plates together with fingers, hold 20-30s per side.' },
    ],
  },
  'russian twist': {
    name: 'Russian Twists',
    aka: 'Seated rotational core — obliques and trunk control',
    weight: 'Med ball, dumbbell, or bodyweight (heels lifted for harder)',
    rest: '45-60 sec between sets',
    form: [
      'Sit on the floor, knees bent, feet flat (or heels lifted for harder).',
      'Lean back ~45° so abs are engaged the whole set.',
      'Hold a med ball or dumbbell at chest. Rotate side to side, tapping next to your hip.',
      'Move from your trunk, not your arms. Keep chest tall.',
      'Slow and controlled — momentum makes the obliques lazy.',
      'One full left+right = 1 rep (so 20 reps = 10 each side).',
    ],
    alternates: [
      { name: 'DB Russian twists', equipment: 'Dumbbells', notes: 'Same motion holding a single dumbbell at chest.' },
      { name: 'Bicycle crunches', equipment: 'Bodyweight', notes: 'Lying on back, alternate elbow to opposite knee. Same oblique + rotation pattern.' },
      { name: 'Side plank with reach-through', equipment: 'Bodyweight', notes: 'Side plank, top arm threads under torso then opens to ceiling. Slower tempo, more shoulder stability.' },
      { name: 'Pallof press', equipment: 'Band or cable', notes: 'Press a band straight out from chest while resisting rotation. Anti-rotation cousin to twists.' },
    ],
  },
  'myrtl': {
    name: 'Myrtl Hip Routine',
    aka: 'Glute medius / hip rotator activation routine — runner staple',
    weight: 'Bodyweight',
    rest: 'Move continuously through all movements',
    form: [
      'Lateral leg swings — 10 each leg. Stand tall, swing one leg side to side.',
      'Front-to-back swings — 10 each leg. Forward and back, foot stays flexed.',
      'Hurdle trail — 10 each leg. Bring knee up, around, and over an imaginary hurdle.',
      'Hurdle lead — 10 each leg. Same motion in reverse.',
      'Donkey kicks — 10 each leg. On hands and knees, kick straight up.',
      'Donkey whips — 10 each leg. Same start, knee swings out then back to center.',
      'Fire hydrants — 10 each leg. On hands and knees, knee opens out to side.',
      'Knee circles — 10 each direction per leg. Knee draws a circle in the air.',
      'Total: about 5-8 minutes. Best done before runs to prime the hip stabilizers.',
    ],
    alternates: [
      { name: '90/90 hip switches', equipment: 'Bodyweight', notes: 'Sit with both knees at 90°, rotate side to side. Hits internal/external rotation.' },
      { name: 'Standing leg circles', equipment: 'Bodyweight', notes: 'Stand on one leg, draw circles with the other knee. 10 each direction.' },
      { name: 'Banded clamshells + monster walks', equipment: 'Mini band', notes: 'Clamshells (15/side) + lateral monster walks (10 each direction). Loaded glute med work.' },
    ],
  },
  'foam roll': {
    name: 'Foam Roll (quads / calves)',
    aka: 'Self-myofascial release — eases tight tissue',
    weight: 'Foam roller',
    rest: 'Continuous — about 1-2 min per area',
    form: [
      'Quads: face down, roller across the front of one thigh. Roll slowly from hip to knee.',
      'Pause 20-30s on any tender spot. Breathe deeply — don\'t hold tension.',
      'Inner / outer quad: rotate the leg so the roller hits VMO (inner) and IT band-side outer quad.',
      'Calves: sit with the roller under one calf. Cross the other leg on top for more pressure.',
      'Roll from Achilles to back of knee. Pause on knots.',
      'Total: ~5 min per side. Daily after runs is ideal.',
      'Discomfort = normal. Sharp pain = back off pressure.',
    ],
    alternates: [
      { name: 'Lacrosse / tennis ball', equipment: 'Ball', notes: 'Smaller, more targeted pressure. Good for calf knots and IT band-adjacent tight spots.' },
      { name: 'Massage gun', equipment: 'Percussion gun', notes: '60-90s per area. More superficial than foam rolling but quicker.' },
      { name: 'Couch / wall stretch', equipment: 'Bodyweight', notes: 'If you have no roller — couch quad stretch (rear foot on couch, lunge forward) hits the rec fem and quads similarly.' },
    ],
  },
}

export interface ParsedExercise {
  name: string
  sets: string
  reps: string
  guide: ExerciseGuide | null
}

export function parseRoutine(detail: string): ParsedExercise[] {
  const parts = detail.split('·').map(s => s.trim()).filter(Boolean)
  return parts.map(part => {
    const setsMatch = part.match(/(\d+)\s*[×x]\s*(\d+\s*(?:\/\s*(?:leg|side))?\s*(?:s|sec)?)/i)
    const sets = setsMatch ? setsMatch[1] : ''
    const reps = setsMatch ? setsMatch[2].trim() : ''
    const guide = findGuide(part)
    return { name: part, sets, reps, guide }
  })
}

function findGuide(exerciseText: string): ExerciseGuide | null {
  const lower = exerciseText.toLowerCase()
  // Try exact-ish matches from most specific to least
  const keys = Object.keys(GUIDES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return GUIDES[key]
  }
  return null
}

export function getExerciseGuide(name: string): ExerciseGuide | null {
  return findGuide(name)
}

// Multiplier applied to the guide's default load per lifting background.
// Experienced (and unspecified, e.g. seed athletes) keep the library default;
// less-experienced lifters get scaled-down starting weights so the defaults
// aren't intimidating or unsafe.
const CALIBRATION_FACTOR: Record<StrengthExperience, number> = {
  new: 0.5,
  recreational: 0.75,
  experienced: 1,
}

/**
 * Scale the numeric load(s) in a guide's `weight` string to the athlete's
 * lifting background. Weight strings only ever contain weight numbers (e.g.
 * "20-30 lb dumbbell", "95-115 lb (moderate)"), so scaling every numeric
 * token is safe. Bodyweight-only strings have no numbers and pass through
 * unchanged. Rounds to the nearest 5 lb with a 5 lb floor.
 */
export function calibrateGuideWeight(
  weight: string,
  level?: StrengthExperience,
): string {
  if (!level || level === 'experienced') return weight
  const factor = CALIBRATION_FACTOR[level]
  return weight.replace(/\d+(?:\.\d+)?/g, (m) => {
    const n = parseFloat(m)
    if (!Number.isFinite(n)) return m
    const scaled = Math.max(5, Math.round((n * factor) / 5) * 5)
    return String(scaled)
  })
}
