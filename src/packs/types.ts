import type { Chunk, SubjectId } from '@/types'

/**
 * v2 (2026-08): added `embeddingDim` — the embedding space is no longer a fixed
 * global constant (see DEFAULT_EMBEDDING_DIM), so each pack must declare its own.
 * v1 packs (768-dim nomic-embed-text / text-embedding-3-small) are rejected by
 * SubjectDataManager and must be reseeded.
 */
export const PACK_SCHEMA_VERSION = 2 as const

/**
 * A downloadable subject pack: the heavy chunk + embedding payload. Structural
 * metadata (topic tree, rubrics) lives in the subject registry, not here.
 */
export interface SubjectPack {
  schemaVersion: number
  subjectId: SubjectId
  /** Model that produced the chunk vectors; queries must use the same model. */
  embeddingModel: string
  /** Vector length of every chunk's `embedding`; queries must match. */
  embeddingDim: number
  generatedAt: string
  chunks: Chunk[]
}
