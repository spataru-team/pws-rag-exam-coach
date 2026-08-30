import { describe, it, expect } from 'vitest'
import { buildScoringAtoms, reviewStatus, classifyErrorType, evaluateSkillEvidence, selectRescueRoute, computeForecast } from './rescueEngine'
import { RESCUE_CONFIG } from './rescueConfig'
import { romanianSb26 } from '@/data/exams/romanian-sb26'
import type { BaremResult, RescueSkillEvidence, ScoringAtom } from '@/types'

describe('reviewStatus', () => {
  it('5/5 confident => correct', () => {
    expect(reviewStatus(5, 5, 'deterministic')).toBe('correct')
  })
  it('3/5 confident => partial', () => {
    expect(reviewStatus(3, 5, 'llm')).toBe('partial')
  })
  it('reliable 0/5 => incorrect', () => {
    expect(reviewStatus(0, 5, 'llm')).toBe('incorrect')
  })
  it('self mode => needs_review regardless of awarded', () => {
    expect(reviewStatus(5, 5, 'self')).toBe('needs_review')
  })
  it('lowConfidence => needs_review even with full credit', () => {
    expect(reviewStatus(5, 5, 'llm', true)).toBe('needs_review')
  })
})

describe('classifyErrorType', () => {
  it('blank answer => blank', () => {
    expect(classifyErrorType('replici', '   ', 0, 4)).toBe('blank')
  })
  it('dialog with fewer than 6 reply-lines and lost points => insufficient-volume', () => {
    const answer = '- Da.\n- Poate.\n- Nu știu.'
    expect(classifyErrorType('replici', answer, 2, 4)).toBe('insufficient-volume')
  })
  it('full credit => unknown (no error to classify)', () => {
    const answer = '- A.\n- B.\n- C.\n- D.\n- E.\n- F.'
    expect(classifyErrorType('replici', answer, 4, 4)).toBe('unknown')
  })
})

describe('buildScoringAtoms', () => {
  it('creates one atom per whole item when subCriteria is absent', () => {
    const results: BaremResult[] = [{
      itemId: 'sb26-5', perCriterion: [{ id: 'sb26-5', awarded: 2, max: 3, comment: '' }],
      awarded: 2, max: 3, advice: '', mode: 'llm',
    }]
    const atoms = buildScoringAtoms(romanianSb26, { 'sb26-5': 'text' }, results)
    const item5Atoms = atoms.filter((a) => a.itemId === 'sb26-5')
    expect(item5Atoms).toHaveLength(1)
    expect(item5Atoms[0]).toMatchObject({
      skillTag: 'portret-caracterizare', earnedPoints: 2, maxPoints: 3, source: 'exam-parent',
    })
  })

  it('creates one atom per subCriterion, never a parent atom, when subCriteria is present', () => {
    const results: BaremResult[] = [{
      itemId: 'sb26-9',
      perCriterion: [
        { id: 'adresare', awarded: 1, max: 1, comment: '' },
        { id: 'ocazie', awarded: 0, max: 1, comment: '' },
        { id: 'urare', awarded: 1, max: 2, comment: '' },
        { id: 'asezare', awarded: 1, max: 1, comment: '' },
      ],
      awarded: 3, max: 5, advice: '', mode: 'llm',
    }]
    const atoms = buildScoringAtoms(romanianSb26, { 'sb26-9': 'text' }, results)
    const item9Atoms = atoms.filter((a) => a.itemId === 'sb26-9')
    expect(item9Atoms).toHaveLength(4) // never a 5th "parent" atom
    expect(item9Atoms.reduce((s, a) => s + a.maxPoints, 0)).toBe(5) // no double counting
    expect(item9Atoms.every((a) => a.skillTag === 'felicitare')).toBe(true)
  })

  it('total atom maxPoints across the whole paper equals the paper total (50)', () => {
    const results: BaremResult[] = romanianSb26.items.map((item) => {
      const slots = item.subCriteria?.length
        ? item.subCriteria.map((c) => ({ id: c.id, awarded: 0, max: c.maxPoints, comment: '' }))
        : [{ id: item.id, awarded: 0, max: item.maxPoints, comment: '' }]
      return { itemId: item.id, perCriterion: slots, awarded: 0, max: item.maxPoints, advice: '', mode: 'self' as const }
    })
    const atoms = buildScoringAtoms(romanianSb26, {}, results)
    expect(atoms.reduce((s, a) => s + a.maxPoints, 0)).toBe(50)
  })
})

