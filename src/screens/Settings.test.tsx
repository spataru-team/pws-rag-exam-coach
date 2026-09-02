import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { ProxyCapability } from '@/llm'
import type { LLMProviderConfig } from '@/llm'

const checkProxyCapabilityMock = vi.fn<() => Promise<ProxyCapability>>()
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return {
    ...actual,
    checkProxyCapability: checkProxyCapabilityMock,
    isOllamaReachable: vi.fn().mockResolvedValue(false),
    isOvmsReachable: vi.fn().mockResolvedValue(false),
  }
})
vi.mock('@/packs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/packs')>()
  return {
    ...actual,
    subjectDataManager: { ...actual.subjectDataManager, getStatus: vi.fn().mockResolvedValue({ empty: true }) },
  }
})

const { Settings } = await import('./Settings')
const { useAppStore } = await import('@/app/store')
const { PROVIDER_PRESETS } = await import('@/llm')

const EMBEDDINGS_ONLY: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: false }
const MANAGED_CHAT_ON: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: true }

const testProfile = {
  localId: 'stu_test',
  interfaceLanguage: 'ru' as const,
  preferredLearningLanguage: 'ro' as const,
  activeSubjects: ['romanian' as const],
  currentSubjectId: 'romanian' as const,
  dyslexiaMode: false,
  theme: 'light' as const,
  studyMode: 'sprint' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => {
  checkProxyCapabilityMock.mockReset().mockResolvedValue(EMBEDDINGS_ONLY)
  useAppStore.setState({
    providerConfig: PROVIDER_PRESETS.mock as LLMProviderConfig,
    apiKey: '',
    profile: testProfile,
  })
})
afterEach(cleanup)

const providerSelectFor = (value: string) =>
  screen.getAllByRole('combobox').find((c) => (c as HTMLSelectElement).value === value) as HTMLSelectElement | undefined
const optionsOf = (sel: HTMLSelectElement) =>
  Array.from(sel.querySelectorAll('option')).map((o) => o.getAttribute('value'))

describe('Settings — provider dropdown', () => {
  it('omits managed chat (worker) on the embeddings-only deployment', async () => {
    render(<Settings />)
    await waitFor(() => expect(optionsOf(providerSelectFor('mock')!)).not.toContain('worker'))
    expect(optionsOf(providerSelectFor('mock')!)).toEqual(
      expect.arrayContaining(['mock', 'openai', 'openrouter', 'openvino']),
    )
  })

  it('includes worker once the deployment reports managed chat enabled', async () => {
    checkProxyCapabilityMock.mockResolvedValue(MANAGED_CHAT_ON)
    render(<Settings />)
    await waitFor(() => expect(optionsOf(providerSelectFor('mock')!)).toContain('worker'))
  })

  it('keeps a currently-selected worker visible even if the probe reports chat disabled', async () => {
    useAppStore.setState({ providerConfig: PROVIDER_PRESETS.worker as LLMProviderConfig })
    checkProxyCapabilityMock.mockResolvedValue(EMBEDDINGS_ONLY)
    render(<Settings />)
    // worker stays selectable (so the user can switch away), but it is the only
    // reason it appears — a fresh mock-default deployment would not show it.
    await waitFor(() => expect(optionsOf(providerSelectFor('worker')!)).toContain('worker'))
  })
})
