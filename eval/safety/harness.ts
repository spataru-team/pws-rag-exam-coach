/**
 * P1-1a safety-characterization benchmark core.
 *
 * Two fully deterministic, offline subsets, reported SEPARATELY and with NO
 * pass/fail gate:
 *
 *   A. Refusal — real `retrieveRelevantChunks` in deterministic mode against the
 *      committed public-fallback packs (romanian / english / biology / history).
 *      Each case carries a human-authored `shouldRefuse` semantic label; the
 *      measured `insufficient` verdict is compared to it and classified
 *      correct / under-refusal / over-refusal. Mismatches are findings, not
 *      failures — the deterministic stub has no semantic discrimination and the
 *      0.42 threshold is bge-m3-calibrated (see docs/EVALUATION.md).
 *
 *   B. Citation integrity — the extracted `citationCheck` pipeline run over
 *      synthetic fixtures. No retrieval, no embeddings. Every listed field is
 *      asserted exactly.
 *
 * Plus an over-refusal INTEGRATION SIGNAL over the on-topic golden items that a
 * clean public clone can actually evaluate (34: romanian 15 + english 8 +
 * biology 5 + history 6). Reported alongside, not folded into the core metrics.
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DeterministicEmbeddingProvider,
  InMemoryChunkSource,
  retrieveRelevantChunks,
  embedDeterministic,
  buildQueryExpansionGlossary,
  DEFAULT_TOP_K,
  DEFAULT_MIN_SIMILARITY,
} from '@/rag'
import { getTopics } from '@/data/subjectRegistry'
import { mean } from '@/stats/metrics'
import { citationCheck } from '@/services/citationCheck'
import type { SubjectPack } from '@/packs/types'
import type { Chunk, SubjectId } from '@/types'
import { classifyPack, type SkipReason } from '../harness'
import type {
  CitationFixture,
  CitationFixtureResult,
  GoldenSet,
  RefusalCase,
  RefusalCaseResult,
  RefusalVerdict,
} from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(__dirname, '..', '..', 'public', 'packs')
const GOLDEN_DIR = join(__dirname, '..', 'golden')
const CASES_DIR = __dirname

/** Subjects a clean public clone can evaluate — same set as the retrieval eval. */
export const PUBLIC_FALLBACK_SUBJECTS: readonly SubjectId[] = [
  'romanian',
  'english',
  'biology',
  'history',
]

export interface SafetyDirs {
  packsDir?: string
  goldenDir?: string
  casesDir?: string
}

// --- pure scoring ----------------------------------------------------------

/** Compare the human-authored semantic label to the measured verdict. */
export function classifyRefusal(shouldRefuse: boolean, insufficient: boolean): RefusalVerdict {
  if (shouldRefuse) return insufficient ? 'correct' : 'under-refusal'
  return insufficient ? 'over-refusal' : 'correct'
}

export interface RefusalMetrics {
  caseCount: number
  shouldRefuseN: number
  correctlyRefused: number
  underRefusals: number
  shouldAnswerN: number
  correctlyAnswered: number
  overRefusals: number
  /** correctlyRefused / shouldRefuseN — null when no should-refuse cases. */
  refusalRecall: number | null
  /** correctlyRefused / (correctlyRefused + overRefusals) — null when that sum is 0. */
  refusalPrecision: number | null
  refusalF1: number | null
  /** overRefusals / shouldAnswerN — 0 when no should-answer cases. */
  overRefusalRate: number
}

export function refusalMetrics(results: RefusalCaseResult[]): RefusalMetrics {
  const shouldRefuse = results.filter((r) => r.shouldRefuse)
  const shouldAnswer = results.filter((r) => !r.shouldRefuse)
  const correctlyRefused = shouldRefuse.filter((r) => r.verdict === 'correct').length
  const underRefusals = shouldRefuse.filter((r) => r.verdict === 'under-refusal').length
  const correctlyAnswered = shouldAnswer.filter((r) => r.verdict === 'correct').length
  const overRefusals = shouldAnswer.filter((r) => r.verdict === 'over-refusal').length

  const recall = shouldRefuse.length === 0 ? null : correctlyRefused / shouldRefuse.length
  const precDenom = correctlyRefused + overRefusals
  const precision = precDenom === 0 ? null : correctlyRefused / precDenom
  const f1 =
    recall === null || precision === null || recall + precision === 0
      ? null
      : (2 * recall * precision) / (recall + precision)

  return {
    caseCount: results.length,
    shouldRefuseN: shouldRefuse.length,
    correctlyRefused,
    underRefusals,
    shouldAnswerN: shouldAnswer.length,
    correctlyAnswered,
    overRefusals,
    refusalRecall: recall,
    refusalPrecision: precision,
    refusalF1: f1,
    overRefusalRate: shouldAnswer.length === 0 ? 0 : overRefusals / shouldAnswer.length,
  }
}

