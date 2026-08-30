import type { InterfaceLanguage, ModelRunMetrics, SubjectId } from '@/types'
import {
  buildFeedbackPrompt,
  createAdapter,
  PROVIDER_PRESETS,
  ACTIVE_PROMPT_VERSION,
  type ChatResponse,
  type LLMProviderConfig,
} from '@/llm'
import type { ScoredChunk } from '@/rag'
import { metricsRepo } from '@/storage'
import { getTopic } from '@/data/subjectRegistry'
import { retrieve } from './ragService'
import { citationCheck } from './citationCheck'

export interface TutorRequest {
  subjectId: SubjectId
  topicId: string
  question: string
  studentAnswer?: string
  supportLanguage: InterfaceLanguage
  providerConfig?: LLMProviderConfig
  apiKey?: string
  hintOnly?: boolean
  topK?: number
}

export interface TutorResponse {
  answer: string
  retrieved: ScoredChunk[]
  citedChunkIds: string[]
  insufficient: boolean
  /** True when the embedding service was unavailable (no LLM call was made). */
  embeddingUnavailable: boolean
  /**
   * True when the subject's pack holds zero chunks — its corpus is absent from
   * this build (chemistry/math/russian on a clean public clone), as opposed to
   * `insufficient` meaning "the materials don't cover this question". Derived
   * from pack metadata via `ragService.retrieve`, not from empty retrieval
   * results — see `docs/JUDGE_REPRODUCIBILITY.md`.
   */
  corpusEmpty: boolean
  /**
   * True when the grounded context came from a synthetic demo pack
   * (`npm run seed:demo`), not the production curriculum corpus. The UI must
   * surface this prominently. Propagated from `RetrievalResult.synthetic`.
   */
  synthetic: boolean
  /**
   * True when the LLM provider call itself failed (HTTP error, network,
   * misconfigured proxy) AFTER retrieval succeeded. Distinct from
   * `insufficient` (a retrieval verdict) and `embeddingUnavailable` (the query
   * could not be embedded, so no LLM call was attempted): here retrieval was
   * fine and `insufficient` keeps its real value — only the answer is missing.
   * The UI must show a clear "provider unavailable" message, never fail silently.
   */
  providerError: boolean
  /** Short diagnostic for `providerError` (adapter error text). Not shown verbatim to students. */
  providerErrorMessage?: string
  groundednessScore: number
  formatCompliance: number
  metrics: ModelRunMetrics
}

/**
 * End-to-end grounded tutoring: retrieve → build subject prompt → call provider
 * → measure groundedness/format → persist ModelRunMetrics. Keeps retrieval,
 * LLM and storage concerns composed here, not entangled inside each other.
 */
