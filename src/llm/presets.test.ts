import { describe, it, expect } from 'vitest'
import { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID, visibleProviderIds } from './presets'
import type { ProxyCapability } from './proxyProbe'

describe('DEFAULT_PROVIDER_ID', () => {
  it('is mock — the zero-setup default for every run mode, deployed site included', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('mock')
    expect(PROVIDER_PRESETS.mock).toBeDefined()
  })
})

describe('worker preset (managed chat — kept for controlled private deployments)', () => {
  it('still exists and proxies to the same-origin /api/v1', () => {
    const w = PROVIDER_PRESETS.worker!
    expect(w).toBeDefined()
    expect(w.kind).toBe('openai')
    expect(w.apiKeyMode).toBe('proxy')
    expect(w.baseUrl).toBe('/api/v1')
    expect(w.locality).toBe('cloud')
  })
})

describe('visibleProviderIds', () => {
  const base: ProxyCapability = { available: false, embeddingsConfigured: false, chatConfigured: false }

  it('hides worker when managed chat is not configured (the public deployment)', () => {
    const ids = visibleProviderIds({ ...base, available: true, embeddingsConfigured: true })
    expect(ids).not.toContain('worker')
  })

  it('shows worker only when chatConfigured is true', () => {
    const ids = visibleProviderIds({ ...base, available: true, embeddingsConfigured: true, chatConfigured: true })
    expect(ids).toContain('worker')
  })

  it('does not infer worker visibility from embeddingsConfigured', () => {
    const ids = visibleProviderIds({ available: true, embeddingsConfigured: true, chatConfigured: false })
    expect(ids).not.toContain('worker')
  })

  it('always offers mock, the local providers and the BYOK cloud providers', () => {
    for (const cap of [base, { ...base, chatConfigured: true }]) {
      const ids = visibleProviderIds(cap)
      expect(ids).toEqual(expect.arrayContaining(['mock', 'openvino', 'ollama', 'lmstudio', 'openai', 'openrouter']))
    }
  })

  it('lists mock first', () => {
    expect(visibleProviderIds(base)[0]).toBe('mock')
  })

  it('only ever returns known preset ids', () => {
    const ids = visibleProviderIds({ ...base, chatConfigured: true })
    ids.forEach((id) => expect(PROVIDER_PRESETS[id]).toBeDefined())
  })
})
