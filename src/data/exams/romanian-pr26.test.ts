import { describe, it, expect } from 'vitest'
import { romanianPr26 } from './romanian-pr26'

describe('romanianPr26', () => {
  it('has 11 items in order with unique ids', () => {
    expect(romanianPr26.items).toHaveLength(11)
    const ids = romanianPr26.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(11)
    expect(romanianPr26.items.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('item maxPoints sum to the declared total (50)', () => {
    const sum = romanianPr26.items.reduce((s, i) => s + i.maxPoints, 0)
    expect(sum).toBe(romanianPr26.totalPoints)
    expect(romanianPr26.totalPoints).toBe(50)
  })

  it('carries the reading text and a 120-minute limit', () => {
    expect(romanianPr26.sourceText).toContain('Fapte, nu vorbe')
    expect(romanianPr26.timeLimitMin).toBe(120)
  })

  it('every item (or its subCriteria) carries a skillTag', () => {
    for (const item of romanianPr26.items) {
      if (item.subCriteria && item.subCriteria.length > 0) {
        expect(item.skillTag).toBeUndefined() // atoms live on subCriteria, not both
        for (const c of item.subCriteria) expect(c.skillTag).toBeTruthy()
      } else {
        expect(item.skillTag).toBeTruthy()
      }
    }
  })

  it('item 5 is portret-caracterizare and item 6 is concluzii (pr26 order)', () => {
    expect(romanianPr26.items.find((i) => i.order === 5)?.skillTag).toBe('portret-caracterizare')
    expect(romanianPr26.items.find((i) => i.order === 6)?.skillTag).toBe('concluzii')
  })
})
