import type { SubjectId } from '@/types'
import type { ChunkDraft } from '../types'
import { chemistryDemoChunks } from './chemistry.demo.chunks'
import { mathDemoChunks } from './math.demo.chunks'
import { russianDemoChunks } from './russian.demo.chunks'

export { DEMO_SOURCE, DEMO_TEXT_PREFIX } from './types'

/**
 * Self-authored synthetic chunk drafts for the three subjects the public repo
 * ships empty (their real corpora are copyrighted — see
 * `docs/JUDGE_REPRODUCIBILITY.md`). Consumed ONLY by `scripts/seed-demo.ts`
 * (`npm run seed:demo`), which tags the resulting packs `synthetic: true`.
 * `npm run seed` never reads this.
 */
export const demoChunkDraftsBySubject: Partial<Record<SubjectId, ChunkDraft[]>> = {
  chemistry: chemistryDemoChunks,
  math: mathDemoChunks,
  russian: russianDemoChunks,
}

/** Subjects that have a synthetic demo corpus available. */
export const DEMO_SUBJECT_IDS = Object.keys(demoChunkDraftsBySubject) as SubjectId[]
