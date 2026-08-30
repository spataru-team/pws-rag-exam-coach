/**
 * Pure perturbation of the Rescue pedagogical ranking parameters.
 *
 * `RESCUE_CONFIG` is NEVER mutated. `applyPerturbation` deep-clones it, changes
 * exactly one value, clamps it to its natural domain, recursively freezes the
 * result, and returns it. The Rescue engine reads its constants through the
 * `RescueConfig` type (see `src/learning/rescueConfig.ts`), so a frozen
 * perturbed copy drops straight in without touching production.
 */
import type { RescueConfig } from '@/learning/rescueConfig'
import type { RescuePerturbationSpec } from '../types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

/** Structured deep clone of a plain config object. */
function cloneConfig(base: RescueConfig): RescueConfig {
  return {
    passThreshold: base.passThreshold,
    safetyTarget: base.safetyTarget,
    maxRescueSkills: base.maxRescueSkills,
    minRescueSkills: base.minRescueSkills,
    zoneThresholds: { ...base.zoneThresholds },
    partialCreditFormula: { ...base.partialCreditFormula },
    gradingConfidenceWeights: { ...base.gradingConfidenceWeights },
    errorTypeModifiers: { ...base.errorTypeModifiers },
    perSkill: Object.fromEntries(
      Object.entries(base.perSkill).map(([k, w]) => [k, { ...w }]),
    ) as RescueConfig['perSkill'],
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
/** trainingCost stays strictly positive so `priority = ERP / trainingCost` is well-defined. */
const clampCost = (n: number) => Math.max(0.1, n)

function clampParam(param: 'trainability' | 'transferReliability' | 'trainingCost', v: number): number {
  return param === 'trainingCost' ? clampCost(v) : clamp01(v)
}

export function applyPerturbation(base: RescueConfig, spec: RescuePerturbationSpec): RescueConfig {
  const cfg = cloneConfig(base)

  switch (spec.kind) {
    case 'baseline':
      break
    case 'skill-param-delta': {
      const w = cfg.perSkill[spec.skill]
      const raw = w[spec.param] * (1 + spec.deltaPct / 100)
      w[spec.param] = clampParam(spec.param, raw)
      break
    }
    case 'skill-param-absolute': {
      const w = cfg.perSkill[spec.skill]
      w[spec.param] = clampParam(spec.param, spec.value)
      break
    }
    case 'safety-target':
      cfg.safetyTarget = spec.value
      break
  }

  return deepFreeze(cfg)
}
