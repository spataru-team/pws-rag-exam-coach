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

describe('Onboarding — capability-aware initial provider', () => {
  it('starts on Mock synchronously, before the probe resolves', () => {
    render(<Onboarding />)
    expect(pressed('Mock (offline demo)')).toBe('true')
    expect(pressed('OpenAI-compatible (cloud)')).toBe('false')
  })

  it('stays on Mock when no configured proxy is detected (npm run dev / preview)', async () => {
    render(<Onboarding />)
    cap.resolve({ available: false, configured: false })
    await flush()
    expect(pressed('Mock (offline demo)')).toBe('true')
    expect(pressed('OpenAI-compatible (cloud)')).toBe('false')
  })

  it('stays on Mock when the proxy route exists but is not configured', async () => {
    render(<Onboarding />)
    cap.resolve({ available: true, configured: false })
    await flush()
    expect(pressed('Mock (offline demo)')).toBe('true')
  })

  it('switches to the cloud proxy ONLY when a configured proxy answers', async () => {
    render(<Onboarding />)
    cap.resolve({ available: true, configured: true })
    await flush()
    expect(pressed('OpenAI-compatible (cloud)')).toBe('true')
    expect(pressed('Mock (offline demo)')).toBe('false')
    // cloud warning must be visible whenever Worker is selected
    expect(screen.getByText(/⚠️/)).toBeInTheDocument()
  })

  it('never overrides a provider the user picked before the probe resolved', async () => {
    const user = userEvent.setup()
    render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: 'LM Studio (local)' }))
    expect(pressed('LM Studio (local)')).toBe('true')

    cap.resolve({ available: true, configured: true }) // would pick Worker if unguarded
    await flush()

    expect(pressed('LM Studio (local)')).toBe('true')
    expect(pressed('OpenAI-compatible (cloud)')).toBe('false')
  })
})
