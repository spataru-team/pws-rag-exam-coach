import { describe, it, expect } from 'vitest'
import { validateProviderConfig, isCloudProvider } from './validation'
import { PROVIDER_PRESETS } from './presets'
import type { LLMProviderConfig } from './types'

describe('validateProviderConfig', () => {
  it('accepts the mock preset without a base url', () => {
    const r = validateProviderConfig(PROVIDER_PRESETS.mock as LLMProviderConfig)
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('accepts a valid local Ollama preset with no cloud warning', () => {
    const r = validateProviderConfig(PROVIDER_PRESETS.ollama as LLMProviderConfig)
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.includes('Cloud'))).toBe(false)
  })

  it('accepts the local OpenVINO (OVMS) preset with no key or cloud warning', () => {
    const cfg = PROVIDER_PRESETS.openvino as LLMProviderConfig
    const r = validateProviderConfig(cfg)
    expect(cfg.kind).toBe('openvino')
    expect(cfg.locality).toBe('local')
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('warns about cloud data egress for cloud providers', () => {
    const r = validateProviderConfig(
      PROVIDER_PRESETS.openai as LLMProviderConfig,
      'sk-test',
    )
    expect(isCloudProvider(PROVIDER_PRESETS.openai as LLMProviderConfig)).toBe(true)
    expect(r.warnings.some((w) => w.toLowerCase().includes('external service'))).toBe(true)
  })

  it('warns when a user_key provider has no key', () => {
    const r = validateProviderConfig(PROVIDER_PRESETS.openrouter as LLMProviderConfig)
    expect(r.warnings.some((w) => w.includes('API key'))).toBe(true)
  })

  it('rejects an invalid base url', () => {
    const bad: LLMProviderConfig = {
      ...(PROVIDER_PRESETS.ollama as LLMProviderConfig),
      baseUrl: 'localhost:11434',
    }
    const r = validateProviderConfig(bad)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('Base URL'))).toBe(true)
  })

  it('rejects a config missing a model', () => {
    const bad: LLMProviderConfig = {
      ...(PROVIDER_PRESETS.ollama as LLMProviderConfig),
      model: '',
    }
    expect(validateProviderConfig(bad).valid).toBe(false)
  })

  it('accepts a same-origin relative baseUrl (worker proxy preset)', () => {
    const result = validateProviderConfig(PROVIDER_PRESETS.worker as LLMProviderConfig)
    expect(result.errors).toEqual([])
  })
})
