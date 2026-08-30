/**
 * Expands a compact synthetic `RescueProfileSpec` into the real Level-B inputs
 * (`BaremResult[]` + `answersByItemId`) for `romanian-sb26`, then runs the
 * production path `buildScoringAtoms -> evaluateSkillEvidence -> selectRescueRoute`.
 *
 * Pure and deterministic. No LLM, no I/O. The skill -> item -> slot mapping is
 * derived from `romanianSb26` itself (public structural data), never hard-coded.
 */
import type { BaremResult, GradeMode, RescueSkillTag } from '@/types'
import { romanianSb26 } from '@/data/exams/romanian-sb26'
import { criteriaSlots } from '@/learning/baremGrader'
import {
  buildScoringAtoms,
  evaluateSkillEvidence,
  selectRescueRoute,
} from '@/learning/rescueEngine'
import type { RescueConfig } from '@/learning/rescueConfig'
import { RESCUE_CONFIG } from '@/learning/rescueConfig'
import type { RescueProfileSpec, ProfileSkillForm } from '../types'

interface Slot {
  itemId: string
  slotId: string
  max: number
  skillTag: RescueSkillTag
}

/** Every scoring slot in ro-sb26, with the skill it trains. */
export const SB26_SLOTS: Slot[] = romanianSb26.items.flatMap((item) => {
  const hasSub = Boolean(item.subCriteria && item.subCriteria.length > 0)
  return criteriaSlots(item).map((slot) => {
    const skillTag = hasSub
      ? item.subCriteria!.find((c) => c.id === slot.id)?.skillTag
      : item.skillTag
    if (!skillTag) throw new Error(`ro-sb26 slot ${item.id}:${slot.id} has no skillTag`)
    return { itemId: item.id, slotId: slot.id, max: slot.max, skillTag }
  })
})

/** Total scorable points per skill in ro-sb26. */
export const SB26_SKILL_MAX: Record<string, number> = SB26_SLOTS.reduce<Record<string, number>>(
  (acc, s) => ({ ...acc, [s.skillTag]: (acc[s.skillTag] ?? 0) + s.max }),
  {},
)

/** All route-eligible skills (not permanently 'expensive', not excluded). */
export const ROUTE_ELIGIBLE_SKILLS: RescueSkillTag[] = (
  Object.keys(RESCUE_CONFIG.perSkill) as RescueSkillTag[]
).filter((tag) => {
  const w = RESCUE_CONFIG.perSkill[tag]
  if (w.excludedFromRanking) return false
  const { expensiveCostAbove, expensiveReliabilityBelow } = RESCUE_CONFIG.zoneThresholds
  return !(w.trainingCost >= expensiveCostAbove || w.transferReliability <= expensiveReliabilityBelow)
})

// Long answer stubs so `classifyErrorType` never returns 'insufficient-volume'
// for a non-blank attempt on the dialog / essay-volume sub-criteria — the
// benchmark controls errorType through `form`, not through stub length.
const DIALOG_STUB = '- a\n- b\n- c\n- d\n- e\n- f\n'
const VOLUME_STUB = 'One. Two. Three. Four. Five. Six. Seven.'
const PLAIN_STUB = 'attempt'

function stubFor(itemId: string): string {
  if (itemId === 'sb26-8') return DIALOG_STUB
  if (itemId === 'sb26-10') return VOLUME_STUB
  return PLAIN_STUB
}

interface ItemBuild {
  perCriterion: { id: string; awarded: number; max: number; comment: string }[]
  forms: ProfileSkillForm[]
  itemId: string
}

/** Distributes `earned` greedily across a skill's slots within one item. */
function distribute(earned: number, maxes: number[]): number[] {
  let rem = Math.max(0, Math.round(earned))
  return maxes.map((m) => {
    const a = Math.min(rem, m)
    rem -= a
    return a
  })
}

export interface ExpandedProfile {
  spec: RescueProfileSpec
  answersByItemId: Record<string, string>
  results: BaremResult[]
  officialScore: number
}

