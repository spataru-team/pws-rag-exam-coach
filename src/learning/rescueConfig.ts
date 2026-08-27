import type { RescueSkillTag, RescueErrorType } from '@/types'

/** OFFICIAL: raw-score → grade bands. Confirmed by the teacher for nota 5-10 only;
 * nota 1-4 bands are not yet sourced from an official ANCE document — do not invent them. */
export interface GradeBand {
  nota: number
  min: number
  max: number
}

export const RO_GIMNAZIU_GRADING_SCALE: GradeBand[] = [
  { nota: 5, min: 13, max: 20 },
  { nota: 6, min: 21, max: 28 },
  { nota: 7, min: 29, max: 36 },
  { nota: 8, min: 37, max: 44 },
  { nota: 9, min: 45, max: 47 },
  { nota: 10, min: 48, max: 50 },
]

interface SkillWeights {
  /** PEDAGOGICAL: how coachable this skill is in a few days, 0..1. */
  trainability: number
  /** PEDAGOGICAL: relative microdrill effort, 1 (cheap) .. 5 (expensive). */
  trainingCost: number
  /** PEDAGOGICAL: confidence the trained skill transfers to an unseen paper, 0..1. */
  transferReliability: number
  /** true = never a route candidate (cross-cutting metric, see plan §F). */
  excludedFromRanking?: boolean
}

/** Declared with an explicit Record type (not inline `satisfies`) so every entry is typed
 * as the full SkillWeights interface — otherwise TS narrows each literal to only the keys
 * it wrote, and `weights.excludedFromRanking` becomes inaccessible on entries that omit it. */
const PER_SKILL: Record<RescueSkillTag, SkillWeights> = {
  felicitare: { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
  'eseu-volum': { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
  'transformare-gramaticala': { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
  dialog: { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
  'intrebari-directe': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
  'enunt-reflexiv': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
  'eseu-repere': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
  concluzii: { trainability: 0.6, trainingCost: 2, transferReliability: 0.6 },
  'completare-text': { trainability: 0.6, trainingCost: 2, transferReliability: 0.6 },
  'sinonime-antonime': { trainability: 0.55, trainingCost: 3, transferReliability: 0.5 },
  'portret-caracterizare': { trainability: 0.4, trainingCost: 4, transferReliability: 0.4 },
  'eseu-coerenta': { trainability: 0.4, trainingCost: 4, transferReliability: 0.4 },
  corectitudine: { trainability: 0.3, trainingCost: 5, transferReliability: 0.3, excludedFromRanking: true },
}

export const RESCUE_CONFIG = {
  /** OFFICIAL: lower bound of nota 5, from RO_GIMNAZIU_GRADING_SCALE. */
  passThreshold: 13,
  /** PEDAGOGICAL: comfortably inside the nota-5 band, not just clearing it. */
  safetyTarget: 18,
  maxRescueSkills: 4,
  minRescueSkills: 2,
  zoneThresholds: {
    /** earned/max >= this on a skill's atoms => likelyStrong/confirmedStrong. */
    safeRatio: 0.8,
    /** trainingCost at or above this makes a skill 'expensive' even if lostPoints is large. */
    expensiveCostAbove: 4,
    /** transferReliability at or below this makes a skill 'expensive' regardless of cost. */
    expensiveReliabilityBelow: 0.4,
  },
  /** PEDAGOGICAL: partialCreditFactor = base + span * (earned/max). Rewards "almost there"
   * atoms over "understands nothing" atoms of the same lostPoints, per plan §E worked example. */
  partialCreditFormula: { base: 0.4, span: 0.6 },
  /** How much we trust a scoring atom's earned/max reading, by how it was graded. */
  gradingConfidenceWeights: {
    deterministicOrConfidentLlm: 1.0,
    selfOrLowConfidence: 0.5,
  },
  /** PEDAGOGICAL: a zero caused by 'blank'/'insufficient-volume' is not equivalent to a zero
   * caused by not understanding the skill — nudges evidenceConfidence up for those. */
  errorTypeModifiers: {
    blank: 0.85,
    'insufficient-volume': 0.9,
    unknown: 1.0,
  } satisfies Record<RescueErrorType, number>,
  perSkill: PER_SKILL,
} as const
