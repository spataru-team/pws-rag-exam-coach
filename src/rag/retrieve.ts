import type { Chunk, SubjectId } from '@/types'
import { cosineSimilarity } from './cosine'
import type { EmbeddingProvider } from './embeddings'
import { lexicalScores, fuseRRF } from './lexical'
import { defaultReranker, type Reranker } from './rerank'
import { expandQueryForLexical } from './queryExpansion'

export interface ScoredChunk {
  chunk: Chunk
  /** Cosine similarity to the query (used for display and the insufficient gate). */
  similarity: number
  /** BM25-lite lexical score (hybrid retrieval only). */
  lexicalScore?: number
  /** Fused RRF score used for ordering (hybrid retrieval only). */
  fusedScore?: number
}

export interface RetrievalResult {
  query: string
  subjectId: SubjectId
  topicId?: string
  results: ScoredChunk[]
  /** True when there is not enough grounded evidence to answer safely. */
  insufficient: boolean
  embeddingModelId: string
  /**
   * True when the query could not be embedded (e.g. the pack uses a real model
   * like nomic-embed-text but Ollama is unavailable). Distinct from
   * `insufficient`: there is no usable query vector at all, so the UI should ask
   * the user to start the embedding service rather than imply the materials are
   * lacking. We never silently fall back to a different embedding space.
   */
  unavailable?: boolean
  /**
   * True when there were zero candidate chunks in scope — the subject (or the
   * subject+grade) has no knowledge base at all in this build. Distinct from
   * `insufficient` (candidates existed, none cleared the similarity gate): the
   * UI must say "this subject ships no corpus here, regenerate it locally"
   * rather than "your question isn't covered by the materials". See
   * `public/packs/README.md` / `docs/JUDGE_REPRODUCIBILITY.md` — the public repo
   * intentionally omits the copyrighted textbook packs for chemistry, math and
   * russian, so a clean clone leaves those three empty until `npm run seed`
   * (with a local corpus) or `npm run seed:demo` (synthetic) is run.
   */
  corpusEmpty?: boolean
}

/**
 * Source of candidate chunks. Backed by IndexedDB in the app and by in-memory
 * arrays in tests. Filtering by subjectId happens here so retrieval never
 * crosses subjects unless explicitly given a combined source.
 */
export interface ChunkSource {
  getChunks(subjectId: SubjectId, topicId?: string, gradeLevel?: number): Promise<Chunk[]>
}

/** In-memory ChunkSource — useful for tests, seeding and small packs. */
export class InMemoryChunkSource implements ChunkSource {
  private readonly chunks: Chunk[]
  constructor(chunks: Chunk[]) {
    this.chunks = chunks
  }

  async getChunks(subjectId: SubjectId, topicId?: string, gradeLevel?: number): Promise<Chunk[]> {
    return Promise.resolve(
      this.chunks.filter(
        (c) =>
          c.subjectId === subjectId &&
          (!topicId || c.topicId === topicId) &&
          // gradeLevel is ignored once topicId narrows the set — see contentRepo.getChunksBySubject.
          (topicId || gradeLevel === undefined || c.gradeLevel === gradeLevel),
      ),
    )
  }
}

export interface RetrieveOptions {
  subjectId: SubjectId
  topicId?: string
  /** Only applied when topicId is absent — see ChunkSource.getChunks. Keeps a
   * mixed-grade subject pack (e.g. chemistry: grades 9 and 12 in one pack)
   * from surfacing another grade's material during subject-wide fallback. */
  gradeLevel?: number
  topK?: number
  /** Minimum top-1 similarity below which evidence is deemed insufficient. */
  minSimilarity?: number
  /** Vector + lexical fusion. Default true. */
  hybrid?: boolean
  /** Apply the second-stage reranker. Default true. */
  rerank?: boolean
  /** First-stage pool size handed to the reranker. Default topK * 2. */
  rerankTopN?: number
  /** Reranker implementation to use. Default the offline LexicalReranker. */
  reranker?: Reranker
  /**
   * Cross-language term glossary (see queryExpansion.ts) applied ONLY to the
   * lexical/BM25 branch of hybrid retrieval — a ru query against a ro corpus
   * otherwise contributes near-zero lexical signal, dragging the RRF fusion
   * down even when the vector branch found the right chunk.
   */
  queryExpansionGlossary?: Map<string, Set<string>>
}

