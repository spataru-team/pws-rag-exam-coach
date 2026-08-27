import type { SubjectId } from '@/types'

/** A teacher-approved evaluation item. */
/** Language of the query text itself (not the corpus it's tested against). */
export type QueryLang = 'ru' | 'ro' | 'en'

export interface GoldenItem {
  id: string
  query: string
  /** Language the query is written in — drives the byLang breakdown in AggregateReport. */
  lang: QueryLang
  expectedSubjectId: SubjectId
  expectedTopicId: string
  /** Chunk ids that SHOULD be retrieved for a good answer. */
  expectedChunkIds: string[]
  /** Rubric id the model answer should satisfy. */
  expectedAnswerRubricId?: string
  /** When true, retrieval SHOULD flag insufficient evidence (refusal case). */
  expectInsufficient?: boolean
  notes?: string
}

export interface GoldenSet {
  subjectId: SubjectId
  items: GoldenItem[]
}

export interface EvalResult {
  itemId: string
  subjectId: SubjectId
  topicId: string
  retrievedChunkIds: string[]
  /** Share of expected chunks present in the retrieved top-K. */
  retrievalRecall: number
  topSimilarity: number
  insufficient: boolean
}
