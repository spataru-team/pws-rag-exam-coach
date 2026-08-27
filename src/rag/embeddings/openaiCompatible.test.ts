import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'

afterEach(() => vi.restoreAllMocks())

describe('OpenAICompatibleEmbeddingProvider', () => {
  it('sends `dimensions` in the request body when configured', async () => {
    const vec = Array(768).fill(0.1)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v1',
      model: 'text-embedding-3-small',
      dimensions: 768,
      apiKey: 'k',
    })
    const out = await provider.embed('hi')
    expect(out).toHaveLength(768)
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(opts.body as string)
    expect(sent.model).toBe('text-embedding-3-small')
    expect(sent.dimensions).toBe(768)
  })

  it('omits `dimensions` when not configured, and defaults expected length to DEFAULT_EMBEDDING_DIM (1024)', async () => {
    const vec = Array(1024).fill(0.2)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v1',
      model: 'bge-m3',
    })
    const out = await provider.embed('hi')
    expect(out).toHaveLength(1024)
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect('dimensions' in JSON.parse(opts.body as string)).toBe(false)
  })

  it('validates against `expectedDim` when set independently of `dimensions` (e.g. OVMS bge-m3, which ignores `dimensions`)', async () => {
    const vec = Array(1024).fill(0.3)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v3',
      model: 'bge-m3',
      expectedDim: 1024,
    })
    await expect(provider.embed('hi')).resolves.toHaveLength(1024)
  })

  it('rejects a response whose length does not match the expected dimension', async () => {
    const vec = Array(768).fill(0.1)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v3',
      model: 'bge-m3',
      expectedDim: 1024,
    })
    await expect(provider.embed('hi')).rejects.toThrow(/expected 1024 dims, got 768/)
  })
})
