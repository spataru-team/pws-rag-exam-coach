import type { LearningEvent, SubjectId, TopicMastery } from '@/types'
import { eventRepo, masteryRepo } from '@/storage'
import {
  emptyMastery,
  updateMastery,
  progressComparison,
  recommendTopics,
  mixOldAndNew,
  readinessEstimate,
  studyStreakDays,
  subjectXp,
  computeBadges,
  levelForXp,
  type Badge,
  type ProgressComparison,
  type TopicRecommendation,
} from '@/learning'
import { getTopics } from '@/data/subjectRegistry'

/** Persists a learning event and folds it into the topic's mastery. */
export async function recordLearningEvent(
  event: LearningEvent,
): Promise<TopicMastery> {
  await eventRepo.add(event)
  const prev =
    (await masteryRepo.get(event.subjectId, event.topicId)) ??
    emptyMastery(event.subjectId, event.topicId)
  const next = updateMastery(prev, event)
  await masteryRepo.save(next)
  return next
}

export interface DashboardData {
  subjectId: SubjectId
  comparison: ProgressComparison
  streakDays: number
  readiness: number
  xp: number
  level: number
  badges: Badge[]
  weakTopics: TopicMastery[]
  recommendations: TopicRecommendation[]
  sessionPlan: TopicRecommendation[]
}

/** Aggregates everything the Subject Dashboard needs in one read. */
export async function loadDashboard(
  subjectId: SubjectId,
  opts: { studyMode: 'year_long' | 'sprint'; examDate?: string; now?: Date },
): Promise<DashboardData> {
  const now = opts.now ?? new Date()
  const events = await eventRepo.listBySubject(subjectId)
  const masteries = await masteryRepo.listBySubject(subjectId)
  const topics = getTopics(subjectId)

  const recommendations = recommendTopics(topics, masteries, {
    studyMode: opts.studyMode,
    examDate: opts.examDate,
    now,
  })

  const streakDays = studyStreakDays(events, now)
  const xp = subjectXp(events, subjectId)

  return {
    subjectId,
    comparison: progressComparison(events, now),
    streakDays,
    readiness: readinessEstimate(masteries, topics),
    xp,
    level: levelForXp(xp),
    badges: computeBadges(events, masteries, streakDays),
    weakTopics: masteries
      .filter((m) => m.masteryScore < 0.6 || m.attempts === 0)
      .sort((a, b) => a.masteryScore - b.masteryScore),
    recommendations,
    sessionPlan: mixOldAndNew(recommendations, 5),
  }
}
