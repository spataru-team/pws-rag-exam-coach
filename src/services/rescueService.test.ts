import { describe, it, expect } from 'vitest'
import { runDiagnostic, diagnosticFromAttempt, buildForecast, selectTestBPaper } from './rescueService'
import { romanianSb26 } from '@/data/exams/romanian-sb26'
import { romanianPr26 } from '@/data/exams/romanian-pr26'
import type { ExamAttempt, ExamPaper } from '@/types'

describe('runDiagnostic', () => {
  it('grades the sb26 paper, builds atoms, evidence and a route, all from one pass', async () => {
    const answers: Record<string, string> = {}
    for (const item of romanianSb26.items) answers[item.id] = '' // fully blank, worst case
    const result = await runDiagnostic(romanianSb26, answers, { supportLanguage: 'ru' })

    expect(result.attempt.paperId).toBe('ro-sb26')
    expect(result.attempt.totalAwarded).toBe(0) // blank => 0 everywhere
    expect(result.atoms.length).toBeGreaterThan(0)
    expect(result.evidence.every((e) => e.skillTag)).toBe(true)
    expect(Array.isArray(result.route)).toBe(true)
  })
})

describe('diagnosticFromAttempt', () => {
  // A pre-graded attempt: partial credit on several skills, total below the
  // safety target so a route is produced.
  const attempt: ExamAttempt = {
    id: 'seed-1',
    subjectId: 'romanian',
    paperId: 'ro-sb26',
    startedAt: '2026-08-01T00:00:00.000Z',
    submittedAt: '2026-08-01T00:20:00.000Z',
    timeSpentSec: 1200,
    answersByItemId: Object.fromEntries(romanianSb26.items.map((i) => [i.id, 'un răspuns parțial dezvoltat aici'])),
    results: [
      { itemId: 'sb26-1', perCriterion: [{ id: 'sb26-1', awarded: 2, max: 3, comment: '' }], awarded: 2, max: 3, advice: '', mode: 'llm' },
      { itemId: 'sb26-2', perCriterion: [{ id: 'sb26-2', awarded: 2, max: 4, comment: '' }], awarded: 2, max: 4, advice: '', mode: 'deterministic' },
      { itemId: 'sb26-7', perCriterion: [{ id: 'sb26-7', awarded: 1, max: 5, comment: '' }], awarded: 1, max: 5, advice: '', mode: 'llm' },
      { itemId: 'sb26-9', perCriterion: [
        { id: 'adresare', awarded: 1, max: 1, comment: '' }, { id: 'ocazie', awarded: 1, max: 1, comment: '' },
        { id: 'urare', awarded: 0, max: 2, comment: '' }, { id: 'asezare', awarded: 0, max: 1, comment: '' },
      ], awarded: 2, max: 5, advice: '', mode: 'llm' },
    ],
    totalAwarded: 7,
    totalMax: 50,
  }

  it('derives atoms, evidence and a route from a pre-graded attempt without regrading', () => {
    const result = diagnosticFromAttempt(romanianSb26, attempt)
    expect(result.attempt).toBe(attempt)
    expect(result.atoms.length).toBeGreaterThan(0)
    expect(result.evidence.every((e) => e.skillTag)).toBe(true)
    expect(result.route.length).toBeGreaterThan(0)
  })

  it('is pure — same attempt in, identical route out', () => {
    expect(diagnosticFromAttempt(romanianSb26, attempt).route).toEqual(
      diagnosticFromAttempt(romanianSb26, attempt).route,
    )
  })
})

describe('selectTestBPaper', () => {
  function paper(id: string, year: number, profile?: 'real' | 'umanist'): ExamPaper {
    return { ...romanianPr26, id, year, title: id, ...(profile ? { profile } : {}) }
  }

  it('excludes the diagnostic paper and prefers one never attempted, most recent first', () => {
    const candidates = [paper('a', 2023), paper('b', 2024), paper('c', 2025)]
    const picked = selectTestBPaper(candidates, paper('c', 2025), new Set(['b']))
    expect(picked?.id).toBe('a') // 'b' already attempted, 'c' excluded as diagnostic -> only 'a' unseen
  })

  it('picks the most recent unseen paper when several are unseen', () => {
    const candidates = [paper('a', 2023), paper('b', 2024), paper('c', 2025)]
    const picked = selectTestBPaper(candidates, paper('c', 2025), new Set())
    expect(picked?.id).toBe('b') // 'c' excluded as diagnostic, 'a'/'b' both unseen -> newest ('b')
  })

  it('falls back to the whole pool (most recent) when every other paper was already attempted', () => {
    const candidates = [paper('a', 2023), paper('b', 2024), paper('c', 2025)]
    const picked = selectTestBPaper(candidates, paper('c', 2025), new Set(['a', 'b']))
    expect(picked?.id).toBe('b') // nothing unseen -> fall back to newest of the remaining pool
  })

  it('returns undefined when the diagnostic is the only registered paper', () => {
    const only = paper('only', 2026)
    expect(selectTestBPaper([only], only, new Set())).toBeUndefined()
  })

  it('works against the real registry (romanian has 2 papers today)', () => {
    const picked = selectTestBPaper([romanianPr26, romanianSb26], romanianSb26, new Set())
    expect(picked?.id).toBe('ro-pr26')
  })

  it('never crosses curriculum-profile tracks: excludes a same-subject paper on the other profile', () => {
    const candidates = [paper('a-real', 2024, 'real'), paper('b-umanist', 2025, 'umanist')]
    const picked = selectTestBPaper(candidates, paper('diag-real', 2026, 'real'), new Set())
    expect(picked?.id).toBe('a-real') // 'b-umanist' must never be offered as Test B for a real-track diagnostic
  })

  it('still offers a profile-agnostic paper (no profile set) as Test B for a profiled diagnostic', () => {
    const candidates = [paper('no-profile', 2020), paper('other-track', 2025, 'umanist')]
    const picked = selectTestBPaper(candidates, paper('diag-real', 2026, 'real'), new Set())
    expect(picked?.id).toBe('no-profile')
  })
})

describe('buildForecast', () => {
  it('produces a forecast object with all required fields, capped at paper max', () => {
    const forecast = buildForecast(10, [], [], 50)
    expect(forecast.officialScore).toBe(10)
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(50)
    expect(forecast.expectedForecast).toBeLessThanOrEqual(50)
  })

  it('caps at a non-50 paper max (regression: paperMaxPoints must never silently default)', () => {
    const forecast = buildForecast(5, [], [], 8)
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(8)
    expect(forecast.expectedForecast).toBeLessThanOrEqual(8)
  })
})
