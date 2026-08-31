import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProxyCapability } from '@/llm'

const checkProxyCapabilityMock = vi.fn<() => Promise<ProxyCapability>>()
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return { ...actual, checkProxyCapability: checkProxyCapabilityMock }
})

const { useAppStore } = await import('./store')
const { settingsRepo, SETTING_KEYS } = await import('@/storage')
const { PROVIDER_PRESETS } = await import('@/llm')

const EMBEDDINGS_ONLY: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: false }
const MANAGED_CHAT_ON: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: true }

beforeEach(async () => {
  checkProxyCapabilityMock.mockReset().mockResolvedValue(EMBEDDINGS_ONLY)
  await settingsRepo.set(SETTING_KEYS.llmProviderConfig, null)
  useAppStore.setState({ providerConfig: PROVIDER_PRESETS.mock, apiKey: '', profile: null, loaded: false })
})

describe('store.load — persisted managed-chat provider on a deployment that no longer offers it', () => {
  it('resolves the effective provider to Mock without deleting the stored worker config', async () => {
    await settingsRepo.set(SETTING_KEYS.llmProviderConfig, PROVIDER_PRESETS.worker)

    await useAppStore.getState().load()

    // effective provider for this session is Mock (worker is hidden + would 503)
    expect(useAppStore.getState().providerConfig.id).toBe('mock')
    // the stored choice is untouched — still usable if managed chat returns
    expect(await settingsRepo.get(SETTING_KEYS.llmProviderConfig)).toMatchObject({ id: 'worker' })
  })

  it('keeps the stored worker provider active when the deployment DOES offer managed chat', async () => {
    checkProxyCapabilityMock.mockResolvedValue(MANAGED_CHAT_ON)
    await settingsRepo.set(SETTING_KEYS.llmProviderConfig, PROVIDER_PRESETS.worker)

    await useAppStore.getState().load()

    expect(useAppStore.getState().providerConfig.id).toBe('worker')
  })

  it('does not probe for a non-managed-chat stored provider (e.g. a BYOK or local choice)', async () => {
    await settingsRepo.set(SETTING_KEYS.llmProviderConfig, PROVIDER_PRESETS.openrouter)

    await useAppStore.getState().load()

    expect(useAppStore.getState().providerConfig.id).toBe('openrouter')
    expect(checkProxyCapabilityMock).not.toHaveBeenCalled()
  })
})
