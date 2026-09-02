import { describe, it, expect } from 'vitest'
import { isDemoResult, isDemoAttempt, hasDemoData } from './demoProvenance'
import type { BaremResult, ExamAttempt } from '@/types'

const result = (over: Partial<BaremResult> = {}): BaremResult => ({
  itemId: 'i1',
  perCriterion: [],
  awarded: 1,
  max: 2,
  advice: '',
  mode: 'self',
  ...over,
})

const attempt = (over: Partial<ExamAttempt> = {}): ExamAttempt => ({
  id: 'a1',
  subjectId: 'romanian',
  paperId: 'ro-sb26',
  startedAt: '2026-08-01T00:00:00.000Z',
  submittedAt: '2026-08-01T00:10:00.000Z',
  timeSpentSec: 600,
  answersByItemId: {},
  results: [],
  totalAwarded: 0,
  totalMax: 50,
  ...over,
})

describe('demo provenance — a single structured flag, never a text prefix', () => {
  it('isDemoResult keys on the boolean flag only', () => {
    expect(isDemoResult(result({ demo: true }))).toBe(true)
    expect(isDemoResult(result())).toBe(false)
  })

  it('isDemoResult ignores a [DEMO] text prefix in advice/comment (presentation only)', () => {
    expect(isDemoResult(result({ advice: '[DEMO] not a real grade' }))).toBe(false)
    expect(
      isDemoResult(
        result({ perCriterion: [{ id: 'c', awarded: 0, max: 1, comment: '[DEMO] demonstration' }] }),
      ),
    ).toBe(false)
  })

  it('isDemoAttempt keys on the boolean flag only', () => {
    expect(isDemoAttempt(attempt({ demo: true }))).toBe(true)
    expect(isDemoAttempt(attempt())).toBe(false)
  })

  it('hasDemoData is true if any result in the list carries the flag', () => {
    expect(hasDemoData([result(), result({ demo: true })])).toBe(true)
    expect(hasDemoData([result(), result()])).toBe(false)
    expect(hasDemoData([])).toBe(false)
  })
})
