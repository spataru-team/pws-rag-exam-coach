/**
 * Reusable evaluation core shared by runEval.ts (report + CI gate) and
 * sweep.ts (parameter grid). Pure-ish: it does I/O (read packs/golden) but the
 * scoring uses the shared metric helpers.
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DeterministicEmbeddingProvider,
  OllamaEmbeddingProvider,
  InMemoryChunkSource,
  retrieveRelevantChunks,
  embedDeterministic,
  buildQueryExpansionGlossary,
  bareModelName,
  type EmbeddingProvider,
} from '@/rag'
import { recallAtK, mrr, mean } from '@/stats/metrics'
import { getTopics } from '@/data/subjectRegistry'
import type { SubjectPack } from '@/packs/types'
import type { Chunk, SubjectId } from '@/types'
import type { GoldenSet, QueryLang } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(__dirname, '..', 'public', 'packs')
const GOLDEN_DIR = join(__dirname, 'golden')

export type EvalMode = 'auto' | 'deterministic'

export interface EvalConfig {
  mode: EvalMode
  topK: number
  minSimilarity: number
  hybrid: boolean
  rerank: boolean
}

export interface ItemResult {
  itemId: string
  subjectId: string
  lang: QueryLang
  retrievedChunkIds: string[]
  recallAt5: number
  reciprocalRank: number
  topSimilarity: number
  insufficient: boolean
  refusal: boolean
  refusalCorrect: boolean | null
}

/** Recall/MRR restricted to one query language — the slide that actually proves the ru-query fix. */
export interface LangBreakdown {
  itemCount: number
  recallAt5: number
  mrr: number
  avgTopSimilarity: number
}

export interface AggregateReport {
  generatedAt: string
  config: EvalConfig
  itemCount: number
  recallAt1: number
  recallAt3: number
  recallAt5: number
  mrr: number
  avgTopSimilarity: number
  refusalAccuracy: number | null
  byLang: Partial<Record<QueryLang, LangBreakdown>>
  results: ItemResult[]
}

async function loadPack(subjectId: string): Promise<SubjectPack> {
  return JSON.parse(
    await readFile(join(PACKS_DIR, `${subjectId}.pack.json`), 'utf8'),
  ) as SubjectPack
}

export async function loadGoldenSets(): Promise<GoldenSet[]> {
  const files = (await readdir(GOLDEN_DIR)).filter((f) => f.endsWith('.json'))
  const sets: GoldenSet[] = []
  for (const f of files) {
    sets.push(JSON.parse(await readFile(join(GOLDEN_DIR, f), 'utf8')) as GoldenSet)
  }
  return sets
}

function makeEmbedder(mode: EvalMode, packModel: string, packDim: number): EmbeddingProvider {
  if (mode === 'deterministic') return new DeterministicEmbeddingProvider(packDim)
  return packModel && packModel !== 'deterministic-stub'
    ? new OllamaEmbeddingProvider({ model: bareModelName(packModel), dim: packDim })
    : new DeterministicEmbeddingProvider(packDim)
}

/** In deterministic mode, re-embed chunk text with the stub so the run is fully reproducible. */
function makeChunks(mode: EvalMode, chunks: Chunk[], dim: number): Chunk[] {
  if (mode !== 'deterministic') return chunks
  return chunks.map((c) => ({ ...c, embedding: embedDeterministic(c.text, dim) }))
}

// Per-subject glossary cache, same idea as ragService.ts's — built once from
// each subject's own topic tree, not per golden item.
const glossaryCache = new Map<SubjectId, Map<string, Set<string>>>()
function glossaryFor(subjectId: SubjectId): Map<string, Set<string>> {
  let g = glossaryCache.get(subjectId)
  if (!g) {
    g = buildQueryExpansionGlossary(getTopics(subjectId))
    glossaryCache.set(subjectId, g)
  }
  return g
}

export async function runEvalHarness(config: EvalConfig): Promise<AggregateReport> {
  const sets = await loadGoldenSets()
  const results: ItemResult[] = []

  for (const set of sets) {
    if (set.items.length === 0) continue
    const pack = await loadPack(set.subjectId)
    const embedder = makeEmbedder(config.mode, pack.embeddingModel, pack.embeddingDim)
    const source = new InMemoryChunkSource(makeChunks(config.mode, pack.chunks, pack.embeddingDim))

    for (const item of set.items) {
      const r = await retrieveRelevantChunks(item.query, embedder, source, {
        subjectId: item.expectedSubjectId,
        topK: config.topK,
        minSimilarity: config.minSimilarity,
        queryExpansionGlossary: glossaryFor(item.expectedSubjectId),
        hybrid: config.hybrid,
        rerank: config.rerank,
      })
      const ids = r.results.map((x) => x.chunk.id)
      const refusal = item.expectInsufficient === true
      results.push({
        itemId: item.id,
        subjectId: set.subjectId,
        lang: item.lang,
        retrievedChunkIds: ids,
        recallAt5: recallAtK(ids, item.expectedChunkIds, 5),
        reciprocalRank: mrr(ids, item.expectedChunkIds),
        topSimilarity: r.results[0]?.similarity ?? 0,
        insufficient: r.insufficient,
        refusal,
        refusalCorrect: refusal ? r.insufficient === true : null,
      })
    }
  }

  const scored = results.filter((r) => !r.refusal)
  const refusals = results.filter((r) => r.refusal)

  // recall@1/3 computed from stored retrieved ids + expected ids per golden item.
  const expectedById = new Map<string, string[]>()
  for (const set of sets) {
    for (const it of set.items) expectedById.set(it.id, it.expectedChunkIds)
  }
  const recallK = (k: number, rows: ItemResult[] = scored) =>
    mean(
      rows.map((r) =>
        recallAtK(r.retrievedChunkIds, expectedById.get(r.itemId) ?? [], k),
      ),
    )

  const langs: QueryLang[] = ['ru', 'ro', 'en']
  const byLang: Partial<Record<QueryLang, LangBreakdown>> = {}
  for (const lang of langs) {
    const rows = scored.filter((r) => r.lang === lang)
    if (rows.length === 0) continue
    byLang[lang] = {
      itemCount: rows.length,
      recallAt5: recallK(5, rows),
      mrr: mean(rows.map((r) => r.reciprocalRank)),
      avgTopSimilarity: mean(rows.map((r) => r.topSimilarity)),
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    config,
    itemCount: results.length,
    recallAt1: recallK(1),
    recallAt3: recallK(3),
    recallAt5: mean(scored.map((r) => r.recallAt5)),
    mrr: mean(scored.map((r) => r.reciprocalRank)),
    avgTopSimilarity: mean(scored.map((r) => r.topSimilarity)),
    refusalAccuracy:
      refusals.length === 0
        ? null
        : mean(refusals.map((r) => (r.refusalCorrect ? 1 : 0))),
    byLang,
    results,
  }
}
