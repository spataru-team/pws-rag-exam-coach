import type {
  BaremResult, ExamPaper, GradeMode, RescueErrorType, RescueForecast, RescueSkillEvidence,
  RescueSkillTag, ReviewStatus, ScoringAtom, StrengthState,
} from '@/types'
import { criteriaSlots } from './baremGrader'
import { RESCUE_CONFIG } from './rescueConfig'

/** 4-state credit/confidence status. Confidence (mode/lowConfidence) always wins over credit. */
export function reviewStatus(
  awarded: number,
  max: number,
  mode: GradeMode,
  lowConfidence?: boolean,
): ReviewStatus {
  if (mode === 'self' || lowConfidence) return 'needs_review'
  if (awarded >= max) return 'correct'
  if (awarded > 0) return 'partial'
  return 'incorrect'
}

const REPLY_LINE_RE = /^\s*[-–—]/

/** Deterministic-only classification (see the architecture plan §G): blank and
 * insufficient-volume are cheap to detect reliably; everything else stays 'unknown'
 * rather than guessing. */
export function classifyErrorType(
  subCriterionId: string | undefined,
  answer: string,
  awarded: number,
  max: number,
): RescueErrorType {
  if (!answer.trim()) return 'blank'
  if (awarded >= max) return 'unknown'

  if (subCriterionId === 'replici') {
    const replyLines = answer.split('\n').filter((l) => REPLY_LINE_RE.test(l)).length
    if (replyLines > 0 && replyLines < 5) return 'insufficient-volume'
  }
  if (subCriterionId === 'volum') {
    const sentences = answer.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length
    if (sentences > 0 && sentences < 6) return 'insufficient-volume'
  }
  return 'unknown'
}

function gradingConfidence(mode: GradeMode, lowConfidence?: boolean): number {
  const w = RESCUE_CONFIG.gradingConfidenceWeights
  return mode === 'self' || lowConfidence ? w.selfOrLowConfidence : w.deterministicOrConfidentLlm
}

/** Normalizes one BaremResult into ScoringAtoms: one atom per subCriterion when present,
 * else one atom for the whole item — reusing criteriaSlots() so this can never disagree
 * with what the grader itself already treats as the scoring unit. Never both levels at once. */
