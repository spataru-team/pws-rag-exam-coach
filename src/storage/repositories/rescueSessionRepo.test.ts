import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { rescueSessionRepo } from './rescueSessionRepo'
import type { RescueSession } from '@/types'

function makeSession(overrides: Partial<RescueSession> = {}): RescueSession {
  return {
    id: 'r1', subjectId: 'romanian', diagnosticAttemptId: 'a1', diagnosticPaperId: 'ro-sb26',
    seenPaperIds: ['ro-sb26', 'ro-pr26'], selectedSkills: ['felicitare'], skillEvidence: [],
    drillResults: [], forecastHistory: [], startedAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z', ...overrides,
  }
}

describe('rescueSessionRepo', () => {
  beforeEach(async () => { await db.rescueSessions.clear() })

  it('adds and retrieves a session by id', async () => {
    await rescueSessionRepo.add(makeSession())
    const found = await rescueSessionRepo.get('r1')
    expect(found?.selectedSkills).toEqual(['felicitare'])
  })

  it('update() upserts by id (matches examAttemptRepo.add pattern)', async () => {
    await rescueSessionRepo.add(makeSession())
    await rescueSessionRepo.update({ ...makeSession(), selectedSkills: ['felicitare', 'dialog'] })
    const found = await rescueSessionRepo.get('r1')
    expect(found?.selectedSkills).toEqual(['felicitare', 'dialog'])
  })

  it('does not affect existing examAttempts table (v1/v2 tables preserved)', async () => {
    await db.examAttempts.put({
      id: 'a1', subjectId: 'romanian', paperId: 'ro-sb26', startedAt: '', submittedAt: '',
      timeSpentSec: 0, answersByItemId: {}, results: [], totalAwarded: 0, totalMax: 50,
    })
    await rescueSessionRepo.add(makeSession())
    expect(await db.examAttempts.get('a1')).toBeDefined()
  })
})