const NUMERIC_FIELDS = [
  'groundednessScore',
  'formatCompliance',
  'rawCitationValidity',
  'fabricatedCitationCatchRate',
  'postSanitizationCitationValidity',
] as const

/** Run one fixture through `citationCheck` and diff against its `expect` block. */
export function checkCitationFixture(fixture: CitationFixture): CitationFixtureResult {
  const actual = citationCheck({
    retrievedChunkIds: fixture.retrievedChunkIds,
    modelAnswer: fixture.modelAnswer,
    retrievalInsufficient: fixture.retrievalInsufficient,
  })
  const exp = fixture.expect
  const mismatches: string[] = []

  const arrayEq = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i])

  if (exp.citedChunkIds && !arrayEq(actual.citedChunkIds, exp.citedChunkIds))
    mismatches.push(
      `citedChunkIds: got ${JSON.stringify(actual.citedChunkIds)}, want ${JSON.stringify(exp.citedChunkIds)}`,
    )
  if (
    exp.fabricatedCitedChunkIds &&
    !arrayEq(actual.fabricatedCitedChunkIds, exp.fabricatedCitedChunkIds)
  )
    mismatches.push(
      `fabricatedCitedChunkIds: got ${JSON.stringify(actual.fabricatedCitedChunkIds)}, want ${JSON.stringify(exp.fabricatedCitedChunkIds)}`,
    )
  if (exp.sanitizedAnswer !== undefined && actual.sanitizedAnswer !== exp.sanitizedAnswer)
    mismatches.push(
      `sanitizedAnswer: got ${JSON.stringify(actual.sanitizedAnswer)}, want ${JSON.stringify(exp.sanitizedAnswer)}`,
    )
  if (exp.insufficient !== undefined && actual.insufficient !== exp.insufficient)
    mismatches.push(`insufficient: got ${actual.insufficient}, want ${exp.insufficient}`)
  for (const f of NUMERIC_FIELDS) {
    const want = exp[f]
    if (want !== undefined && Math.abs(actual[f] - want) > 1e-9)
      mismatches.push(`${f}: got ${actual[f]}, want ${want}`)
  }

  return { id: fixture.id, category: fixture.category, pass: mismatches.length === 0, mismatches }
}

/**
 * Pooled marker counts across the whole adversarial fixture set. These are the
 * mechanically meaningful numbers: how many `[#id]` markers the fixtures carry,
 * how many were deliberately fabricated, and whether the checker stripped every
 * one. The `*Mean` ratios below are per-fixture averages whose value depends on
 * fixture composition (how many fabricated markers we authored) — diagnostic
 * only, not a system citation-quality score.
 */
export interface CitationMarkerCounts {
  totalRawMarkers: number
  rawValid: number
  /** Markers pointing at an id that was not retrieved — all authored by us. */
  rawFabricated: number
  /** Fabricated markers removed by sanitization. */
  fabricatedCaught: number
  /** Fabricated markers still present after sanitization (should be 0). */
  invalidRemainingAfterSanitization: number
  postSanitizationMarkers: number
}

export interface CitationAggregate {
  fixtureCount: number
  passCount: number
  markerCounts: CitationMarkerCounts
  /** Per-fixture mean of valid/cited (empty-citation fixtures count 1). Fixture-composition diagnostic. */
  rawCitationValidityMean: number
  fabricatedCitationCatchRateMean: number
  postSanitizationCitationValidityMean: number
  foldBoundaryFixtures: { id: string; groundednessScore: number; insufficient: boolean }[]
  markerConformanceFixtures: { id: string; pass: boolean; mismatches: string[] }[]
  results: CitationFixtureResult[]
}