function atom(overrides: Partial<ScoringAtom>): ScoringAtom {
  return {
    id: 'a', paperId: 'ro-sb26', itemId: 'i', skillTag: 'felicitare',
    earnedPoints: 0, maxPoints: 1, gradingConfidence: 1, errorType: 'unknown',
    reviewStatus: 'incorrect', source: 'exam-parent', ...overrides,
  }
}

describe('evaluateSkillEvidence', () => {
  it('felicitare (3/5, one element missing) beats eseu-coerenta (0/2) in priority — worked example', () => {
    // 3/5 (ratio 0.6) deliberately stays below safeRatio (0.8) so it lands in the
    // 'recoverable' zone, not 'likelyStrong' — this compares two recoverable candidates.
    const felicitareAtoms = [atom({ skillTag: 'felicitare', earnedPoints: 3, maxPoints: 5 })]
    const coerentaAtoms = [atom({ skillTag: 'eseu-coerenta', earnedPoints: 0, maxPoints: 2 })]
    const evidence = evaluateSkillEvidence([...felicitareAtoms, ...coerentaAtoms])
    const felicitare = evidence.find((e) => e.skillTag === 'felicitare')!
    const coerenta = evidence.find((e) => e.skillTag === 'eseu-coerenta')!
    expect(felicitare.priority).toBeGreaterThan(coerenta.priority)
  })

  it('estimatedRecoverablePoints is a float, not rounded', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 4, maxPoints: 5 })])
    expect(Number.isInteger(evidence[0]!.estimatedRecoverablePoints)).toBe(false)
  })

  it('ratio >= safeRatio with confident grading and no corroboration => likelyStrong', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 5, maxPoints: 5, reviewStatus: 'correct' })])
    expect(evidence[0]!.state).toBe('likelyStrong')
  })

  it('ratio >= safeRatio corroborated by another paper => confirmedStrong', () => {
    const diagnostic = [atom({ paperId: 'ro-sb26', earnedPoints: 5, maxPoints: 5, reviewStatus: 'correct' })]
    const corroboration = [atom({ paperId: 'ro-pr26', earnedPoints: 4, maxPoints: 5, reviewStatus: 'correct' })]
    const evidence = evaluateSkillEvidence(diagnostic, corroboration)
    expect(evidence[0]!.state).toBe('confirmedStrong')
  })

  it('high trainingCost or low transferReliability => expensive, not recoverable', () => {
    const evidence = evaluateSkillEvidence([atom({ skillTag: 'portret-caracterizare', earnedPoints: 0, maxPoints: 3 })])
    expect(evidence[0]!.state).toBe('expensive')
  })

  it('corectitudine is excluded from ranking (priority 0, flagged expensive/excluded)', () => {
    const evidence = evaluateSkillEvidence([atom({ skillTag: 'corectitudine', earnedPoints: 2, maxPoints: 7 })])
    expect(evidence[0]!.priority).toBe(0)
  })

  it('needs_review-only evidence is uncertain, not recoverable', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 0, maxPoints: 5, reviewStatus: 'needs_review', gradingConfidence: 0.5 })])
    expect(evidence[0]!.state).toBe('uncertain')
  })
})

function evidence(overrides: Partial<RescueSkillEvidence>): RescueSkillEvidence {
  return {
    // A "normal" recoverable candidate has demonstrated some scorable competence
    // (aggregate earnedPoints > 0) — that is the default here. Tests for the
    // zero-competence route gate set earnedPoints: 0 explicitly.
    skillTag: 'felicitare', observations: 1, earnedPoints: 1, maxPoints: 5,
    performanceRatio: 0.2, errorTypes: ['unknown'], evidenceConfidence: 0.5,
    state: 'recoverable', estimatedRecoverablePoints: 1, trainingCost: 1,
    transferReliability: 0.8, priority: 1, ...overrides,
  }
}

