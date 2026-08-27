import { describe, it, expect, vi } from 'vitest'
import { isOllamaReachable } from './ollamaProbe'

describe('isOllamaReachable', () => {
  it('returns true when /api/tags responds ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await isOllamaReachable('http://localhost:11434', 500, fetchImpl)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.anything(),
    )
  })

  it('returns false when the request rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('refused'))
    expect(await isOllamaReachable('http://localhost:11434', 500, fetchImpl)).toBe(false)
  })
})
