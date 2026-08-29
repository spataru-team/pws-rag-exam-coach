import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatResponse } from '@/llm'
import type { RetrievalResult, ScoredChunk } from '@/rag'
import type { Chunk } from '@/types'

const chatMock = vi.fn<() => Promise<ChatResponse>>()
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return {
    ...actual,
    createAdapter: () => ({ config: actual.PROVIDER_PRESETS.mock, chat: chatMock }),
  }
})

const retrieveMock = vi.fn<() => Promise<RetrievalResult>>()
vi.mock('./ragService', () => ({ retrieve: retrieveMock }))

const { getTutorFeedback } = await import('./tutorService')

function chunk(id: string, text = 'text'): Chunk {
  return {
    id,
    subjectId: 'chemistry',
    topicId: 't',
    language: 'ru',
    text,
    source: 'test',
    gradeLevel: 9,
    embedding: [],
  }
}

function scored(id: string): ScoredChunk {
  return { chunk: chunk(id), similarity: 0.9 }
}

function retrieval(results: ScoredChunk[], insufficient = false): RetrievalResult {
  return {
    query: 'q',
    subjectId: 'chemistry',
    topicId: 't',
    results,
    insufficient,
    embeddingModelId: 'bge-m3',
  }
}

function chatResponse(content: string): ChatResponse {
  return {
    content,
    usage: { tokensIn: 1, tokensOut: 1 },
    latencyMs: 1,
    provider: 'mock',
    model: 'mock-grounded',
  }
}

const baseReq = {
  subjectId: 'chemistry' as const,
  topicId: 't',
  question: 'q',
  studentAnswer: 'a',
  supportLanguage: 'ru' as const,
}

beforeEach(() => {
  chatMock.mockReset()
  retrieveMock.mockReset()
})

describe('getTutorFeedback — groundedness gate', () => {
  it('leaves a fully-valid-cited answer untouched', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a'), scored('b')]))
    chatMock.mockResolvedValue(chatResponse('Explanation [#a] and [#b].'))

    const res = await getTutorFeedback(baseReq)

    expect(res.answer).toBe('Explanation [#a] and [#b].')
    expect(res.insufficient).toBe(false)
    expect(res.groundednessScore).toBe(1)
  })

  it('strips a fabricated citation id that was never retrieved', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')]))
    chatMock.mockResolvedValue(chatResponse('Real [#a], fake [#zzz].'))

    const res = await getTutorFeedback(baseReq)

    expect(res.answer).toBe('Real [#a], fake .')
    expect(res.citedChunkIds).toEqual(['a', 'zzz']) // raw list still reflects what the model tried to cite
  })

  it('degrades to insufficient when most citations are fabricated', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')]))
    chatMock.mockResolvedValue(chatResponse('[#fake1] [#fake2] and one real [#a].'))

    const res = await getTutorFeedback(baseReq)

    expect(res.groundednessScore).toBeCloseTo(1 / 3)
    expect(res.insufficient).toBe(true)
  })

  it('does not gate on groundedness when there are no citations at all (unchanged prior behavior)', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')]))
    chatMock.mockResolvedValue(chatResponse('An answer with no citations.'))

    const res = await getTutorFeedback(baseReq)

    expect(res.groundednessScore).toBe(0)
    expect(res.insufficient).toBe(false)
  })

  it('stays insufficient when retrieval itself was insufficient, regardless of citations', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')], true))
    chatMock.mockResolvedValue(chatResponse('[#a] fully valid.'))

    const res = await getTutorFeedback(baseReq)

    expect(res.insufficient).toBe(true)
  })

  it('short-circuits before calling the LLM when the embedding service is unavailable', async () => {
    retrieveMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      results: [],
      insufficient: true,
      unavailable: true,
      embeddingModelId: 'bge-m3',
    })

    const res = await getTutorFeedback(baseReq)

    expect(res.embeddingUnavailable).toBe(true)
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('short-circuits before the LLM and sets corpusEmpty when the subject ships no knowledge base (clean-clone chemistry/math/russian)', async () => {
    retrieveMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      topicId: 't',
      results: [],
      insufficient: true,
      corpusEmpty: true,
      embeddingModelId: 'deterministic-stub',
    })

    const res = await getTutorFeedback(baseReq)

    expect(res.corpusEmpty).toBe(true)
    expect(res.insufficient).toBe(true)
    expect(res.embeddingUnavailable).toBe(false)
    expect(res.answer).toBe('')
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('leaves corpusEmpty false when the corpus has chunks but the question is off-topic', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')], true))
    chatMock.mockResolvedValue(chatResponse('Not enough grounded material.'))

    const res = await getTutorFeedback(baseReq)

    expect(res.corpusEmpty).toBe(false)
    expect(res.insufficient).toBe(true)
  })

  // FIX 1 regression: a populated subject whose grade/topic filter matched
  // nothing must NOT be reported as corpusEmpty (which would wrongly tell the
  // student to regenerate the corpus). `corpusEmpty` now comes from pack
  // metadata (chunkCount === 0), not from empty retrieval results.
  it('populated subject + zero retrieval results (grade/topic miss) → corpusEmpty false, LLM still tried', async () => {
    retrieveMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      topicId: 't',
      results: [],
      insufficient: true,
      corpusEmpty: false, // pack has chunks — the pure results were just empty for this slice
      embeddingModelId: 'bge-m3',
    })
    chatMock.mockResolvedValue(chatResponse('I could not find grounded material for that.'))

    const res = await getTutorFeedback(baseReq)

    expect(res.corpusEmpty).toBe(false)
    expect(res.insufficient).toBe(true)
    expect(chatMock).toHaveBeenCalled() // ordinary flow — NOT the empty-pack short-circuit
  })
})

