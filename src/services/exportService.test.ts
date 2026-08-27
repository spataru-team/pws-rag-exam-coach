import { describe, it, expect, beforeEach } from 'vitest'
import { buildExportFromStorage } from './exportService'
import { examAttemptRepo } from '@/storage'
import { db } from '@/storage/db'
import type { ExamAttempt, StudentProfile } from '@/types'

const profile: StudentProfile = {
  localId: 'local-1',
  interfaceLanguage: 'ru',
  preferredLearningLanguage: 'ro',
  activeSubjects: ['romanian'],
  currentSubjectId: 'romanian',
  dyslexiaMode: false,
  theme: 'light',
  studyMode: 'sprint',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
}

const attempt: ExamAttempt = {
  id: 'att-1', subjectId: 'romanian', paperId: 'ro-pr26',
  startedAt: '2026-06-12T09:00:00.000Z', submittedAt: '2026-06-12T10:00:00.000Z',
  timeSpentSec: 3600, answersByItemId: {}, results: [],
  totalAwarded: 33, totalMax: 50,
}

describe('buildExportFromStorage', () => {
  beforeEach(async () => {
    await db.examAttempts.clear()
  })

  it('includes stored exam attempts in the export', async () => {
    await examAttemptRepo.add(attempt)
    const out = await buildExportFromStorage(profile)
    expect(out.examAttempts).toHaveLength(1)
    expect(out.examAttempts?.[0]?.totalAwarded).toBe(33)
  })

  it('emits an empty examAttempts array when there are none', async () => {
    const out = await buildExportFromStorage(profile)
    expect(out.examAttempts).toEqual([])
  })
})
