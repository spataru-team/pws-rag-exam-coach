import { describe, it, expect } from 'vitest'
import { evaluateExpression, answersEquivalent } from './expressionMatch'

describe('evaluateExpression', () => {
  it('evaluates plain integers and decimals, with unary minus and Unicode minus', () => {
    expect(evaluateExpression('-1')).toBeCloseTo(-1, 9)
    expect(evaluateExpression('−1')).toBeCloseTo(-1, 9)
    expect(evaluateExpression('3.5')).toBeCloseTo(3.5, 9)
    expect(evaluateExpression('3,5')).toBeCloseTo(3.5, 9) // Russian decimal comma
  })

  it('evaluates the three real math-sb26 notations for the same cone answer to the same value', () => {
    const forms = ['9√2π', '9π√2', '9*sqrt(2)*pi', '9 * sqrt(2) * pi']
    const values = forms.map((f) => evaluateExpression(f))
    for (const v of values) expect(v).toBeDefined()
    for (const v of values) expect(v!).toBeCloseTo(values[0]!, 6)
  })

  it('evaluates the pyramid volume notations (division, explicit and implicit multiply)', () => {
    const a = evaluateExpression('500√3/3')
    const b = evaluateExpression('500*sqrt(3)/3')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!).toBeCloseTo(b!, 6)
    expect(a!).toBeCloseTo(288.675, 2)
  })

  it('binds a bare √ tightly to only the next atom, not the whole trailing term', () => {
    // √2π must be sqrt(2)*π, not sqrt(2π) — matches how the real barem writes it.
    expect(evaluateExpression('√2π')).toBeCloseTo(Math.sqrt(2) * Math.PI, 9)
  })

  it('strips a leading variable label so "k=14" evaluates like "14"', () => {
    expect(evaluateExpression('k=14')).toBeCloseTo(14, 9)
    expect(evaluateExpression('k = 14')).toBeCloseTo(14, 9)
  })

  it('parses the leading numeric prefix and ignores a trailing unit', () => {
    expect(evaluateExpression('310 см')).toBeCloseTo(310, 9)
    expect(evaluateExpression('310см')).toBeCloseTo(310, 9)
  })

  it('handles parens and exponents', () => {
    expect(evaluateExpression('(1+2)*3')).toBeCloseTo(9, 9)
    expect(evaluateExpression('2^3')).toBeCloseTo(8, 9)
  })

  it('returns undefined for non-numeric answers (inequalities, intervals, blank)', () => {
    expect(evaluateExpression('t>3')).toBeUndefined()
    expect(evaluateExpression('(3;+∞)')).toBeUndefined()
    expect(evaluateExpression('')).toBeUndefined()
    expect(evaluateExpression('   ')).toBeUndefined()
  })

  it('returns undefined on unbalanced parens or a dangling operator', () => {
    expect(evaluateExpression('(1+2')).toBeUndefined()
    expect(evaluateExpression('1+')).toBeUndefined()
  })
})

describe('answersEquivalent', () => {
  it('treats different notations of the same number as equivalent', () => {
    expect(answersEquivalent('9√2π', '9*sqrt(2)*pi')).toBe(true)
    expect(answersEquivalent('9√2π', '9π√2')).toBe(true)
    expect(answersEquivalent('500√3/3', '500*sqrt(3)/3')).toBe(true)
    expect(answersEquivalent('-1', '−1')).toBe(true)
    expect(answersEquivalent('k=14', '14')).toBe(true)
    expect(answersEquivalent('310', '310 см')).toBe(true)
  })

  it('rejects a genuinely different number', () => {
    expect(answersEquivalent('9√2π', '9√3π')).toBe(false)
    expect(answersEquivalent('14', '15')).toBe(false)
  })

  it('falls back to normalized string matching for non-numeric answers', () => {
    expect(answersEquivalent('t>3', 't > 3')).toBe(true)
    expect(answersEquivalent('S=(3;+∞)', 's=(3;+∞)')).toBe(true)
    expect(answersEquivalent('t>3', 't>4')).toBe(false)
  })

  it('is not fooled by one side being numeric and the other not', () => {
    expect(answersEquivalent('14', 'fourteen')).toBe(false)
  })
})
