import { describe, it, expect } from 'vitest'
import { RESCUE_CONFIG } from '@/learning/rescueConfig'
import { applyPerturbation } from './applyPerturbation'

const snapshot = JSON.stringify(RESCUE_CONFIG)

describe('applyPerturbation', () => {
  it('baseline returns the same numbers as RESCUE_CONFIG and never mutates it', () => {
    const cfg = applyPerturbation(RESCUE_CONFIG, { id: 'baseline', kind: 'baseline' })
    expect(JSON.stringify(cfg)).toBe(snapshot)
    expect(JSON.stringify(RESCUE_CONFIG)).toBe(snapshot) // untouched
  })

  it('result is deeply frozen', () => {
    const cfg = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-delta', skill: 'dialog', param: 'trainability', deltaPct: 10, group: 'primary',
    })
    expect(Object.isFrozen(cfg)).toBe(true)
    expect(Object.isFrozen(cfg.perSkill)).toBe(true)
    expect(Object.isFrozen(cfg.perSkill.dialog)).toBe(true)
    expect(Object.isFrozen(cfg.zoneThresholds)).toBe(true)
  })

  it('skill-param-delta scales exactly one value, others unchanged', () => {
    const cfg = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-delta', skill: 'dialog', param: 'trainingCost', deltaPct: -20, group: 'primary',
    })
    expect(cfg.perSkill.dialog.trainingCost).toBeCloseTo(2 * 0.8) // 1.6, no clamp
    expect(cfg.perSkill.dialog.trainability).toBe(RESCUE_CONFIG.perSkill.dialog.trainability)
    expect(cfg.perSkill.felicitare).toEqual(RESCUE_CONFIG.perSkill.felicitare)
    expect(cfg.safetyTarget).toBe(18)
  })

  it('clamps trainability / transferReliability to [0,1]', () => {
    const up = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-delta', skill: 'felicitare', param: 'trainability', deltaPct: 20, group: 'primary',
    })
    expect(up.perSkill.felicitare.trainability).toBe(1) // 0.85 * 1.2 = 1.02 -> clamped
    const dn = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-absolute', skill: 'sinonime-antonime', param: 'transferReliability', value: -0.3, group: 'boundary',
    })
    expect(dn.perSkill['sinonime-antonime'].transferReliability).toBe(0)
  })

  it('clamps trainingCost to a strictly positive value', () => {
    const cfg = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-absolute', skill: 'felicitare', param: 'trainingCost', value: 0, group: 'boundary',
    })
    expect(cfg.perSkill.felicitare.trainingCost).toBeGreaterThan(0)
  })

  it('skill-param-absolute sets the exact eligibility-boundary values', () => {
    const t = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-absolute', skill: 'sinonime-antonime', param: 'transferReliability', value: 0.4, group: 'boundary',
    })
    expect(t.perSkill['sinonime-antonime'].transferReliability).toBe(0.4)
    const c = applyPerturbation(RESCUE_CONFIG, {
      id: 'x', kind: 'skill-param-absolute', skill: 'sinonime-antonime', param: 'trainingCost', value: 4, group: 'boundary',
    })
    expect(c.perSkill['sinonime-antonime'].trainingCost).toBe(4)
  })

  it('safety-target changes only safetyTarget', () => {
    const cfg = applyPerturbation(RESCUE_CONFIG, { id: 'x', kind: 'safety-target', value: 17, group: 'boundary' })
    expect(cfg.safetyTarget).toBe(17)
    expect(cfg.passThreshold).toBe(13)
    expect(cfg.perSkill).toEqual(RESCUE_CONFIG.perSkill)
  })
})
