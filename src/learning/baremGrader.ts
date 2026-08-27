import type { BaremResult, BaremCriterionScore, ExamItem, ExamSubCriterion } from '@/types'
import { answersEquivalent } from './expressionMatch'

/** Lenient normalisation for short-answer matching: case, diacritics, punctuation. */
export function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '') // strip combining diacritics (NFD residue)
    .replace(/[.,;:!?„""«»()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits a student's short answer into distinct candidate tokens. */
function candidateTokens(answer: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of answer.split(/[\n,;/]+/)) {
    const norm = normalizeForMatch(raw)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

/**
 * Deterministic grading for `short` items: one point per distinct student token
 * that matches an accepted answer (diacritics-insensitive), capped at maxPoints.
 */
export function gradeShortDeterministic(item: ExamItem, answer: string): BaremResult {
  const accepted = new Set((item.acceptedAnswers ?? []).map(normalizeForMatch))
  const tokens = candidateTokens(answer)
  const matched = tokens.filter((t) => accepted.has(t)).length
  const awarded = Math.min(matched, item.maxPoints)
  const comment =
    awarded === item.maxPoints
      ? 'Toate cuvintele corecte.'
      : `Recunoscute automat: ${awarded}/${item.maxPoints}. Variantele neobișnuite pot fi corecte — verifică baremul.`
  return {
    itemId: item.id,
    perCriterion: [{ id: item.id, awarded, max: item.maxPoints, comment }],
    awarded,
    max: item.maxPoints,
    advice: '',
    mode: 'deterministic',
  }
}

/** Sums awarded/max across per-item results. */
export function totalsOf(results: BaremResult[]): {
  totalAwarded: number
  totalMax: number
} {
  return results.reduce(
    (acc, r) => ({
      totalAwarded: acc.totalAwarded + r.awarded,
      totalMax: acc.totalMax + r.max,
    }),
    { totalAwarded: 0, totalMax: 0 },
  )
}

/** Expected scoring slots for an item: its sub-criteria, or a single whole-item slot. */
export function criteriaSlots(item: ExamItem): { id: string; max: number }[] {
  if (item.subCriteria && item.subCriteria.length > 0) {
    return item.subCriteria.map((c) => ({ id: c.id, max: c.maxPoints }))
  }
  return [{ id: item.id, max: item.maxPoints }]
}

/**
 * Deterministically grades ONE sub-criterion (`ExamSubCriterion.gradeMode ===
 * 'deterministic'`) against the item's own `acceptedAnswers`. All-or-nothing:
 * real barems don't give partial credit for a wrong final answer. Uses
 * notation-aware numeric comparison for math ("9√2π" == "9*sqrt(2)*pi"),
 * falling back to a normalized string match for non-numeric answers — see
 * src/learning/expressionMatch.ts.
 */
export function gradeDeterministicCriterion(
  criterion: Pick<ExamSubCriterion, 'id' | 'maxPoints'>,
  acceptedAnswers: string[],
  answer: string,
): BaremCriterionScore {
  const trimmed = answer.trim()
  const correct = trimmed.length > 0 && acceptedAnswers.some((a) => answersEquivalent(a, trimmed))
  return { id: criterion.id, awarded: correct ? criterion.maxPoints : 0, max: criterion.maxPoints, comment: '' }
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

/** Extracts the JSON object from a model reply, tolerating fences/preamble. */
function extractJsonObject(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('grader response contains no JSON object')
  return match[0]
}

export interface ParsedBaremCriteria {
  perCriterion: BaremCriterionScore[]
  advice: string
}

/**
 * Parses the grader LLM's JSON against an explicit list of expected slots —
 * not necessarily every criterion on the item: `gradeItem` (examGraderService.ts)
 * passes only the LLM-graded subset for a hybrid item, keeping the
 * deterministically-graded slots (see `gradeDeterministicCriterion`) out of
 * the prompt and this parse entirely. Awarded points per slot are clamped to
 * that slot's max. Throws on malformed JSON so the caller can fall back.
 */
export function parseBaremCriteria(raw: string, slots: { id: string; max: number }[]): ParsedBaremCriteria {
  const parsed = JSON.parse(extractJsonObject(raw)) as {
    perCriterion?: { id?: string; awarded?: number; comment?: string }[]
    advice?: string
  }
  // No scores → treat as ungradeable so the caller falls back to self-mode,
  // rather than silently reporting a confident zero.
  if (!Array.isArray(parsed.perCriterion) || parsed.perCriterion.length === 0) {
    throw new Error('grader response has no perCriterion scores')
  }
  // Keep the FIRST entry per id so a duplicated id cannot silently overwrite a score.
  const byId = new Map<string, { id?: string; awarded?: number; comment?: string }>()
  for (const c of parsed.perCriterion) {
    const key = String(c.id)
    if (!byId.has(key)) byId.set(key, c)
  }
  const perCriterion: BaremCriterionScore[] = slots.map((slot) => {
    const got = byId.get(slot.id)
    return {
      id: slot.id,
      awarded: clamp(Math.round(Number(got?.awarded ?? 0)), 0, slot.max),
      max: slot.max,
      comment: String(got?.comment ?? ''),
    }
  })
  return { perCriterion, advice: String(parsed.advice ?? '') }
}

/**
 * Parses the grader LLM's JSON into a whole-item BaremResult, against every
 * one of the item's own criteria. The item total is clamped to item.maxPoints.
 */
export function parseBaremResponse(raw: string, item: ExamItem): BaremResult {
  const { perCriterion, advice } = parseBaremCriteria(raw, criteriaSlots(item))
  const awarded = clamp(
    perCriterion.reduce((s, c) => s + c.awarded, 0),
    0,
    item.maxPoints,
  )
  return {
    itemId: item.id,
    perCriterion,
    awarded,
    max: item.maxPoints,
    advice,
    mode: 'llm',
    lowConfidence: item.type === 'correctness',
  }
}