// Tuned via `npm run eval:sweep` (see eval/sweep.ts). Hybrid + reranker keep
// recall high while improving ordering; the threshold guards against weak matches.
// Exported so eval/runEval.ts measures the same defaults the app actually runs with,
// instead of a second hardcoded copy that can silently drift.
export const DEFAULT_TOP_K = 5
// Recalibrated 2026-08 for bge-m3 (was 0.15, tuned for nomic-embed-text). bge-m3's
// cosine scores run systematically higher: on the 5 off-topic golden refusal items,
// top similarity topped out at 0.395, while every genuine on-topic item started at
// 0.441 — 0.15 let every off-topic query through with `insufficient=false`, silently
// disabling the refusal safety net (measured via `npm run eval`, byLang/refusalAcc
// breakdown). 0.42 sits in that gap with symmetric margin. Re-check with
// `npm run eval:sweep` if the embedding model changes again.
export const DEFAULT_MIN_SIMILARITY = 0.42

interface RankResult {
  results: ScoredChunk[]
  insufficient: boolean
}

/** Pure vector ranking against a query vector (no embedding, no I/O). */
export function rankBySimilarity(
  queryVec: number[],
  candidates: Chunk[],
  topK = DEFAULT_TOP_K,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
): RankResult {
  const results = candidates
    .map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryVec, chunk.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
  const top = results[0]
  return { results, insufficient: !top || top.similarity < minSimilarity }
}

/**
 * Hybrid ranking: fuse cosine and BM25-lite lexical rankings via Reciprocal
 * Rank Fusion. `insufficient` still depends on the best cosine similarity, so a
 * lexical match alone never masks a semantically weak result — but that check
 * is scoped to the returned candidates, not the whole subject pool (see below).
 */
export function rankHybrid(
  queryVec: number[],
  queryText: string,
  candidates: Chunk[],
  topK = DEFAULT_TOP_K,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
): RankResult {
  if (candidates.length === 0) return { results: [], insufficient: true }

  const lex = lexicalScores(queryText, candidates.map((c) => c.text))
  const scoredAll = candidates.map((chunk, i) => ({
    chunk,
    similarity: cosineSimilarity(queryVec, chunk.embedding),
    lexicalScore: lex[i] ?? 0,
  }))

  const vecRanking = [...scoredAll]
    .sort((a, b) => b.similarity - a.similarity)
    .map((s) => s.chunk.id)
  const lexRanking = [...scoredAll]
    .sort((a, b) => b.lexicalScore - a.lexicalScore)
    .map((s) => s.chunk.id)
  const fused = fuseRRF([vecRanking, lexRanking])

  const results = scoredAll
    .map((s) => ({ ...s, fusedScore: fused.get(s.chunk.id) ?? 0 }))
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, topK)

  // Measured bug (2026-08): this used to take maxCos over the ENTIRE subject
  // pool (scoredAll), not just `results`. On a 300-600 chunk subject that means
  // "does anything anywhere in the corpus vaguely resemble this query" — with
  // enough candidates, an off-topic query almost always clears any fixed
  // threshold by chance (measured refusalAccuracy 0.4/1.0 on golden off-topic
  // items with a threshold otherwise cleanly separating on/off-topic top-K
  // results). Scoping to the retrieved pool keeps the original intent (a
  // lexical-only match can't fake sufficiency) without that corpus-size leak.
  const maxCos = results.reduce((m, s) => Math.max(m, s.similarity), -Infinity)
  return { results, insufficient: maxCos < minSimilarity }
}

/**
 * Default ranking pipeline: hybrid first stage (wider pool) → reranker → top-K.
 * Controlled by RetrieveOptions; both default to on.
 */
