import { describe, it, expect } from 'vitest'
import { percentile, recallAtK, mrr, mean } from './metrics'

describe('percentile', () => {
  it('returns 0 for empty', () => {
    expect(percentile([], 50)).toBe(0)
  })
  it('returns the single value', () => {
    expect(percentile([42], 95)).toBe(42)
  })
  it('computes median (p50) and p95 with interpolation', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 6)
    expect(percentile([10, 20, 30, 40, 50], 95)).toBeCloseTo(48, 6)
  })
  it('is order-independent', () => {
    expect(percentile([50, 10, 30, 40, 20], 50)).toBe(30)
  })
})

describe('recallAtK', () => {
  it('1 when nothing expected', () => {
    expect(recallAtK(['a'], [], 5)).toBe(1)
  })
  it('counts only within top-k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0)
    expect(recallAtK(['a', 'b', 'c'], ['c'], 3)).toBe(1)
  })
  it('partial recall for multiple expected', () => {
    expect(recallAtK(['a', 'b'], ['a', 'x'], 5)).toBe(0.5)
  })
})

describe('mrr', () => {
  it('1 when first hit is rank 1', () => {
    expect(mrr(['a', 'b'], ['a'])).toBe(1)
  })
  it('1/3 when first hit is rank 3', () => {
    expect(mrr(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3, 6)
  })
  it('0 when no hit', () => {
    expect(mrr(['x', 'y'], ['a'])).toBe(0)
  })
})

describe('mean', () => {
  it('averages and handles empty', () => {
    expect(mean([2, 4])).toBe(3)
    expect(mean([])).toBe(0)
  })
})
