import { describe, it, expect, vi } from 'vitest'
import type { ExamItem } from '@/types'

// The offline demonstration path: a `kind: 'mock'` provider. The real
// MockAdapter returns a deterministic barem JSON body; here we stub `chat` with
// an equivalent so the test does not depend on its exact numbers.
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return {
    ...actual,
    createAdapter: (config: unknown) => ({
      config,
      chat: async () => ({
        content: JSON.stringify({
          perCriterion: [{ id: 'pr26-3', awarded: 1, comment: '[DEMO] demonstration' }],
          advice: '[DEMO] offline',
        }),
        usage: { tokensIn: 1, tokensOut: 1 },
        latencyMs: 1,
        provider: 'mock',
        model: 'mock-grounded',
      }),
    }),
  }
})

const { gradeItem } = await import('./examGraderService')
const { PROVIDER_PRESETS } = await import('@/llm')
const { isDemoResult } = await import('@/learning/demoProvenance')

const openItem: ExamItem = {
  id: 'pr26-3', order: 3, type: 'open', maxPoints: 2,
  prompt: 'Scrie două enunțuri', baremRule: '1 p. per enunț',
}
const shortItem: ExamItem = {
  id: 'pr26-2', order: 2, type: 'short', maxPoints: 4,
  prompt: 'x', baremRule: 'y', acceptedAnswers: ['fals', 'slab'],
}

describe('gradeItem — offline demonstration provenance', () => {
  it('stamps the structured demo flag on an open item graded by a mock-kind provider', async () => {
    const r = await gradeItem(openItem, 'Un răspuns oarecare, suficient de lung pentru a conta.', {
      supportLanguage: 'ru',
      providerConfig: PROVIDER_PRESETS.mock,
    })
    expect(isDemoResult(r)).toBe(true)
  })

  it('keeps mode mechanistic (never a "demo" value) so the Rescue engine still produces a route', async () => {
    const r = await gradeItem(openItem, 'ceva', { supportLanguage: 'ru', providerConfig: PROVIDER_PRESETS.mock })
    expect(r.mode).not.toBe('demo')
    expect(['llm', 'hybrid', 'deterministic']).toContain(r.mode)
  })

  it('does NOT mark deterministic short grading as demo (that scoring is genuine)', async () => {
    const r = await gradeItem(shortItem, 'fals\nslab', {
      supportLanguage: 'ru',
      providerConfig: PROVIDER_PRESETS.mock,
    })
    expect(isDemoResult(r)).toBe(false)
    expect(r.mode).toBe('deterministic')
  })

  it('does NOT mark a blank-answer self result as demo (no grader ran at all)', async () => {
    const r = await gradeItem(openItem, '   ', {
      supportLanguage: 'ru',
      providerConfig: PROVIDER_PRESETS.mock,
    })
    expect(isDemoResult(r)).toBe(false)
  })
})
