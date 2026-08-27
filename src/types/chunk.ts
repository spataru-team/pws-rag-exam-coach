import type { LearningLanguage, SubjectId } from './common'
import type { VisualAsset } from './asset'

/**
 * Metadata mirroring the existing `rag_chunks` columns so a real export from
 * the Postgres/pgvector corpus can populate packs later without type changes.
 */
export interface ChunkSourceMetadata {
  bookId?: string
  chunkId?: string
  pageFrom?: number
  pageTo?: number
  contentHash?: string
  grade?: number
  /** Drawings/diagrams/formulas cropped from the pages this chunk covers. */
  figures?: VisualAsset[]
  [key: string]: unknown
}

/** 3. Chunk — a retrievable unit with an embedding vector. */
export interface Chunk {
  id: string
  subjectId: SubjectId
  topicId: string
  language: LearningLanguage
  text: string
  source: string
  gradeLevel: number
  /** Length must equal the owning SubjectPack's `embeddingDim`. Validated at load via assertEmbeddingDim. */
  embedding: number[]
  metadata?: ChunkSourceMetadata
}
