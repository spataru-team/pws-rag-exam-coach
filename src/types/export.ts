import type { SubjectId } from './common'
import type { ExamAttempt } from './exam'
import type { ModelRunMetrics } from './metrics'
import type { TopicMastery } from './student'

export const EXPORT_SCHEMA_VERSION = 1 as const

export interface SubjectProgressSummary {
  subjectId: SubjectId
  /** 0..1 average mastery across practised topics. */
  averageMastery: number
  topicsPracticed: number
  topicsTotal: number
  /** 0..1 readiness estimate for the exam. */
  readiness: number
  xp: number
}

export interface WeakTopicSummary {
  subjectId: SubjectId
  topicId: string
  masteryScore: number
  weakReason?: string
}

export interface ActivitySummary {
  totalEvents: number
  totalTimeSpentSec: number
  byActivityType: Record<string, number>
  studyStreakDays: number
}

/** 10. ProgressExportJson — the teacher-facing export. No hidden personal data. */
export interface ProgressExportJson {
  schemaVersion: number
  exportedAt: string
  anonymousStudentId: string
  dateRange: { from: string; to: string }
  activeSubjects: SubjectId[]
  subjectProgress: SubjectProgressSummary[]
  topicMastery: TopicMastery[]
  weakTopics: WeakTopicSummary[]
  activitySummary: ActivitySummary
  modelRunMetrics: ModelRunMetrics[]
  examAttempts: ExamAttempt[]
  teacherNotes?: string
}
