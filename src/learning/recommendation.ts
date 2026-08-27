import type { StudyMode, Topic, TopicMastery } from '@/types'
import { isWeak } from './mastery'
import { isDueForReview } from './spacedRepetition'

export interface TopicRecommendation {
  topicId: string
  /** Higher = practise sooner. */
  priority: number
  reason: string
}

const RELEVANCE_WEIGHT: Record<Topic['examRelevance'], number> = {
  low: 0.5,
  medium: 1,
  high: 1.5,
  core: 2,
}

/**
 * Ranks topics to practise next. Weak topics and overdue reviews score highest;
 * exam relevance amplifies priority. Sprint mode sharpens the focus on
 * high-value weak topics, especially as the exam date approaches.
 */
export function recommendTopics(
  topics: Topic[],
  masteries: TopicMastery[],
  opts: {
    studyMode: StudyMode
    examDate?: string
    now?: Date
  },
): TopicRecommendation[] {
  const now = opts.now ?? new Date()
  const masteryByTopic = new Map(masteries.map((m) => [m.topicId, m]))
  const sprintFactor = computeSprintFactor(opts.studyMode, opts.examDate, now)

  const recs = topics.map((t) => {
    const m = masteryByTopic.get(t.id)
    const relevance = RELEVANCE_WEIGHT[t.examRelevance]
    let priority: number
    let reason: string

    if (!m || m.attempts === 0) {
      priority = 1.0 * relevance
      reason = 'never_practiced'
    } else if (isDueForReview(m, now)) {
      priority = (1.3 - m.masteryScore) * relevance
      reason = 'due_review'
    } else if (isWeak(m, now)) {
      priority = (1.5 - m.masteryScore) * relevance
      reason = m.weakReason ?? 'weak'
    } else {
      priority = (1 - m.masteryScore) * 0.5 * relevance
      reason = 'reinforce'
    }

    // Sprint mode multiplies priority of high-relevance weak topics.
    if (opts.studyMode === 'sprint') {
      priority *= 1 + sprintFactor * (relevance - 1)
    }
    return { topicId: t.id, priority, reason }
  })

  return recs.sort((a, b) => b.priority - a.priority)
}

/**
 * Interleaves due/weak ("old") topics with new topics for retrieval practice,
 * so a session mixes review and fresh material rather than batching them.
 */
export function mixOldAndNew(
  recommendations: TopicRecommendation[],
  sessionSize = 5,
): TopicRecommendation[] {
  const old = recommendations.filter(
    (r) => r.reason === 'due_review' || r.reason.includes('weak') || r.reason === 'low_accuracy' || r.reason === 'low_confidence' || r.reason === 'overdue_review' || r.reason === 'few_attempts',
  )
  const fresh = recommendations.filter((r) => r.reason === 'never_practiced')
  const rest = recommendations.filter((r) => !old.includes(r) && !fresh.includes(r))

  const mixed: TopicRecommendation[] = []
  let oi = 0
  let fi = 0
  while (mixed.length < sessionSize && (oi < old.length || fi < fresh.length)) {
    if (oi < old.length) mixed.push(old[oi++] as TopicRecommendation)
    if (mixed.length < sessionSize && fi < fresh.length)
      mixed.push(fresh[fi++] as TopicRecommendation)
  }
  for (const r of rest) {
    if (mixed.length >= sessionSize) break
    mixed.push(r)
  }
  return mixed.slice(0, sessionSize)
}

/** 0 (far / year-long) .. 1 (exam imminent). Drives sprint prioritisation. */
export function computeSprintFactor(
  studyMode: StudyMode,
  examDate: string | undefined,
  now: Date,
): number {
  if (studyMode !== 'sprint' || !examDate) return 0
  const daysLeft =
    (new Date(examDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  if (daysLeft <= 0) return 1
  if (daysLeft >= 30) return 0.2
  return 1 - daysLeft / 30
}

/** Hours-left guidance for the final stretch (review over overload). */
export function sprintEndgameAdvice(
  examDate: string | undefined,
  now: Date = new Date(),
): 'normal' | 'consolidate' | 'rest_and_review' {
  if (!examDate) return 'normal'
  const hoursLeft = (new Date(examDate).getTime() - now.getTime()) / (60 * 60 * 1000)
  if (hoursLeft <= 12) return 'rest_and_review'
  if (hoursLeft <= 72) return 'consolidate'
  return 'normal'
}
