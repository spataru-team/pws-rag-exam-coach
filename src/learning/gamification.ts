import type { LearningEvent, TopicMastery } from '@/types'

export interface Badge {
  id: string
  /** i18n key for the badge label. */
  labelKey: string
  earned: boolean
}

/** Mastery levels are encouraging, never punitive. */
export type MasteryLevel = 'beginner' | 'developing' | 'proficient' | 'mastered'

export function masteryLevel(masteryScore: number): MasteryLevel {
  if (masteryScore >= 0.85) return 'mastered'
  if (masteryScore >= 0.6) return 'proficient'
  if (masteryScore >= 0.3) return 'developing'
  return 'beginner'
}

/** XP → level. Linear, generous; designed to reward consistency, not grinding. */
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50)) + 1
}

/**
 * Computes earned badges. Rewards reinforce consistency, improvement,
 * correcting mistakes, and returning to weak topics — never streak-breaking
 * or absence. There are no negative badges and missed days are not penalised.
 */
export function computeBadges(
  events: LearningEvent[],
  masteries: TopicMastery[],
  streakDays: number,
): Badge[] {
  const correctedMistake = hasCorrectedMistake(events)
  const returnedToWeak = events.some(
    (e) => e.activityType === 'review' || e.activityType === 'practice',
  )
  const reflections = events.filter((e) => e.activityType === 'reflection').length
  const mastered = masteries.filter((m) => m.masteryScore >= 0.85).length

  return [
    badge('first_steps', events.length >= 1, 'badges.firstSteps'),
    badge('consistency_3', streakDays >= 3, 'badges.consistency3'),
    badge('consistency_7', streakDays >= 7, 'badges.consistency7'),
    badge('comeback', correctedMistake, 'badges.comeback'),
    badge('reflective', reflections >= 3, 'badges.reflective'),
    badge('weak_topic_return', returnedToWeak && correctedMistake, 'badges.weakReturn'),
    badge('topic_master', mastered >= 1, 'badges.topicMaster'),
  ]
}

function badge(id: string, earned: boolean, labelKey: string): Badge {
  return { id, labelKey, earned }
}

/** True if any topic was answered incorrectly and later answered correctly. */
function hasCorrectedMistake(events: LearningEvent[]): boolean {
  const byTopic = new Map<string, LearningEvent[]>()
  for (const e of events) {
    const list = byTopic.get(e.topicId) ?? []
    list.push(e)
    byTopic.set(e.topicId, list)
  }
  for (const list of byTopic.values()) {
    const ordered = [...list].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    )
    let sawMistake = false
    for (const e of ordered) {
      if (e.result === 'incorrect' || e.result === 'partial') sawMistake = true
      else if (e.result === 'correct' && sawMistake) return true
    }
  }
  return false
}
