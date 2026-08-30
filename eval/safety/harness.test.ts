import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyRefusal,
  refusalMetrics,
  checkCitationFixture,
  citationAggregate,
  runRefusalBenchmark,
  runGoldenOverRefusalSignal,
} from './harness'
import type { CitationFixture, RefusalCase, RefusalCaseResult } from '../types'

describe('classifyRefusal — semantic label vs measured verdict', () => {
  it('should-refuse + insufficient=true → correct', () => {
    expect(classifyRefusal(true, true)).toBe('correct')
  })
  it('should-refuse + insufficient=false → under-refusal', () => {
    expect(classifyRefusal(true, false)).toBe('under-refusal')
  })
  it('should-answer + insufficient=false → correct', () => {
    expect(classifyRefusal(false, false)).toBe('correct')
  })
  it('should-answer + insufficient=true → over-refusal', () => {
    expect(classifyRefusal(false, true)).toBe('over-refusal')
  })
})

function res(shouldRefuse: boolean, insufficient: boolean): RefusalCaseResult {
  return {
    id: 'x',
    subjectId: 'romanian',
    category: shouldRefuse ? 'no-evidence' : 'over-refusal-guard',
    shouldRefuse,
    insufficient,
    topSimilarity: 0,
    retrievedChunkIds: [],
    verdict: classifyRefusal(shouldRefuse, insufficient),
  }
}

describe('refusalMetrics', () => {
  it('counts each verdict class and derives recall / precision / F1 / over-refusal rate', () => {
    // 3 should-refuse (2 correct, 1 under-refusal); 2 should-answer (1 correct, 1 over-refusal)
    const m = refusalMetrics([
      res(true, true),
      res(true, true),
      res(true, false),
      res(false, false),
      res(false, true),
    ])
    expect(m.shouldRefuseN).toBe(3)
    expect(m.correctlyRefused).toBe(2)
    expect(m.underRefusals).toBe(1)
    expect(m.shouldAnswerN).toBe(2)
    expect(m.correctlyAnswered).toBe(1)
    expect(m.overRefusals).toBe(1)
    expect(m.refusalRecall).toBeCloseTo(2 / 3)
    expect(m.refusalPrecision).toBeCloseTo(2 / 3) // 2 TP / (2 TP + 1 FP)
    expect(m.refusalF1).toBeCloseTo(2 / 3)
    expect(m.overRefusalRate).toBeCloseTo(1 / 2)
  })

  it('returns null rates when a denominator is empty (no cases of that kind)', () => {
    const m = refusalMetrics([res(false, false), res(false, false)])
    expect(m.shouldRefuseN).toBe(0)
    expect(m.refusalRecall).toBeNull()
    expect(m.refusalF1).toBeNull()
    expect(m.overRefusalRate).toBe(0)
  })
})

describe('checkCitationFixture — asserts only the fields the fixture lists', () => {
  const base: Omit<CitationFixture, 'expect'> = {
    id: 'B-x',
    category: 'fabricated',
    retrievedChunkIds: ['a'],
    modelAnswer: 'real [#a] fake [#zzz]',
    retrievalInsufficient: false,
    note: 'one fabricated marker',
    source: 'synthetic',
  }

  it('passes when every listed expectation matches', () => {
    const r = checkCitationFixture({
      ...base,
      expect: {
        citedChunkIds: ['a', 'zzz'],
        fabricatedCitedChunkIds: ['zzz'],
        groundednessScore: 0.5,
        insufficient: false,
        sanitizedAnswer: 'real [#a] fake ',
      },
    })
    expect(r.pass).toBe(true)
    expect(r.mismatches).toEqual([])
  })

  it('fails and names each field that does not match', () => {
    const r = checkCitationFixture({
      ...base,
      expect: { groundednessScore: 1, insufficient: true },
    })
    expect(r.pass).toBe(false)
    expect(r.mismatches).toHaveLength(2)
    expect(r.mismatches.join(' ')).toContain('groundednessScore')
    expect(r.mismatches.join(' ')).toContain('insufficient')
  })
})

describe('citationAggregate', () => {
  it('means the validity metrics and counts fixture passes', () => {
    const fixtures: CitationFixture[] = [
      {
        id: 'B-1',
        category: 'fabricated',
        retrievedChunkIds: ['a'],
        modelAnswer: '[#a] [#x]',
        retrievalInsufficient: false,
        note: '',
        source: 'synthetic',
        expect: { groundednessScore: 0.5 },
      },
      {
        id: 'B-2',
        category: 'control',
        retrievedChunkIds: ['a', 'b'],
        modelAnswer: '[#a] [#b]',
        retrievalInsufficient: false,
        note: '',
        source: 'synthetic',
        expect: { groundednessScore: 1 },
      },
    ]
    const agg = citationAggregate(fixtures)
    expect(agg.fixtureCount).toBe(2)
    expect(agg.passCount).toBe(2)
    expect(agg.rawCitationValidityMean).toBeCloseTo((0.5 + 1) / 2)
    expect(agg.fabricatedCitationCatchRateMean).toBe(1)
    expect(agg.postSanitizationCitationValidityMean).toBe(1)
  })
})