export function expandProfile(spec: RescueProfileSpec): ExpandedProfile {
  const skillOf = (tag: RescueSkillTag) => spec.skills[tag]

  const byItem = new Map<string, ItemBuild>()
  for (const item of romanianSb26.items) {
    byItem.set(item.id, { perCriterion: [], forms: [], itemId: item.id })
  }

  // group slots by item to distribute per-skill earned across that skill's slots
  const slotsByItemSkill = new Map<string, Slot[]>()
  for (const s of SB26_SLOTS) {
    const key = `${s.itemId}::${s.skillTag}`
    const list = slotsByItemSkill.get(key) ?? []
    list.push(s)
    slotsByItemSkill.set(key, list)
  }

  for (const [key, slots] of slotsByItemSkill) {
    const [itemId, skillTag] = key.split('::') as [string, RescueSkillTag]
    const spc = skillOf(skillTag)
    const totalMax = slots.reduce((n, s) => n + s.max, 0)
    const form: ProfileSkillForm = spc ? spc.form : 'attempt'
    const earned = spc ? Math.min(Math.max(0, spc.earned), totalMax) : totalMax // omitted => full credit
    const awardedPerSlot = distribute(earned, slots.map((s) => s.max))
    const build = byItem.get(itemId)!
    slots.forEach((s, i) => {
      build.perCriterion.push({ id: s.slotId, awarded: awardedPerSlot[i]!, max: s.max, comment: '' })
    })
    build.forms.push(form)
  }

  const answersByItemId: Record<string, string> = {}
  const results: BaremResult[] = []
  let officialScore = 0

  for (const item of romanianSb26.items) {
    const build = byItem.get(item.id)!
    const awarded = build.perCriterion.reduce((n, c) => n + c.awarded, 0)
    officialScore += awarded

    const allBlankOrSelf = build.forms.every((f) => f === 'blank' || f === 'self')
    const anyBlank = build.forms.some((f) => f === 'blank')
    const answer = allBlankOrSelf && anyBlank ? '' : stubFor(item.id)
    answersByItemId[item.id] = answer

    let mode: GradeMode
    if (item.type === 'short') mode = answer.trim() === '' || allBlankOrSelf ? 'self' : 'deterministic'
    else mode = allBlankOrSelf ? 'self' : 'llm'

    const lowConfidence = mode === 'self' || item.type === 'correctness'

    results.push({
      itemId: item.id,
      perCriterion: build.perCriterion.sort(
        (a, b) => criteriaSlots(item).findIndex((s) => s.id === a.id) - criteriaSlots(item).findIndex((s) => s.id === b.id),
      ),
      awarded,
      max: item.maxPoints,
      advice: '',
      mode,
      ...(lowConfidence ? { lowConfidence: true } : {}),
    })
  }

  return { spec, answersByItemId, results, officialScore }
}

export interface ProfileRun {
  route: RescueSkillTag[]
  /** recoverable + demonstrated + priority>0 candidates, priority-sorted. */
  candidates: { skillTag: RescueSkillTag; priority: number; estimatedRecoverablePoints: number; earnedPoints: number }[]
}

/** Runs the real engine for a profile under a given (possibly perturbed) config. */
export function runProfile(exp: ExpandedProfile, config: RescueConfig = RESCUE_CONFIG): ProfileRun {
  const atoms = buildScoringAtoms(romanianSb26, exp.answersByItemId, exp.results)
  const evidence = evaluateSkillEvidence(atoms, [], config)
  const route = selectRescueRoute(evidence, exp.officialScore, config)
  const candidates = evidence
    .filter((e) => e.state === 'recoverable' && e.priority > 0 && e.earnedPoints > 0)
    .sort((a, b) => b.priority - a.priority)
    .map((e) => ({
      skillTag: e.skillTag,
      priority: e.priority,
      estimatedRecoverablePoints: e.estimatedRecoverablePoints,
      earnedPoints: e.earnedPoints,
    }))
  return { route, candidates }
}
