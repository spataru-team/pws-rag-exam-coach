import { describe, it, expect, vi } from 'vitest'
import { checkProxyCapability, pickInitialProviderId } from './proxyProbe'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('checkProxyCapability', () => {
  it('reports available + configured from a healthy proxy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ available: true, configured: true }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: true,
      configured: true,
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/health', expect.anything())
  })

  it('reports available but NOT configured when the proxy route exists without a key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ available: true, configured: false }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: true,
      configured: false,
    })
  })

  it('treats the Vite SPA fallback (200 text/html) as not available', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: false,
      configured: false,
    })
  })

  it('treats a 404 (no Function) as not available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: false,
      configured: false,
    })
  })

  it('treats a network error / timeout as not available', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('AbortError'))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: false,
      configured: false,
    })
  })

  it('treats malformed JSON as not available', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(await checkProxyCapability('/api/v1/health', 500, fetchImpl)).toEqual({
      available: false,
      configured: false,
    })
  })

  it('never invokes a completion endpoint (only /health is fetched)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ available: true, configured: true }))
    await checkProxyCapability('/api/v1/health', 500, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = fetchImpl.mock.calls[0]![0] as string
    expect(url).toContain('/health')
    expect(url).not.toContain('chat/completions')
  })
})

describe('pickInitialProviderId', () => {
  it('picks worker ONLY when a configured proxy is available', () => {
    expect(pickInitialProviderId({ available: true, configured: true })).toBe('worker')
  })
  it('stays on mock when the proxy route exists but is not configured', () => {
    expect(pickInitialProviderId({ available: true, configured: false })).toBe('mock')
  })
  it('stays on mock when no proxy route exists (npm run dev / preview)', () => {
    expect(pickInitialProviderId({ available: false, configured: false })).toBe('mock')
  })
})
