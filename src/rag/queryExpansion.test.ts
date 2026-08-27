import { describe, it, expect } from 'vitest'
import { buildQueryExpansionGlossary, expandQueryForLexical, type TitledEntry } from './queryExpansion'

const topics: TitledEntry[] = [
  { title: { en: 'The definite article', ro: 'Articolul hotărât', ru: 'Определённый артикль' } },
  { title: { en: 'Oxidation and reduction', ro: 'Oxidare și reducere, pentru toți', ru: 'Окисление и восстановление, а также' } },
  { title: { en: 'No cross-language pair' } },
]

describe('buildQueryExpansionGlossary', () => {
  it('cross-links a ru term to that same topic\'s ro/en terms', () => {
    const g = buildQueryExpansionGlossary(topics)
    const expansions = g.get('артикль')
    expect(expansions).toBeDefined()
    expect(expansions!.has('articolul')).toBe(true)
    expect(expansions!.has('hotarat')).toBe(true) // diacritics folded by tokenize
    expect(expansions!.has('article')).toBe(true)
  })

  it('does not cross-link terms from unrelated topics', () => {
    const g = buildQueryExpansionGlossary(topics)
    expect(g.get('артикль')?.has('oxidare')).toBeFalsy()
  })

  it('drops stopwords and short tokens from both sides', () => {
    const g = buildQueryExpansionGlossary(topics)
    // Neither "также" (ru stopword) nor "pentru"/"si" (ro, "și" folded) should
    // ever appear as an expansion, and short tokens like "и"/"a" never even
    // become glossary keys.
    expect(g.has('также')).toBe(false)
    expect(g.has('и')).toBe(false)
    const expansions = g.get('окисление')
    expect(expansions?.has('si')).toBeFalsy()
    expect(expansions?.has('pentru')).toBeFalsy()
    expect(expansions?.has('oxidare')).toBe(true) // the real term still comes through
  })

  it('is a no-op for a topic with only one language present', () => {
    const g = buildQueryExpansionGlossary([topics[2]!])
    expect(g.size).toBe(0)
  })
})

describe('expandQueryForLexical', () => {
  it('appends matched expansions to the query text', () => {
    const g = buildQueryExpansionGlossary(topics)
    const expanded = expandQueryForLexical('Как образуется артикль в румынском', g)
    expect(expanded).toContain('articolul')
    expect(expanded).toContain('Как образуется артикль в румынском') // original text preserved
  })

  it('returns the original text unchanged when nothing matches', () => {
    const g = buildQueryExpansionGlossary(topics)
    expect(expandQueryForLexical('completely unrelated wording', g)).toBe('completely unrelated wording')
  })
})
