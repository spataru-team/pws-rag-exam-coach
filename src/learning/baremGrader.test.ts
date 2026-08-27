import { describe, it, expect } from 'vitest'
import { normalizeForMatch, gradeShortDeterministic, totalsOf, parseBaremResponse } from './baremGrader'
import type { ExamItem, BaremResult } from '@/types'

const shortItem: ExamItem = {
  id: 'pr26-2',
  order: 2,
  type: 'short',
  maxPoints: 4,
  prompt: 'sinonime/antonime',
  baremRule: '1 p. per cuvânt',
  acceptedAnswers: ['muncitor', 'a respecta', 'fals', 'slab'],
}

describe('normalizeForMatch', () => {
  it('lowercases, trims, strips diacritics and punctuation', () => {
    expect(normalizeForMatch('  Fáls. ')).toBe('fals')
    expect(normalizeForMatch('A Respecta')).toBe('a respecta')
  })
})

describe('gradeShortDeterministic', () => {
  it('awards one point per distinct accepted token, capped at maxPoints', () => {
    const r = gradeShortDeterministic(shortItem, 'muncitor\na respecta\nfals\nslab')
    expect(r.awarded).toBe(4)
    expect(r.mode).toBe('deterministic')
    expect(r.max).toBe(4)
  })

  it('ignores diacritics and duplicates, never exceeds maxPoints', () => {
    const r = gradeShortDeterministic(shortItem, 'muncitor, muncitor, fáls')
    expect(r.awarded).toBe(2)
  })

  it('caps awarded at maxPoints when more distinct tokens match than the maximum', () => {
    const capped: ExamItem = { ...shortItem, maxPoints: 2 }
    const r = gradeShortDeterministic(capped, 'muncitor\na respecta\nfals\nslab')
    expect(r.awarded).toBe(2)
  })

  it('treats a slash as a token delimiter', () => {
    const r = gradeShortDeterministic(shortItem, 'muncitor/fals')
    expect(r.awarded).toBe(2)
  })

  it('gives zero with a comment when nothing matches', () => {
    const r = gradeShortDeterministic(shortItem, 'xyz')
    expect(r.awarded).toBe(0)
    expect(r.perCriterion[0]!.comment.length).toBeGreaterThan(0)
  })
})

describe('totalsOf', () => {
  it('sums awarded and max across results', () => {
    const results: BaremResult[] = [
      { itemId: 'a', perCriterion: [], awarded: 3, max: 4, advice: '', mode: 'llm' },
      { itemId: 'b', perCriterion: [], awarded: 2, max: 2, advice: '', mode: 'deterministic' },
    ]
    expect(totalsOf(results)).toEqual({ totalAwarded: 5, totalMax: 6 })
  })
})

const openItem: ExamItem = {
  id: 'pr26-9',
  order: 9,
  type: 'open',
  maxPoints: 5,
  prompt: 'felicitare',
  baremRule: 'sub-criterii',
  subCriteria: [
    { id: 'adresare', title: { ro: 'Adresare' }, maxPoints: 1, rule: '' },
    { id: 'ocazie', title: { ro: 'Ocazia' }, maxPoints: 1, rule: '' },
    { id: 'urare', title: { ro: 'Urare' }, maxPoints: 2, rule: '' },
    { id: 'asezare', title: { ro: 'Așezare' }, maxPoints: 1, rule: '' },
  ],
}

describe('parseBaremResponse', () => {
  it('parses JSON, clamps awarded to each sub-criterion max, sums total', () => {
    const raw = JSON.stringify({
      perCriterion: [
        { id: 'adresare', awarded: 1, comment: 'ok' },
        { id: 'ocazie', awarded: 1, comment: 'ok' },
        { id: 'urare', awarded: 5, comment: 'peste max' }, // clamps to 2
        { id: 'asezare', awarded: 1, comment: 'ok' },
      ],
      advice: 'Bun lucru.',
    })
    const r = parseBaremResponse(raw, openItem)
    expect(r.mode).toBe('llm')
    expect(r.awarded).toBe(5)
    expect(r.max).toBe(5)
    expect(r.perCriterion.find((c) => c.id === 'urare')?.awarded).toBe(2)
    expect(r.advice).toBe('Bun lucru.')
  })

  it('tolerates ```json fences', () => {
    const raw = '```json\n{"perCriterion":[{"id":"adresare","awarded":1,"comment":"x"}],"advice":"a"}\n```'
    const r = parseBaremResponse(raw, openItem)
    expect(r.awarded).toBe(1)
  })

  it('throws on invalid JSON so the service can fall back', () => {
    expect(() => parseBaremResponse('not json', openItem)).toThrow()
  })

  it('throws when the response has no perCriterion scores (so the service falls back)', () => {
    const raw = JSON.stringify({ advice: 'fără note' })
    expect(() => parseBaremResponse(raw, openItem)).toThrow()
  })

  it('grades a single-criterion open item against item.maxPoints', () => {
    const single: ExamItem = { ...openItem, subCriteria: undefined, maxPoints: 3, id: 'pr26-1' }
    const raw = JSON.stringify({ perCriterion: [{ id: 'pr26-1', awarded: 9, comment: 'x' }], advice: 'a' })
    const r = parseBaremResponse(raw, single)
    expect(r.awarded).toBe(3) // clamped to maxPoints
  })
})
