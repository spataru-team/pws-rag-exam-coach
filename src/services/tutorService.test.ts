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
})
