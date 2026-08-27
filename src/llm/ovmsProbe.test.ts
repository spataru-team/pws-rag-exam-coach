import { describe, it, expect, vi } from 'vitest'
import { isOvmsReachable } from './ovmsProbe'

describe('isOvmsReachable', () => {
  it('probes /v2/health/ready, one level up from the /v3 API base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await isOvmsReachable('http://localhost:8000/v3', 500, fetchImpl)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8000/v2/health/ready',
      expect.anything(),
    )
  })

  it('strips a trailing slash before appending the health path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await isOvmsReachable('http://localhost:8000/v3/', 500, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8000/v2/health/ready',
      expect.anything(),
    )
  })

  it('returns false when the request rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('refused'))
    expect(await isOvmsReachable('http://localhost:8000/v3', 500, fetchImpl)).toBe(false)
  })

  it('returns false on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    expect(await isOvmsReachable('http://localhost:8000/v3', 500, fetchImpl)).toBe(false)
  })
})
