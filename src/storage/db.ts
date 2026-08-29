import Dexie, { type EntityTable } from 'dexie'
import type {
  Chunk,
  ExamAttempt,
  LearningEvent,
  ModelRunMetrics,
  RescueSession,
  StudentProfile,
  Topic,
  TopicMastery,
} from '@/types'

/** A downloaded subject pack record (metadata only; chunks live in `chunks`). */
export interface DownloadedPack {
  subjectId: string
  schemaVersion: number
  embeddingModel: string
  /** Vector length of this pack's chunks. Absent on pre-migration (schemaVersion 1) records. */
  embeddingDim?: number
  chunkCount: number
  /** True when this pack came from `npm run seed:demo` (synthetic content), not a real corpus. */
  synthetic?: boolean
  downloadedAt: string
}

/** Generic key-value settings store (theme, language, provider config, keys). */
export interface SettingRecord {
  key: string
  value: unknown
}

/**
 * Local-first database. All learner data stays here; nothing is sent anywhere
 * unless the user explicitly exports JSON or opts into a cloud LLM provider.
 */
export class PwsDatabase extends Dexie {
  profiles!: EntityTable<StudentProfile, 'localId'>
  chunks!: EntityTable<Chunk, 'id'>
  topics!: EntityTable<Topic, 'id'>
  learningEvents!: EntityTable<LearningEvent, 'id'>
  topicMastery!: EntityTable<TopicMastery & { key: string }, 'key'>
  modelRunMetrics!: EntityTable<ModelRunMetrics, 'id'>
  downloadedPacks!: EntityTable<DownloadedPack, 'subjectId'>
  settings!: EntityTable<SettingRecord, 'key'>
  examAttempts!: EntityTable<ExamAttempt, 'id'>
  rescueSessions!: EntityTable<RescueSession, 'id'>

  constructor() {
    super('pws-rag-exam-coach')
    this.version(1).stores({
      profiles: 'localId',
      chunks: 'id, subjectId, topicId, [subjectId+topicId]',
      topics: 'id, subjectId, parentTopicId',
      learningEvents: 'id, subjectId, topicId, timestamp, [subjectId+topicId]',
      topicMastery: 'key, subjectId, topicId, [subjectId+topicId]',
      modelRunMetrics: 'id, subjectId, provider, model, timestamp',
      downloadedPacks: 'subjectId',
      settings: 'key',
    })
    this.version(2).stores({
      examAttempts: 'id, subjectId, paperId, submittedAt',
    })
    this.version(3).stores({
      rescueSessions: 'id, subjectId, diagnosticPaperId, updatedAt',
    })
    // v4: embedding space migration (768-dim nomic-embed-text/text-embedding-3-small
    // -> 1024-dim bge-m3, multilingual). Old chunk vectors are incomparable with the
    // new space, so the pack cache is cleared; packs re-download automatically on
    // next use (SubjectDataManager). Only the re-downloadable cache is touched — no
    // student progress data (profiles/examAttempts/rescueSessions/mastery/events).
    // Also adds a [subjectId+gradeLevel] index for exam-track filtering.
    this.version(4)
      .stores({
        chunks: 'id, subjectId, topicId, [subjectId+topicId], [subjectId+gradeLevel]',
        downloadedPacks: 'subjectId',
      })
      .upgrade(async (tx) => {
        await tx.table('chunks').clear()
        await tx.table('downloadedPacks').clear()
      })
  }
}

export const db = new PwsDatabase()

/** Composite key helper for topicMastery rows. */
export function masteryKey(subjectId: string, topicId: string): string {
  return `${subjectId}::${topicId}`
}
