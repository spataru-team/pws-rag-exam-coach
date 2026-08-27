import type { ChatRequest, ChatResponse, LLMAdapter, LLMProviderConfig } from '../types'

/**
 * One adapter for every OpenAI-compatible chat endpoint: OpenAI, OpenRouter,
 * LM Studio and Ollama all expose POST {baseUrl}/chat/completions. Differences
 * (auth header, json mode) are driven by config, not branched code.
 */
export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly config: LLMProviderConfig
  constructor(config: LLMProviderConfig) {
    this.config = config
  }

  async chat(request: ChatRequest, apiKey?: string): Promise<ChatResponse> {
    const start = Date.now()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.apiKeyMode === 'user_key') {
      if (!apiKey) throw new Error(`${this.config.name}: API key required`)
      headers.Authorization = `Bearer ${apiKey}`
    }
    // OpenRouter recommends these attribution headers; harmless elsewhere.
    if (this.config.kind === 'openrouter') {
      headers['HTTP-Referer'] = 'https://pws-rag-exam-coach.local'
      headers['X-Title'] = 'PWS RAG Exam Coach'
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
    }
    if (request.maxTokens) body.max_tokens = request.maxTokens
    if (request.jsonMode && this.config.supportsJsonMode) {
      body.response_format = { type: 'json_object' }
    }
    // Qwen3 (the OVMS chat model, see ovms/README.md) defaults to an internal
    // "thinking" pass that both eats the output-token budget and roughly
    // doubles latency (measured: 12s/finish_reason=length vs 6s/finish_reason=
    // stop for the same Russian question) — and the <think>…</think> text
    // lands in `content` unfiltered, which would corrupt barem-grading JSON
    // parsing and confuse a tutor answer. Harmless on backends that don't
    // recognize the field.
    if (this.config.kind === 'openvino') {
      body.chat_template_kwargs = { enable_thinking: false }
    }

    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`${this.config.name}: HTTP ${res.status} ${await safeText(res)}`)
    }

    const data = (await res.json()) as OpenAIChatResponse
    const content = data.choices?.[0]?.message?.content ?? ''
    return {
      content,
      usage: {
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
      provider: this.config.id,
      model: this.config.model,
    }
  }
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200)
  } catch {
    return ''
  }
}
