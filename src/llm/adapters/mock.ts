import type { ChatRequest, ChatResponse, LLMAdapter, LLMProviderConfig } from '../types'
import { PROVIDER_PRESETS } from '../presets'

const CITATION_RE = /\[#([^\]]+)\]/g

/**
 * Offline, deterministic adapter for demos, tests and the "no LLM" path.
 * It does not invent content: it reflects the grounded context it was given,
 * cites the chunk ids embedded as `[#chunkId]`, and refuses when none are
 * present — mirroring the grounding contract real providers must follow.
 */
export class MockAdapter implements LLMAdapter {
  readonly config: LLMProviderConfig
  constructor(config: LLMProviderConfig = PROVIDER_PRESETS.mock as LLMProviderConfig) {
    this.config = config
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now()
    const userMsg = [...request.messages].reverse().find((m) => m.role === 'user')
    const systemMsg = request.messages.find((m) => m.role === 'system')?.content ?? ''
    // Scan ONLY the user message (which holds the retrieved CONTEXT block with
    // real [#id] markers). The system prompt contains a literal "[#id]" example
    // that must not be mistaken for a real citation.
    const context = userMsg?.content ?? ''

    // Offline barem-grading demonstration: when asked (in JSON mode) to grade an
    // answer by barem, return a deterministic, transparent pseudo-score so the
    // whole diagnose → rubric → Rescue flow works with no paid call. This is NOT
    // a model judgement — `examGraderService` stamps the structured `demo: true`
    // flag and the UI shows it as a demonstration.
    if (request.jsonMode === true && /evaluator de examen/i.test(systemMsg)) {
      const content = gradeBaremDeterministically(context)
      return {
        content,
        usage: { tokensIn: estimateTokens(context), tokensOut: estimateTokens(content) },
        latencyMs: Date.now() - start,
        provider: this.config.id,
        model: this.config.model,
      }
    }

    const chunkIds = Array.from(context.matchAll(CITATION_RE), (m) => m[1]).filter(
      (id): id is string => Boolean(id),
    )
    const content =
      chunkIds.length === 0
        ? 'Локальные материалы не содержат достаточно информации, чтобы ответить на этот вопрос. Попробуйте переформулировать или выбрать другую тему.'
        : buildGroundedAnswer(userMsg?.content ?? '', chunkIds)

    return {
      content,
      usage: {
        tokensIn: estimateTokens(context),
        tokensOut: estimateTokens(content),
      },
      latencyMs: Date.now() - start,
      provider: this.config.id,
      model: this.config.model,
    }
  }
}

const DEMO_COMMENT = '[DEMO] Детерминированная демонстрация — не оценка модели.'
const DEMO_ADVICE =
  '[DEMO] Это офлайн-демонстрация рабочего процесса. Настоящую проверку по баремуу выполняет преподаватель или выбранная вами языковая модель.'

/**
 * Deterministic, transparent pseudo-grading for the offline demo. Reads the
 * criterion slots (`- "<id>" (max N): ...`) and the student answer
 * (`RĂSPUNSUL ELEVULUI:`) straight out of the barem prompt, then awards points
 * purely from answer length — no model, no calibration. Same input → same JSON.
 */
function gradeBaremDeterministically(userContent: string): string {
  const slots = Array.from(userContent.matchAll(/^- "([^"]+)" \(max (\d+)\):/gm), (m) => ({
    id: m[1] as string,
    max: Number(m[2]),
  }))
  const answerBlock = userContent.split('RĂSPUNSUL ELEVULUI:\n')[1] ?? ''
  const answer = (answerBlock.split('\n\nEvaluează')[0] ?? '').trim()
  const clean = answer === '(gol)' ? '' : answer
  const len = clean.length

  const perCriterion = (slots.length > 0 ? slots : [{ id: 'total', max: 1 }]).map((slot) => {
    const ratio = Math.min(1, len / 220)
    const floor = clean.length > 0 ? 1 : 0
    const awarded = Math.max(floor, Math.min(slot.max, Math.round(ratio * slot.max)))
    return { id: slot.id, awarded, comment: DEMO_COMMENT }
  })
  return JSON.stringify({ perCriterion, advice: DEMO_ADVICE })
}

function buildGroundedAnswer(question: string, chunkIds: string[]): string {
  const cites = chunkIds.map((id) => `[#${id}]`).join(' ')
  const focus = question.trim().slice(0, 160)
  return [
    'Опираясь на материалы из локальной базы:',
    focus
      ? `по вопросу «${focus}» источники описывают ключевые правила и примеры.`
      : 'источники описывают ключевые правила и примеры по теме.',
    '',
    'Подсказка: сначала вспомните правило, затем проверьте ответ примером.',
    '',
    `Источники: ${cites}`,
  ].join('\n')
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}
