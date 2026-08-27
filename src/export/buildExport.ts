import {
  EXPORT_SCHEMA_VERSION,
  type ExamAttempt,
  type LearningEvent,
  type ModelRunMetrics,
  type ProgressExportJson,
  type StudentProfile,
  type SubjectId,
  type SubjectProgressSummary,
  type Topic,
  type TopicMastery,
  type WeakTopicSummary,
} from '@/types'
import {
  averageMastery,
  readinessEstimate,
  subjectXp,
  summarizeActivity,
} from '@/learning/progress'
import { isWeak } from '@/learning/mastery'

export interface ExportInput {
  profile: Pick<StudentProfile, 'localId' | 'activeSubjects'>
  events: LearningEvent[]
  masteries: TopicMastery[]
  metrics: ModelRunMetrics[]
  /** Topic trees per active subject, for readiness and totals. */
  topicsBySubject: Record<SubjectId, Topic[]>
  dateRange: { from: string; to: string }
  now?: Date
  teacherNotes?: string
  examAttempts?: ExamAttempt[]
}

/**
 * Pure builder for the teacher-facing export. Contains no personal data beyond
 * the anonymous local id; nothing here reads storage so it is fully testable.
 */
export function buildProgressExport(input: ExportInput): ProgressExportJson {
  const now = input.now ?? new Date()

  const subjectProgress: SubjectProgressSummary[] = input.profile.activeSubjects.map(
    (subjectId) => {
      const subjectMasteries = input.masteries.filter((m) => m.subjectId === subjectId)
      const topics = input.topicsBySubject[subjectId] ?? []
      return {
        subjectId,
        averageMastery: averageMastery(subjectMasteries),
        topicsPracticed: subjectMasteries.filter((m) => m.attempts > 0).length,
        topicsTotal: topics.length,
        readiness: readinessEstimate(subjectMasteries, topics),
        xp: subjectXp(input.events, subjectId),
      }
    },
  )

  const weakTopics: WeakTopicSummary[] = input.masteries
    .filter((m) => isWeak(m, now))
    .map((m) => ({
      subjectId: m.subjectId,
      topicId: m.topicId,
      masteryScore: m.masteryScore,
      weakReason: m.weakReason,
    }))

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    anonymousStudentId: input.profile.localId,
    dateRange: input.dateRange,
    activeSubjects: input.profile.activeSubjects,
    subjectProgress,
    topicMastery: input.masteries,
    weakTopics,
    activitySummary: summarizeActivity(input.events, now),
    modelRunMetrics: input.metrics,
    examAttempts: input.examAttempts ?? [],
    ...(input.teacherNotes ? { teacherNotes: input.teacherNotes } : {}),
  }
}
