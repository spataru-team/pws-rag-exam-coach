import type { Chunk, SubjectId } from '@/types'
import {
  retrieveOrDegrade,
  selectEmbedder,
  buildQueryExpansionGlossary,
  DEFAULT_EMBEDDING_CONFIG,
  type ChunkSource,
  type EmbeddingProvider,
  type EmbeddingRuntimeConfig,
  type RetrievalResult,
} from '@/rag'
import { contentRepo, settingsRepo, SETTING_KEYS } from '@/storage'
import { subjectDataManager, type PackStatus } from '@/packs'
import { getTopics } from '@/data/subjectRegistry'

// selectReranker()/CrossEncoderReranker (src/rag/rerankRuntime.ts) are built and
// tested, but deliberately NOT wired in here yet: measured against a live OVMS
// export of BAAI/bge-reranker-v2-m3 (int8 AND fp16 — not a quantization
// artifact), it scores Cyrillic query/document pairs as a near-tie or even
// inverted (e.g. an irrelevant "weather" passage outscoring the correct
// "photosynthesis" one, 0.99 vs 0.97), while Romanian and English pairs rerank
// correctly (0.9997 vs 0.00002). Romanian/English share a tokenizer family with
// bge-m3's own embeddings export, which DOES handle Cyrillic correctly
// (verified cosine 0.9995+ vs Ollama, see scripts/verify-embedding-space.ts) —
// so this is isolated to OVMS's rerank_ov tokenizer conversion, not bge-m3
// itself or this app's code. Shipping the cross-encoder as the silent default
// would regress the exact ru-language case this whole migration was fixing.
// Re-enable once a working multilingual rerank export is confirmed (retest
// with the battery in docs/ARCHITECTURE.md before flipping this back on).

/** IndexedDB-backed source of candidate chunks for a subject. */
class IndexedDbChunkSource implements ChunkSource {
  async getChunks(subjectId: SubjectId, topicId?: string, gradeLevel?: number): Promise<Chunk[]> {
    return contentRepo.getChunksBySubject(subjectId, topicId, gradeLevel)
  }
}

const chunkSource = new IndexedDbChunkSource()

// Built once per subject from that subject's own topic tree (ru/ro/en titles
// already in src/data/subjects/*.ts) and cached — tokenizing a few dozen
// topic titles is cheap, but there is no reason to redo it on every keystroke.
const expansionGlossaryCache = new Map<SubjectId, Map<string, Set<string>>>()
function expansionGlossaryFor(subjectId: SubjectId): Map<string, Set<string>> {
  let glossary = expansionGlossaryCache.get(subjectId)
  if (!glossary) {
    glossary = buildQueryExpansionGlossary(getTopics(subjectId))
    expansionGlossaryCache.set(subjectId, glossary)
  }
  return glossary
}

/**
 * Returns an embedder matching the model a subject's pack was built with, so
 * query vectors live in the same space as the stored chunk vectors. The model
 * NAME comes from the pack; the backend (Ollama vs OpenVINO/OpenAI-compatible)
 * comes from the user's runtime setting. Deterministic-stub packs always use the
 * offline stub.
 */
export async function embedderForSubject(
  subjectId: SubjectId,
  status?: PackStatus,
): Promise<EmbeddingProvider> {
  const s = status ?? (await subjectDataManager.getStatus(subjectId))
  const config =
    (await settingsRepo.get<EmbeddingRuntimeConfig>(SETTING_KEYS.embeddingConfig)) ??
    DEFAULT_EMBEDDING_CONFIG
  return selectEmbedder(s.embeddingModel, config, s.embeddingDim)
}

/**
 * Subject-scoped retrieval used by the tutor and diagnostic flows. `gradeLevel`
 * only matters when `topicId` is omitted (subject-wide fallback) — see
 * ChunkSource.getChunks — and keeps a mixed-grade pack (e.g. chemistry: 9+12
 * in one pack) from surfacing another grade's material in that fallback.
 */
export async function retrieve(
  query: string,
  subjectId: SubjectId,
  topicId?: string,
  topK = 5,
  gradeLevel?: number,
): Promise<RetrievalResult> {
  const status = await subjectDataManager.getStatus(subjectId)
  const embedder = await embedderForSubject(subjectId, status)
  // Degrade gracefully: if the pack's embedding model (e.g. Ollama) is down,
  // this returns an `unavailable` result rather than throwing.
  const result = await retrieveOrDegrade(query, embedder, chunkSource, {
    subjectId,
    topicId,
    topK,
    gradeLevel,
    // reranker intentionally omitted — defaults to the offline LexicalReranker.
    // See the CrossEncoderReranker comment above for why.
    queryExpansionGlossary: expansionGlossaryFor(subjectId),
  })
  // Stamp authoritative pack-level facts onto the result. The pure retrieval
  // layer only sees post-filter candidates, so it can't tell "the subject's
  // pack is empty" (regenerate it) from "nothing matched this topic/grade"
  // (ordinary insufficient evidence). `getStatus().empty` is `chunkCount === 0`
  // recorded from `pack.chunks.length` at download — see docs/JUDGE_REPRODUCIBILITY.md.
  return {
    ...result,
    corpusEmpty: status.empty === true,
    synthetic: status.synthetic === true,
  }
}