describe('getTutorFeedback — synthetic demo flag (npm run seed:demo)', () => {
  it('flags the response synthetic when grounded in a synthetic demo pack, and still answers', async () => {
    retrieveMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      topicId: 't',
      results: [scored('demo-chem-002')],
      insufficient: false,
      synthetic: true,
      embeddingModelId: 'deterministic-stub',
    })
    chatMock.mockResolvedValue(chatResponse('Ionic vs covalent, briefly. [#demo-chem-002]'))

    const res = await getTutorFeedback(baseReq)

    expect(res.synthetic).toBe(true)
    expect(res.answer).toContain('Ionic vs covalent')
  })

  it('a normal production/fallback response is not flagged synthetic', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')]))
    chatMock.mockResolvedValue(chatResponse('Grounded answer [#a].'))

    const res = await getTutorFeedback(baseReq)

    expect(res.synthetic).toBe(false)
  })

  it('carries synthetic through the embedding-unavailable and empty-pack short-circuits too', async () => {
    retrieveMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      results: [],
      insufficient: true,
      unavailable: true,
      synthetic: true,
      embeddingModelId: 'deterministic-stub',
    })

    const res = await getTutorFeedback(baseReq)

    expect(res.embeddingUnavailable).toBe(true)
    expect(res.synthetic).toBe(true)
  })
})

describe('getTutorFeedback — provider failure is distinct from insufficient evidence', () => {
  it('sufficient retrieval + provider throws → providerError true, insufficient stays FALSE, no exception', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a'), scored('b')], false)) // sufficient
    chatMock.mockRejectedValue(new Error('OpenAI-compatible (cloud): HTTP 404 '))

    const res = await getTutorFeedback(baseReq)

    expect(res.providerError).toBe(true)
    expect(res.providerErrorMessage).toContain('HTTP 404')
    expect(res.insufficient).toBe(false) // retrieval was fine — only the answer is missing
    expect(res.embeddingUnavailable).toBe(false)
    expect(res.corpusEmpty).toBe(false)
    expect(res.answer).toBe('')
    expect(res.retrieved.map((r) => r.chunk.id)).toEqual(['a', 'b']) // sources preserved
  })

  it('genuinely insufficient retrieval + provider succeeds → insufficient true, providerError FALSE', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')], true)) // insufficient
    chatMock.mockResolvedValue(chatResponse('Not enough grounded material.'))

    const res = await getTutorFeedback(baseReq)

    expect(res.insufficient).toBe(true)
    expect(res.providerError).toBe(false)
  })

  it('insufficient retrieval AND provider throws → both flags true (honest), still no exception', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')], true))
    chatMock.mockRejectedValue(new Error('network down'))

    const res = await getTutorFeedback(baseReq)

    expect(res.providerError).toBe(true)
    expect(res.insufficient).toBe(true) // preserved from retrieval, independently
  })

  it('a successful answer never sets providerError', async () => {
    retrieveMock.mockResolvedValue(retrieval([scored('a')]))
    chatMock.mockResolvedValue(chatResponse('Grounded [#a].'))

    const res = await getTutorFeedback(baseReq)

    expect(res.providerError).toBe(false)
    expect(res.providerErrorMessage).toBeUndefined()
  })
})