describe('selectRescueRoute', () => {
  it('student already at/above safetyTarget (19/50) gets an empty route', () => {
    const route = selectRescueRoute([evidence({ priority: 5 })], 19)
    expect(route).toEqual([])
  })

  it('stops adding skills once the projected total reaches safetyTarget (18)', () => {
    const evs = [
      evidence({ skillTag: 'felicitare', priority: 3, estimatedRecoverablePoints: 5 }),
      evidence({ skillTag: 'dialog', priority: 2, estimatedRecoverablePoints: 4 }),
      evidence({ skillTag: 'intrebari-directe', priority: 1, estimatedRecoverablePoints: 3 }),
    ]
    const route = selectRescueRoute(evs, 10) // 10 + 5 + 4 = 19 >= 18, third skill not needed
    expect(route).toEqual(['felicitare', 'dialog'])
  })

  it('never selects more than maxRescueSkills (4)', () => {
    const tags = ['felicitare', 'dialog', 'intrebari-directe', 'concluzii', 'completare-text', 'enunt-reflexiv'] as const
    const evs = tags.map((skillTag, i) => evidence({ skillTag, priority: 6 - i, estimatedRecoverablePoints: 0.5 }))
    const route = selectRescueRoute(evs, 0)
    expect(route.length).toBeLessThanOrEqual(4)
  })

  it('never includes expensive/confirmedStrong/uncertain skills', () => {
    const evs = [
      evidence({ skillTag: 'felicitare', state: 'recoverable', priority: 2 }),
      evidence({ skillTag: 'portret-caracterizare', state: 'expensive', priority: 0 }),
      evidence({ skillTag: 'eseu-coerenta', state: 'confirmedStrong', priority: 0 }),
    ]
    const route = selectRescueRoute(evs, 5)
    expect(route).not.toContain('portret-caracterizare')
    expect(route).not.toContain('eseu-coerenta')
  })

  it('a single skill can be enough (route need not have a hard minimum)', () => {
    const route = selectRescueRoute([evidence({ priority: 5, estimatedRecoverablePoints: 10 })], 12)
    expect(route).toEqual(['felicitare'])
  })
})

