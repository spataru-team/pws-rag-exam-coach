import { describe, it, expect } from 'vitest'
import {
  InMemoryChunkSource,
  retrieveRelevantChunks,
  retrieveOrDegrade,
  rankBySimilarity,
  rankHybrid,
  type ScoredChunk,
} from './retrieve'
import type { Reranker } from './rerank'
import {
  DeterministicEmbeddingProvider,
  embedDeterministic,
  type EmbeddingProvider,
} from './embeddings'
import type { Chunk } from '@/types'

function makeChunk(
  id: string,
  subjectId: string,
  topicId: string,
  text: string,
  gradeLevel = 9,
): Chunk {
  return {
    id,
    subjectId,
    topicId,
    language: 'ro',
    text,
    source: 'test',
    gradeLevel,
    embedding: embedDeterministic(text),
  }
}

const chunks: Chunk[] = [
  makeChunk('ro-1', 'romanian', 'grammar', 'Articolul hotărât în limba română'),
  makeChunk('ro-2', 'romanian', 'reading', 'Înțelegerea textului literar'),
  makeChunk('bio-1', 'biology', 'cell', 'Celula este unitatea de bază a vieții'),
]

// A mixed-grade subject pack (like chemistry: grades 9 and 12 in one pack).
const mixedGradeChunks: Chunk[] = [
  makeChunk('chem-9-1', 'chemistry', 'chem-general', 'Периодический закон и строение атома', 9),
  makeChunk('chem-12-1', 'chemistry', 'chem-general', 'Функциональные группы органических соединений', 12),
]

const embedder = new DeterministicEmbeddingProvider()

describe('retrieveRelevantChunks — subject filtering', () => {
  it('never returns chunks from another subject', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks(
      'Celula este unitatea de bază a vieții',
      embedder,
      source,
      { subjectId: 'romanian', topK: 5 },
    )
    expect(res.results.every((r) => r.chunk.subjectId === 'romanian')).toBe(true)
    expect(res.results.find((r) => r.chunk.id === 'bio-1')).toBeUndefined()
  })

  it('further filters by topicId when provided', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks('articol', embedder, source, {
      subjectId: 'romanian',
      topicId: 'grammar',
    })
    expect(res.results.every((r) => r.chunk.topicId === 'grammar')).toBe(true)
  })

  it('ranks the exact-text chunk first', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks(
      'Articolul hotărât în limba română',
      embedder,
      source,
      { subjectId: 'romanian' },
    )
    expect(res.results[0]?.chunk.id).toBe('ro-1')
    expect(res.insufficient).toBe(false)
  })

  it('flags insufficient evidence when subject has no chunks', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks('anything', embedder, source, {
      subjectId: 'history',
    })
    expect(res.results).toHaveLength(0)
    expect(res.insufficient).toBe(true)
  })
})

describe('corpusEmpty — empty knowledge base vs off-topic question', () => {
  it('sets corpusEmpty when the subject has zero candidate chunks (clean-clone chemistry/math/russian)', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks('anything', embedder, source, {
      subjectId: 'chemistry',
    })
    expect(res.corpusEmpty).toBe(true)
    expect(res.insufficient).toBe(true)
  })

  it('does NOT set corpusEmpty when chunks exist but the query is off-topic', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks(
      'How do I repair a diesel truck engine?',
      embedder,
      source,
      { subjectId: 'romanian', minSimilarity: 0.99 },
    )
    expect(res.corpusEmpty).toBe(false)
    expect(res.insufficient).toBe(true)
  })

  it('retrieveOrDegrade reports corpusEmpty for an empty subject', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveOrDegrade('anything', embedder, source, {
      subjectId: 'chemistry',
    })
    expect(res.corpusEmpty).toBe(true)
    expect(res.unavailable).toBeUndefined()
  })

  it('retrieveOrDegrade reports corpusEmpty even when the embedder is also unavailable', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveOrDegrade('anything', new FailingEmbeddingProvider(), source, {
      subjectId: 'chemistry',
    })
    expect(res.unavailable).toBe(true)
    expect(res.corpusEmpty).toBe(true)
  })
})

/** Embedder that always fails — simulates Ollama being unavailable. */
class FailingEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'bge-m3'
  readonly dim = 1024
  embed(): Promise<number[]> {
    return Promise.reject(new Error('connection refused'))
  }
}

describe('graceful degradation (retrieveOrDegrade)', () => {
  it('returns an unavailable result instead of throwing when embedding fails', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveOrDegrade('articol', new FailingEmbeddingProvider(), source, {
      subjectId: 'romanian',
    })
    expect(res.unavailable).toBe(true)
    expect(res.insufficient).toBe(true)
    expect(res.results).toHaveLength(0)
    expect(res.embeddingModelId).toBe('bge-m3')
  })

  it('behaves like normal retrieval when embedding succeeds', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveOrDegrade(
      'Articolul hotărât în limba română',
      embedder,
      source,
      { subjectId: 'romanian' },
    )
    expect(res.unavailable).toBeUndefined()
    expect(res.results[0]?.chunk.id).toBe('ro-1')
  })
})

describe('rankBySimilarity', () => {
  it('sorts by similarity and respects topK', () => {
    const vec = embedDeterministic('Articolul hotărât în limba română')
    const { results } = rankBySimilarity(vec, chunks, 1)
    expect(results).toHaveLength(1)
    expect(results[0]?.chunk.id).toBe('ro-1')
  })

  it('flags insufficient when nothing clears the threshold', () => {
    const vec = embedDeterministic('x')
    const { insufficient } = rankBySimilarity(vec, [], 5)
    expect(insufficient).toBe(true)
  })
})

