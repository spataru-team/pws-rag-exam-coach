import type { Chunk } from '@/types'

/** Authored chunk without an embedding; the seed script fills `embedding`. */
export type ChunkDraft = Omit<Chunk, 'embedding'>