// --- integration: real retrieval against a temp packs dir -------------------

function pack(subjectId: string, chunks: unknown[], synthetic = false) {
  return {
    schemaVersion: 2,
    subjectId,
    embeddingModel: 'deterministic-stub',
    embeddingDim: 1024,
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...(synthetic ? { synthetic: true } : {}),
    chunks,
  }
}

const roChunk = {
  id: 'ro-art-001',
  subjectId: 'romanian',
  topicId: 'ro-articles',
  language: 'ro',
  text: 'Articolul hotărât în limba română se atașează la sfârșitul substantivului: băiat devine băiatul.',
  source: 'test',
  gradeLevel: 7,
  embedding: [],
}

const REFUSAL_CASES: RefusalCase[] = [
  {
    id: 't-ne-1',
    subjectId: 'romanian',
    query: 'Cum se calculează aria unui cerc?',
    lang: 'ro',
    category: 'no-evidence',
    shouldRefuse: true,
    rationale: 'geometry, not in a language-arts pack',
    source: 'synthetic',
  },
  {
    id: 't-or-1',
    subjectId: 'romanian',
    query: 'Cum se atașează articolul hotărât la substantiv în română?',
    lang: 'ro',
    category: 'over-refusal-guard',
    shouldRefuse: false,
    rationale: 'ro-art-001 answers this directly',
    source: 'synthetic',
  },
]

async function scratch(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'safety-test-'))
  const packsDir = join(root, 'packs')
  const goldenDir = join(root, 'golden')
  const casesDir = join(root, 'cases')
  await mkdir(packsDir, { recursive: true })
  await mkdir(goldenDir, { recursive: true })
  await mkdir(casesDir, { recursive: true })
  await writeFile(join(packsDir, 'romanian.pack.json'), JSON.stringify(pack('romanian', [roChunk])))
  await writeFile(join(packsDir, 'english.pack.json'), JSON.stringify(pack('english', []))) // empty
  await writeFile(join(casesDir, 'refusal-cases.json'), JSON.stringify(REFUSAL_CASES))
  await writeFile(
    join(goldenDir, 'romanian.json'),
    JSON.stringify({
      subjectId: 'romanian',
      items: [
        {
          id: 'g-ontopic',
          query: 'Cum se formează articolul hotărât în română?',
          lang: 'ro',
          expectedSubjectId: 'romanian',
          expectedTopicId: 'ro-articles',
          expectedChunkIds: ['ro-art-001'],
        },
        {
          id: 'g-offtopic',
          query: 'Cum se repară un motor diesel?',
          lang: 'ro',
          expectedSubjectId: 'romanian',
          expectedTopicId: 'ro-articles',
          expectedChunkIds: [],
          expectInsufficient: true,
        },
      ],
    }),
  )
  return {
    dir: root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

describe('runRefusalBenchmark — real retrieval, deterministic', () => {
  it('classifies every case and is byte-stable across runs', async () => {
    const { dir, cleanup } = await scratch()
    try {
      const dirs = { packsDir: join(dir, 'packs'), casesDir: join(dir, 'cases') }
      const a = await runRefusalBenchmark(dirs)
      const b = await runRefusalBenchmark(dirs)
      expect(a.evaluatedSubjects).toEqual(['romanian'])
      expect(a.results).toHaveLength(2)
      expect(a.results.every((r) => ['correct', 'under-refusal', 'over-refusal'].includes(r.verdict)))
        .toBe(true)
      expect(a.results).toEqual(b.results) // deterministic
      expect(a.metrics.caseCount).toBe(2)
    } finally {
      await cleanup()
    }
  })

  it('skips a subject whose pack is missing rather than throwing', async () => {
    const report = await runRefusalBenchmark({ packsDir: join(tmpdir(), 'definitely-not-here') })
    expect(report.evaluatedSubjects).toEqual([])
    expect(report.skippedSubjects.map((s) => s.reason)).toContain('missing-pack')
    expect(report.partialCoverage).toBe(true)
  })
})

describe('runGoldenOverRefusalSignal — on-topic golden only', () => {
  it('counts wrongful refusals over on-topic items and ignores expectInsufficient items', async () => {
    const { dir, cleanup } = await scratch()
    try {
      const s = await runGoldenOverRefusalSignal({
        packsDir: join(dir, 'packs'),
        goldenDir: join(dir, 'golden'),
      })
      expect(s.evaluatedSubjects).toEqual(['romanian'])
      expect(s.onTopicItemCount).toBe(1) // the off-topic (expectInsufficient) item is excluded
      expect(s.wronglyRefused).toBe(s.wronglyRefusedIds.length)
    } finally {
      await cleanup()
    }
  })
})
