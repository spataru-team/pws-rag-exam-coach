import { describe, it, expect } from 'vitest'
import {
  DeterministicEmbeddingProvider,
  embedDeterministic,
  InMemoryChunkSource,
  retrieveRelevantChunks,
} from '@/rag'
import { getTopic } from '@/data/subjectRegistry'
import type { Chunk, SubjectId } from '@/types'
import {
  demoChunkDraftsBySubject,
  DEMO_SOURCE,
  DEMO_TEXT_PREFIX,
  DEMO_SUBJECT_IDS,
} from './index'

const DEMO_SUBJECTS = Object.entries(demoChunkDraftsBySubject) as [
  SubjectId,
  NonNullable<(typeof demoChunkDraftsBySubject)[SubjectId]>,
][]

/** Same transform the real seed script applies, re-embedded with the offline stub. */
function embed(subjectId: SubjectId): Chunk[] {
  return (demoChunkDraftsBySubject[subjectId] ?? []).map((d) => ({
    ...d,
    embedding: embedDeterministic(d.text),
  }))
}

describe('synthetic demo chunks — labelling and registry validity', () => {
  it('covers exactly the three subjects the public repo ships empty', () => {
    expect([...DEMO_SUBJECT_IDS].sort()).toEqual(['chemistry', 'math', 'russian'])
  })

  it.each(DEMO_SUBJECTS)('%s: 5–8 chunks, each explicitly marked synthetic', (_subjectId, drafts) => {
    expect(drafts.length).toBeGreaterThanOrEqual(5)
    expect(drafts.length).toBeLessThanOrEqual(8)
    for (const d of drafts) {
      expect(d.id.startsWith('demo-')).toBe(true)
      expect(d.source).toBe(DEMO_SOURCE)
      expect(d.text.startsWith(DEMO_TEXT_PREFIX)).toBe(true)
      expect(d.metadata?.bookId).toBe('DEMO_SYNTHETIC')
    }
  })

  it.each(DEMO_SUBJECTS)('%s: every chunk maps to a real topic id and matching grade', (subjectId, drafts) => {
    for (const d of drafts) {
      const topic = getTopic(subjectId, d.topicId)
      expect(topic, `${d.id} -> ${d.topicId}`).toBeDefined()
      if (topic?.gradeLevel !== undefined) {
        expect(d.gradeLevel).toBe(topic.gradeLevel)
      }
    }
  })
})

describe('synthetic demo — exercises the real retrieval pipeline (same code as production)', () => {
  const embedder = new DeterministicEmbeddingProvider()

  it('retrieves the intended synthetic chunk for a paraphrased query (chemistry)', async () => {
    const source = new InMemoryChunkSource(embed('chemistry'))
    const res = await retrieveRelevantChunks(
      'Чем ионная связь отличается от ковалентной связи?',
      embedder,
      source,
      { subjectId: 'chemistry', topK: 3 },
    )
    expect(res.corpusEmpty).toBe(false)
    expect(res.results.map((r) => r.chunk.id)).toContain('demo-chem-002')
  })

  it('retrieves the intended synthetic chunk for a paraphrased query (math)', async () => {
    const source = new InMemoryChunkSource(embed('math'))
    const res = await retrieveRelevantChunks(
      'Cum rezolvi o ecuație de gradul al doilea folosind discriminantul?',
      embedder,
      source,
      { subjectId: 'math', topK: 3 },
    )
    expect(res.results.map((r) => r.chunk.id)).toContain('demo-math-003')
  })

  it('an off-topic question is insufficient but NOT corpusEmpty (russian)', async () => {
    const source = new InMemoryChunkSource(embed('russian'))
    const res = await retrieveRelevantChunks('How do I change a car tyre?', embedder, source, {
      subjectId: 'russian',
      topK: 3,
      minSimilarity: 0.5,
    })
    expect(res.corpusEmpty).toBe(false)
    expect(res.insufficient).toBe(true)
  })

  it('retrieval never crosses from a demo subject into another subject', async () => {
    const source = new InMemoryChunkSource([...embed('chemistry'), ...embed('math')])
    const res = await retrieveRelevantChunks('производная и скорость изменения', embedder, source, {
      subjectId: 'math',
      topK: 5,
    })
    expect(res.results.every((r) => r.chunk.subjectId === 'math')).toBe(true)
  })
})
