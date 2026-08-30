import { describe, it, expect } from 'vitest'
import { RESCUE_CONFIG } from '@/learning/rescueConfig'
import type { RescueSkillTag } from '@/types'
import { kendallTau, loadProfiles, loadGrid, runSensitivity } from './harness'

describe('kendallTau', () => {
  const pri = new Map<RescueSkillTag, number>([
    ['felicitare', 1.5], ['transformare-gramaticala', 1.5], ['dialog', 0.6], ['concluzii', 0.2],
  ])

  it('identical rankings -> tau 1, no discordant pairs', () => {
    const order: RescueSkillTag[] = ['felicitare', 'dialog', 'concluzii']
    const r = kendallTau(order, order, pri)
    expect(r.tau).toBe(1)
    expect(r.discordantGenuine).toBe(0)
    expect(r.discordantTieBreak).toBe(0)
  })

  it('a swap of an equal-priority pair counts as tie-break-only', () => {
    const r = kendallTau(
      ['felicitare', 'transformare-gramaticala', 'dialog'],
      ['transformare-gramaticala', 'felicitare', 'dialog'],
      pri,
    )
    expect(r.discordantTieBreak).toBe(1)
    expect(r.discordantGenuine).toBe(0)
  })

  it('a swap of an unequal-priority pair counts as a genuine reorder', () => {
    const r = kendallTau(['felicitare', 'dialog'], ['dialog', 'felicitare'], pri)
    expect(r.discordantGenuine).toBe(1)
    expect(r.discordantTieBreak).toBe(0)
    expect(r.tau).toBe(-1)
  })

  it('fewer than 2 common candidates -> N/A', () => {
    expect(kendallTau(['felicitare'], ['felicitare', 'dialog'], pri).tau).toBeNull()
  })
})

describe('frozen benchmark inputs', () => {
  it('profiles.json: exactly 30, 15 clearly-separated + 15 near-tie, all synthetic', async () => {
    const p = await loadProfiles()
    expect(p).toHaveLength(30)
    expect(p.filter((x) => x.band === 'clearly-separated')).toHaveLength(15)
    expect(p.filter((x) => x.band === 'near-tie')).toHaveLength(15)
    expect(p.every((x) => x.source === 'synthetic')).toBe(true)
    expect(new Set(p.map((x) => x.id)).size).toBe(30)
  })

  it('perturbations.json: 1 baseline + 108 primary + 16 boundary = 125', async () => {
    const g = await loadGrid()
    expect(g.perturbations).toHaveLength(125)
    expect(g.perturbations.filter((p) => p.kind === 'baseline')).toHaveLength(1)
    const primary = g.perturbations.filter((p) => p.kind === 'skill-param-delta' && p.group === 'primary')
    expect(primary).toHaveLength(108)
    // 9 non-boundary skills x 3 params x 4 deltas, sinonime excluded from primary
    expect(primary.some((p) => p.kind === 'skill-param-delta' && p.skill === 'sinonime-antonime')).toBe(false)
    const boundary = g.perturbations.filter(
      (p) => p.kind !== 'baseline' && !(p.kind === 'skill-param-delta' && p.group === 'primary'),
    )
    expect(boundary).toHaveLength(16)
  })
})

describe('runSensitivity', () => {
  it('structural invariants hold and the run is deterministic', async () => {
    const a = await runSensitivity()
    const b = await runSensitivity()
    expect(a.invariants).toEqual({
      zeroEvidenceLeakage: 0,
      routeCapViolations: 0,
      allProfilesBelowSafetyTarget: true,
      productionConfigUnchanged: true,
    })
    // deterministic: same cells, same aggregates
    expect(JSON.stringify(a.cells)).toEqual(JSON.stringify(b.cells))
    expect(JSON.stringify(a.primary)).toEqual(JSON.stringify(b.primary))
  })

  it('every baseline profile is below safetyTarget and every route respects the cap', async () => {
    const r = await runSensitivity()
    for (const br of r.baselineRoutes) {
      expect(br.officialScore).toBeLessThan(RESCUE_CONFIG.safetyTarget)
      expect(br.routeLen).toBeLessThanOrEqual(RESCUE_CONFIG.maxRescueSkills)
    }
    for (const c of r.cells) expect(c.pertRoute.length).toBeLessThanOrEqual(RESCUE_CONFIG.maxRescueSkills)
  })

  it('clearly-separated profiles are more route-stable than near-tie under +/-10%', async () => {
    const r = await runSensitivity()
    expect(r.primary.delta10.clearlySeparated.top1StableRate).toBeGreaterThanOrEqual(
      r.primary.delta10.nearTie.top1StableRate,
    )
  })
})
