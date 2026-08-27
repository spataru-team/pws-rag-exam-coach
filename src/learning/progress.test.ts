import { describe, it, expect } from 'vitest'
import {
  progressComparison,
  studyStreakDays,
  summarizeActivity,
  averageMastery,
  readinessEstimate,
} from './progress'
import type { LearningEvent, Topic, TopicMastery } from '@/types'

const NOW = new Date('2026-06-03T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function ev(offsetMs: number, score: number): LearningEvent {
  return {
    id: 'e' + offsetMs + '_' + score,
    timestamp: new Date(NOW.getTime() - offsetMs).toISOString(),
    subjectId: 'romanian',
    topicId: 'grammar',
    activityType: 'practice',
    exerciseType: 'written',
    result: 'correct',
    score,
    timeSpentSec: 60,
    retrievedChunkIds: [],
  }
}

describe('progressComparison', () => {
  it('compares today vs yesterday', () => {
    const events = [
      ev(1 * 60 * 60 * 1000, 0.9), // today
      ev(1 * DAY - 1000, 0.4), // yesterday (within previous 24h window)
    ]
    const cmp = progressComparison(events, NOW)
    expect(cmp.vsYesterday.current.count).toBe(1)
    expect(cmp.vsYesterday.current.avgScore).toBeCloseTo(0.9, 6)
    expect(cmp.vsYesterday.previous.avgScore).toBeCloseTo(0.4, 6)
    expect(cmp.vsYesterday.deltaScore).toBeCloseTo(0.5, 6)
  })
})

describe('studyStreakDays', () => {
  it('counts consecutive days ending today', () => {
    const events = [ev(0, 1), ev(1 * DAY, 1), ev(2 * DAY, 1)]
    expect(studyStreakDays(events, NOW)).toBe(3)
  })

  it('breaks the streak on a gap', () => {
    const events = [ev(0, 1), ev(3 * DAY, 1)]
    expect(studyStreakDays(events, NOW)).toBe(1)
  })

  it('returns 0 with no events', () => {
    expect(studyStreakDays([], NOW)).toBe(0)
  })

  it('does not punish for not practising yet today (counts from yesterday)', () => {
    const events = [ev(1 * DAY, 1), ev(2 * DAY, 1)]
    expect(studyStreakDays(events, NOW)).toBe(2)
  })
})

describe('summarizeActivity', () => {
  it('aggregates counts and time', () => {
    const s = summarizeActivity([ev(0, 1), ev(1000, 0.5)], NOW)
    expect(s.totalEvents).toBe(2)
    expect(s.totalTimeSpentSec).toBe(120)
    expect(s.byActivityType.practice).toBe(2)
  })
})

describe('mastery aggregates', () => {
  const masteries: TopicMastery[] = [
    { subjectId: 'romanian', topicId: 'a', masteryScore: 0.8, accuracy: 0.8, confidence: 0.8, attempts: 3 },
    { subjectId: 'romanian', topicId: 'b', masteryScore: 0.4, accuracy: 0.4, confidence: 0.4, attempts: 2 },
    { subjectId: 'romanian', topicId: 'c', masteryScore: 0, accuracy: 0, confidence: 0, attempts: 0 },
  ]

  it('averages only practised topics', () => {
    expect(averageMastery(masteries)).toBeCloseTo(0.6, 6)
  })

  it('weights readiness by exam relevance', () => {
    const topics: Topic[] = [
      { id: 'a', subjectId: 'romanian', title: { en: 'A' }, skillArea: 'g', prerequisites: [], difficulty: 'basic', gradeLevel: 9, examRelevance: 'core' },
      { id: 'b', subjectId: 'romanian', title: { en: 'B' }, skillArea: 'g', prerequisites: [], difficulty: 'basic', gradeLevel: 9, examRelevance: 'low' },
    ]
    // Only 'a' (core) counts; 'b' is low relevance and excluded.
    expect(readinessEstimate(masteries, topics)).toBeCloseTo(0.8, 6)
  })
})