async function rankCandidates(
  queryVec: number[],
  queryText: string,
  candidates: Chunk[],
  options: RetrieveOptions,
): Promise<RankResult> {
  const topK = options.topK ?? DEFAULT_TOP_K
  const minSim = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY
  const hybrid = options.hybrid ?? true
  const useRerank = options.rerank ?? true
  const rerankTopN = options.rerankTopN ?? topK * 2
  const firstStageK = useRerank ? Math.max(topK, rerankTopN) : topK
  const reranker = options.reranker ?? defaultReranker
  // Expansion only feeds the lexical branch's own BM25 pass below; the
  // reranker (phrase containment / rewritten prompt context) always gets the
  // student's original wording, never the expanded one.
  const lexicalQueryText = options.queryExpansionGlossary
    ? expandQueryForLexical(queryText, options.queryExpansionGlossary)
    : queryText

  const ranked = hybrid
    ? rankHybrid(queryVec, lexicalQueryText, candidates, firstStageK, minSim)
    : rankBySimilarity(queryVec, candidates, firstStageK, minSim)

  let results = ranked.results
  if (useRerank) {
    results = await reranker.rerank(queryText, results, results.length)
  }
  const finalResults = results.slice(0, topK)

  // Recompute insufficient over the *final* top-K, not the wider firstStageK
  // pool `ranked` was scored against: the reranker can reorder rank-1 to a
  // different chunk, and the wider pool's own max-cosine guard (see rankHybrid)
  // is only meant to catch that pool, not to double as a verdict on what
  // actually ships to the student.
  const maxCos = finalResults.reduce((m, r) => Math.max(m, r.similarity), -Infinity)
  const insufficient = finalResults.length === 0 || maxCos < minSim
  return { results: finalResults, insufficient }
}

/**
 * retrieveRelevantChunks(query, subjectId, topicId?, topK) — embeds the query,
 * filters candidates by subject (then optional topic), ranks by cosine
 * similarity and returns the top-K. The same EmbeddingProvider that produced
 * the chunk vectors MUST be passed so the spaces match. Throws if embedding
 * fails; use retrieveOrDegrade for the graceful-degradation path.
 */
export async function retrieveRelevantChunks(
  query: string,
  embedder: EmbeddingProvider,
  source: ChunkSource,
  options: RetrieveOptions,
): Promise<RetrievalResult> {
  const candidates = await source.getChunks(options.subjectId, options.topicId, options.gradeLevel)
  const queryVec = await embedder.embed(query)
  const { results, insufficient } = await rankCandidates(queryVec, query, candidates, options)
  return {
    query,
    subjectId: options.subjectId,
    topicId: options.topicId,
    results,
    insufficient,
    embeddingModelId: embedder.modelId,
    corpusEmpty: candidates.length === 0,
  }
}

/**
 * Like retrieveRelevantChunks, but if the query cannot be embedded (the
 * embedding service is unavailable) it returns an `unavailable` result instead
 * of throwing. We never substitute a different embedding space, since that
 * would silently produce misleading matches.
 */
export async function retrieveOrDegrade(
  query: string,
  embedder: EmbeddingProvider,
  source: ChunkSource,
  options: RetrieveOptions,
): Promise<RetrievalResult> {
  const candidates = await source.getChunks(options.subjectId, options.topicId, options.gradeLevel)
  let queryVec: number[]
  try {
    queryVec = await embedder.embed(query)
  } catch {
    return {
      query,
      subjectId: options.subjectId,
      topicId: options.topicId,
      results: [],
      insufficient: true,
      embeddingModelId: embedder.modelId,
      unavailable: true,
      corpusEmpty: candidates.length === 0,
    }
  }
  const { results, insufficient } = await rankCandidates(queryVec, query, candidates, options)
  return {
    query,
    subjectId: options.subjectId,
    topicId: options.topicId,
    results,
    insufficient,
    embeddingModelId: embedder.modelId,
    corpusEmpty: candidates.length === 0,
  }
}
