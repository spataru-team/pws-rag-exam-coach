import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProxyCapability } from '@/llm'

/** A promise we resolve by hand, to control when the capability probe "returns". */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const checkProxyCapabilityMock = vi.fn<() => Promise<ProxyCapability>>()
vi.mock('@/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm')>()
  return { ...actual, checkProxyCapability: checkProxyCapabilityMock }
})
// Onboarding calls this in finish(); never exercised here, but stub it so the
// real IndexedDB path isn't touched.
vi.mock('@/packs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/packs')>()
  return { ...actual, subjectDataManager: { ...actual.subjectDataManager, download: vi.fn() } }
})

const { Onboarding } = await import('./Onboarding')

let cap: ReturnType<typeof deferred<ProxyCapability>>

beforeEach(() => {
  cap = deferred<ProxyCapability>()
  checkProxyCapabilityMock.mockReset().mockReturnValue(cap.promise)
})
afterEach(cleanup)

const flush = () => new Promise((r) => setTimeout(r, 0))
const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')
const queryButton = (name: string) => screen.queryByRole('button', { name })

const EMBEDDINGS_ONLY: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: false }
const MANAGED_CHAT_ON: ProxyCapability = { available: true, embeddingsConfigured: true, chatConfigured: true }
const NO_PROXY: ProxyCapability = { available: false, embeddingsConfigured: false, chatConfigured: false }

describe('Onboarding — provider selection', () => {
  it('starts on Mock synchronously', () => {
    render(<Onboarding />)
    expect(pressed('Mock (offline demo)')).toBe('true')
  })

  it('stays on Mock when there is no proxy (npm run dev / preview)', async () => {
    render(<Onboarding />)
    cap.resolve(NO_PROXY)
    await flush()
    expect(pressed('Mock (offline demo)')).toBe('true')
  })

  it('stays on Mock on the embeddings-only public deployment, and does NOT offer managed chat', async () => {
    render(<Onboarding />)
    cap.resolve(EMBEDDINGS_ONLY)
    await flush()
    expect(pressed('Mock (offline demo)')).toBe('true')
    expect(queryButton('OpenAI-compatible (cloud)')).toBeNull()
  })

  it('offers managed chat when the deployment enables it, but still never auto-selects it', async () => {
    render(<Onboarding />)
    cap.resolve(MANAGED_CHAT_ON)
    await flush()
    expect(queryButton('OpenAI-compatible (cloud)')).not.toBeNull()
    expect(pressed('OpenAI-compatible (cloud)')).toBe('false')
    expect(pressed('Mock (offline demo)')).toBe('true')
  })

  it('always offers the BYOK cloud providers', () => {
    render(<Onboarding />)
    expect(queryButton('OpenAI (свой ключ)')).not.toBeNull()
    expect(queryButton('OpenRouter (cloud)')).not.toBeNull()
  })

  it('never overrides a provider the user picked before the probe resolved', async () => {
    const user = userEvent.setup()
    render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: 'LM Studio (local)' }))
    expect(pressed('LM Studio (local)')).toBe('true')

    cap.resolve(MANAGED_CHAT_ON)
    await flush()

    expect(pressed('LM Studio (local)')).toBe('true')
  })
})