export function citationAggregate(fixtures: CitationFixture[]): CitationAggregate {
  const results = fixtures.map(checkCitationFixture)
  const checks = fixtures.map((f) => ({
    f,
    a: citationCheck({
      retrievedChunkIds: f.retrievedChunkIds,
      modelAnswer: f.modelAnswer,
      retrievalInsufficient: f.retrievalInsufficient,
    }),
  }))
  const retrievedSets = fixtures.map((f) => new Set(f.retrievedChunkIds))
  const rawFabricated = checks.reduce((n, c) => n + c.a.fabricatedCitedChunkIds.length, 0)
  const invalidRemaining = checks.reduce(
    (n, c, i) =>
      n + c.a.postSanitizationCitedChunkIds.filter((id) => !retrievedSets[i]!.has(id)).length,
    0,
  )
  const markerCounts: CitationMarkerCounts = {
    totalRawMarkers: checks.reduce((n, c) => n + c.a.citedChunkIds.length, 0),
    rawValid: checks.reduce((n, c) => n + c.a.validCitedChunkIds.length, 0),
    rawFabricated,
    fabricatedCaught: rawFabricated - invalidRemaining,
    invalidRemainingAfterSanitization: invalidRemaining,
    postSanitizationMarkers: checks.reduce(
      (n, c) => n + c.a.postSanitizationCitedChunkIds.length,
      0,
    ),
  }

  return {
    fixtureCount: fixtures.length,
    passCount: results.filter((r) => r.pass).length,
    markerCounts,
    rawCitationValidityMean: mean(checks.map((c) => c.a.rawCitationValidity)),
    fabricatedCitationCatchRateMean: mean(checks.map((c) => c.a.fabricatedCitationCatchRate)),
    postSanitizationCitationValidityMean: mean(
      checks.map((c) => c.a.postSanitizationCitationValidity),
    ),
    foldBoundaryFixtures: checks
      .filter((c) => c.f.category === 'partial-grounding')
      .map((c) => ({
        id: c.f.id,
        groundednessScore: c.a.groundednessScore,
        insufficient: c.a.insufficient,
      })),
    markerConformanceFixtures: checks
      .filter((c) => c.f.category === 'malformed-marker')
      .map((c) => {
        const r = results.find((x) => x.id === c.f.id)!
        return { id: c.f.id, pass: r.pass, mismatches: r.mismatches }
      }),
    results,
  }
}

// --- I/O + retrieval ------------------------------------------------------

