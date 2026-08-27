import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAICompatibleAdapter } from './openaiCompatible'
import type { LLMProviderConfig } from '../types'

function config(overrides: Partial<LLMProviderConfig> = {}): LLMProviderConfig {
  return {
    id: 'test',
    kind: 'openai',
    name: 'Test',
    baseUrl: 'https://api.example.com/v1',
    apiKeyMode: 'none',
    model: 'test-model',
    supportsStreaming: false,
    supportsJsonMode: true,
    locality: 'cloud',
    ...overrides,
  }
}

const okResponse = () =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    }),
    { status: 200 },
  )

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('OpenAICompatibleAdapter', () => {
  it('posts to {baseUrl}/chat/completions with messages and temperature', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await new OpenAICompatibleAdapter(config()).chat({ messages: [{ role: 'user', content: 'q' }] })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const sent = JSON.parse(opts.body as string)
    expect(sent.messages).toEqual([{ role: 'user', content: 'q' }])
    expect(sent.temperature).toBe(0.2)
  })

  it('sends response_format only when jsonMode is requested AND the config supports it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await new OpenAICompatibleAdapter(config({ supportsJsonMode: false })).chat({
      messages: [],
      jsonMode: true,
    })
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect('response_format' in sent).toBe(false)
  })

  it('requires an apiKey for user_key mode and sends it as a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(config({ apiKeyMode: 'user_key' }))
    await expect(adapter.chat({ messages: [] })).rejects.toThrow('API key required')

    await adapter.chat({ messages: [] }, 'sk-test')
    const opts = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('adds OpenRouter attribution headers only for kind=openrouter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await new OpenAICompatibleAdapter(config({ kind: 'openrouter' })).chat({ messages: [] })
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['X-Title']).toBe('PWS RAG Exam Coach')
  })

  it('disables Qwen3 thinking mode for the openvino provider kind only', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse()))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await new OpenAICompatibleAdapter(config({ kind: 'openvino' })).chat({ messages: [] })
    const ovmsSent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(ovmsSent.chat_template_kwargs).toEqual({ enable_thinking: false })

    fetchMock.mockClear()
    await new OpenAICompatibleAdapter(config({ kind: 'openai' })).chat({ messages: [] })
    const openaiSent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect('chat_template_kwargs' in openaiSent).toBe(false)
  })

  it('throws with status and body snippet on a non-ok response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('server error', { status: 500 })) as unknown as typeof fetch
    await expect(new OpenAICompatibleAdapter(config()).chat({ messages: [] })).rejects.toThrow(
      /HTTP 500/,
    )
  })

  it('returns usage, latency and echoes provider/model', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse()) as unknown as typeof fetch
    const res = await new OpenAICompatibleAdapter(config()).chat({ messages: [] })
    expect(res.content).toBe('hi')
    expect(res.usage).toEqual({ tokensIn: 1, tokensOut: 2 })
    expect(res.provider).toBe('test')
    expect(res.model).toBe('test-model')
    expect(res.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
