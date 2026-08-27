import type { TopicMastery } from '@/types'

/**
 * Simplified SM-2-style scheduling. The stronger the mastery, the longer until
 * the next review. Spacing intervals (days) form a Leitner-like ladder.
 */
const INTERVAL_DAYS = [1, 2, 4, 8, 16, 32] as const

export function intervalForMastery(masteryScore: number): number {
  const idx = clampIndex(Math.round(clamp01(masteryScore) * (INTERVAL_DAYS.length - 1)))
  return INTERVAL_DAYS[idx] as number
}

/** Returns the ISO timestamp for the next review given current mastery. */
export function computeNextReview(masteryScore: number, from: Date = new Date()): string {
  const days = intervalForMastery(masteryScore)
  const next = new Date(from.getTime())
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

export function isDueForReview(mastery: TopicMastery, now: Date = new Date()): boolean {
  if (!mastery.nextReviewAt) return true
  return new Date(mastery.nextReviewAt).getTime() <= now.getTime()
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function clampIndex(i: number): number {
  return Math.max(0, Math.min(INTERVAL_DAYS.length - 1, i))
}
