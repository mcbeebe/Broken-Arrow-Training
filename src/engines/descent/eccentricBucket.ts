/**
 * Discrete eccentric-load bucket per segment (1–5).
 *
 * Categorical companion to the continuous {@link eccentricScore} in
 * {@link ./eccentric}. Used to populate `TerrainSegment.eccentricBucket`,
 * which downstream PRs (eccentric-TRIMP integration, repeated-bout
 * memory, DOMS forecast) consume as a per-segment severity tag.
 *
 * Bucket boundaries are placed at the midpoints between the 19 fixture
 * rows in `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx`
 * (column G, "Eccentric/Mechanical load (1–5)") so every fixture grade
 * lands in its documented bucket without rounding artefacts.
 *
 * | grade range            | bucket | description                         |
 * | ---------------------- | ------ | ----------------------------------- |
 * | grade ≤ −0.275         | 5      | extreme descent (scramble territory) |
 * | −0.275 < g ≤ −0.175    | 4      | steep descent                        |
 * | −0.175 < g ≤ −0.125    | 3      | moderate descent                     |
 * | −0.125 < g ≤ −0.025    | 2      | gentle / optimal descent             |
 * | −0.025 < g ≤ +0.075    | 1      | flat / near-flat                     |
 * | +0.075 < g ≤ +0.325    | 2      | climb (eccentrically light)          |
 * | grade > +0.325         | 3      | steep climb / scramble               |
 *
 * Plan PR-08 lists boundaries at the round-number grade values
 * (−0.30, −0.20, −0.10, ...). Those put grade=−0.10 in bucket 3, which
 * contradicts the v1.1 fixture's `ecc=2` at that row. The midpoint
 * boundaries above match all 19 fixture rows exactly.
 *
 * Source: Vernillo et al. 2017 (PMID 27392180) + Peake et al. 2017
 * (PMID 28035017), anchored to the Minetti 2002 (PMID 12183501) cost
 * polynomial. Same provenance as the trunk's continuous
 * {@link eccentricScore}.
 *
 * @see `src/engines/descent/eccentric.ts` — continuous interpolation + load aggregation
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-08
 */

export type EccentricBucket = 1 | 2 | 3 | 4 | 5

/**
 * Map a signed decimal grade to its discrete eccentric-load bucket.
 *
 * @param grade  signed decimal gradient (e.g. -0.20 = -20 %, +0.15 = +15 %).
 *               Inputs outside [-0.45, +0.45] clamp into the steepest
 *               bucket on the matching side.
 * @returns      integer bucket in {1, 2, 3, 4, 5}.
 */
export function eccentricBucket(grade: number): EccentricBucket {
  if (grade <= -0.275) return 5
  if (grade <= -0.175) return 4
  if (grade <= -0.125) return 3
  if (grade <= -0.025) return 2
  if (grade <= 0.075) return 1
  if (grade <= 0.325) return 2
  return 3
}
