import type { ExamItem, InterfaceLanguage } from '@/types'
import type { ScoredChunk } from '@/rag'
import type { ChatMessage } from '../types'
import { renderContext } from './index'
import { localize } from '@/i18n/localize'

export interface BaremGradeInput {
  item: ExamItem
  studentAnswer: string
  supportLanguage: InterfaceLanguage
  retrieved?: ScoredChunk[]
  /**
   * Restricts the barem section of the prompt to just these criteria —
   * `gradeItem` (examGraderService.ts) passes only the LLM-graded subset of
   * `item.subCriteria` for a hybrid item, so the model is never asked to
   * (re-)grade the criterion that's already being checked deterministically
   * (see `ExamSubCriterion.gradeMode`). Defaults to every one of the item's
   * own criteria, exactly as before this existed.
   */
  criteria?: { id: string; maxPoints: number; rule: string }[]
}

const SUPPORT_NAME: Record<InterfaceLanguage, string> = {
  ru: 'rusă',
  ro: 'română',
  en: 'engleză',
}

/** Builds chat messages that ask the model to grade an answer strictly by barem. */
export function buildBaremGradePrompt(input: BaremGradeInput): ChatMessage[] {
  const { item } = input
  const criteria =
    input.criteria ??
    (item.subCriteria && item.subCriteria.length > 0
      ? item.subCriteria.map((c) => ({ id: c.id, maxPoints: c.maxPoints, rule: c.rule }))
      : [{ id: item.id, maxPoints: item.maxPoints, rule: item.baremRule }])
  const slots = criteria.map((c) => `- "${c.id}" (max ${c.maxPoints}): ${c.rule}`).join('\n')

  const system = [
    // Subject-neutral on purpose: this prompt grades every subject (romanian,
    // math, chemistry, ...) via the same barem-checking flow — it used to
    // literally claim to be a Romanian-language evaluator ("pentru limba
    // română, gimnaziu, alolingvi") even when grading a math item, which is
    // simply false for non-Romanian papers (found while wiring math-sb26).
    'Ești un evaluator de examen riguros. Notează un răspuns de elev conform baremului oficial al disciplinei.',
    'Notează STRICT după barem. Nu acorda puncte peste maximul fiecărui criteriu.',
    `Scrie comentariile și sfatul în limba ${SUPPORT_NAME[input.supportLanguage]}.`,
    'Răspunde DOAR cu JSON valid, fără text în plus, în forma:',
    '{"perCriterion":[{"id":"<id>","awarded":<număr>,"comment":"<scurt>"}],"advice":"<un sfat concret>"}',
  ].join('\n')

  // The model can't see the figure itself (no vision call here) — describe it
  // in words so grading a "see the drawing" geometry item isn't blind to what
  // the student was actually looking at. See src/types/asset.ts.
  const figures = (item.assets ?? [])
    .map((a) => a.description || localize(a.caption, input.supportLanguage) || localize(a.alt, input.supportLanguage))
    .filter(Boolean)

  const user = [
    `SARCINA:\n${item.prompt}`,
    figures.length > 0 ? `FIGURĂ (descriere, elevul o vede desenată):\n${figures.join('\n')}` : '',
    `BAREM (criterii și maxim):\n${slots}`,
    item.acceptedAnswers && item.acceptedAnswers.length > 0
      ? `RĂSPUNS DE REFERINȚĂ (orientativ, se acceptă și alte variante adecvate):\n${item.acceptedAnswers.join('\n')}`
      : '',
    input.retrieved && input.retrieved.length > 0
      ? `CONTEXT (materiale locale):\n${renderContext(input.retrieved)}`
      : '',
    `RĂSPUNSUL ELEVULUI:\n${input.studentAnswer || '(gol)'}`,
    'Evaluează și returnează JSON-ul cerut.',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
