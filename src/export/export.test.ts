import { describe, it, expect } from 'vitest'
import { buildProgressExport, type ExportInput } from './buildExport'
import { validateProgressExport } from './schema'
import { EXPORT_SCHEMA_VERSION, type LearningEvent, type TopicMastery } from '@/types'

const NOW = new Date('2026-06-03T12:00:00.000Z')

const masteries: TopicMastery[] = [
  { subjectId: 'romanian', topicId: 'grammar', masteryScore: 0.8, accuracy: 0.8, confidence: 0.8, attempts: 4 },
  { subjectId: 'romanian', topicId: 'reading', masteryScore: 0.3, accuracy: 0.3, confidence: 0.3, attempts: 2, weakReason: 'low_accuracy' },
]

const events: LearningEvent[] = [
  {
    id: 'e1',
    timestamp: '2026-06-03T10:00:00.000Z',
    subjectId: 'romanian',
    topicId: 'grammar',
    activityType: 'practice',
    exerciseType: 'written',
    result: 'correct',
    score: 1,
    timeSpentSec: 120,
    retrievedChunkIds: ['ro-1'],
  },
]

function makeInput(overrides?: Partial<ExportInput>): ExportInput {
  return {
    profile: { localId: 'stu_abc', activeSubjects: ['romanian'] },
    events,
    masteries,
    metrics: [],
    topicsBySubject: { romanian: [] },
    dateRange: { from: '2026-05-01', to: '2026-06-03' },
    now: NOW,
    ...overrides,
  }
}

describe('buildProgressExport', () => {
  it('produces an object matching the export schema', () => {
    const out = buildProgressExport(makeInput())
    const res = validateProgressExport(out)
    expect(res.errors).toEqual([])
    expect(res.valid).toBe(true)
    expect(out.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
  })

  it('includes anonymous id and no personal fields', () => {
    const out = buildProgressExport(makeInput())
    expect(out.anonymousStudentId).toBe('stu_abc')
    expect(out).not.toHaveProperty('name')
    expect(out).not.toHaveProperty('email')
  })

  it('summarises subject progress and flags weak topics', () => {
    const out = buildProgressExport(makeInput())
    expect(out.subjectProgress[0]?.subjectId).toBe('romanian')
    expect(out.weakTopics.some((w) => w.topicId === 'reading')).toBe(true)
  })

  it('omits teacherNotes when not provided and includes it when set', () => {
    expect(buildProgressExport(makeInput())).not.toHaveProperty('teacherNotes')
    const withNotes = buildProgressExport(makeInput({ teacherNotes: 'Good progress' }))
    expect(withNotes.teacherNotes).toBe('Good progress')
  })
})

describe('validateProgressExport', () => {
  it('rejects a wrong schema version', () => {
    const out = buildProgressExport(makeInput()) as unknown as Record<string, unknown>
    out.schemaVersion = 999
    expect(validateProgressExport(out).valid).toBe(false)
  })

  it('rejects an export carrying a personal name field', () => {
    const out = buildProgressExport(makeInput()) as unknown as Record<string, unknown>
    out.name = 'Ion'
    const res = validateProgressExport(out)
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.includes('name'))).toBe(true)
  })
})
