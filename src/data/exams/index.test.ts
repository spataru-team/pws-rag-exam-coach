import { describe, it, expect } from 'vitest'
import { examPapersForSubject, getExamPaper } from './index'

describe('exam paper registry', () => {
  it('still defaults romanian[0] to pr26 (existing /exam behavior unchanged)', () => {
    expect(examPapersForSubject('romanian')[0]?.id).toBe('ro-pr26')
  })

  it('registers sb26 alongside pr26', () => {
    const ids = examPapersForSubject('romanian').map((p) => p.id)
    expect(ids).toEqual(['ro-pr26', 'ro-sb26'])
  })

  it('getExamPaper finds sb26 by id', () => {
    expect(getExamPaper('ro-sb26')?.title).toContain('Faptă mică')
  })

  it('grade is set on every registered paper', () => {
    const all = [...examPapersForSubject('romanian'), ...examPapersForSubject('math')]
    expect(all.every((p) => typeof p.grade === 'number')).toBe(true)
  })

  it('profile filter is a no-op when omitted (grade-9 romanian has no profile split)', () => {
    expect(examPapersForSubject('romanian').map((p) => p.id)).toEqual(
      examPapersForSubject('romanian', 'real').map((p) => p.id),
    )
  })

  it('profile-agnostic papers (no profile set) pass any profile filter', () => {
    // romanian's papers carry no `profile` at all (grade 9, no split) — neither
    // filter value should exclude them.
    expect(examPapersForSubject('romanian', 'real').map((p) => p.id)).toEqual(['ro-pr26', 'ro-sb26'])
    expect(examPapersForSubject('romanian', 'umanist').map((p) => p.id)).toEqual(['ro-pr26', 'ro-sb26'])
  })

  it("math-sb26 is tagged profile 'real' and survives a matching filter", () => {
    expect(examPapersForSubject('math', 'real').map((p) => p.id)).toEqual(['math-sb26'])
  })
})
