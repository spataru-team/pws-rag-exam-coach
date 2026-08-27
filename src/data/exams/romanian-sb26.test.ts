import { describe, it, expect } from 'vitest'
import { romanianSb26 } from './romanian-sb26'

describe('romanianSb26', () => {
  it('has 11 items in order with unique ids', () => {
    expect(romanianSb26.items).toHaveLength(11)
    const ids = romanianSb26.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(11)
    expect(romanianSb26.items.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('item maxPoints sum to the declared total (50)', () => {
    const sum = romanianSb26.items.reduce((s, i) => s + i.maxPoints, 0)
    expect(sum).toBe(romanianSb26.totalPoints)
    expect(romanianSb26.totalPoints).toBe(50)
  })

  it('carries the reading text and a 120-minute limit', () => {
    expect(romanianSb26.sourceText).toContain('Faptă mică')
    expect(romanianSb26.timeLimitMin).toBe(120)
  })

  it('item 5 is portret-caracterizare and item 6 is concluzii (sb26 order, matches pr26)', () => {
    expect(romanianSb26.items.find((i) => i.order === 5)?.skillTag).toBe('portret-caracterizare')
    expect(romanianSb26.items.find((i) => i.order === 6)?.skillTag).toBe('concluzii')
  })

  it('every item (or its subCriteria) carries a skillTag, never both', () => {
    for (const item of romanianSb26.items) {
      if (item.subCriteria && item.subCriteria.length > 0) {
        expect(item.skillTag).toBeUndefined()
        for (const c of item.subCriteria) expect(c.skillTag).toBeTruthy()
      } else {
        expect(item.skillTag).toBeTruthy()
      }
    }
  })
})
