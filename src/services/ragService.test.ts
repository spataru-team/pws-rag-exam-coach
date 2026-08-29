import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RetrievalResult } from '@/rag'
import type { PackStatus } from '@/packs'

/**
 * `ragService.retrieve` is the "service metadata" layer: it runs the pure
 * retrieval pipeline and then stamps authoritative pack-level facts onto the
 * result — `corpusEmpty` (the subject's pack has zero chunks → regenerate it)
 * and `synthetic` (the pack came from `npm run seed:demo`). Neither can be
 * derived from post-filter retrieval results, so this is where they are set.
 */

const retrieveOrDegradeMock = vi.fn<() => Promise<RetrievalResult>>()
vi.mock('@/rag', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/rag')>()
  return { ...actual, retrieveOrDegrade: retrieveOrDegradeMock }
})

const getStatusMock = vi.fn<(id: string) => Promise<PackStatus>>()
vi.mock('@/packs', () => ({ subjectDataManager: { getStatus: getStatusMock } }))

vi.mock('@/storage', () => ({
  contentRepo: { getChunksBySubject: vi.fn().mockResolvedValue([]) },
  settingsRepo: { get: vi.fn().mockResolvedValue(undefined) },
  SETTING_KEYS: { embeddingConfig: 'embeddingConfig' },
}))

const { retrieve } = await import('./ragService')

function status(over: Partial<PackStatus>): PackStatus {
  return {
    subjectId: 'chemistry',
    enabled: true,
    downloaded: true,
    embeddingModel: 'deterministic-stub',
    embeddingDim: 1024,
    chunkCount: 0,
    empty: false,
    synthetic: false,
    ...over,
  }
}

beforeEach(() => {
  retrieveOrDegradeMock.mockReset()
  getStatusMock.mockReset()
  retrieveOrDegradeMock.mockResolvedValue({
    query: 'q',
    subjectId: 'chemistry',
    results: [],
    insufficient: true,
    embeddingModelId: 'deterministic-stub',
  })
})

describe('ragService.retrieve — pack-metadata stamping', () => {
  it('stamps corpusEmpty=true when the pack holds zero chunks', async () => {
    getStatusMock.mockResolvedValue(status({ chunkCount: 0, empty: true }))

    const res = await retrieve('q', 'chemistry')

    expect(res.corpusEmpty).toBe(true)
    expect(res.synthetic).toBe(false)
  })

  it('stamps corpusEmpty=false for a populated pack even when the pure retrieval returned nothing', async () => {
    getStatusMock.mockResolvedValue(status({ chunkCount: 120, empty: false }))

    const res = await retrieve('q', 'chemistry', 'chem-organic-functional', 5, 9)

    // pure retrieval returned [] (grade/topic slice matched nothing) — must NOT
    // be reported as an empty corpus.
    expect(res.results).toHaveLength(0)
    expect(res.corpusEmpty).toBe(false)
  })

  it('stamps synthetic=true for a demo pack (and it is not treated as empty)', async () => {
    getStatusMock.mockResolvedValue(status({ chunkCount: 6, empty: false, synthetic: true }))

    const res = await retrieve('q', 'chemistry')

    expect(res.synthetic).toBe(true)
    expect(res.corpusEmpty).toBe(false)
  })

  it('preserves the underlying retrieval result (unavailable, results, insufficient)', async () => {
    getStatusMock.mockResolvedValue(status({ chunkCount: 50, empty: false }))
    retrieveOrDegradeMock.mockResolvedValue({
      query: 'q',
      subjectId: 'chemistry',
      results: [],
      insufficient: true,
      unavailable: true,
      embeddingModelId: 'deterministic-stub',
    })

    const res = await retrieve('q', 'chemistry')

    expect(res.unavailable).toBe(true)
    expect(res.corpusEmpty).toBe(false)
    expect(res.synthetic).toBe(false)
  })
})
