/**
 * Tests for the training-method schema and all method data files.
 *
 * Run from the project root:
 *   npx vitest run training-method
 *
 * Asserts:
 *   1. Schema layer  — every method JSON validates against the JSON Schema
 *   2. Logical layer — internal references (workouts, phases, zones) consistent
 *   3. Per-method invariants
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import schema from '../schema/training-method.schema.json';

import danielsMethod from '../data/methods/daniels.json';
import pfitzingerMethod from '../data/methods/pfitzinger.json';
import hansonsMethod from '../data/methods/hansons.json';
import higdonMethod from '../data/methods/higdon.json';
import gallowayMethod from '../data/methods/galloway.json';
import fitzgeraldMethod from '../data/methods/fitzgerald_8020.json';
import koopMethod from '../data/methods/koop.json';
import rocheMethod from '../data/methods/roche_swap.json';

import type {
  TrainingMethod,
  WorkoutCategory,
} from '../types/training-method';

/** Categories that count as a "running" day. */
const NON_RUNNING_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set([
  'rest',
  'cross_training',
  'strength',
]);

/** All 8 methods loaded as the canonical ordered list. */
const ALL_METHODS: ReadonlyArray<readonly [string, unknown]> = [
  ['daniels', danielsMethod],
  ['pfitzinger', pfitzingerMethod],
  ['hansons', hansonsMethod],
  ['higdon', higdonMethod],
  ['galloway', gallowayMethod],
  ['fitzgerald_8020', fitzgeraldMethod],
  ['koop', koopMethod],
  ['roche_swap', rocheMethod],
] as const;

/**
 * Build an AJV validator for the TrainingMethod schema.
 *
 * @returns Compiled AJV validate function
 * @throws If schema compilation fails
 */
function buildValidator(): ValidateFunction {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

// ============================================================================
// SCHEMA LAYER
// ============================================================================

describe('TrainingMethod schema', () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    validate = buildValidator();
  });

  it('schema compiles without errors', () => {
    expect(validate).toBeDefined();
  });

  it.each(ALL_METHODS)('%s method validates against the schema', (id, data) => {
    const isValid = validate(data);
    if (!isValid) {
      // eslint-disable-next-line no-console
      console.error(`Schema errors for ${id}:`, validate.errors);
    }
    expect(isValid).toBe(true);
  });

  it('rejects an obviously invalid object', () => {
    const invalid = { id: 'daniels', name: 'broken' };
    expect(validate(invalid)).toBe(false);
  });
});

// ============================================================================
// PER-METHOD CONTENT INTEGRITY
// ============================================================================