describe('selectRescueRoute — demonstrated-competence gate (route builds on earned points)', () => {
  it('excludes a recoverable skill with zero demonstrated competence, even at higher priority', () => {
    const zeroBase = evidence({
      skillTag: 'felicitare', state: 'recoverable', priority: 5, earnedPoints: 0, estimatedRecoverablePoints: 3,
    })
    const demonstrated = evidence({
      skillTag: 'dialog', state: 'recoverable', priority: 2, earnedPoints: 1, estimatedRecoverablePoints: 2,
    })
    expect(selectRescueRoute([zeroBase, demonstrated], 10)).toEqual(['dialog'])
  })

  // Regression for probe W2: a broadly weak student who attempted many items and
  // scored 0 on almost all of them, with felicitare 2/5 the only skill showing
  // any scorable competence. Before this gate the route pulled in transformare
  // 0/5, eseu-volum 0/4 and dialog 0/6 (larger raw deficits). After: only the
  // demonstrated skill is a route target.
  it('W2: broadly weak student — route contains only the demonstrated skill (felicitare 2/5)', () => {
    const atoms = [
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 0, maxPoints: 5, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'eseu-volum', earnedPoints: 0, maxPoints: 4, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'dialog', earnedPoints: 0, maxPoints: 6, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'intrebari-directe', earnedPoints: 0, maxPoints: 4, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'completare-text', earnedPoints: 0, maxPoints: 3, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
    ]
    const route = selectRescueRoute(evaluateSkillEvidence(atoms), 4)
    expect(route).toEqual(['felicitare'])
  })

  it('A: several skills with positive credit — route ranks and selects normally', () => {
    const atoms = [
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'eseu-volum', earnedPoints: 1, maxPoints: 4, reviewStatus: 'partial' }),
    ]
    const route = selectRescueRoute(evaluateSkillEvidence(atoms), 12)
    expect(route.length).toBeGreaterThan(0)
    expect(route.every((t) => ['transformare-gramaticala', 'felicitare', 'eseu-volum'].includes(t))).toBe(true)
  })

  it('B: a mixed multi-atom skill (one zero sub-criterion + one scored) stays eligible', () => {
    const atoms = [
      atom({ skillTag: 'dialog', subCriterionId: 'lexic', earnedPoints: 2, maxPoints: 2, reviewStatus: 'correct' }),
      atom({ skillTag: 'dialog', subCriterionId: 'replici', earnedPoints: 0, maxPoints: 4, reviewStatus: 'incorrect' }),
    ]
    const ev = evaluateSkillEvidence(atoms)
    expect(ev.find((e) => e.skillTag === 'dialog')!.earnedPoints).toBe(2)
    expect(selectRescueRoute(ev, 12)).toContain('dialog')
  })

  it('C: an all-zero multi-atom skill is not route-eligible', () => {
    const atoms = [
      atom({ skillTag: 'dialog', subCriterionId: 'lexic', earnedPoints: 0, maxPoints: 2, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'dialog', subCriterionId: 'replici', earnedPoints: 0, maxPoints: 4, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'felicitare', earnedPoints: 3, maxPoints: 5, reviewStatus: 'partial' }),
    ]
    const route = selectRescueRoute(evaluateSkillEvidence(atoms), 10)
    expect(route).not.toContain('dialog')
    expect(route).toEqual(['felicitare'])
  })

  it('D: near-pass profile with all demonstrated skills is unchanged (greedy stop at safetyTarget)', () => {
    const atoms = [
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'eseu-volum', earnedPoints: 1, maxPoints: 4, reviewStatus: 'partial' }),
      atom({ skillTag: 'dialog', earnedPoints: 2, maxPoints: 6, reviewStatus: 'partial' }),
    ]
    const route = selectRescueRoute(evaluateSkillEvidence(atoms), 15)
    expect(route).toEqual(['transformare-gramaticala', 'felicitare', 'eseu-volum'])
  })

  it('E: a student already at safetyTarget still gets an empty route, even with demonstrated recoverable skills', () => {
    const atoms = [atom({ skillTag: 'felicitare', earnedPoints: 3, maxPoints: 5, reviewStatus: 'partial' })]
    expect(selectRescueRoute(evaluateSkillEvidence(atoms), 18)).toEqual([])
  })

  it('F: the route is still capped at maxRescueSkills (4) with more demonstrated recoverable skills', () => {
    const tags = [
      'completare-text', 'transformare-gramaticala', 'felicitare', 'dialog', 'intrebari-directe', 'eseu-repere',
    ] as const
    const atoms = tags.map((t) => atom({ skillTag: t, earnedPoints: 1, maxPoints: 5, reviewStatus: 'partial' }))
    expect(selectRescueRoute(evaluateSkillEvidence(atoms), 3).length).toBe(4)
  })

  it('G: a single demonstrated skill is a valid route — no hard minimum is introduced', () => {
    const atoms = [
      atom({ skillTag: 'felicitare', earnedPoints: 3, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 0, maxPoints: 5, reviewStatus: 'incorrect' }),
    ]
    expect(selectRescueRoute(evaluateSkillEvidence(atoms), 16)).toEqual(['felicitare'])
  })

  // §4: a zero-point skill is out of the ROUTE regardless of HOW it scored zero —
  // blank open (self / needs_review), blank short (deterministic / incorrect), or
  // a nonblank attempt (incorrect). Internal diagnostic state may still differ.
  it('excludes every zero-point form from the route (blank-open, blank-short, nonblank-attempt)', () => {
    const atoms = [
      atom({ skillTag: 'dialog', earnedPoints: 0, maxPoints: 6, errorType: 'blank', reviewStatus: 'needs_review', gradingConfidence: 0.5 }),
      atom({ skillTag: 'sinonime-antonime', earnedPoints: 0, maxPoints: 4, errorType: 'blank', reviewStatus: 'incorrect', gradingConfidence: 1 }),
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 0, maxPoints: 5, errorType: 'unknown', reviewStatus: 'incorrect', gradingConfidence: 1 }),
      atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
    ]
    expect(selectRescueRoute(evaluateSkillEvidence(atoms), 6)).toEqual(['felicitare'])
  })
})

