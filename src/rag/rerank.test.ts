import { describe, it, expect } from 'vitest'
import { LexicalReranker } from './rerank'
import type { ScoredChunk } from './retrieve'
import type { Chunk } from '@/types'

function sc(id: string, text: string, similarity: number): ScoredChunk {
  const chunk: Chunk = {
    id,
    subjectId: 'romanian',
    topicId: 't',
    language: 'ro',
    text,
    source: 'test',
    gradeLevel: 9,
    embedding: [],
  }
  return { chunk, similarity }
}

const reranker = new LexicalReranker()

describe('LexicalReranker', () => {
  it('promotes the lexically relevant chunk above a higher-similarity off-topic one', () => {
    const scored = [
      sc('off', 'Celula este unitatea de bază a vieții', 0.9),
      sc('hit', 'Articolul hotărât în limba română', 0.5),
    ]
    const out = reranker.rerank('articolul hotărât în limba română', scored, 2)
    expect(out[0]!.chunk.id).toBe('hit')
  })

  it('is a no-op for 0 or 1 candidate', () => {
    const one = [sc('a', 'x', 0.5)]
    expect(reranker.rerank('q', one, 2)).toBe(one)
  })

  it('keeps candidates beyond topN untouched at the tail', () => {
    const scored = [
      sc('a', 'irrelevant text', 0.8),
      sc('b', 'articolul hotărât', 0.7),
      sc('c', 'tail chunk', 0.6),
    ]
    const out = reranker.rerank('articolul hotărât', scored, 2)
    // Only first 2 reranked; 'c' stays last.
    expect(out[2]!.chunk.id).toBe('c')
    expect(out[0]!.chunk.id).toBe('b')
  })

  it('is deterministic', () => {
    const make = () => [
      sc('a', 'articolul hotărât în limba', 0.4),
      sc('b', 'verbul la prezent', 0.6),
    ]
    const a = reranker.rerank('articolul hotărât', make(), 2).map((s) => s.chunk.id)
    const b = reranker.rerank('articolul hotărât', make(), 2).map((s) => s.chunk.id)
    expect(a).toEqual(b)
  })
})
