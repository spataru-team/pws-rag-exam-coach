import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SubjectPack } from '@/packs/types'
import { seedPacks } from './seed-packs'

async function seedInto(only: string[], includeDemo: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'seed-test-'))
  try {
    const seeded = await seedPacks({ only, includeDemo, mode: 'deterministic', outDir: dir })
    const packs: Record<string, SubjectPack> = {}
    for (const s of seeded) {
      packs[s.subjectId] = JSON.parse(
        await readFile(join(dir, `${s.subjectId}.pack.json`), 'utf8'),
      ) as SubjectPack
    }
    return { seeded, packs }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('npm run seed (public / production) — copyright-safe by construction', () => {
  it('leaves chemistry / math / russian empty and untagged', async () => {
    const { seeded, packs } = await seedInto(['chemistry', 'math', 'russian'], false)
    for (const row of seeded) {
      expect(row).toMatchObject({ chunkCount: 0, synthetic: false })
      expect(packs[row.subjectId]!.chunks).toHaveLength(0)
      expect(packs[row.subjectId]!.synthetic).toBeUndefined()
    }
  })

  it('still seeds the hand-authored public-fallback subjects', async () => {
    const { seeded } = await seedInto(['biology', 'history'], false)
    expect(seeded.find((s) => s.subjectId === 'biology')!.chunkCount).toBeGreaterThan(0)
    expect(seeded.every((s) => !s.synthetic)).toBe(true)
  })
})

describe('npm run seed:demo — synthetic fallback', () => {
  it('fills each empty subject with a synthetic-tagged pack (5–8 chunks)', async () => {
    const { seeded, packs } = await seedInto(['chemistry', 'math', 'russian'], true)
    for (const row of seeded) {
      expect(row.synthetic).toBe(true)
      expect(row.chunkCount).toBeGreaterThanOrEqual(5)
      expect(row.chunkCount).toBeLessThanOrEqual(8)
      const pack = packs[row.subjectId]!
      expect(pack.synthetic).toBe(true)
      expect(pack.chunks.every((c) => c.id.startsWith('demo-'))).toBe(true)
      expect(pack.chunks.every((c) => c.embedding.length === pack.embeddingDim)).toBe(true)
    }
  })

  it('does NOT overwrite a subject that already has real authored chunks', async () => {
    const { seeded, packs } = await seedInto(['biology'], true)
    const bio = seeded.find((s) => s.subjectId === 'biology')!
    expect(bio.synthetic).toBe(false)
    expect(packs.biology!.synthetic).toBeUndefined()
    expect(packs.biology!.chunks.every((c) => !c.id.startsWith('demo-'))).toBe(true)
  })
})
