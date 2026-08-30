import { describe, it, expect } from 'vitest'
import { citationCheck } from './citationCheck'

describe('citationCheck — extraction of the tutorService citation pipeline', () => {
  it('leaves a fully-valid-cited answer untouched (groundedness 1, format 1)', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a', 'b'],
      modelAnswer: 'Explanation [#a] and [#b].',
      retrievalInsufficient: false,
    })
    expect(r.citedChunkIds).toEqual(['a', 'b'])
    expect(r.validCitedChunkIds).toEqual(['a', 'b'])
    expect(r.fabricatedCitedChunkIds).toEqual([])
    expect(r.sanitizedAnswer).toBe('Explanation [#a] and [#b].')
    expect(r.groundednessScore).toBe(1)
    expect(r.formatCompliance).toBe(1)
    expect(r.insufficient).toBe(false)
  })

  it('strips a fabricated citation id that was never retrieved, keeps the raw cited list', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: 'Real [#a], fake [#zzz].',
      retrievalInsufficient: false,
    })
    expect(r.citedChunkIds).toEqual(['a', 'zzz'])
    expect(r.fabricatedCitedChunkIds).toEqual(['zzz'])
    expect(r.sanitizedAnswer).toBe('Real [#a], fake .')
    expect(r.groundednessScore).toBe(0.5)
    expect(r.insufficient).toBe(false) // 0.5 is NOT < 0.5 — not folded
  })

  it('folds to insufficient when most citations are fabricated (groundedness 1/3 < 0.5)', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: '[#fake1] [#fake2] and one real [#a].',
      retrievalInsufficient: false,
    })
    expect(r.groundednessScore).toBeCloseTo(1 / 3)
    expect(r.insufficient).toBe(true)
  })

  it('does not gate on groundedness when there are no citations at all', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: 'An answer with no citations.',
      retrievalInsufficient: false,
    })
    expect(r.groundednessScore).toBe(0)
    expect(r.formatCompliance).toBe(0)
    expect(r.insufficient).toBe(false)
  })

  it('scores a citation-free correct refusal as groundedness 1, format 1', () => {
    const r = citationCheck({
      retrievedChunkIds: [],
      modelAnswer: 'The local materials do not cover this question.',
      retrievalInsufficient: true,
    })
    expect(r.groundednessScore).toBe(1)
    expect(r.formatCompliance).toBe(1)
    expect(r.insufficient).toBe(true)
  })

  it('stays insufficient when retrieval itself was insufficient, regardless of valid citations', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: '[#a] fully valid.',
      retrievalInsufficient: true,
    })
    expect(r.insufficient).toBe(true)
  })

  it('does not fold at exactly groundedness 0.5 (strict < boundary)', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a', 'b', 'c', 'd'],
      modelAnswer: '[#a][#b][#x][#y]',
      retrievalInsufficient: false,
    })
    expect(r.groundednessScore).toBe(0.5)
    expect(r.insufficient).toBe(false)
  })

  it('matches chunk ids exactly — no substring / lookalike match', () => {
    const r = citationCheck({
      retrievedChunkIds: ['chunk-12'],
      modelAnswer: 'see [#chunk-1] here',
      retrievalInsufficient: false,
    })
    expect(r.validCitedChunkIds).toEqual([])
    expect(r.fabricatedCitedChunkIds).toEqual(['chunk-1'])
    expect(r.sanitizedAnswer).toBe('see  here')
  })
})

describe('citationCheck — pre/post sanitization metrics (P1-1a)', () => {
  it('reports raw validity before sanitization and full validity after', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a', 'b'],
      modelAnswer: '[#a] [#b] [#ghost1] [#ghost2]',
      retrievalInsufficient: false,
    })
    expect(r.rawCitationValidity).toBe(0.5) // 2 valid / 4 cited, raw
    expect(r.fabricatedCitationCatchRate).toBe(1) // 2 fabricated markers, both removed
    expect(r.postSanitizationCitedChunkIds).toEqual(['a', 'b'])
    expect(r.postSanitizationCitationValidity).toBe(1)
  })

  it('rawCitationValidity is 1 when the model cited nothing', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: 'no markers here',
      retrievalInsufficient: false,
    })
    expect(r.rawCitationValidity).toBe(1)
    expect(r.fabricatedCitationCatchRate).toBe(1)
  })

  it('counts a literal [#id] example echoed from the system prompt as a fabricated citation', () => {
    // src/llm/promptTemplates/generic.ts tells the model to cite "in the form [#id]".
    // If the model echoes that instruction text, current code parses `id` as a
    // citation, finds it was never retrieved, strips it, and it drags groundedness down.
    const r = citationCheck({
      retrievedChunkIds: ['bio-cell-001'],
      modelAnswer: 'Cite the chunk ids you used, in the form [#id].',
      retrievalInsufficient: false,
    })
    expect(r.citedChunkIds).toEqual(['id'])
    expect(r.fabricatedCitedChunkIds).toEqual(['id'])
    expect(r.groundednessScore).toBe(0)
    expect(r.insufficient).toBe(true) // folded — 0 < 0.5
    expect(r.sanitizedAnswer).toBe('Cite the chunk ids you used, in the form .')
  })

  it('pins marker-extraction edge cases: empty, whitespace, duplicate', () => {
    const r = citationCheck({
      retrievedChunkIds: ['a'],
      modelAnswer: 'x [#] y [# a ] z [#a][#a]',
      retrievalInsufficient: false,
    })
    // `[#]` has no id char -> not a match at all; `[# a ]` captures " a " (spaces kept).
    expect(r.citedChunkIds).toEqual([' a ', 'a', 'a'])
    expect(r.validCitedChunkIds).toEqual(['a', 'a'])
    expect(r.fabricatedCitedChunkIds).toEqual([' a '])
    expect(r.groundednessScore).toBeCloseTo(2 / 3)
    expect(r.sanitizedAnswer).toBe('x [#] y  z [#a][#a]')
  })
})
