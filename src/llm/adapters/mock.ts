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
    // Scan ONLY the user message (which holds the retrieved CONTEXT block with
    // real [#id] markers). The system prompt contains a literal "[#id]" example
    // that must not be mistaken for a real citation.
    const context = userMsg?.content ?? ''

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
