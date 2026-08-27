import { describe, it, expect } from 'vitest'
import { RO_GIMNAZIU_GRADING_SCALE, RESCUE_CONFIG } from './rescueConfig'

describe('RO_GIMNAZIU_GRADING_SCALE', () => {
  it('matches the official ANCE conversion table for grades 5-10', () => {
    const byGrade = Object.fromEntries(RO_GIMNAZIU_GRADING_SCALE.map((b) => [b.nota, b]))
    expect(byGrade[5]).toEqual({ nota: 5, min: 13, max: 20 })
    expect(byGrade[6]).toEqual({ nota: 6, min: 21, max: 28 })
    expect(byGrade[7]).toEqual({ nota: 7, min: 29, max: 36 })
    expect(byGrade[8]).toEqual({ nota: 8, min: 37, max: 44 })
    expect(byGrade[9]).toEqual({ nota: 9, min: 45, max: 47 })
    expect(byGrade[10]).toEqual({ nota: 10, min: 48, max: 50 })
  })

  it('does not fabricate bands below nota 5', () => {
    const grades = RO_GIMNAZIU_GRADING_SCALE.map((b) => b.nota)
    expect(grades).not.toContain(1)
    expect(grades).not.toContain(4)
  })
})

describe('RESCUE_CONFIG', () => {
  it('passThreshold equals the official nota-5 lower bound', () => {
    expect(RESCUE_CONFIG.passThreshold).toBe(13)
  })

  it('safetyTarget is a pedagogical value strictly above passThreshold', () => {
    expect(RESCUE_CONFIG.safetyTarget).toBe(18)
    expect(RESCUE_CONFIG.safetyTarget).toBeGreaterThan(RESCUE_CONFIG.passThreshold)
  })

  it('never assigns sinonime-antonime the cheapest training cost', () => {
    // Explicit regression for the corrected heuristic — see plan §M.
    expect(RESCUE_CONFIG.perSkill['sinonime-antonime'].trainingCost).toBeGreaterThan(1)
  })

  it('excludes corectitudine from ordinary rescue ranking', () => {
    expect(RESCUE_CONFIG.perSkill.corectitudine.excludedFromRanking).toBe(true)
  })

  it('defines weights for every RescueSkillTag', () => {
    const tags = [
      'completare-text', 'sinonime-antonime', 'enunt-reflexiv', 'intrebari-directe',
      'concluzii', 'portret-caracterizare', 'transformare-gramaticala', 'dialog',
      'felicitare', 'eseu-repere', 'eseu-coerenta', 'eseu-volum', 'corectitudine',
    ] as const
    for (const tag of tags) {
      expect(RESCUE_CONFIG.perSkill[tag]).toBeDefined()
      expect(RESCUE_CONFIG.perSkill[tag].trainability).toBeGreaterThan(0)
      expect(RESCUE_CONFIG.perSkill[tag].trainability).toBeLessThanOrEqual(1)
    }
  })
})
