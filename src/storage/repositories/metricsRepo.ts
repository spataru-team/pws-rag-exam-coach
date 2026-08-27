import type { ModelRunMetrics, SubjectId } from '@/types'
import { db } from '../db'

export const metricsRepo = {
  async add(metrics: ModelRunMetrics): Promise<void> {
    await db.modelRunMetrics.put(metrics)
  },

  async listBySubject(subjectId: SubjectId): Promise<ModelRunMetrics[]> {
    return db.modelRunMetrics.where('subjectId').equals(subjectId).toArray()
  },

  async all(): Promise<ModelRunMetrics[]> {
    return db.modelRunMetrics.toArray()
  },
}
