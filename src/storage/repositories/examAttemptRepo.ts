import type { ExamAttempt, SubjectId } from '@/types'
import { db } from '../db'

export const examAttemptRepo = {
  async add(attempt: ExamAttempt): Promise<void> {
    await db.examAttempts.put(attempt)
  },

  async all(): Promise<ExamAttempt[]> {
    return db.examAttempts.toArray()
  },

  async listBySubject(subjectId: SubjectId): Promise<ExamAttempt[]> {
    return db.examAttempts.where('subjectId').equals(subjectId).toArray()
  },

  async listByPaper(paperId: string): Promise<ExamAttempt[]> {
    return db.examAttempts.where('paperId').equals(paperId).toArray()
  },
}
