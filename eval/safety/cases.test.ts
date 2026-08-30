/**
 * Pins the committed benchmark case files against the real pipeline. No packs
 * needed — these run in CI before the deterministic seed step.
 *
 *  - every citation fixture still matches `citationCheck` exactly (a pipeline
 *    change that moves a value breaks this loudly);
 *  - the refusal cases are well-formed.
 *
 * Characterization pins, not a pass/fail gate on refusal behaviour.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkCitationFixture, loadCitationFixtures } from './harness'
import type { RefusalCase } from '../types'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('citation-fixtures.json', () => {
  it('has 13 synthetic fixtures with unique ids', async () => {
    const fx = await loadCitationFixtures()
    expect(fx).toHaveLength(13)
    expect(new Set(fx.map((f) => f.id)).size).toBe(13)
    expect(fx.every((f) => f.source === 'synthetic')).toBe(true)
  })

  it('every fixture matches citationCheck exactly', async () => {
    const fx = await loadCitationFixtures()
    const failures = fx.map(checkCitationFixture).filter((r) => !r.pass)
    expect(failures).toEqual([])
  })
})

describe('refusal-cases.json', () => {
  it('has 13 synthetic cases with unique ids and known categories', async () => {
    const cases = JSON.parse(
      await readFile(join(HERE, 'refusal-cases.json'), 'utf8'),
    ) as RefusalCase[]
    expect(cases).toHaveLength(13)
    expect(new Set(cases.map((c) => c.id)).size).toBe(13)
    for (const c of cases)
      expect([
        'no-evidence',
        'weak-partial',
        'within-subject-unsupported-near-match',
        'over-refusal-guard',
      ]).toContain(c.category)
    // over-refusal guards are the only should-answer cases
    for (const c of cases) expect(c.shouldRefuse).toBe(c.category !== 'over-refusal-guard')
    expect(cases.every((c) => c.source === 'synthetic' && c.rationale.length > 0)).toBe(true)
  })
})
