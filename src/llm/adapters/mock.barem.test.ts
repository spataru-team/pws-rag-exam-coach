import { describe, it, expect } from 'vitest'
import { MockAdapter } from './mock'
import { buildBaremGradePrompt } from '../promptTemplates/barem'
import { parseBaremResponse } from '@/learning/baremGrader'
import type { ExamItem } from '@/types'

const adapter = new MockAdapter()

const essayItem: ExamItem = {
  id: 'sb26-9',
  order: 9,
  type: 'open',
  maxPoints: 5,
  prompt: 'Scrie o felicitare adresată unui prieten cu ocazia unui premiu.',
  baremRule: 'Se punctează pe sub-criterii.',
  subCriteria: [
    { id: 'adresare', title: { ro: 'Adresare' }, maxPoints: 1, rule: 'Formula de adresare + încheiere.' },
    { id: 'ocazie', title: { ro: 'Ocazia' }, maxPoints: 1, rule: 'Indicarea ocaziei.' },
    { id: 'urare', title: { ro: 'Urare' }, maxPoints: 2, rule: '2 p. urare deosebită; 1 p. simplă.' },
    { id: 'asezare', title: { ro: 'Așezare' }, maxPoints: 1, rule: 'Așezarea corectă în pagină.' },
  ],
}

const singleItem: ExamItem = {
  id: 'sb26-6',
  order: 6,
  type: 'open',
  maxPoints: 2,
  prompt: 'Formulează două concluzii în baza textului.',
  baremRule: 'Câte 1 punct pentru fiecare concluzie adecvată.',
}

const gradePrompt = (item: ExamItem, studentAnswer: string) =>
  ({ messages: buildBaremGradePrompt({ item, studentAnswer, supportLanguage: 'ru' }), jsonMode: true })

describe('MockAdapter — offline barem grading (deterministic demonstration)', () => {
  it('answers a barem-grading request with JSON that parseBaremResponse accepts', async () => {
    const res = await adapter.chat(gradePrompt(essayItem, 'Dragă Ana, felicitări pentru premiu! Îți doresc din suflet multe realizări și bucurii. Cu drag, Maria.'))
    const parsed = parseBaremResponse(res.content, essayItem)
    expect(parsed.perCriterion.map((c) => c.id)).toEqual(['adresare', 'ocazie', 'urare', 'asezare'])
    expect(parsed.awarded).toBeGreaterThan(0)
    expect(parsed.awarded).toBeLessThanOrEqual(essayItem.maxPoints)
  })

  it('scores a blank answer at zero', async () => {
    const res = await adapter.chat(gradePrompt(singleItem, ''))
    expect(parseBaremResponse(res.content, singleItem).awarded).toBe(0)
  })

  it('is deterministic — identical request yields byte-identical content', async () => {
    const a = await adapter.chat(gradePrompt(essayItem, 'Un răspuns scurt.'))
    const b = await adapter.chat(gradePrompt(essayItem, 'Un răspuns scurt.'))
    expect(a.content).toBe(b.content)
  })

  it('never awards more than a criterion maximum', async () => {
    const res = await adapter.chat(
      gradePrompt(essayItem, 'x'.repeat(400) + ' felicitări ocazie urare'),
    )
    const parsed = parseBaremResponse(res.content, essayItem)
    parsed.perCriterion.forEach((c) => expect(c.awarded).toBeLessThanOrEqual(c.max))
  })

  it('leaves non-grading requests on the grounded-prose path (cites context ids)', async () => {
    const res = await adapter.chat({
      messages: [
        { role: 'system', content: 'Ești un tutore. Citează [#id].' },
        { role: 'user', content: 'CONTEXT:\n[#ro-chunk-1] Articolul hotărât...\n\nÎNTREBARE: Ce este articolul hotărât?' },
      ],
    })
    expect(res.content).toContain('[#ro-chunk-1]')
  })

  it('still refuses a non-grading request with no context', async () => {
    const res = await adapter.chat({
      messages: [{ role: 'user', content: 'Ce este articolul hotărât?' }],
    })
    expect(res.content.toLowerCase()).toMatch(/недостаточно|попробуйте/)
  })
})
