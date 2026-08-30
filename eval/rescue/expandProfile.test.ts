import { describe, it, expect } from 'vitest'
import {
  expandProfile,
  runProfile,
  SB26_SLOTS,
  SB26_SKILL_MAX,
  ROUTE_ELIGIBLE_SKILLS,
} from './expandProfile'
import type { RescueProfileSpec } from '../types'

describe('ro-sb26 structural derivation', () => {
  it('slots cover the whole paper (50 points) and match the barem layout', () => {
    expect(SB26_SLOTS.reduce((n, s) => n + s.max, 0)).toBe(50)
    expect(SB26_SKILL_MAX).toMatchObject({
      'completare-text': 3, 'sinonime-antonime': 4, 'enunt-reflexiv': 2, 'intrebari-directe': 4,
      'portret-caracterizare': 3, concluzii: 2, 'transformare-gramaticala': 5, dialog: 6,
      felicitare: 5, 'eseu-repere': 3, 'eseu-coerenta': 2, 'eseu-volum': 4, corectitudine: 7,
    })
  })

  it('ROUTE_ELIGIBLE_SKILLS excludes the permanently-expensive and excluded skills', () => {
    expect(ROUTE_ELIGIBLE_SKILLS).toHaveLength(10)
    expect(ROUTE_ELIGIBLE_SKILLS).not.toContain('portret-caracterizare')
    expect(ROUTE_ELIGIBLE_SKILLS).not.toContain('eseu-coerenta')
    expect(ROUTE_ELIGIBLE_SKILLS).not.toContain('corectitudine')
  })
})

const base = (over: RescueProfileSpec['skills'], backdrop: RescueProfileSpec['skills'] = {}): RescueProfileSpec => ({
  id: 'T', label: 't', band: 'clearly-separated', note: '', source: 'synthetic',
  skills: { ...backdrop, ...over },
})

describe('expandProfile', () => {
  it('produces one BaremResult per exam item and a derived officialScore', () => {
    const exp = expandProfile(base({ felicitare: { earned: 2, form: 'partial' } }))
    expect(exp.results).toHaveLength(11)
    // omitted skills default to full credit; felicitare loses 3 -> 47
    expect(exp.officialScore).toBe(47)
  })

  it('omitted skill => full credit; listed skill => its earned points', () => {
    const exp = expandProfile(base({ dialog: { earned: 2, form: 'partial' } }))
    const dialogResult = exp.results.find((r) => r.itemId === 'sb26-8')!
    expect(dialogResult.awarded).toBe(2)
    const felicitareResult = exp.results.find((r) => r.itemId === 'sb26-9')!
    expect(felicitareResult.awarded).toBe(5) // omitted -> full
  })

  it("form 'blank' => self mode + lowConfidence; form 'attempt' => llm mode", () => {
    const exp = expandProfile(
      base({ felicitare: { earned: 0, form: 'blank' }, transformare: { earned: 0, form: 'attempt' } } as RescueProfileSpec['skills']),
    )
    const fel = exp.results.find((r) => r.itemId === 'sb26-9')!
    expect(fel.mode).toBe('self')
    expect(fel.lowConfidence).toBe(true)
    const tr = exp.results.find((r) => r.itemId === 'sb26-7')!
    expect(tr.mode).toBe('llm')
  })

  it('runs the real engine path: a W2-sparse profile routes only the demonstrated skill', () => {
    const attemptZero = Object.fromEntries(
      ROUTE_ELIGIBLE_SKILLS.map((t) => [t, { earned: 0, form: 'attempt' as const }]),
    ) as RescueProfileSpec['skills']
    const exp = expandProfile(base({ felicitare: { earned: 2, form: 'partial' } }, attemptZero))
    const run = runProfile(exp)
    expect(run.route).toEqual(['felicitare'])
  })
})
