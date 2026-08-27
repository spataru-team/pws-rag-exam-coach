import type { InterfaceLanguage, SubjectId } from '@/types'
import type { ScoredChunk } from '@/rag'
import type { ChatMessage } from '../types'
import { genericSystemPrompt, PROMPT_VERSION } from './generic'
import { subjectPromptRules } from './subjects'

export { PROMPT_VERSION } from './generic'
export { subjectPromptRules, SUBJECT_PROMPT_RULES } from './subjects'

export interface FeedbackPromptInput {
  subjectId: SubjectId
  supportLanguage: InterfaceLanguage
  question: string
  studentAnswer?: string
  retrieved: ScoredChunk[]
  /** When true, ask for a hint rather than full feedback. */
  hintOnly?: boolean
}

/** Renders retrieved chunks into a context block with [#id] citation markers. */
export function renderContext(retrieved: ScoredChunk[]): string {
  if (retrieved.length === 0) return '(no context retrieved)'
  return retrieved
    .map((r) => `[#${r.chunk.id}] (${r.similarity.toFixed(2)}) ${r.chunk.text}`)
    .join('\n\n')
}

/** Builds the chat messages for RAG-grounded feedback on a written answer. */
export function buildFeedbackPrompt(input: FeedbackPromptInput): ChatMessage[] {
  const system = [
    genericSystemPrompt(input.supportLanguage),
    subjectPromptRules(input.subjectId),
  ]
    .filter(Boolean)
    .join('\n\n')

  const task = input.hintOnly
    ? 'Give ONE short hint that nudges the student toward the rule. Do not reveal the full answer.'
    : 'Give feedback: what is correct, what to fix, and the rule that applies. End with the cited chunk ids.'

  const user = [
    `CONTEXT:\n${renderContext(input.retrieved)}`,
    `QUESTION:\n${input.question}`,
    input.studentAnswer ? `STUDENT ANSWER:\n${input.studentAnswer}` : '',
    `TASK:\n${task}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export const ACTIVE_PROMPT_VERSION = PROMPT_VERSION

export { buildBaremGradePrompt, type BaremGradeInput } from './barem'
