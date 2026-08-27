import type { InterfaceLanguage, ModelRunMetrics, SubjectId } from '@/types'
import {
  buildFeedbackPrompt,
  createAdapter,
  PROVIDER_PRESETS,
  ACTIVE_PROMPT_VERSION,
  type LLMProviderConfig,
} from '@/llm'
import type { ScoredChunk } from '@/rag'
import { metricsRepo } from '@/storage'
import { getTopic } from '@/data/subjectRegistry'
import { retrieve } from './ragService'

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
  groundednessScore: number
  formatCompliance: number
  metrics: ModelRunMetrics
}

const CITATION_RE = /\[#([^\]]+)\]/g

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
  const chat = await adapter.chat(
    { messages, temperature: 0.2, jsonMode: false },
    req.apiKey,
  )

  const citedChunkIds = Array.from(chat.content.matchAll(CITATION_RE), (m) => m[1] as string)
  const retrievedIds = new Set(retrieval.results.map((r) => r.chunk.id))
  const validCites = citedChunkIds.filter((id) => retrievedIds.has(id))

  const groundednessScore =
    citedChunkIds.length === 0
      ? retrieval.insufficient
        ? 1 // correctly refused / nothing to ground
        : 0
      : validCites.length / citedChunkIds.length
  const formatCompliance = citedChunkIds.length > 0 || retrieval.insufficient ? 1 : 0

  // Hard groundedness gate: a `[#id]` the model invented (never actually
  // retrieved) is worse than no citation at all — a student can't tell a real
  // source number from a fabricated one, so strip fabricated ones outright.
  // If most of an answer's citations are fabricated, the prose around them is
  // suspect too; fold that into `insufficient` so the UI's existing warning
  // banner covers it, rather than serving a confident-looking but unverifiable
  // explanation.
  const answer = stripInvalidCitations(chat.content, retrievedIds)
  const insufficient = retrieval.insufficient || (citedChunkIds.length > 0 && groundednessScore < 0.5)

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
    groundednessScore,
    formatCompliance,
    metrics,
  }
}

/** Removes a `[#id]` citation marker for any id that wasn't actually retrieved
 * — the model invented it — while leaving valid citations and the rest of the
 * prose untouched. */
function stripInvalidCitations(content: string, retrievedIds: Set<string>): string {
  return content.replace(CITATION_RE, (match, id: string) => (retrievedIds.has(id) ? match : ''))
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