// P1-2: the engine now takes an optional `config` (default RESCUE_CONFIG) so a
// perturbed copy can be passed for sensitivity analysis. Production/default
// behaviour must be byte-for-byte unchanged.
describe('selectRescueRoute / evaluateSkillEvidence — optional config is default-compatible', () => {
  const scenarios: ScoringAtom[][] = [
    [atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' })],
    [
      atom({ skillTag: 'transformare-gramaticala', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'felicitare', earnedPoints: 2, maxPoints: 5, reviewStatus: 'partial' }),
      atom({ skillTag: 'eseu-volum', earnedPoints: 1, maxPoints: 4, reviewStatus: 'partial' }),
      atom({ skillTag: 'dialog', earnedPoints: 0, maxPoints: 6, reviewStatus: 'incorrect' }),
    ],
    [
      atom({ skillTag: 'portret-caracterizare', earnedPoints: 0, maxPoints: 3, reviewStatus: 'incorrect' }),
      atom({ skillTag: 'sinonime-antonime', earnedPoints: 1, maxPoints: 4, reviewStatus: 'partial', gradingConfidence: 1 }),
      atom({ skillTag: 'corectitudine', earnedPoints: 3, maxPoints: 7, reviewStatus: 'needs_review', gradingConfidence: 0.5 }),
    ],
  ]

  it('evaluateSkillEvidence: no-arg === explicit RESCUE_CONFIG', () => {
    for (const atoms of scenarios) {
      expect(evaluateSkillEvidence(atoms)).toEqual(evaluateSkillEvidence(atoms, [], RESCUE_CONFIG))
    }
  })

  it('selectRescueRoute: no-arg === explicit RESCUE_CONFIG, across scores', () => {
    for (const atoms of scenarios) {
      const ev = evaluateSkillEvidence(atoms)
      for (const score of [0, 5, 10, 14, 17, 18, 25]) {
        expect(selectRescueRoute(ev, score)).toEqual(selectRescueRoute(ev, score, RESCUE_CONFIG))
      }
    }
  })

  it('pins the pre-P1-2 default routes for a representative near-pass profile', () => {
    const atoms = scenarios[1]!
    const ev = evaluateSkillEvidence(atoms)
    // felicitare/transformare are an exact priority tie -> doc order (transformare first);
    // dialog has 0 earned -> gated out; eseu-volum third; greedy stop at safetyTarget.
    expect(selectRescueRoute(ev, 16)).toEqual(['transformare-gramaticala', 'felicitare'])
    expect(selectRescueRoute(ev, 15)).toEqual(['transformare-gramaticala', 'felicitare', 'eseu-volum'])
    expect(selectRescueRoute(ev, 18)).toEqual([])
  })
})

function drillResult(awarded: number, max: number, mode: BaremResult['mode'] = 'llm'): BaremResult {
  return { itemId: 'd', perCriterion: [{ id: 'd', awarded, max, comment: '' }], awarded, max, advice: '', mode }
}

describe('computeForecast', () => {
  it('never adds drill points directly to the official score', () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'felicitare', lostPoints: 3, drillResults: [drillResult(5, 5), drillResult(5, 5)] },
    ])
    // Even with perfect drills, gain is capped by lostPoints (3), not the drill's own scale.
    expect(forecast.confirmedGain).toBeLessThanOrEqual(3)
    expect(forecast.potentialGain).toBeLessThanOrEqual(3)
  })

  it("confirmedGain and potentialGain never exceed that skill's lostPoints", () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'dialog', lostPoints: 1, drillResults: [drillResult(6, 6), drillResult(6, 6), drillResult(6, 6)] },
    ])
    expect(forecast.confirmedGain).toBeLessThanOrEqual(1)
    expect(forecast.potentialGain).toBeLessThanOrEqual(1)
  })

  it('no drills yet => zero gain, forecast equals officialScore', () => {
    const forecast = computeForecast(10, 50, [{ skillTag: 'felicitare', lostPoints: 3, drillResults: [] }])
    expect(forecast.confirmedGain).toBe(0)
    expect(forecast.potentialGain).toBe(0)
    expect(forecast.conservativeForecast).toBe(10)
    expect(forecast.expectedForecast).toBe(10)
  })

  it('forecast never exceeds the paper max, even summed across many strong skills', () => {
    const perSkill = (['felicitare', 'dialog', 'intrebari-directe', 'concluzii'] as const).map((skillTag) => ({
      skillTag,
      lostPoints: 20,
      drillResults: [drillResult(6, 6), drillResult(6, 6)],
    }))
    const forecast = computeForecast(45, 50, perSkill)
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(50)
    expect(forecast.expectedForecast).toBeLessThanOrEqual(50)
  })

  it('confirmedForecast is always <= expectedForecast', () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'felicitare', lostPoints: 3, drillResults: [drillResult(2, 5), drillResult(4, 5)] },
    ])
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(forecast.expectedForecast)
  })

  it('officialScore field is the untouched diagnostic score', () => {
    const forecast = computeForecast(10, 50, [])
    expect(forecast.officialScore).toBe(10)
  })
})
