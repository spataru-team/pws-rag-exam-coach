import { describe, it, expect } from 'vitest'
import { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID } from './presets'

describe('worker preset', () => {
  it('is the default and proxies to the same-origin /api/v1', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('worker')
    const w = PROVIDER_PRESETS.worker!
    expect(w).toBeDefined()
    expect(w.kind).toBe('openai')
    expect(w.apiKeyMode).toBe('proxy')
    expect(w.baseUrl).toBe('/api/v1')
    expect(w.model).toBe('gpt-5.4-mini')
    expect(w.locality).toBe('cloud')
  })
})
