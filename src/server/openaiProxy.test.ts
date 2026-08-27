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

  it('500s the chat branch when OPENAI_API_KEY is missing, even if the CF embeddings secrets are set', async () => {
    const res = await handleOpenAiProxy(
      req('/api/v1/chat/completions', { messages: [] }),
      { CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'cf-test' },
      { fetch: vi.fn() },
    )
    expect(res.status).toBe(500)
  })

  it('404s unknown paths', async () => {
    const res = await handleOpenAiProxy(req('/api/v1/nope', {}), env, { fetch: vi.fn() })
    expect(res.status).toBe(404)
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
