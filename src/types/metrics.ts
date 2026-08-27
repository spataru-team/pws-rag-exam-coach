import type { SubjectId } from './common'

/** 9. ModelRunMetrics — one measured LLM call, used by the Model Lab. */
export interface ModelRunMetrics {
  id: string
  timestamp: string
  provider: string
  model: string
  subjectId: SubjectId
  topicId: string
  latencyMs: number
  tokensIn: number
  tokensOut: number
  /** Rough estimate in USD; 0 for local/free providers. */
  estimatedCost: number
  retrievalTopK: number
  contextChunkIds: string[]
  /** 0..1 — share of answer claims supported by retrieved context. */
  groundednessScore: number
  /** 0..1 — adherence to the requested output format. */
  formatCompliance: number
  /** 0..1 — learner rating of the answer. */
  userRating?: number
  /** 0..1 — optional teacher rating. */
  teacherRating?: number
}