export function buildScoringAtoms(
  paper: ExamPaper,
  answersByItemId: Record<string, string>,
  results: BaremResult[],
): ScoringAtom[] {
  const resultByItemId = new Map(results.map((r) => [r.itemId, r]))
  const atoms: ScoringAtom[] = []

  for (const item of paper.items) {
    const result = resultByItemId.get(item.id)
    if (!result) continue
    const slots = criteriaSlots(item)
    const answer = answersByItemId[item.id] ?? ''
    const hasSubCriteria = Boolean(item.subCriteria && item.subCriteria.length > 0)

    for (const slot of slots) {
      const criterion = result.perCriterion.find((c) => c.id === slot.id)
      const awarded = criterion?.awarded ?? 0
      const skillTag = hasSubCriteria
        ? item.subCriteria?.find((c) => c.id === slot.id)?.skillTag
        : item.skillTag
      if (!skillTag) continue // data-integrity: every atom must be explicitly tagged (Task 3/4)

      atoms.push({
        id: `${paper.id}:${item.id}:${slot.id}`,
        paperId: paper.id,
        itemId: item.id,
        subCriterionId: hasSubCriteria ? slot.id : undefined,
        skillTag,
        earnedPoints: awarded,
        maxPoints: slot.max,
        gradingConfidence: gradingConfidence(result.mode, result.lowConfidence),
        errorType: classifyErrorType(hasSubCriteria ? slot.id : undefined, answer, awarded, slot.max),
        reviewStatus: reviewStatus(awarded, slot.max, result.mode, result.lowConfidence),
        source: hasSubCriteria ? 'exam-subcriterion' : 'exam-parent',
      })
    }
  }
  return atoms
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function partialCreditFactor(earned: number, max: number): number {
  const { base, span } = RESCUE_CONFIG.partialCreditFormula
  return max > 0 ? base + span * (earned / max) : base
}

function groupBySkill(atoms: ScoringAtom[]): Map<RescueSkillTag, ScoringAtom[]> {
  const map = new Map<RescueSkillTag, ScoringAtom[]>()
  for (const a of atoms) {
    const list = map.get(a.skillTag) ?? []
    list.push(a)
    map.set(a.skillTag, list)
  }
  return map
}

/** ratio/cost/reliability thresholds are inclusive ('at or above'/'at or below', per
 * RESCUE_CONFIG.zoneThresholds' own doc comments) so a skill exactly at a boundary (e.g.
 * portret-caracterizare at trainingCost=4 with expensiveCostAbove=4) is still classified
 * correctly instead of silently falling through to 'recoverable'. */
function classifyState(
  ratio: number,
  weights: { trainingCost: number; transferReliability: number; excludedFromRanking?: boolean },
  corroborated: boolean,
  allNeedsReview: boolean,
): StrengthState {
  const { safeRatio, expensiveCostAbove, expensiveReliabilityBelow } = RESCUE_CONFIG.zoneThresholds
  if (allNeedsReview) return 'uncertain'
  if (ratio >= safeRatio) return corroborated ? 'confirmedStrong' : 'likelyStrong'
  if (weights.trainingCost >= expensiveCostAbove || weights.transferReliability <= expensiveReliabilityBelow) {
    return 'expensive'
  }
  return 'recoverable'
}

/** Aggregates atoms per skillTag into evidence + priority. `corroboratingAtoms`, if given
 * (e.g. from a different already-attempted paper), can promote likelyStrong to
 * confirmedStrong per the architecture plan §I — one diagnostic observation alone is never
 * "confirmed". */
export function evaluateSkillEvidence(
  atoms: ScoringAtom[],
  corroboratingAtoms: ScoringAtom[] = [],
): RescueSkillEvidence[] {
  const bySkill = groupBySkill(atoms)
  const corroborationBySkill = groupBySkill(corroboratingAtoms)

  return Array.from(bySkill.entries()).map(([skillTag, skillAtoms]) => {
    const earnedPoints = skillAtoms.reduce((s, a) => s + a.earnedPoints, 0)
    const maxPoints = skillAtoms.reduce((s, a) => s + a.maxPoints, 0)
    const lostPoints = maxPoints - earnedPoints
    const ratio = maxPoints > 0 ? earnedPoints / maxPoints : 0
    const weights = RESCUE_CONFIG.perSkill[skillTag]
    const allNeedsReview = skillAtoms.every((a) => a.reviewStatus === 'needs_review')

    const avgGradingConfidence = skillAtoms.reduce((s, a) => s + a.gradingConfidence, 0) / skillAtoms.length
    const errorModifier = skillAtoms.length
      ? skillAtoms.reduce((s, a) => s + RESCUE_CONFIG.errorTypeModifiers[a.errorType], 0) / skillAtoms.length
      : 1
    const evidenceConfidence = clamp01(avgGradingConfidence * partialCreditFactor(earnedPoints, maxPoints) * errorModifier)

    const corroboration = corroborationBySkill.get(skillTag)
    const corroborationMax = corroboration?.reduce((s, a) => s + a.maxPoints, 0) ?? 0
    const corroborated = Boolean(
      corroboration && corroborationMax > 0 &&
      corroboration.reduce((s, a) => s + a.earnedPoints, 0) / corroborationMax >= RESCUE_CONFIG.zoneThresholds.safeRatio,
    )
    const state = classifyState(ratio, weights, corroborated, allNeedsReview)

    const estimatedRecoverablePoints = weights.excludedFromRanking
      ? 0
      : lostPoints * weights.trainability * weights.transferReliability * evidenceConfidence
    const priority = state === 'recoverable' && weights.trainingCost > 0
      ? estimatedRecoverablePoints / weights.trainingCost
      : 0

    return {
      skillTag,
      observations: skillAtoms.length,
      earnedPoints,
      maxPoints,
      performanceRatio: ratio,
      errorTypes: Array.from(new Set(skillAtoms.map((a) => a.errorType))),
      evidenceConfidence,
      state,
      estimatedRecoverablePoints,
      trainingCost: weights.trainingCost,
      transferReliability: weights.transferReliability,
      priority,
    }
  })
}

/** Greedy, priority-ranked selection of up to `maxRescueSkills` recoverable skills the student
 * has already earned points on (aggregate `earnedPoints > 0`) — a short Rescue route builds on
 * demonstrated partial competence, not zero-evidence topics the student would have to learn
 * from scratch. Stops once the plausible projected total reaches `safetyTarget`; the route may
 * be shorter, or empty (student already at/above `safetyTarget`, or no demonstrated recoverable
 * weakness). Never selects 'expensive', 'confirmedStrong', 'likelyStrong', or 'uncertain'
 * skills — see the architecture plan §N. A zero-evidence skill still appears in the diagnostic
 * zones; this gate is about route eligibility, not hiding a learning gap. */
export function selectRescueRoute(
  evidence: RescueSkillEvidence[],
  currentScore: number,
): RescueSkillTag[] {
  if (currentScore >= RESCUE_CONFIG.safetyTarget) return []

  const candidates = evidence
    .filter((e) => e.state === 'recoverable' && e.priority > 0 && e.earnedPoints > 0)
    .sort((a, b) => b.priority - a.priority)

  const route: RescueSkillTag[] = []
  let projected = currentScore
  for (const candidate of candidates) {
    if (route.length >= RESCUE_CONFIG.maxRescueSkills) break
    if (projected >= RESCUE_CONFIG.safetyTarget) break
    route.push(candidate.skillTag)
    projected += candidate.estimatedRecoverablePoints
  }
  return route
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Drill performance is evidence, never exam points. confirmedGain requires the last two
 * drills (if there are at least two) to be confident and strong; potentialGain uses the best
 * single observation. Both are capped by lostPoints — see the architecture plan §Q/§R. */
function estimateSkillGain(
  lostPoints: number,
  drillResults: BaremResult[],
): { confirmedGain: number; potentialGain: number } {
  if (drillResults.length === 0) return { confirmedGain: 0, potentialGain: 0 }

  const ratios = drillResults.map((r) => (r.max > 0 ? r.awarded / r.max : 0))
  const allConfident = drillResults.every((r) => r.mode !== 'self' && !r.lowConfidence)
  const lastTwo = ratios.slice(-2)
  const consistentlyStrong = lastTwo.length >= 2 && lastTwo.every((r) => r >= 0.8) && allConfident
  const confirmedRatio = consistentlyStrong ? lastTwo.reduce((s, r) => s + r, 0) / lastTwo.length : 0
  const potentialRatio = Math.max(...ratios, confirmedRatio)

  const confirmedGain = clamp(lostPoints * confirmedRatio, 0, lostPoints)
  const potentialGain = clamp(Math.max(lostPoints * potentialRatio, confirmedGain), 0, lostPoints)
  return { confirmedGain, potentialGain }
}

export function computeForecast(
  officialScore: number,
  paperMaxPoints: number,
  perSkillDrills: { skillTag: RescueSkillTag; lostPoints: number; drillResults: BaremResult[] }[],
): RescueForecast {
  let confirmedGain = 0
  let potentialGain = 0
  for (const { lostPoints, drillResults } of perSkillDrills) {
    const gain = estimateSkillGain(lostPoints, drillResults)
    confirmedGain += gain.confirmedGain
    potentialGain += gain.potentialGain
  }

  const conservativeForecast = clamp(officialScore + confirmedGain, 0, paperMaxPoints)
  const expectedForecast = clamp(officialScore + potentialGain, 0, paperMaxPoints)
  const overallConfidence = perSkillDrills.length
    ? perSkillDrills.reduce((s, d) => s + (d.drillResults.length > 0 ? 1 : 0), 0) / perSkillDrills.length
    : 0

  return {
    officialScore,
    confirmedGain,
    potentialGain,
    conservativeForecast,
    expectedForecast,
    passThreshold: RESCUE_CONFIG.passThreshold,
    safetyTarget: RESCUE_CONFIG.safetyTarget,
    evidenceConfidence: overallConfidence,
  }
}
