import type {
  BaremCriterionScore,
  BaremResult,
  ExamItem,
  ExamPaper,
  InterfaceLanguage,
  SubjectId,
} from '@/types'
import {
  buildBaremGradePrompt,
  createAdapter,
  PROVIDER_PRESETS,
  type LLMProviderConfig,
} from '@/llm'
import type { ScoredChunk } from '@/rag'
import {
  criteriaSlots,
  gradeDeterministicCriterion,
  gradeShortDeterministic,
  parseBaremCriteria,
  parseBaremResponse,
  totalsOf,
} from '@/learning/baremGrader'
import { retrieve } from './ragService'

export interface GradeDeps {
  supportLanguage: InterfaceLanguage
  providerConfig?: LLMProviderConfig
  apiKey?: string
  /** Subject used for RAG grounding. Grounding is skipped (not defaulted to some
   * other subject) when omitted — grounding a math item in Romanian-grammar
   * chunks would be worse than no grounding at all. `gradeAttempt` always
   * fills this from `paper.subjectId`, so it's only ever unset when `gradeItem`
   * is called directly without a paper. */
  subjectId?: SubjectId
}

/** Zeroed self-assessment result (blank answer or LLM unavailable/invalid). */
function selfResult(item: ExamItem, advice: string): BaremResult {
  const slots = criteriaSlots(item)
  return {
    itemId: item.id,
    perCriterion: slots.map((s) => ({ id: s.id, awarded: 0, max: s.max, comment: '' })),
    awarded: 0,
    max: item.maxPoints,
    advice,
    mode: 'self',
    lowConfidence: true,
  }
}

const LLM_UNAVAILABLE_ADVICE = 'Evaluarea automată nu este disponibilă acum — compară-ți răspunsul cu baremul.'

/**
 * Grades one item. `short` → deterministic, no LLM. `open`/`correctness` →
 * retrieve local context, ask the provider to grade by barem, parse strictly.
 * Any failure (blank answer, provider down, invalid JSON) degrades to self-mode
 * so the mock never blocks on the LLM.
 *
 * When some of the item's `subCriteria` are `gradeMode: 'deterministic'` (a
 * real barem's "exact final answer" split out from its "method" criteria —
 * see math-sb26.ts), those are checked against `acceptedAnswers` up front,
 * with no network call, and only the remaining criteria go to the LLM — the
 * result reports `mode: 'hybrid'`. If the LLM call then fails, the
 * already-verified deterministic credit is kept rather than lost to a
 * whole-item self-mode fallback.
 */
export async function gradeItem(
  item: ExamItem,
  answer: string,
  deps: GradeDeps,
): Promise<BaremResult> {
  if (item.type === 'short') {
    return gradeShortDeterministic(item, answer)
  }
  if (!answer.trim()) {
    return selfResult(item, 'Fără răspuns — verifică baremul și încearcă din nou.')
  }

  const subCriteria = item.subCriteria ?? []
  const deterministicCriteria = subCriteria.filter((c) => c.gradeMode === 'deterministic')
  const llmCriteria = subCriteria.filter((c) => c.gradeMode !== 'deterministic')
  const isHybrid = deterministicCriteria.length > 0

  const deterministicResults: BaremCriterionScore[] = deterministicCriteria.map((c) =>
    gradeDeterministicCriterion(c, item.acceptedAnswers ?? [], answer),
  )

  if (isHybrid && llmCriteria.length === 0) {
    // Every criterion on this item is deterministic — no LLM call needed at all.
    const awarded = deterministicResults.reduce((s, r) => s + r.awarded, 0)
    return {
      itemId: item.id,
      perCriterion: deterministicResults,
      awarded,
      max: item.maxPoints,
      advice: '',
      mode: 'deterministic',
    }
  }

  const config = deps.providerConfig ?? (PROVIDER_PRESETS.mock as LLMProviderConfig)

  // Best-effort grounding; ignore retrieval failures (grading must still run).
  // No subjectId → no grounding, rather than guessing a subject (see GradeDeps).
  let retrieved: ScoredChunk[] | undefined
  if (deps.subjectId) {
    try {
      const r = await retrieve(`${item.prompt}\n${answer}`, deps.subjectId, undefined, 4)
      retrieved = r.unavailable ? undefined : r.results
    } catch {
      retrieved = undefined
    }
  }

  try {
    const messages = buildBaremGradePrompt({
      item,
      studentAnswer: answer,
      supportLanguage: deps.supportLanguage,
      retrieved,
      criteria: isHybrid ? llmCriteria.map((c) => ({ id: c.id, maxPoints: c.maxPoints, rule: c.rule })) : undefined,
    })
    const adapter = createAdapter(config)
    const chat = await adapter.chat({ messages, temperature: 0.1, jsonMode: true }, deps.apiKey)

    if (!isHybrid) {
      return parseBaremResponse(chat.content, item)
    }

    const llmSlots = llmCriteria.map((c) => ({ id: c.id, max: c.maxPoints }))
    const { perCriterion: llmPerCriterion, advice } = parseBaremCriteria(chat.content, llmSlots)
    const perCriterion = [...deterministicResults, ...llmPerCriterion]
    const awarded = Math.min(item.maxPoints, perCriterion.reduce((s, c) => s + c.awarded, 0))
    return { itemId: item.id, perCriterion, awarded, max: item.maxPoints, advice, mode: 'hybrid' }
  } catch (err) {
    console.warn('[examGrader] LLM grading failed, falling back to self-mode:', err)
    if (isHybrid) {
      const zeroedLlm: BaremCriterionScore[] = llmCriteria.map((c) => ({
        id: c.id,
        awarded: 0,
        max: c.maxPoints,
        comment: '',
      }))
      const perCriterion = [...deterministicResults, ...zeroedLlm]
      return {
        itemId: item.id,
        perCriterion,
        awarded: perCriterion.reduce((s, r) => s + r.awarded, 0),
        max: item.maxPoints,
        advice: LLM_UNAVAILABLE_ADVICE,
        mode: 'hybrid',
        lowConfidence: true,
      }
    }
    return selfResult(item, LLM_UNAVAILABLE_ADVICE)
  }
}

export interface AttemptGrade {
  results: BaremResult[]
  totalAwarded: number
  totalMax: number
}

/** Grades a whole paper sequentially (gentle on provider rate limits). */
export async function gradeAttempt(
  paper: ExamPaper,
  answersByItemId: Record<string, string>,
  deps: GradeDeps,
): Promise<AttemptGrade> {
  const itemDeps: GradeDeps = { ...deps, subjectId: deps.subjectId ?? paper.subjectId }
  const results: BaremResult[] = []
  for (const item of paper.items) {
    results.push(await gradeItem(item, answersByItemId[item.id] ?? '', itemDeps))
  }
  return { results, ...totalsOf(results) }
}
