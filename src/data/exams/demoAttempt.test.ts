import { describe, it, expect } from 'vitest'
import { demoAttempt } from './demoAttempt'
import { romanianSb26 } from './romanian-sb26'
import { diagnosticFromAttempt } from '@/services'
import { isDemoAttempt, hasDemoData } from '@/learning/demoProvenance'
import { RESCUE_CONFIG } from '@/learning'

describe('demoAttempt', () => {
  it('is structurally consistent with ro-sb26', () => {
    expect(demoAttempt.paperId).toBe('ro-sb26')
    const itemIds = new Set(romanianSb26.items.map((i) => i.id))
    demoAttempt.results.forEach((res) => expect(itemIds.has(res.itemId)).toBe(true))
    expect(demoAttempt.results).toHaveLength(romanianSb26.items.length)
    const sum = demoAttempt.results.reduce((s, res) => s + res.awarded, 0)
    expect(sum).toBe(demoAttempt.totalAwarded)
  })

  it('carries DEMO provenance on the attempt and every result (structured flag, not text)', () => {
    expect(isDemoAttempt(demoAttempt)).toBe(true)
    expect(hasDemoData(demoAttempt.results)).toBe(true)
    expect(demoAttempt.results.every((r) => r.demo === true)).toBe(true)
  })

  it('sits below the safety target so Rescue produces a route', () => {
    expect(demoAttempt.totalAwarded).toBeLessThan(RESCUE_CONFIG.safetyTarget)
    expect(demoAttempt.totalAwarded).toBeGreaterThan(RESCUE_CONFIG.passThreshold)
  })

  it('drives a non-empty Rescue route built only on demonstrated partial competence', () => {
    const { route, evidence } = diagnosticFromAttempt(romanianSb26, demoAttempt)
    expect(route.length).toBeGreaterThan(0)
    for (const tag of route) {
      const ev = evidence.find((e) => e.skillTag === tag)!
      expect(ev.earnedPoints).toBeGreaterThan(0) // P1-2-0 gate
    }
  })
})