export async function getTutorFeedback(req: TutorRequest): Promise<TutorResponse> {
  const config = req.providerConfig ?? (PROVIDER_PRESETS.mock as LLMProviderConfig)
  const topK = req.topK ?? 5

  // Retrieve on the question plus the student's answer: the answer (in the
  // learning language) is the strongest signal for finding relevant material.
  const retrievalQuery = [req.question, req.studentAnswer].filter(Boolean).join('\n')

  // The topic's own gradeLevel (when known) scopes the subject-wide fallback
  // below to the student's grade — see ragService.retrieve's gradeLevel note.
  const gradeLevel = getTopic(req.subjectId, req.topicId)?.gradeLevel

  // Topic-scoped retrieval first; fall back to subject-level when the topic has
  // no direct chunks (e.g. a parent topic whose chunks live on child topics).
  let retrieval = await retrieve(retrievalQuery, req.subjectId, req.topicId, topK)
  if (retrieval.results.length === 0 && !retrieval.unavailable && req.topicId) {
    retrieval = await retrieve(retrievalQuery, req.subjectId, undefined, topK, gradeLevel)
  }

  // Embedding service down: don't call the LLM (there's no grounded context).
  // Surface a clear status so the UI can ask the user to start it.
  if (retrieval.unavailable) {
    return {
      answer: '',
      retrieved: [],
      citedChunkIds: [],
      insufficient: true,
      embeddingUnavailable: true,
      corpusEmpty: retrieval.corpusEmpty ?? false,
      synthetic: retrieval.synthetic ?? false,
      providerError: false,
      groundednessScore: 0,
      formatCompliance: 0,
      metrics: emptyMetrics(config, req, topK),
    }
  }

  // The subject's pack holds zero chunks — its corpus is absent from this build
  // (see docs/JUDGE_REPRODUCIBILITY.md). Return a clear status instead of calling
  // the LLM to produce a confident but ungrounded answer; the UI must say
  // "regenerate this subject's corpus locally", not "your question isn't in the
  // materials". (A populated subject that simply had no chunk match this
  // topic/grade is NOT corpusEmpty and falls through to the ordinary flow.)
  if (retrieval.corpusEmpty) {
    return {
      answer: '',
      retrieved: [],
      citedChunkIds: [],
      insufficient: true,
      embeddingUnavailable: false,
      corpusEmpty: true,
      synthetic: retrieval.synthetic ?? false,
      providerError: false,
      groundednessScore: 0,
      formatCompliance: 0,
      metrics: emptyMetrics(config, req, topK),
    }
  }

  const messages = buildFeedbackPrompt({
    subjectId: req.subjectId,
    supportLanguage: req.supportLanguage,
    question: req.question,
    studentAnswer: req.studentAnswer,
    retrieved: retrieval.results,
    hintOnly: req.hintOnly,
  })

  const adapter = createAdapter(config)
  let chat: ChatResponse
  try {
    chat = await adapter.chat({ messages, temperature: 0.2, jsonMode: false }, req.apiKey)
  } catch (err) {
    // The LLM provider itself failed (HTTP error / network / misconfigured
    // proxy) — retrieval already succeeded, so keep its real `insufficient`
    // verdict and the retrieved sources, and flag `providerError` so the UI
    // shows a clear "provider unavailable" message rather than nothing.
    return {
      answer: '',
      retrieved: retrieval.results,
      citedChunkIds: [],
      insufficient: retrieval.insufficient,
      embeddingUnavailable: false,
      corpusEmpty: retrieval.corpusEmpty ?? false,
      synthetic: retrieval.synthetic ?? false,
      providerError: true,
      providerErrorMessage: err instanceof Error ? err.message : String(err),
      groundednessScore: 0,
      formatCompliance: 0,
      metrics: emptyMetrics(config, req, topK),
    }
  }

  // Mechanical citation-integrity pipeline (extract `[#id]` markers → membership
  // check → strip fabricated ones → groundedness / format compliance → fold to
  // `insufficient` when most citations are fabricated). Shared verbatim with the
  // safety benchmark (`eval/safety/`). A `[#id]` the model invented is worse than
  // no citation at all — a student can't tell a real source number from a
  // fabricated one — so fabricated markers are stripped outright, and if most of
  // an answer's citations are fabricated the prose around them is suspect too, so
  // that folds into the same `insufficient` state the UI's warning banner covers.
  const {
    citedChunkIds,
    groundednessScore,
    formatCompliance,
    insufficient,
    sanitizedAnswer: answer,
  } = citationCheck({
    retrievedChunkIds: retrieval.results.map((r) => r.chunk.id),
    modelAnswer: chat.content,
    retrievalInsufficient: retrieval.insufficient,
  })

  const metrics: ModelRunMetrics = {
    id: `mrm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    provider: chat.provider,
    model: chat.model,
    subjectId: req.subjectId,
    topicId: req.topicId,
    latencyMs: chat.latencyMs,
    tokensIn: chat.usage.tokensIn,
    tokensOut: chat.usage.tokensOut,
    estimatedCost: 0,
    retrievalTopK: topK,
    contextChunkIds: retrieval.results.map((r) => r.chunk.id),
    groundednessScore,
    formatCompliance,
  }
  await metricsRepo.add(metrics)

  return {
    answer,
    retrieved: retrieval.results,
    citedChunkIds,
    insufficient,
    embeddingUnavailable: false,
    corpusEmpty: retrieval.corpusEmpty ?? false,
    synthetic: retrieval.synthetic ?? false,
    providerError: false,
    groundednessScore,
    formatCompliance,
    metrics,
  }
}

/** Zeroed metrics for the degraded path where no LLM call was made. */
function emptyMetrics(
  config: LLMProviderConfig,
  req: TutorRequest,
  topK: number,
): ModelRunMetrics {
  return {
    id: `mrm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    provider: config.id,
    model: config.model,
    subjectId: req.subjectId,
    topicId: req.topicId,
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    estimatedCost: 0,
    retrievalTopK: topK,
    contextChunkIds: [],
    groundednessScore: 0,
    formatCompliance: 0,
  }
}

export const PROMPT_VERSION_IN_USE = ACTIVE_PROMPT_VERSION
