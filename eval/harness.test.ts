import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SubjectPack } from '@/packs/types'
import {
  classifyPack,
  runEvalHarness,
  EXPECTED_PUBLIC_FALLBACK_SUBJECTS,
  PARTIAL_COVERAGE_LABEL,
  type EvalConfig,
} from './harness'

describe('classifyPack — empty-subject handling', () => {
  const base: Omit<SubjectPack, 'chunks' | 'synthetic'> = {
    schemaVersion: 2,
    subjectId: 'chemistry',
    embeddingModel: 'deterministic-stub',
    embeddingDim: 8,
    generatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('missing pack → not evaluable (missing-pack)', () => {
    expect(classifyPack(null)).toEqual({ evaluable: false, reason: 'missing-pack' })
  })

  it('zero-chunk pack → not evaluable (empty-pack)', () => {
    expect(classifyPack({ ...base, chunks: [] })).toEqual({ evaluable: false, reason: 'empty-pack' })
  })

  it('synthetic demo pack → not evaluable (synthetic-pack), even with chunks', () => {
    const pack = { ...base, synthetic: true, chunks: [{ id: 'demo-x' }] } as unknown as SubjectPack
    expect(classifyPack(pack)).toEqual({ evaluable: false, reason: 'synthetic-pack' })
  })

  it('real non-empty pack → evaluable', () => {
    const pack = { ...base, chunks: [{ id: 'chem-1' }] } as unknown as SubjectPack
    expect(classifyPack(pack)).toEqual({ evaluable: true })
  })
})

// --- integration: run the real harness against a temp packs dir -------------

const CONFIG: EvalConfig = { mode: 'deterministic', topK: 5, minSimilarity: 0.42, hybrid: true, rerank: true }

const GOLDEN = {
  bio: {
    subjectId: 'biology',
    items: [
      {
        id: 't-bio-1',
        query: 'What is a cell?',
        lang: 'en',
        expectedSubjectId: 'biology',
        expectedTopicId: 'bio-cell',
        expectedChunkIds: ['t-bio-c1'],
      },
    ],
  },
  chem: {
    subjectId: 'chemistry',
    items: [
      {
        id: 't-chem-1',
        query: 'What is oxidation?',
        lang: 'en',
        expectedSubjectId: 'chemistry',
        expectedTopicId: 'chem-bonding',
        expectedChunkIds: ['t-chem-c1'],
      },
    ],
  },
}

function pack(subjectId: string, chunks: unknown[], synthetic = false): SubjectPack {
  return {
    schemaVersion: 2,
    subjectId,
    embeddingModel: 'deterministic-stub',
    embeddingDim: 1024,
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...(synthetic ? { synthetic: true } : {}),
    chunks: chunks as SubjectPack['chunks'],
  }
}

const bioChunk = {
  id: 't-bio-c1',
  subjectId: 'biology',
  topicId: 'bio-cell',
  language: 'en',
  text: 'A cell is the basic structural and functional unit of every living organism.',
  source: 'test',
  gradeLevel: 7,
  embedding: [],
}

async function scratch(files: Record<string, unknown>): Promise<{ packsDir: string; goldenDir: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-test-'))
  const packsDir = join(root, 'packs')
  const goldenDir = join(root, 'golden')
  await mkdir(packsDir, { recursive: true })
  await mkdir(goldenDir, { recursive: true })
  await writeFile(join(goldenDir, 'biology.json'), JSON.stringify(GOLDEN.bio))
  await writeFile(join(goldenDir, 'chemistry.json'), JSON.stringify(GOLDEN.chem))
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(packsDir, name), JSON.stringify(body))
  }
  return { packsDir, goldenDir, cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('runEvalHarness — partial coverage reporting', () => {
  it('skips an empty pack and a missing pack, labels the run partial', async () => {
    const { packsDir, goldenDir, cleanup } = await scratch({
      'biology.pack.json': pack('biology', [bioChunk]),
      'chemistry.pack.json': pack('chemistry', []), // empty
      // no math/russian/etc — biology.json + chemistry.json are the only golden sets here
    })
    try {
      const report = await runEvalHarness(CONFIG, { packsDir, goldenDir })
      expect(report.evaluatedSubjects).toEqual(['biology'])
      expect(report.skippedSubjects).toEqual([
        { subjectId: 'chemistry', reason: 'empty-pack', itemCount: 1 },
      ])
      expect(report.evaluatedItemCount).toBe(1)
      expect(report.skippedItemCount).toBe(1)
      expect(report.partialCoverage).toBe(true)
      expect(report.coverageLabel).toBe(PARTIAL_COVERAGE_LABEL)
    } finally {
      await cleanup()
    }
  })

  it('a synthetic demo pack is skipped, never counted toward the benchmark', async () => {
    const { packsDir, goldenDir, cleanup } = await scratch({
      'biology.pack.json': pack('biology', [bioChunk]),
      'chemistry.pack.json': pack('chemistry', [{ ...bioChunk, id: 'demo-chem-1', subjectId: 'chemistry', topicId: 'chem-bonding' }], true),
    })
    try {
      const report = await runEvalHarness(CONFIG, { packsDir, goldenDir })
      expect(report.skippedSubjects).toEqual([
        { subjectId: 'chemistry', reason: 'synthetic-pack', itemCount: 1 },
      ])
      expect(report.results.some((r) => r.subjectId === 'chemistry')).toBe(false)
    } finally {
      await cleanup()
    }
  })

  it('no skips → full coverage, no label', async () => {
    const { packsDir, goldenDir, cleanup } = await scratch({
      'biology.pack.json': pack('biology', [bioChunk]),
      'chemistry.pack.json': pack('chemistry', [{ ...bioChunk, id: 't-chem-c1', subjectId: 'chemistry', topicId: 'chem-bonding', text: 'Oxidation is loss of electrons; reduction is gain of electrons.' }]),
    })
    try {
      const report = await runEvalHarness(CONFIG, { packsDir, goldenDir })
      expect(report.partialCoverage).toBe(false)
      expect(report.coverageLabel).toBeUndefined()
      expect(new Set(report.evaluatedSubjects)).toEqual(new Set(['biology', 'chemistry']))
    } finally {
      await cleanup()
    }
  })
})

describe('EXPECTED_PUBLIC_FALLBACK_SUBJECTS', () => {
  it('is exactly the four hand-authored subjects', () => {
    expect([...EXPECTED_PUBLIC_FALLBACK_SUBJECTS].sort()).toEqual([
      'biology',
      'english',
      'history',
      'romanian',
    ])
  })
})
