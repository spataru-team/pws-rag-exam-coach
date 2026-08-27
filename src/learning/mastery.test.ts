import { describe, it, expect } from 'vitest'
import { emptyMastery, updateMastery, isWeak, WEAK_THRESHOLD } from './mastery'
import type { LearningEvent } from '@/types'

function event(score: number, confidence?: number): LearningEvent {
  return {
    id: 'e' + Math.random(),
    timestamp: '2026-06-03T10:00:00.000Z',
    subjectId: 'romanian',
    topicId: 'grammar',
    activityType: 'practice',
    exerciseType: 'written',
    result: score >= 0.8 ? 'correct' : score > 0 ? 'partial' : 'incorrect',
    score,
    timeSpentSec: 60,
    retrievedChunkIds: [],
    confidenceSelfRating: confidence,
  }
}

describe('updateMastery', () => {
  it('initialises from a fresh empty mastery on first attempt', () => {
    const m = updateMastery(emptyMastery('romanian', 'grammar'), event(1, 0.9))
    expect(m.attempts).toBe(1)
    expect(m.accuracy).toBeCloseTo(1, 6)
    expect(m.confidence).toBeCloseTo(0.9, 6)
    expect(m.masteryScore).toBeCloseTo(0.7 * 1 + 0.3 * 0.9, 6)
    expect(m.lastPracticedAt).toBe('2026-06-03T10:00:00.000Z')
    expect(m.nextReviewAt).toBeTruthy()
  })

  it('uses EMA so repeated good answers raise mastery', () => {
    let m = updateMastery(emptyMastery('romanian', 'grammar'), event(0.4, 0.4))
    const first = m.masteryScore
    m = updateMastery(m, event(1, 1))
    m = updateMastery(m, event(1, 1))
    expect(m.masteryScore).toBeGreaterThan(first)
    expect(m.attempts).toBe(3)
  })

  it('defaults confidence to 0.5 when not provided', () => {
    const m = updateMastery(emptyMastery('romanian', 'grammar'), event(1))
    expect(m.confidence).toBeCloseTo(0.5, 6)
  })

  it('flags low accuracy as weak reason', () => {
    const m = updateMastery(emptyMastery('romanian', 'grammar'), event(0.1, 0.2))
    expect(m.masteryScore).toBeLessThan(WEAK_THRESHOLD)
    expect(m.weakReason).toBe('low_accuracy')
    expect(isWeak(m)).toBe(true)
  })

  it('clamps scores into [0,1]', () => {
    const m = updateMastery(emptyMastery('romanian', 'grammar'), event(5, 5))
    expect(m.accuracy).toBe(1)
    expect(m.confidence).toBe(1)
    expect(m.masteryScore).toBeLessThanOrEqual(1)
  })

  it('never-practiced mastery is weak', () => {
    expect(isWeak(emptyMastery('romanian', 'grammar'))).toBe(true)
  })
})
