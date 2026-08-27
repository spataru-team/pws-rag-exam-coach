import type {
  ActivitySummary,
  LearningEvent,
  SubjectId,
  Topic,
  TopicMastery,
} from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface WindowStats {
  count: number
  avgScore: number
  timeSpentSec: number
}

export interface PeriodComparison {
  current: WindowStats
  previous: WindowStats
  /** current.avgScore - previous.avgScore, in [-1, 1]. */
  deltaScore: number
  /** current.count - previous.count. */
  deltaCount: number
}

export interface ProgressComparison {
  vsYesterday: PeriodComparison
  vsLastWeek: PeriodComparison
  vsLastMonth: PeriodComparison
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function windowStats(
  events: LearningEvent[],
  fromMs: number,
  toMs: number,
): WindowStats {
  const inWindow = events.filter((e) => {
    const t = new Date(e.timestamp).getTime()
    return t >= fromMs && t < toMs
  })
  const count = inWindow.length
  const timeSpentSec = inWindow.reduce((s, e) => s + e.timeSpentSec, 0)
  const avgScore =
    count === 0 ? 0 : inWindow.reduce((s, e) => s + e.score, 0) / count
  return { count, avgScore, timeSpentSec }
}

function compare(
  events: LearningEvent[],
  currentFrom: number,
  currentTo: number,
  spanMs: number,
): PeriodComparison {
  const current = windowStats(events, currentFrom, currentTo)
  const previous = windowStats(events, currentFrom - spanMs, currentFrom)
  return {
    current,
    previous,
    deltaScore: current.avgScore - previous.avgScore,
    deltaCount: current.count - previous.count,
  }
}

/** Progress for "today vs yesterday", "this week vs last", "this month vs last". */
export function progressComparison(
  events: LearningEvent[],
  now: Date = new Date(),
): ProgressComparison {
  const today0 = startOfDay(now).getTime()
  const nowMs = now.getTime()
  return {
    vsYesterday: compare(events, today0, nowMs, DAY_MS),
    vsLastWeek: compare(events, nowMs - 7 * DAY_MS, nowMs, 7 * DAY_MS),
    vsLastMonth: compare(events, nowMs - 30 * DAY_MS, nowMs, 30 * DAY_MS),
  }
}

/** Consecutive calendar days (ending today or yesterday) with >=1 event. */
export function studyStreakDays(
  events: LearningEvent[],
  now: Date = new Date(),
): number {
  if (events.length === 0) return 0
  const days = new Set<number>()
  for (const e of events) {
    days.add(startOfDay(new Date(e.timestamp)).getTime())
  }
  const today0 = startOfDay(now).getTime()
  // Allow the streak to still count if the user hasn't practiced *yet* today.
  let cursor = days.has(today0) ? today0 : today0 - DAY_MS
  if (!days.has(cursor)) return 0
  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor -= DAY_MS
  }
  return streak
}

export function summarizeActivity(
  events: LearningEvent[],
  now: Date = new Date(),
): ActivitySummary {
  const byActivityType: Record<string, number> = {}
  let totalTimeSpentSec = 0
  for (const e of events) {
    byActivityType[e.activityType] = (byActivityType[e.activityType] ?? 0) + 1
    totalTimeSpentSec += e.timeSpentSec
  }
  return {
    totalEvents: events.length,
    totalTimeSpentSec,
    byActivityType,
    studyStreakDays: studyStreakDays(events, now),
  }
}

export function averageMastery(masteries: TopicMastery[]): number {
  const practiced = masteries.filter((m) => m.attempts > 0)
  if (practiced.length === 0) return 0
  return practiced.reduce((s, m) => s + m.masteryScore, 0) / practiced.length
}

/**
 * Exam-readiness estimate in [0,1]: mastery weighted by topic exam relevance and
 * scaled by how much of the subject's exam-relevant content has been covered.
 */
export function readinessEstimate(
  masteries: TopicMastery[],
  topics: Topic[],
): number {
  const weightOf = (relevance: Topic['examRelevance']): number =>
    ({ low: 0.5, medium: 1, high: 1.5, core: 2 })[relevance]

  const examTopics = topics.filter((t) => t.examRelevance !== 'low')
  if (examTopics.length === 0) return averageMastery(masteries)

  const masteryByTopic = new Map(masteries.map((m) => [m.topicId, m]))
  let weighted = 0
  let totalWeight = 0
  for (const t of examTopics) {
    const w = weightOf(t.examRelevance)
    totalWeight += w
    weighted += w * (masteryByTopic.get(t.id)?.masteryScore ?? 0)
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight
}

export function subjectXp(events: LearningEvent[], subjectId: SubjectId): number {
  // XP is awarded per event; correctness and reflection add bonuses.
  return events
    .filter((e) => e.subjectId === subjectId)
    .reduce((xp, e) => {
      let gained = 5
      if (e.result === 'correct') gained += 10
      else if (e.result === 'partial') gained += 5
      if (e.activityType === 'reflection') gained += 3
      return xp + gained
    }, 0)
}
