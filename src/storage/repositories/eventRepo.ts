import type { LearningEvent, SubjectId } from '@/types'
import { db } from '../db'

export const eventRepo = {
  async add(event: LearningEvent): Promise<void> {
    await db.learningEvents.put(event)
  },

  async listBySubject(subjectId: SubjectId): Promise<LearningEvent[]> {
    return db.learningEvents.where('subjectId').equals(subjectId).toArray()
  },

  async listByTopic(
    subjectId: SubjectId,
    topicId: string,
  ): Promise<LearningEvent[]> {
    return db.learningEvents
      .where('[subjectId+topicId]')
      .equals([subjectId, topicId])
      .toArray()
  },

  /** Events with timestamp >= `fromIso`, optionally filtered by subject. */
  async listSince(fromIso: string, subjectId?: SubjectId): Promise<LearningEvent[]> {
    const all = subjectId
      ? await db.learningEvents.where('subjectId').equals(subjectId).toArray()
      : await db.learningEvents.toArray()
    return all.filter((e) => e.timestamp >= fromIso)
  },

  async all(): Promise<LearningEvent[]> {
    return db.learningEvents.toArray()
  },
}
