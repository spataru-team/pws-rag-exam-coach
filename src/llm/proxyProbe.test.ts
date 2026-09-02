import { describe, it, expect, vi } from 'vitest'
import { checkProxyCapability, pickInitialProviderId } from './proxyProbe'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const UNAVAILABLE = { available: false, embeddingsConfigured: false, chatConfigured: false }

describe('checkProxyCapability', () => {
  it('reports both capabilities independently from a healthy proxy', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ available: true, embeddingsConfigured: true, chatConfigured: true }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: true,
      embeddingsConfigured: true,
      chatConfigured: true,
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/health', expect.anything())
  })

  it('reports embeddings-only (the public deployment): embeddingsConfigured true, chatConfigured false', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ available: true, embeddingsConfigured: true, chatConfigured: false }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: true,
      embeddingsConfigured: true,
      chatConfigured: false,
    })
  })

  it('never infers chatConfigured from embeddingsConfigured — an absent chat flag stays false', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ available: true, embeddingsConfigured: true }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: true,
      embeddingsConfigured: true,
      chatConfigured: false,
    })
  })

  it('treats the Vite SPA fallback (200 text/html) as not available', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual(UNAVAILABLE)
  })

  it('treats a 404 (no Function) as not available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual(UNAVAILABLE)
  })

  it('treats a network error / timeout as not available', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('AbortError'))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual(UNAVAILABLE)
  })

  it('treats malformed JSON as not available', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual(UNAVAILABLE)
  })

  it('never invokes a completion endpoint (only /health is fetched)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ available: true, embeddingsConfigured: true, chatConfigured: true }))
    await checkProxyCapability('/api/v1/health', 500, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = fetchImpl.mock.calls[0]![0] as string
    expect(url).toContain('/health')
    expect(url).not.toContain('chat/completions')
  })
})

describe('pickInitialProviderId', () => {
  it('always returns mock — managed chat is never auto-selected, regardless of capability', () => {
    expect(pickInitialProviderId({ available: true, embeddingsConfigured: true, chatConfigured: true })).toBe('mock')
    expect(pickInitialProviderId({ available: true, embeddingsConfigured: true, chatConfigured: false })).toBe('mock')
    expect(pickInitialProviderId(UNAVAILABLE)).toBe('mock')
  })
})
