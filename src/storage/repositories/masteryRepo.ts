import type { SubjectId, TopicMastery } from '@/types'
import { db, masteryKey } from '../db'

export const masteryRepo = {
  async get(
    subjectId: SubjectId,
    topicId: string,
  ): Promise<TopicMastery | undefined> {
    const row = await db.topicMastery.get(masteryKey(subjectId, topicId))
    if (!row) return undefined
    const { key, ...mastery } = row
    return mastery
  },

  async save(mastery: TopicMastery): Promise<void> {
    await db.topicMastery.put({
      ...mastery,
      key: masteryKey(mastery.subjectId, mastery.topicId),
    })
  },

  async listBySubject(subjectId: SubjectId): Promise<TopicMastery[]> {
    const rows = await db.topicMastery
      .where('subjectId')
      .equals(subjectId)
      .toArray()
    return rows.map(({ key, ...m }) => m)
  },

  async all(): Promise<TopicMastery[]> {
    const rows = await db.topicMastery.toArray()
    return rows.map(({ key, ...m }) => m)
  },
}