describe('rankHybrid', () => {
  const romanian = chunks.filter((c) => c.subjectId === 'romanian')

  it('fuses vector + lexical and ranks the matching chunk first', () => {
    const vec = embedDeterministic('Articolul hotărât în limba română')
    const { results } = rankHybrid(vec, 'Articolul hotărât în limba română', romanian)
    expect(results[0]?.chunk.id).toBe('ro-1')
    expect(results[0]?.lexicalScore).toBeGreaterThan(0)
    expect(results[0]?.fusedScore).toBeGreaterThan(0)
  })

  it('returns insufficient for empty candidates', () => {
    const vec = embedDeterministic('anything')
    expect(rankHybrid(vec, 'anything', []).insufficient).toBe(true)
  })
})

describe('hybrid + reranker as default in retrieveRelevantChunks', () => {
  it('still filters by subject and returns the lexical match first', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks(
      'Articolul hotărât în limba română',
      embedder,
      source,
      { subjectId: 'romanian' },
    )
    expect(res.results.every((r) => r.chunk.subjectId === 'romanian')).toBe(true)
    expect(res.results[0]?.chunk.id).toBe('ro-1')
  })

  it('can disable hybrid/rerank via options', async () => {
    const source = new InMemoryChunkSource(chunks)
    const res = await retrieveRelevantChunks('articol', embedder, source, {
      subjectId: 'romanian',
      hybrid: false,
      rerank: false,
    })
    expect(res.results.every((r) => r.chunk.subjectId === 'romanian')).toBe(true)
  })
})

describe('pluggable reranker (RetrieveOptions.reranker)', () => {
  it('awaits an async (network-backed) reranker and uses its order', async () => {
    const source = new InMemoryChunkSource(chunks)
    const reversingReranker: Reranker = {
      async rerank(_q: string, scored: ScoredChunk[]) {
        await Promise.resolve() // force a real microtask hop, not just sync-returning-a-Promise
        return [...scored].reverse()
      },
    }
    const res = await retrieveRelevantChunks('articol', embedder, source, {
      subjectId: 'romanian',
      reranker: reversingReranker,
    })
    const plain = await retrieveRelevantChunks('articol', embedder, source, { subjectId: 'romanian' })
    expect(res.results.map((r) => r.chunk.id)).toEqual([...plain.results.map((r) => r.chunk.id)].reverse())
  })

  it('recomputes insufficient from the final top-K, not the wider pre-rerank pool', async () => {
    // Query vector [1, 0]. 'a' has cosine 1.0 (the best match by far); 'b' and
    // 'c' both sit at cosine 0.6. rerankTopN keeps all 3 in the first stage, but
    // a reranker that buries the best cosine match at the tail should make
    // `insufficient` reflect the final top-2 it actually returns (both 0.6,
    // below the 0.7 threshold) — not the discarded 1.0 from the wider pool.
    const three: Chunk[] = [
      { id: 'a', subjectId: 'romanian', topicId: 't', language: 'ro', text: 'a', source: 'test', gradeLevel: 9, embedding: [1, 0] },
      { id: 'b', subjectId: 'romanian', topicId: 't', language: 'ro', text: 'b', source: 'test', gradeLevel: 9, embedding: [0.6, 0.8] },
      { id: 'c', subjectId: 'romanian', topicId: 't', language: 'ro', text: 'c', source: 'test', gradeLevel: 9, embedding: [0.6, 0.8] },
    ]
    const source = new InMemoryChunkSource(three)
    const worstFirst: Reranker = {
      rerank: (_q: string, scored: ScoredChunk[]) =>
        [...scored].sort((a, b) => a.similarity - b.similarity),
    }
    class FixedVectorEmbedder implements EmbeddingProvider {
      readonly modelId = 'fixed'
      readonly dim = 2
      embed(): Promise<number[]> {
        return Promise.resolve([1, 0])
      }
    }
    const res = await retrieveRelevantChunks('q', new FixedVectorEmbedder(), source, {
      subjectId: 'romanian',
      topK: 2,
      rerankTopN: 3,
      minSimilarity: 0.7,
      reranker: worstFirst,
    })
    expect(res.results.map((r) => r.chunk.id)).toEqual(['b', 'c']) // 'a' pushed out by the reranker
    expect(res.insufficient).toBe(true) // both survivors are 0.6 < 0.7, even though 'a' (1.0) existed upstream
  })
})

describe('gradeLevel filtering (mixed-grade subject packs)', () => {
  it('without topicId, restricts candidates to the given gradeLevel', async () => {
    const source = new InMemoryChunkSource(mixedGradeChunks)
    const res = await retrieveRelevantChunks('химия', embedder, source, {
      subjectId: 'chemistry',
      gradeLevel: 9,
    })
    expect(res.results.every((r) => r.chunk.gradeLevel === 9)).toBe(true)
    expect(res.results.find((r) => r.chunk.id === 'chem-12-1')).toBeUndefined()
  })

  it('without gradeLevel, subject-wide retrieval sees every grade', async () => {
    const source = new InMemoryChunkSource(mixedGradeChunks)
    const res = await retrieveRelevantChunks('химия', embedder, source, {
      subjectId: 'chemistry',
    })
    expect(res.results.map((r) => r.chunk.id).sort()).toEqual(['chem-12-1', 'chem-9-1'])
  })

  it('gradeLevel is ignored once topicId already narrows the set', async () => {
    const source = new InMemoryChunkSource(mixedGradeChunks)
    const res = await retrieveRelevantChunks('химия', embedder, source, {
      subjectId: 'chemistry',
      topicId: 'chem-general',
      gradeLevel: 9, // deliberately mismatched with chem-12-1 — topicId wins
    })
    expect(res.results.map((r) => r.chunk.id).sort()).toEqual(['chem-12-1', 'chem-9-1'])
  })
})
