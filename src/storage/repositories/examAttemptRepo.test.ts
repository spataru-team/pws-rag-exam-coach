import { describe, it, expect, beforeEach } from 'vitest'
import { examAttemptRepo } from './examAttemptRepo'
import { db } from '../db'
import type { ExamAttempt } from '@/types'

function attempt(id: string, paperId = 'ro-pr26'): ExamAttempt {
  return {
    id,
    subjectId: 'romanian',
    paperId,
    startedAt: '2026-06-12T09:00:00.000Z',
    submittedAt: '2026-06-12T10:30:00.000Z',
    timeSpentSec: 5400,
    answersByItemId: { 'pr26-2': 'fals' },
    results: [{ itemId: 'pr26-2', perCriterion: [], awarded: 1, max: 4, advice: '', mode: 'deterministic' }],
    totalAwarded: 1,
    totalMax: 50,
  }
}

describe('examAttemptRepo', () => {
  beforeEach(async () => {
    await db.examAttempts.clear()
  })

  it('stores and reads back an attempt', async () => {
    await examAttemptRepo.add(attempt('att-1'))
    const all = await examAttemptRepo.all()
    expect(all).toHaveLength(1)
    expect(all[0]!.paperId).toBe('ro-pr26')
  })

  it('lists attempts by subject', async () => {
    await examAttemptRepo.add(attempt('att-1'))
    const list = await examAttemptRepo.listBySubject('romanian')
    expect(list.map((a) => a.id)).toContain('att-1')
  })

  it('listByPaper returns only attempts for that paper', async () => {
    await examAttemptRepo.add(attempt('a1', 'ro-pr26'))
    await examAttemptRepo.add(attempt('a2', 'ro-sb26'))
    await examAttemptRepo.add(attempt('a3', 'ro-pr26'))
    const result = await examAttemptRepo.listByPaper('ro-pr26')
    expect(result.map((a) => a.id).sort()).toEqual(['a1', 'a3'])
  })
})