describe.each(ALL_METHODS)('%s — content integrity', (id, raw) => {
  const method = raw as unknown as TrainingMethod;

  it('declares a non-empty pace zone set', () => {
    expect(method.paceZones.length).toBeGreaterThanOrEqual(3);
  });

  it('every workout primaryZone references a declared pace zone', () => {
    const declared = new Set(method.paceZones.map((z) => z.canonical));
    for (const w of method.workouts) {
      expect(declared.has(w.primaryZone)).toBe(true);
    }
  });

  it('every workout segment paceZone references a declared pace zone', () => {
    const declared = new Set(method.paceZones.map((z) => z.canonical));
    for (const w of method.workouts) {
      const segs = [
        ...(w.structure.warmup ? [w.structure.warmup] : []),
        ...w.structure.mainSet,
        ...(w.structure.cooldown ? [w.structure.cooldown] : []),
      ];
      for (const seg of segs) {
        if (seg.paceZone) expect(declared.has(seg.paceZone)).toBe(true);
      }
    }
  });

  it('every workout validPhaseIds references a declared phase', () => {
    const declared = new Set(method.phases.map((p) => p.id));
    for (const w of method.workouts) {
      for (const pid of w.validPhaseIds) {
        expect(declared.has(pid)).toBe(true);
      }
    }
  });

  it('every phase keyWorkoutIds references a declared workout', () => {
    const declared = new Set(method.workouts.map((w) => w.id));
    for (const p of method.phases) {
      for (const wid of p.keyWorkoutIds) {
        expect(declared.has(wid)).toBe(true);
      }
    }
  });

  it('every weekly pattern preferredWorkoutIds references a declared workout', () => {
    const declared = new Set(method.workouts.map((w) => w.id));
    for (const wp of method.weeklyPatterns) {
      for (const day of wp.schedule) {
        for (const wid of day.preferredWorkoutIds ?? []) {
          expect(declared.has(wid)).toBe(true);
        }
      }
    }
  });

  it('phase pctOfPlan defaults sum to ~1.0', () => {
    const total = method.phases.reduce((s, p) => s + p.pctOfPlan.default, 0);
    expect(total).toBeGreaterThanOrEqual(0.95);
    expect(total).toBeLessThanOrEqual(1.05);
  });

  it('every phase intensityDistribution sums to 100', () => {
    for (const p of method.phases) {
      const s =
        p.intensityDistribution.easyPct +
        p.intensityDistribution.moderatePct +
        p.intensityDistribution.hardPct;
      expect(s).toBe(100);
    }
  });

  it('phase orders are sequential starting at 1', () => {
    const orders = method.phases.map((p) => p.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i + 1));
  });

  it('weekly pattern running-day count matches declared daysPerWeek', () => {
    for (const wp of method.weeklyPatterns) {
      const r = wp.schedule.filter((d) => !NON_RUNNING_CATEGORIES.has(d.category)).length;
      expect(r).toBe(wp.daysPerWeek);
    }
  });

  it('weekly pattern day-of-week values are unique', () => {
    for (const wp of method.weeklyPatterns) {
      const days = wp.schedule.map((d) => d.dayOfWeek);
      expect(new Set(days).size).toBe(days.length);
    }
  });

  it('taper weeklyVolumePcts is monotonically decreasing', () => {
    const pcts = method.taper.weeklyVolumePcts;
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i]).toBeLessThan(pcts[i - 1]);
    }
  });

  it('taper weeklyVolumePcts length equals durationWeeks', () => {
    expect(method.taper.weeklyVolumePcts.length).toBe(method.taper.durationWeeks);
  });

  it('generationRules.compressionPriority refs only declared phases', () => {
    const declared = new Set(method.phases.map((p) => p.id));
    for (const pid of method.generationRules.compressionPriority) {
      expect(declared.has(pid)).toBe(true);
    }
  });

  it('generationRules.expansionPriority refs only declared phases', () => {
    const declared = new Set(method.phases.map((p) => p.id));
    for (const pid of method.generationRules.expansionPriority) {
      expect(declared.has(pid)).toBe(true);
    }
  });

  it('declares a primary anchor and a fallback anchor', () => {
    expect(method.primaryAnchor).toBeDefined();
    expect(method.fallbackAnchor).toBeDefined();
  });

  it('every restriction has rule + blocking flag; all restrictions are non-blocking (Q6 design)', () => {
    for (const r of method.restrictions) {
      expect(r.rule.length).toBeGreaterThan(0);
      expect(r.blocking).toBe(false);
    }
  });

  it('applicability matrix has at least one BEST', () => {
    const ratings = [
      ...Object.values(method.applicability.byDistance),
      ...Object.values(method.applicability.byExperience),
      ...Object.values(method.applicability.byTerrain),
    ];
    expect(ratings).toContain('BEST');
  });

  it('id matches the registry id', () => {
    expect(method.id).toBe(id);
  });
});

// ============================================================================
// WORKOUT STRUCTURAL INTEGRITY
// ============================================================================

describe.each(ALL_METHODS)('%s — workout templates', (_id, raw) => {
  const method = raw as unknown as TrainingMethod;

  it('every workout has at least one main-set segment', () => {
    for (const w of method.workouts) {
      expect(w.structure.mainSet.length).toBeGreaterThan(0);
    }
  });

  it('every workout has approxDurationMinutes.min ≤ max', () => {
    for (const w of method.workouts) {
      expect(w.approxDurationMinutes.min).toBeLessThanOrEqual(w.approxDurationMinutes.max);
    }
  });

  it('every interval segment with reps > 1 has a recovery defined', () => {
    for (const w of method.workouts) {
      for (const seg of w.structure.mainSet) {
        if (seg.reps !== undefined && seg.reps > 1) {
          expect(seg.recovery).toBeDefined();
        }
      }
    }
  });

  it('all workout ids are unique within the method', () => {
    const ids = method.workouts.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// CROSS-METHOD COVERAGE
// ============================================================================

describe('cross-method coverage', () => {
  it('all 8 Phase 1 methods are present', () => {
    expect(ALL_METHODS.map(([id]) => id)).toEqual([
      'daniels',
      'pfitzinger',
      'hansons',
      'higdon',
      'galloway',
      'fitzgerald_8020',
      'koop',
      'roche_swap',
    ]);
  });

  it('every method id is unique', () => {
    const ids = ALL_METHODS.map(([_, m]) => (m as TrainingMethod).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every method has at least one BEST applicability rating', () => {
    for (const [_, raw] of ALL_METHODS) {
      const m = raw as unknown as TrainingMethod;
      const ratings = [
        ...Object.values(m.applicability.byDistance),
        ...Object.values(m.applicability.byExperience),
        ...Object.values(m.applicability.byTerrain),
      ];
      expect(ratings).toContain('BEST');
    }
  });

  it('every method declares supportedPlanWeeks', () => {
    for (const [_, raw] of ALL_METHODS) {
      const m = raw as unknown as TrainingMethod;
      expect(m.generationRules.supportedPlanWeeks.length).toBeGreaterThan(0);
    }
  });
});
