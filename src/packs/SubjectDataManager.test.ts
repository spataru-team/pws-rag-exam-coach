import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SubjectDataManager } from './SubjectDataManager'
import { PACK_SCHEMA_VERSION, type SubjectPack } from './types'
import { db } from '@/storage'

function packJson(over: Partial<SubjectPack> = {}): SubjectPack {
  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    subjectId: 'chemistry',
    embeddingModel: 'deterministic-stub',
    embeddingDim: 4,
    generatedAt: '2026-01-01T00:00:00.000Z',
    chunks: [],
    ...over,
  }
}

function stubFetch(pack: SubjectPack | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      pack === null
        ? ({ ok: false, status: 404 } as Response)
        : ({ ok: true, status: 200, json: async () => pack } as Response),
    ),
  )
}

const mgr = new SubjectDataManager('https://example.test/packs')

describe('SubjectDataManager — empty & synthetic pack status', () => {
  beforeEach(async () => {
    await db.downloadedPacks.clear()
    await db.chunks.clear()
    await db.topics.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('flags a downloaded 0-chunk pack as empty (clean-clone chemistry/math/russian)', async () => {
    stubFetch(packJson({ chunks: [] }))
    await mgr.download('chemistry')

    const status = await mgr.getStatus('chemistry')
    expect(status.downloaded).toBe(true)
    expect(status.chunkCount).toBe(0)
    expect(status.empty).toBe(true)
    expect(status.synthetic).toBe(false)
  })

  it('flags a synthetic demo pack, and does not mark it empty', async () => {
    stubFetch(
      packJson({
        synthetic: true,
        chunks: [
          {
            id: 'demo-chem-001',
            subjectId: 'chemistry',
            topicId: 'chem-bonding',
            language: 'ru',
            text: '[DEMO] ...',
            source: 'SYNTHETIC DEMO — self-authored, not exam or textbook material',
            gradeLevel: 9,
            embedding: [0.1, 0.2, 0.3, 0.4],
          },
        ],
      }),
    )
    await mgr.download('chemistry')

    const status = await mgr.getStatus('chemistry')
    expect(status.empty).toBe(false)
    expect(status.synthetic).toBe(true)
    expect(status.chunkCount).toBe(1)
  })

  it('a normal populated pack is neither empty nor synthetic', async () => {
    stubFetch(
      packJson({
        chunks: [
          {
            id: 'chem-1',
            subjectId: 'chemistry',
            topicId: 'chem-bonding',
            language: 'ru',
            text: 'real content',
            source: 'Chimie IX',
            gradeLevel: 9,
            embedding: [0.1, 0.2, 0.3, 0.4],
          },
        ],
      }),
    )
    await mgr.download('chemistry')

    const status = await mgr.getStatus('chemistry')
    expect(status.empty).toBe(false)
    expect(status.synthetic).toBe(false)
  })

  it('throws when the pack file is absent (truly unseeded clean clone)', async () => {
    stubFetch(null)
    await expect(mgr.download('chemistry')).rejects.toThrow(/HTTP 404/)

    const status = await mgr.getStatus('chemistry')
    expect(status.downloaded).toBe(false)
    expect(status.empty).toBeFalsy()
  })
})
