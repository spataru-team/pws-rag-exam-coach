import { describe, it, expect } from 'vitest'
import { summarizeModelRuns } from './modelStats'
import type { ModelRunMetrics } from '@/types'

function run(p: Partial<ModelRunMetrics>): ModelRunMetrics {
  return {
    id: 'm' + Math.random(),
    timestamp: '2026-06-04T10:00:00.000Z',
    provider: 'mock',
    model: 'mock-grounded',
    subjectId: 'romanian',
    topicId: 'ro-article',
    latencyMs: 100,
    tokensIn: 200,
    tokensOut: 80,
    estimatedCost: 0,
    retrievalTopK: 5,
    contextChunkIds: [],
    groundednessScore: 1,
    formatCompliance: 1,
    ...p,
  }
}

describe('summarizeModelRuns', () => {
  it('returns zeroed overview for no metrics', () => {
    const o = summarizeModelRuns([])
    expect(o.totalRuns).toBe(0)
    expect(o.avgLatencyMs).toBe(0)
    expect(o.byProviderModel).toEqual([])
    expect(o.bySubject).toEqual([])
  })

  it('aggregates totals and averages', () => {
    const o = summarizeModelRuns([
      run({ latencyMs: 100, tokensIn: 200, tokensOut: 80, groundednessScore: 1 }),
      run({ latencyMs: 300, tokensIn: 100, tokensOut: 20, groundednessScore: 0 }),
    ])
    expect(o.totalRuns).toBe(2)
    expect(o.avgLatencyMs).toBe(200)
    expect(o.totalTokensIn).toBe(300)
    expect(o.totalTokensOut).toBe(100)
    expect(o.avgGroundedness).toBe(0.5)
  })

  it('computes latency percentiles overall and per model', () => {
    const o = summarizeModelRuns([
      run({ provider: 'p', model: 'm', latencyMs: 100 }),
      run({ provider: 'p', model: 'm', latencyMs: 200 }),
      run({ provider: 'p', model: 'm', latencyMs: 300 }),
    ])
    expect(o.p50LatencyMs).toBe(200)
    expect(o.p95LatencyMs).toBeGreaterThan(200)
    expect(o.byProviderModel[0]!.p50LatencyMs).toBe(200)
  })

  it('groups by provider/model', () => {
    const o = summarizeModelRuns([
      run({ provider: 'mock', model: 'a' }),
      run({ provider: 'mock', model: 'a' }),
      run({ provider: 'ollama', model: 'b', latencyMs: 500 }),
    ])
    expect(o.byProviderModel).toHaveLength(2)
    const top = o.byProviderModel[0]!
    expect(top.key).toBe('mock / a')
    expect(top.runs).toBe(2)
  })

  it('averages user rating only over rated runs (null when none)', () => {
    const o = summarizeModelRuns([
      run({ provider: 'p', model: 'm', userRating: 0.8 }),
      run({ provider: 'p', model: 'm' }),
    ])
    expect(o.byProviderModel[0]!.avgUserRating).toBeCloseTo(0.8, 6)

    const none = summarizeModelRuns([run({ provider: 'q', model: 'n' })])
    expect(none.byProviderModel[0]!.avgUserRating).toBeNull()
  })

  it('groups by subject', () => {
    const o = summarizeModelRuns([
      run({ subjectId: 'romanian' }),
      run({ subjectId: 'english', groundednessScore: 0 }),
      run({ subjectId: 'english', groundednessScore: 1 }),
    ])
    const en = o.bySubject.find((s) => s.subjectId === 'english')!
    expect(en.runs).toBe(2)
    expect(en.avgGroundedness).toBe(0.5)
  })
})
