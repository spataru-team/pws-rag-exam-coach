import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import answers from './answers.json'
import manifest from './manifest.json'
import { romanianPr26 } from '@/data/exams/romanian-pr26'
import { romanianSb26 } from '@/data/exams/romanian-sb26'
import { criteriaSlots } from '@/learning/baremGrader'

const papers = { 'ro-pr26': romanianPr26, 'ro-sb26': romanianSb26 } as const

describe('ro-synthetic-answers — frozen shared input', () => {
  it('has 20–24 cases with stable, unique ids', () => {
    expect(answers.cases.length).toBeGreaterThanOrEqual(20)
    expect(answers.cases.length).toBeLessThanOrEqual(24)
    const ids = answers.cases.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(id).toMatch(/^syn-(pr26|sb26)-\d{2}$/))
  })

  it('covers all four bands including blank/near-blank', () => {
    const bands = new Set(answers.cases.map((c) => c.band))
    expect(bands).toEqual(new Set(['strong', 'partial', 'l2-errors', 'near-blank']))
  })

  it('answers only real registered exam items of the stated paper', () => {
    for (const c of answers.cases) {
      const paper = papers[c.paperId as keyof typeof papers]
      expect(paper).toBeDefined()
      const itemIds = new Set(paper.items.map((i) => i.id))
      for (const itemId of Object.keys(c.answersByItemId)) {
        expect(itemIds.has(itemId)).toBe(true)
      }
    }
  })

  it('carries NO teacher labels and NO system predictions — cases hold only answers', () => {
    const allowed = new Set(['id', 'paperId', 'band', 'note', 'answersByItemId'])
    for (const c of answers.cases) {
      for (const key of Object.keys(c)) expect(allowed.has(key), `${c.id} has unexpected key "${key}"`).toBe(true)
      for (const v of Object.values(c.answersByItemId)) expect(typeof v).toBe('string')
    }
  })

  it('matches the frozen contentHash in the manifest', () => {
    const hash = createHash('sha256').update(JSON.stringify(answers.cases)).digest('hex')
    expect(hash).toBe(manifest.contentHash)
  })

  it('every strong-band case attempts every gradeable item of its paper', () => {
    for (const c of answers.cases.filter((x) => x.band === 'strong')) {
      const paper = papers[c.paperId as keyof typeof papers]
      const gradeable = paper.items.filter((i) => i.type !== 'correctness')
      for (const item of gradeable) {
        const a = c.answersByItemId[item.id as keyof typeof c.answersByItemId] ?? ''
        expect(a.trim().length, `${c.id} / ${item.id}`).toBeGreaterThan(0)
        // slot structure is real (criteriaSlots resolves for every item)
        expect(criteriaSlots(item).length).toBeGreaterThan(0)
      }
    }
  })
})
