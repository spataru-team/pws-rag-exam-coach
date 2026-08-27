import { describe, it, expect } from 'vitest'
import type { ExamItem } from '@/types'
import { buildBaremGradePrompt } from './barem'

const baseItem: ExamItem = {
  id: 'i1',
  order: 1,
  type: 'open',
  prompt: 'Determine the area.',
  maxPoints: 5,
  baremRule: '5 points for the correct area.',
}

describe('buildBaremGradePrompt', () => {
  it('omits the FIGURĂ block when the item has no assets', () => {
    const [, user] = buildBaremGradePrompt({ item: baseItem, studentAnswer: '42', supportLanguage: 'ru' })
    expect(user!.content).not.toContain('FIGURĂ')
  })

  it('describes an asset via its description field when present', () => {
    const item: ExamItem = {
      ...baseItem,
      assets: [
        {
          id: 'fig-1',
          kind: 'figure',
          src: '/assets/exams/x/fig-1.png',
          width: 100,
          height: 100,
          alt: { ru: 'alt text' },
          description: 'A right cone with height 3cm.',
        },
      ],
    }
    const [, user] = buildBaremGradePrompt({ item, studentAnswer: '42', supportLanguage: 'ru' })
    expect(user!.content).toContain('FIGURĂ')
    expect(user!.content).toContain('A right cone with height 3cm.')
  })

  it('falls back to localized caption, then alt, when description is absent', () => {
    const withCaption: ExamItem = {
      ...baseItem,
      assets: [
        { id: 'fig-1', kind: 'figure', src: 'x.png', width: 1, height: 1, alt: { ru: 'alt-ru' }, caption: { ru: 'caption-ru' } },
      ],
    }
    const [, user1] = buildBaremGradePrompt({ item: withCaption, studentAnswer: '', supportLanguage: 'ru' })
    expect(user1!.content).toContain('caption-ru')
    expect(user1!.content).not.toContain('alt-ru')

    const altOnly: ExamItem = {
      ...baseItem,
      assets: [{ id: 'fig-1', kind: 'figure', src: 'x.png', width: 1, height: 1, alt: { ru: 'alt-ru' } }],
    }
    const [, user2] = buildBaremGradePrompt({ item: altOnly, studentAnswer: '', supportLanguage: 'ru' })
    expect(user2!.content).toContain('alt-ru')
  })

  it('joins descriptions from multiple assets', () => {
    const item: ExamItem = {
      ...baseItem,
      assets: [
        { id: 'a', kind: 'figure', src: 'a.png', width: 1, height: 1, alt: {}, description: 'first figure' },
        { id: 'b', kind: 'figure', src: 'b.png', width: 1, height: 1, alt: {}, description: 'second figure' },
      ],
    }
    const [, user] = buildBaremGradePrompt({ item, studentAnswer: '', supportLanguage: 'ru' })
    expect(user!.content).toContain('first figure')
    expect(user!.content).toContain('second figure')
  })

  it('lists every sub-criterion when no override is given', () => {
    const item: ExamItem = {
      ...baseItem,
      subCriteria: [
        { id: 'method', title: {}, maxPoints: 3, rule: 'show the working' },
        { id: 'answer', title: {}, maxPoints: 2, rule: 'exact final value', gradeMode: 'deterministic' },
      ],
    }
    const [, user] = buildBaremGradePrompt({ item, studentAnswer: '', supportLanguage: 'ru' })
    expect(user!.content).toContain('"method"')
    expect(user!.content).toContain('"answer"')
  })

  it('restricts the barem section to the `criteria` override, excluding deterministic slots', () => {
    const item: ExamItem = {
      ...baseItem,
      subCriteria: [
        { id: 'method', title: {}, maxPoints: 3, rule: 'show the working' },
        { id: 'answer', title: {}, maxPoints: 2, rule: 'exact final value', gradeMode: 'deterministic' },
      ],
    }
    const [, user] = buildBaremGradePrompt({
      item,
      studentAnswer: '',
      supportLanguage: 'ru',
      criteria: [{ id: 'method', maxPoints: 3, rule: 'show the working' }],
    })
    expect(user!.content).toContain('"method"')
    expect(user!.content).not.toContain('"answer"')
  })
})