async function loadPack(subjectId: string, packsDir: string): Promise<SubjectPack | null> {
  try {
    return JSON.parse(await readFile(join(packsDir, `${subjectId}.pack.json`), 'utf8')) as SubjectPack
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function loadJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

const glossaryCache = new Map<SubjectId, Map<string, Set<string>>>()
function glossaryFor(subjectId: SubjectId): Map<string, Set<string>> {
  let g = glossaryCache.get(subjectId)
  if (!g) {
    g = buildQueryExpansionGlossary(getTopics(subjectId))
    glossaryCache.set(subjectId, g)
  }
  return g
}

export interface SkippedSubject {
  subjectId: string
  reason: SkipReason
  caseCount: number
}

export interface RefusalBenchmarkReport {
  metrics: RefusalMetrics
  results: RefusalCaseResult[]
  evaluatedSubjects: string[]
  skippedSubjects: SkippedSubject[]
  partialCoverage: boolean
}

/** Deterministic-mode retrieval over one case, re-embedding chunk text with the stub. */
async function retrieveForCase(
  query: string,
  subjectId: SubjectId,
  pack: SubjectPack,
): Promise<{ insufficient: boolean; topSimilarity: number; retrievedChunkIds: string[] }> {
  const dim = pack.embeddingDim
  const embedder = new DeterministicEmbeddingProvider(dim)
  const chunks: Chunk[] = pack.chunks.map((c) => ({ ...c, embedding: embedDeterministic(c.text, dim) }))
  const source = new InMemoryChunkSource(chunks)
  const r = await retrieveRelevantChunks(query, embedder, source, {
    subjectId,
    topK: DEFAULT_TOP_K,
    minSimilarity: DEFAULT_MIN_SIMILARITY,
    queryExpansionGlossary: glossaryFor(subjectId),
    hybrid: true,
    rerank: true,
  })
  return {
    insufficient: r.insufficient,
    topSimilarity: r.results[0]?.similarity ?? 0,
    retrievedChunkIds: r.results.map((x) => x.chunk.id),
  }
}

export async function runRefusalBenchmark(dirs: SafetyDirs = {}): Promise<RefusalBenchmarkReport> {
  const packsDir = dirs.packsDir ?? PACKS_DIR
  const casesDir = dirs.casesDir ?? CASES_DIR
  const cases = await loadJson<RefusalCase[]>(join(casesDir, 'refusal-cases.json'))

  const bySubject = new Map<SubjectId, RefusalCase[]>()
  for (const c of cases) {
    const list = bySubject.get(c.subjectId) ?? []
    list.push(c)
    bySubject.set(c.subjectId, list)
  }

  const results: RefusalCaseResult[] = []
  const evaluatedSubjects: string[] = []
  const skippedSubjects: SkippedSubject[] = []

  for (const [subjectId, subjectCases] of bySubject) {
    const pack = await loadPack(subjectId, packsDir)
    const { evaluable, reason } = classifyPack(pack)
    if (!evaluable) {
      skippedSubjects.push({ subjectId, reason: reason!, caseCount: subjectCases.length })
      continue
    }
    evaluatedSubjects.push(subjectId)
    for (const c of subjectCases) {
      const r = await retrieveForCase(c.query, subjectId, pack!)
      results.push({
        id: c.id,
        subjectId,
        category: c.category,
        shouldRefuse: c.shouldRefuse,
        insufficient: r.insufficient,
        topSimilarity: r.topSimilarity,
        retrievedChunkIds: r.retrievedChunkIds,
        verdict: classifyRefusal(c.shouldRefuse, r.insufficient),
      })
    }
  }

  return {
    metrics: refusalMetrics(results),
    results,
    evaluatedSubjects,
    skippedSubjects,
    partialCoverage: skippedSubjects.length > 0,
  }
}

export interface GoldenOverRefusalSignal {
  evaluatedSubjects: string[]
  skippedSubjects: string[]
  onTopicItemCount: number
  wronglyRefused: number
  overRefusalRate: number
  wronglyRefusedIds: string[]
}

/** On-topic golden items a clean public clone can evaluate, scored ONLY for over-refusal. */
export async function runGoldenOverRefusalSignal(
  dirs: SafetyDirs = {},
): Promise<GoldenOverRefusalSignal> {
  const packsDir = dirs.packsDir ?? PACKS_DIR
  const goldenDir = dirs.goldenDir ?? GOLDEN_DIR
  const files = (await readdir(goldenDir)).filter((f) => f.endsWith('.json'))

  const evaluatedSubjects: string[] = []
  const skippedSubjects: string[] = []
  const wronglyRefusedIds: string[] = []
  let onTopicItemCount = 0

  for (const f of files) {
    const set = await loadJson<GoldenSet>(join(goldenDir, f))
    if (set.items.length === 0) continue
    const pack = await loadPack(set.subjectId, packsDir)
    if (!classifyPack(pack).evaluable) {
      skippedSubjects.push(set.subjectId)
      continue
    }
    evaluatedSubjects.push(set.subjectId)
    for (const item of set.items) {
      if (item.expectInsufficient === true) continue
      onTopicItemCount++
      const r = await retrieveForCase(item.query, item.expectedSubjectId, pack!)
      if (r.insufficient) wronglyRefusedIds.push(item.id)
    }
  }

  return {
    evaluatedSubjects,
    skippedSubjects,
    onTopicItemCount,
    wronglyRefused: wronglyRefusedIds.length,
    overRefusalRate: onTopicItemCount === 0 ? 0 : wronglyRefusedIds.length / onTopicItemCount,
    wronglyRefusedIds,
  }
}

export async function loadCitationFixtures(dirs: SafetyDirs = {}): Promise<CitationFixture[]> {
  const casesDir = dirs.casesDir ?? CASES_DIR
  return loadJson<CitationFixture[]>(join(casesDir, 'citation-fixtures.json'))
}
