import type { Chunk, SubjectId, Topic } from '@/types'
import { db } from '../db'

/** Stores chunks and topics imported from downloaded subject packs. */
export const contentRepo = {
  async putChunks(chunks: Chunk[]): Promise<void> {
    await db.chunks.bulkPut(chunks)
  },

  /**
   * `gradeLevel` only applies when `topicId` is absent (the subject-wide
   * fallback retrieval path in tutorService) — a given `topicId` already
   * pins one grade via the topic tree, so filtering by both would be
   * redundant. Without it, a mixed-grade subject pack (e.g. chemistry, which
   * spans grades 9 and 12 in one pack) would let a grade-9 query surface
   * grade-12 organic-chemistry chunks the student hasn't covered yet.
   */
  async getChunksBySubject(
    subjectId: SubjectId,
    topicId?: string,
    gradeLevel?: number,
  ): Promise<Chunk[]> {
    if (topicId) {
      return db.chunks
        .where('[subjectId+topicId]')
        .equals([subjectId, topicId])
        .toArray()
    }
    if (gradeLevel !== undefined) {
      return db.chunks
        .where('[subjectId+gradeLevel]')
        .equals([subjectId, gradeLevel])
        .toArray()
    }
    return db.chunks.where('subjectId').equals(subjectId).toArray()
  },

  async deleteChunksBySubject(subjectId: SubjectId): Promise<void> {
    await db.chunks.where('subjectId').equals(subjectId).delete()
  },

  async putTopics(topics: Topic[]): Promise<void> {
    await db.topics.bulkPut(topics)
  },

  async getTopicsBySubject(subjectId: SubjectId): Promise<Topic[]> {
    return db.topics.where('subjectId').equals(subjectId).toArray()
  },

  async deleteTopicsBySubject(subjectId: SubjectId): Promise<void> {
    await db.topics.where('subjectId').equals(subjectId).delete()
  },
}
