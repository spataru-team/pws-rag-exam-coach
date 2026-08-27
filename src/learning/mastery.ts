import type { LearningEvent, SubjectId, TopicMastery, WeakReason } from '@/types'
import { computeNextReview, isDueForReview } from './spacedRepetition'

/** Weight given to the newest attempt in the rolling averages. */
const EMA_ALPHA = 0.4
/** Below this masteryScore a topic counts as weak. */
export const WEAK_THRESHOLD = 0.6

export function emptyMastery(
  subjectId: SubjectId,
  topicId: string,
): TopicMastery {
  return {
    subjectId,
    topicId,
    masteryScore: 0,
    accuracy: 0,
    confidence: 0,
    attempts: 0,
    weakReason: 'never_practiced',
  }
}

/**
 * Pure update: folds one LearningEvent into the prior mastery using
 * exponential moving averages, then recomputes masteryScore, the weak reason
 * and the next spaced-repetition review date.
 */
export function updateMastery(
  prev: TopicMastery,
  event: LearningEvent,
  now: Date = new Date(),
): TopicMastery {
  const isFirst = prev.attempts === 0
  const confidenceSample = event.confidenceSelfRating ?? 0.5

  const accuracy = isFirst
    ? clamp01(event.score)
    : ema(prev.accuracy, clamp01(event.score))
  const confidence = isFirst
    ? clamp01(confidenceSample)
    : ema(prev.confidence, clamp01(confidenceSample))
  const attempts = prev.attempts + 1

  const masteryScore = clamp01(0.7 * accuracy + 0.3 * confidence)

  const next: TopicMastery = {
    subjectId: prev.subjectId,
    topicId: prev.topicId,
    masteryScore,
    accuracy,
    confidence,
    attempts,
    lastPracticedAt: event.timestamp,
    nextReviewAt: computeNextReview(masteryScore, now),
  }
  const reason = deriveWeakReason(next, now)
  if (reason) next.weakReason = reason
  return next
}

export function isWeak(mastery: TopicMastery, now: Date = new Date()): boolean {
  return (
    mastery.attempts === 0 ||
    mastery.masteryScore < WEAK_THRESHOLD ||
    isDueForReview(mastery, now)
  )
}

function deriveWeakReason(
  m: TopicMastery,
  now: Date,
): WeakReason | undefined {
  if (m.attempts === 0) return 'never_practiced'
  if (m.accuracy < 0.5) return 'low_accuracy'
  if (m.confidence < 0.4) return 'low_confidence'
  if (m.attempts < 2 && m.masteryScore < WEAK_THRESHOLD) return 'few_attempts'
  if (isDueForReview(m, now) && m.masteryScore < WEAK_THRESHOLD)
    return 'overdue_review'
  return undefined
}

function ema(prev: number, sample: number): number {
  return clamp01(prev * (1 - EMA_ALPHA) + sample * EMA_ALPHA)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
