import { describe, it, expect, vi, afterEach } from 'vitest'
import { CrossEncoderReranker } from './crossEncoderReranker'
import { LexicalReranker } from './rerank'
import type { ScoredChunk } from './retrieve'
import type { Chunk } from '@/types'

function sc(id: string, text: string, similarity: number): ScoredChunk {
  const chunk: Chunk = {
    id,
    subjectId: 'chemistry',
    topicId: 't',
    language: 'ru',
    text,
    source: 'test',
    gradeLevel: 9,
    embedding: [],
  }
  return { chunk, similarity }
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('CrossEncoderReranker', () => {
  it('reorders by relevance_score from a Cohere-shaped /rerank response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 0, relevance_score: 0.1 },
            { index: 1, relevance_score: 0.9 },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3', model: 'm' })
    const scored = [sc('a', 'off-topic', 0.5), sc('b', 'on-topic', 0.4)]
    const out = await reranker.rerank('q', scored, 2)
    expect(out.map((s) => s.chunk.id)).toEqual(['b', 'a'])
    // similarity (cosine) must survive the reorder unchanged — the reranker's
    // relevance_score isn't cosine and mustn't overwrite the insufficient gate's input.
    expect(out.find((s) => s.chunk.id === 'b')!.similarity).toBe(0.4)
  })

  it('sends the expected Cohere-shaped request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 0, relevance_score: 0.5 },
            { index: 1, relevance_score: 0.9 },
          ],
        }),
      ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3/', model: 'bge-reranker-v2-m3' })
    await reranker.rerank('вопрос', [sc('a', 'текст а', 0.5), sc('b', 'текст б', 0.4)], 2)

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/v3/rerank')
    expect(JSON.parse(opts.body as string)).toEqual({
      model: 'bge-reranker-v2-m3',
      query: 'вопрос',
      documents: ['текст а', 'текст б'],
    })
  })

  it('falls back to LexicalReranker on a network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    const fallback = new LexicalReranker()
    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3', model: 'm', fallback })
    const scored = [
      sc('off', 'Celula este unitatea de bază a vieții', 0.9),
      sc('hit', 'Articolul hotărât în limba română', 0.5),
    ]
    const out = await reranker.rerank('articolul hotărât în limba română', scored, 2)
    expect(out[0]!.chunk.id).toBe('hit') // lexical fallback actually ran, not a pass-through
  })

  it('falls back on a non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 503 })) as unknown as typeof fetch
    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3', model: 'm' })
    const scored = [sc('a', 'x', 0.5), sc('b', 'y', 0.4)]
    const out = await reranker.rerank('q', scored, 2)
    expect(out.map((s) => s.chunk.id)).toEqual(['a', 'b']) // unchanged order (no lexical signal either way)
  })

  it('falls back when the response has out-of-range/incomplete indices', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ results: [{ index: 5, relevance_score: 1 }] })))
    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3', model: 'm' })
    const scored = [sc('a', 'x', 0.5), sc('b', 'y', 0.4)]
    const out = await reranker.rerank('q', scored, 2)
    expect(out).toHaveLength(2)
  })

  it('is a no-op for 0 or 1 candidate (no network call)', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const reranker = new CrossEncoderReranker({ baseUrl: 'http://localhost:8000/v3', model: 'm' })
    const one = [sc('a', 'x', 0.5)]
    const out = await reranker.rerank('q', one, 2)
    expect(out).toBe(one)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
