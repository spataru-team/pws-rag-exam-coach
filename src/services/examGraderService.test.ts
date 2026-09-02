import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatRequest, ChatResponse } from '@/llm'
import type { ExamItem } from '@/types'

const chatMock = vi.fn<(request: ChatRequest, apiKey?: string) => Promise<ChatResponse>>()
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return {
    ...actual,
    // A real (non-mock) provider — this suite exercises grading/merge logic, not
    // the offline demonstration path (that is examGraderService.demo.test.ts).
    createAdapter: () => ({ config: actual.PROVIDER_PRESETS.openai, chat: chatMock }),
  }
})

const { gradeItem } = await import('./examGraderService')
const { PROVIDER_PRESETS } = await import('@/llm')
/** Deps with a real (non-mock) provider — keeps grading out of the demo path. */
const realDeps = { supportLanguage: 'ru' as const, providerConfig: PROVIDER_PRESETS.openai }

function chatResponse(content: string): ChatResponse {
  return { content, usage: { tokensIn: 1, tokensOut: 1 }, latencyMs: 1, provider: 'mock', model: 'mock' }
}

const NON_JSON_PROSE = 'Copiii se joacă în curte. Eu joc fotbal.'

beforeEach(() => {
  chatMock.mockReset()
  // Default: the same non-JSON prose the real MockAdapter returns for an
  // ungrounded question — matches this suite's original fallback-path intent
  // without depending on the real adapter's exact wording.
  chatMock.mockResolvedValue(chatResponse(NON_JSON_PROSE))
})

const shortItem: ExamItem = {
  id: 'pr26-2', order: 2, type: 'short', maxPoints: 4,
  prompt: 'x', baremRule: 'y',
  acceptedAnswers: ['fals', 'slab', 'muncitor', 'a respecta'],
}

const openItem: ExamItem = {
  id: 'pr26-3', order: 3, type: 'open', maxPoints: 2,
  prompt: 'Scrie două enunțuri', baremRule: '1 p. per enunț',
}

describe('gradeItem', () => {
  it('grades short items deterministically without an LLM', async () => {
    const r = await gradeItem(shortItem, 'fals\nslab', { supportLanguage: 'ru' })
    expect(r.mode).toBe('deterministic')
    expect(r.awarded).toBe(2)
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns a zero self result for a blank open answer', async () => {
    const r = await gradeItem(openItem, '   ', { supportLanguage: 'ru' })
    expect(r.awarded).toBe(0)
    expect(r.mode).toBe('self')
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('falls back to self-mode when the provider output is not gradeable JSON', async () => {
    const r = await gradeItem(openItem, 'Copiii se joacă în curte. Eu joc fotbal.', {
      supportLanguage: 'ru',
    })
    expect(r.mode).toBe('self')
    expect(r.max).toBe(2)
  })

  describe('hybrid items (some subCriteria deterministic, some LLM-graded)', () => {
    const hybridItem: ExamItem = {
      id: 'math-1', order: 1, type: 'open', maxPoints: 5,
      prompt: 'Compute the cone lateral surface area.', baremRule: 'see subCriteria',
      acceptedAnswers: ['9√2π', '9π√2', '9*sqrt(2)*pi'],
      subCriteria: [
        { id: 'radius', title: {}, maxPoints: 2, rule: 'finds the radius' },
        { id: 'slant', title: {}, maxPoints: 1, rule: 'finds the slant height' },
        { id: 'final', title: {}, maxPoints: 2, rule: 'final area', gradeMode: 'deterministic' },
      ],
    }

    it('skips the LLM entirely when every subCriterion is deterministic', async () => {
      const allDeterministic: ExamItem = {
        ...hybridItem,
        subCriteria: hybridItem.subCriteria!.map((c) => ({ ...c, gradeMode: 'deterministic' as const })),
        acceptedAnswers: ['9√2π'],
      }
      const r = await gradeItem(allDeterministic, '9*sqrt(2)*pi', { supportLanguage: 'ru' })
      expect(chatMock).not.toHaveBeenCalled()
      expect(r.mode).toBe('deterministic')
      expect(r.awarded).toBe(5)
    })

    it('merges deterministic credit with a successful LLM response, scoped to only the LLM slots', async () => {
      chatMock.mockResolvedValue(
        chatResponse(
          JSON.stringify({
            perCriterion: [
              { id: 'radius', awarded: 2, comment: 'ok' },
              { id: 'slant', awarded: 1, comment: 'ok' },
            ],
            advice: 'Bine.',
          }),
        ),
      )
      const r = await gradeItem(hybridItem, '9*sqrt(2)*pi', realDeps)
      expect(r.mode).toBe('hybrid')
      expect(r.awarded).toBe(5) // 2 (radius) + 1 (slant) + 2 (final, deterministic match)
      expect(r.perCriterion.find((c) => c.id === 'final')?.awarded).toBe(2)
      expect(r.perCriterion.find((c) => c.id === 'radius')?.awarded).toBe(2)
      expect(r.advice).toBe('Bine.')

      // The prompt sent to the LLM must not mention the deterministic slot.
      const sentRequest = chatMock.mock.calls[0]![0]
      const userMsg = sentRequest.messages.find((m) => m.role === 'user')!
      expect(userMsg.content).toContain('"radius"')
      expect(userMsg.content).not.toContain('"final"')
    })

    it('awards 0 for a wrong deterministic final answer even if the LLM would award full method credit', async () => {
      chatMock.mockResolvedValue(
        chatResponse(
          JSON.stringify({
            perCriterion: [
              { id: 'radius', awarded: 2, comment: 'ok' },
              { id: 'slant', awarded: 1, comment: 'ok' },
            ],
            advice: '',
          }),
        ),
      )
      const r = await gradeItem(hybridItem, '42', { supportLanguage: 'ru' })
      expect(r.perCriterion.find((c) => c.id === 'final')?.awarded).toBe(0)
      expect(r.awarded).toBe(3) // only the two LLM-graded method criteria
    })

    it('keeps the deterministic credit when the LLM call fails, instead of losing it to a whole-item self-mode', async () => {
      chatMock.mockResolvedValue(chatResponse(NON_JSON_PROSE)) // unparseable -> parseBaremCriteria throws
      const r = await gradeItem(hybridItem, '9*sqrt(2)*pi', { supportLanguage: 'ru' })
      expect(r.mode).toBe('hybrid')
      expect(r.lowConfidence).toBe(true)
      expect(r.perCriterion.find((c) => c.id === 'final')?.awarded).toBe(2) // deterministic credit survives
      expect(r.perCriterion.find((c) => c.id === 'radius')?.awarded).toBe(0) // LLM portion zeroed
      expect(r.awarded).toBe(2)
    })
  })
})
