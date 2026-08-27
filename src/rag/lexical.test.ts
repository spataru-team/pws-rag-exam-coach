import { describe, it, expect } from 'vitest'
import { tokenize, lexicalScores, fuseRRF } from './lexical'

describe('tokenize', () => {
  it('lowercases, strips punctuation, folds diacritics', () => {
    expect(tokenize('Articolul hotărât, în limbă!')).toEqual([
      'articolul',
      'hotarat',
      'in',
      'limba',
    ])
  })
  it('returns empty for blank input', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('lexicalScores', () => {
  const docs = [
    'Articolul hotărât în limba română',
    'Conjugarea verbului la prezent',
    'Celula este unitatea de bază a vieții',
  ]

  it('ranks the lexically matching doc highest', () => {
    const scores = lexicalScores('articolul hotărât', docs)
    expect(scores[0]).toBeGreaterThan(scores[1]!)
    expect(scores[0]).toBeGreaterThan(scores[2]!)
  })

  it('matches across diacritics (folded)', () => {
    const withDiacritics = lexicalScores('hotărât', docs)
    const withoutDiacritics = lexicalScores('hotarat', docs)
    expect(withoutDiacritics[0]).toBeCloseTo(withDiacritics[0]!, 6)
    expect(withoutDiacritics[0]).toBeGreaterThan(0)
  })

  it('returns zeros for empty query or no docs', () => {
    expect(lexicalScores('', docs)).toEqual([0, 0, 0])
    expect(lexicalScores('x', [])).toEqual([])
  })
})

describe('fuseRRF', () => {
  it('rewards items ranked high across rankings', () => {
    const fused = fuseRRF([
      ['a', 'b', 'c'],
      ['b', 'a', 'c'],
    ])
    // 'a' and 'b' both appear near the top in both lists; 'c' is last in both.
    expect(fused.get('a')!).toBeGreaterThan(fused.get('c')!)
    expect(fused.get('b')!).toBeGreaterThan(fused.get('c')!)
  })

  it('ranks an item that is top in both above mixed ones', () => {
    const fused = fuseRRF([
      ['x', 'y', 'z'],
      ['x', 'z', 'y'],
    ])
    expect(fused.get('x')!).toBeGreaterThan(fused.get('y')!)
    expect(fused.get('x')!).toBeGreaterThan(fused.get('z')!)
  })
})
