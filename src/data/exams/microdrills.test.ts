import { describe, it, expect } from 'vitest'
import { microdrillsForSkill, microdrillsBySkill } from './microdrills'

describe('microdrills', () => {
  const p0Skills = ['felicitare', 'transformare-gramaticala', 'dialog', 'intrebari-directe', 'eseu-repere', 'eseu-volum'] as const

  it('every P0 skill has 3-6 drills', () => {
    for (const tag of p0Skills) {
      const drills = microdrillsForSkill(tag)
      expect(drills.length).toBeGreaterThanOrEqual(3)
      expect(drills.length).toBeLessThanOrEqual(6)
    }
  })

  it('every drill is tagged with the skill it lives under', () => {
    for (const tag of p0Skills) {
      for (const drill of microdrillsForSkill(tag)) expect(drill.skillTag).toBe(tag)
    }
  })

  it('every drill has a unique id within its skill group', () => {
    for (const tag of p0Skills) {
      const ids = microdrillsForSkill(tag).map((d) => d.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('unknown skill returns an empty array, not undefined', () => {
    expect(microdrillsForSkill('portret-caracterizare')).toEqual([])
  })

  it('microdrillsBySkill only registers the P0 skills for now', () => {
    expect(Object.keys(microdrillsBySkill).sort()).toEqual([...p0Skills].sort())
  })
})
