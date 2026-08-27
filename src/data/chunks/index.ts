import type { SubjectId } from '@/types'
import type { ChunkDraft } from './types'
import { romanianChunks } from './romanian.chunks'
import { englishChunks } from './english.chunks'
import { biologyChunks } from './biology.chunks'
import { historyChunks } from './history.chunks'

export type { ChunkDraft } from './types'

/** Authored chunk drafts per subject, consumed by the seed script. */
export const chunkDraftsBySubject: Record<SubjectId, ChunkDraft[]> = {
  romanian: romanianChunks,
  english: englishChunks,
  biology: biologyChunks,
  history: historyChunks,
}
