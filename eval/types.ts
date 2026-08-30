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

// --- P1-1a safety-characterization benchmark (eval/safety/) -----------------

/** Human-authored semantic category for a refusal case. */
export type RefusalCategory =
  | 'no-evidence'
  | 'weak-partial'
  | 'within-subject-unsupported-near-match'
  | 'over-refusal-guard'

/**
 * One refusal-benchmark case. `shouldRefuse` is a human-authored semantic label —
 * what a correct system OUGHT to do — set independently of what the current
 * pipeline actually does. A mismatch with the measured `insufficient` verdict is
 * a documented finding (under- or over-refusal), never a test failure. Run in
 * deterministic mode against the committed public-fallback packs.
 */
export interface RefusalCase {
  id: string
  subjectId: SubjectId
  query: string
  lang: QueryLang
  category: RefusalCategory
  /** True = a correct system should flag insufficient evidence. */
  shouldRefuse: boolean
  /** Why this label — corpus fact the case turns on. */
  rationale: string
  source: 'synthetic'
}

export type RefusalVerdict = 'correct' | 'under-refusal' | 'over-refusal'

export interface RefusalCaseResult {
  id: string
  subjectId: SubjectId
  category: RefusalCategory
  shouldRefuse: boolean
  insufficient: boolean
  topSimilarity: number
  retrievedChunkIds: string[]
  verdict: RefusalVerdict
}

/**
 * One citation-integrity fixture. `modelAnswer` is a synthetic string carrying a
 * single pathology; `retrievalInsufficient` is an explicit input because the
 * fold rule is `retrievalInsufficient || (cited > 0 && groundednessScore < 0.5)`
 * and cannot be derived from the other two fields.
 */
export interface CitationFixture {
  id: string
  category:
    | 'fabricated'
    | 'partial-grounding'
    | 'control'
    | 'malformed-marker'
  retrievedChunkIds: string[]
  modelAnswer: string
  retrievalInsufficient: boolean
  note: string
  source: 'synthetic'
  /** Expected values, asserted exactly. Partial: only listed fields are checked. */
  expect: {
    citedChunkIds?: string[]
    fabricatedCitedChunkIds?: string[]
    sanitizedAnswer?: string
    groundednessScore?: number
    formatCompliance?: number
    rawCitationValidity?: number
    fabricatedCitationCatchRate?: number
    postSanitizationCitationValidity?: number
    insufficient?: boolean
  }
}

export interface CitationFixtureResult {
  id: string
  category: CitationFixture['category']
  pass: boolean
  mismatches: string[]
}
