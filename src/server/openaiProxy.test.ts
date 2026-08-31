import { describe, it, expect, vi } from 'vitest'
import { handleOpenAiProxy } from './openaiProxy'

function req(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.pages.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
const env = { OPENAI_API_KEY: 'sk-test', CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'cf-test' }
const okFetch = () =>
  vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

describe('handleOpenAiProxy', () => {
  it('routes embeddings to Workers AI (bge-m3), strips client dimensions, and auths with CF_API_TOKEN', async () => {
    const fetchMock = okFetch()
    const res = await handleOpenAiProxy(
      req('/api/v1/embeddings', { model: 'evil', input: 'hi', dimensions: 42 }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(200)
    const [target, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/embeddings')
    const sent = JSON.parse(opts.body as string)
    expect(sent.model).toBe('@cf/baai/bge-m3')
    expect('dimensions' in sent).toBe(false)
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer cf-test')
  })

  it('routes chat to OpenAI and auths with OPENAI_API_KEY', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-mini', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [target, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe('https://api.openai.com/v1/chat/completions')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('coerces an unknown chat model to the default', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-4o', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string).model).toBe('gpt-5.4-mini')
  })

  it('keeps an allowlisted chat model', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-nano', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string).model).toBe('gpt-5.4-nano')
  })

  it('rejects a foreign Origin without calling upstream', async () => {
    const fetchMock = okFetch()
    const res = await handleOpenAiProxy(
      req('/api/v1/embeddings', {}, { Origin: 'https://evil.com' }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('500s the embeddings branch when CF_ACCOUNT_ID/CF_API_TOKEN are missing, even if OPENAI_API_KEY is set', async () => {
    const res = await handleOpenAiProxy(
      req('/api/v1/embeddings', {}),
      { OPENAI_API_KEY: 'sk-test' },
      { fetch: vi.fn() },
    )
    expect(res.status).toBe(500)
  })

  it('503s the chat branch when managed chat is not enabled (no OPENAI_API_KEY) — the intended public-demo state, not an error', async () => {
    const fetchMock = vi.fn()
    const res = await handleOpenAiProxy(
      req('/api/v1/chat/completions', { messages: [] }),
      { CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'cf-test' },
      { fetch: fetchMock },
    )
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/not enabled/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversize request body with 413 before parsing or calling upstream', async () => {
    const fetchMock = vi.fn()
    const huge = 'x'.repeat(33 * 1024)
    const res = await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-mini', messages: [{ role: 'user', content: huge }] }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 504 when the upstream call times out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    )
    const res = await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-mini', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(504)
  })

  it('never logs headers, Origin, CF-Connecting-IP, the request body, or the upstream body', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"secret-upstream":"leak"}', { status: 200 }))
    await handleOpenAiProxy(
      req(
        '/api/v1/chat/completions',
        { model: 'gpt-5.4-mini', messages: [{ role: 'user', content: 'PRIVATE-ANSWER-TEXT' }] },
        { 'CF-Connecting-IP': '203.0.113.7', Origin: 'https://app.pages.dev' },
      ),
      env,
      { fetch: fetchMock },
    )
    const logged = spies.flatMap((s) => s.mock.calls.flat()).join(' ')
    expect(logged).not.toMatch(/PRIVATE-ANSWER-TEXT|203\.0\.113\.7|secret-upstream|sk-test|cf-test/)
    spies.forEach((s) => s.mockRestore())
  })

  it('404s unknown paths', async () => {
    const res = await handleOpenAiProxy(req('/api/v1/nope', {}), env, { fetch: vi.fn() })
    expect(res.status).toBe(404)
  })

  describe('GET /api/v1/health (non-generative capability probe)', () => {
    const get = () => new Request('https://app.pages.dev/api/v1/health', { method: 'GET' })

    it('reports the two capabilities independently when both are configured, without calling upstream', async () => {
      const fetchMock = vi.fn()
      const res = await handleOpenAiProxy(get(), env, { fetch: fetchMock })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        available: true,
        embeddingsConfigured: true,
        chatConfigured: true,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('reports chatConfigured:false but embeddingsConfigured:true on the embeddings-only public deployment', async () => {
      const res = await handleOpenAiProxy(get(), { CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 'b' }, { fetch: vi.fn() })
      expect(await res.json()).toEqual({
        available: true,
        embeddingsConfigured: true,
        chatConfigured: false,
      })
    })

    it('reports embeddingsConfigured:false when the CF secrets are absent', async () => {
      const res = await handleOpenAiProxy(get(), { OPENAI_API_KEY: 'sk-test' }, { fetch: vi.fn() })
      expect(await res.json()).toEqual({
        available: true,
        embeddingsConfigured: false,
        chatConfigured: true,
      })
    })

    it('no longer emits the ambiguous flat `configured` field', async () => {
      const res = await handleOpenAiProxy(get(), env, { fetch: vi.fn() })
      expect('configured' in (await res.json())).toBe(false)
    })

    it('never echoes a secret value', async () => {
      const res = await handleOpenAiProxy(get(), env, { fetch: vi.fn() })
      const text = await res.text()
      expect(text).not.toContain('sk-test')
      expect(text).not.toContain('cf-test')
      expect(text).not.toContain('acct-1')
    })
  })

  it('maps capped output to max_completion_tokens (GPT-5.x), strips max_tokens/stream, caps n=1', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', {
        model: 'gpt-5.4-mini', messages: [], max_tokens: 9999, stream: true, n: 5,
      }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(opts.body as string)
    expect(sent.max_completion_tokens).toBe(512)
    expect('max_tokens' in sent).toBe(false)
    expect('stream' in sent).toBe(false)
    expect(sent.n).toBe(1)
  })

  it('defaults max_completion_tokens to 512 when unset', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-mini', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(opts.body as string)
    expect(sent.max_completion_tokens).toBe(512)
    expect('max_tokens' in sent).toBe(false)
  })

  it('routes rerank to Workers AI bge-reranker-base, reshaping documents->contexts and auths with CF_API_TOKEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { response: [{ index: 1, score: 0.9 }] } }), {
        status: 200,
      }),
    )
    const res = await handleOpenAiProxy(
      req('/api/v1/rerank', { model: 'ignored', query: 'q', documents: ['a', 'b'] }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(200)
    const [target, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/@cf/baai/bge-reranker-base',
    )
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer cf-test')
    const sent = JSON.parse(opts.body as string)
    expect(sent).toEqual({ query: 'q', contexts: [{ text: 'a' }, { text: 'b' }] })
    const outBody = await res.json()
    expect(outBody).toEqual({ results: [{ index: 1, relevance_score: 0.9 }] })
  })

  it('parses the real Workers AI response shape (id, not index)', async () => {
    // Verified against the live endpoint: Cloudflare's run API returns
    // {id, score}, not the {index, score} the original code (written from
    // docs, never hit live) assumed — that mismatch silently 502'd every
    // real rerank call. Regression test for that exact bug.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ result: { response: [{ id: 1, score: 0.6 }, { id: 0, score: 0.4 }] } }),
        { status: 200 },
      ),
    )
    const res = await handleOpenAiProxy(
      req('/api/v1/rerank', { model: 'ignored', query: 'q', documents: ['a', 'b'] }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(200)
    const outBody = await res.json()
    expect(outBody).toEqual({
      results: [{ index: 1, relevance_score: 0.6 }, { index: 0, relevance_score: 0.4 }],
    })
  })

  it('500s the rerank branch when CF secrets are missing', async () => {
    const res = await handleOpenAiProxy(
      req('/api/v1/rerank', { query: 'q', documents: [] }),
      { OPENAI_API_KEY: 'sk-test' },
      { fetch: vi.fn() },
    )
    expect(res.status).toBe(500)
  })

  it('502s rerank when the upstream envelope is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"unexpected":true}', { status: 200 }))
    const res = await handleOpenAiProxy(
      req('/api/v1/rerank', { query: 'q', documents: ['a'] }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(502)
  })
})
