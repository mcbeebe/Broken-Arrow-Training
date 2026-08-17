/**
 * P4.3 — injury-area-driven prehab.
 *
 * The onboarding flow has always collected `injuryArea`, and until now it
 * reached prose only (the coach greeting and the LLM prompt) — it selected
 * no exercises, no contraindications, and no descent-load caution. This
 * module turns the collected answer into the best-evidenced intervention
 * we were ignoring: a targeted prehab block appended to strength/cross
 * days (and, when a week has neither, the first easy run), plus a
 * descent-dose caution flag for knee/lower-leg histories.
 *
 * Blocks follow the loading consensus for each region (eccentric bias for
 * tendon, isometric+lateral-chain for knee, adduction for groin). They are
 * maintenance doses (~10 min), not rehab protocols — the advisory keeps
 * pointing athletes with active symptoms at a physiotherapist.
 */
const KNEE_BLOCK =
  'PREHAB (knee): eccentric step-downs 3×10/leg · Spanish squat 3×30s · banded hip abduction 3×15/side · Copenhagen plank 3×20s/side'
const ACHILLES_CALF_BLOCK =
  'PREHAB (achilles/calf): eccentric heel drops 3×15/leg (straight + bent knee) · single-leg calf raise 3×12/leg · soleus wall sit 3×30s'
const IT_BAND_BLOCK =
  'PREHAB (hip/IT band): banded hip abduction 3×15/side · side plank with leg lift 3×20s/side · single-leg glute bridge 3×12/leg'
const SHIN_BLOCK =
  'PREHAB (shin): toe raises 3×15 · heel walks 2×20m · single-leg calf raise 3×12/leg · foot doming 2×10/side'
const HAMSTRING_BLOCK =
  'PREHAB (hamstring): Nordic curl negatives 3×4 (or slider leg curls 3×8) · single-leg RDL 3×8/leg · long-lever bridge hold 3×20s'
const FOOT_ANKLE_BLOCK =
  'PREHAB (foot/ankle): single-leg balance 3×30s/side · foot doming 2×10/side · banded ankle eversion 3×15/side · calf raise 3×12/leg'
const HIP_GLUTE_BLOCK =
  'PREHAB (hip/glute): banded hip abduction 3×15/side · single-leg glute bridge 3×12/leg · Copenhagen plank 3×20s/side'
const BACK_BLOCK =
  'PREHAB (low back): dead bugs 3×10/side · bird dogs 3×8/side · side plank 3×30s/side · hip hinge patterning 2×10'
const GENERIC_BLOCK =
  'PREHAB: single-leg balance 3×30s/side · glute bridge 3×15 · calf raise 3×12/leg · side plank 3×30s/side'

const BLOCKS: Partial<Record<string, string>> = {
  knee: KNEE_BLOCK,
  achilles_calf: ACHILLES_CALF_BLOCK,
  it_band: IT_BAND_BLOCK,
  shin: SHIN_BLOCK,
  hamstring: HAMSTRING_BLOCK,
  foot_ankle: FOOT_ANKLE_BLOCK,
  foot: FOOT_ANKLE_BLOCK,
  ankle: FOOT_ANKLE_BLOCK,
  hip: HIP_GLUTE_BLOCK,
  glute: HIP_GLUTE_BLOCK,
  hip_glute: HIP_GLUTE_BLOCK,
  back: BACK_BLOCK,
  low_back: BACK_BLOCK,
}

/** The prehab block for an injury area ('' when no history). */
export function prehabBlockFor(area: string | undefined): string {
  if (!area) return ''
  return BLOCKS[area] ?? GENERIC_BLOCK
}

/** Areas where eccentric downhill loading is the highest-risk stimulus —
 *  the descent prescription drops to a reduced dose and the plan carries a
 *  "cut vert first" advisory. */
const DESCENT_CAUTION_AREAS = new Set<string>(['knee', 'it_band', 'achilles_calf', 'shin', 'foot_ankle', 'foot', 'ankle'])

export function descentCautionFor(area: string | undefined): boolean {
  return !!area && DESCENT_CAUTION_AREAS.has(area)
}
