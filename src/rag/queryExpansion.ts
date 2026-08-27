import type { LocalizedText } from '@/types'
import { tokenize } from './lexical'

// Short function words that would otherwise cross-link almost every topic
// title to almost every other one, drowning the real subject-specific terms.
const STOPWORDS = new Set([
  // ru
  'и', 'в', 'на', 'с', 'по', 'что', 'как', 'это', 'для', 'из', 'к', 'от', 'до',
  'не', 'или', 'а', 'но', 'также', 'их', 'о', 'об', 'при', 'за', 'то', 'же', 'ее', 'его',
  // ro (accents already folded away by tokenize, so write the folded forms)
  'si', 'in', 'la', 'cu', 'de', 'pe', 'este', 'sunt', 'sau', 'ce', 'din', 'ale',
  'al', 'a', 'un', 'o', 'se', 'care', 'pentru', 'fi', 'ca', 'mai',
  // en
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are',
])

function significantTokens(text: string | undefined): string[] {
  if (!text) return []
  return tokenize(text).filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

/** Anything carrying a `title: LocalizedText` — a Topic, without importing the data layer's type. */
export interface TitledEntry {
  title: LocalizedText
}

/**
 * Term-expansion glossary built entirely from a subject's own topic titles —
 * already localized ru/ro/en in every topic tree (src/data/subjects/*.ts), so
 * this needs no external dictionary, ANCE scraping or LLM call. A topic's
 * title in one language cross-links to that SAME topic's title in the other
 * languages: a ru query term that matches a topic's Russian title pulls in
 * that topic's Romanian/English title terms too, giving the lexical (BM25)
 * branch a chance to match a corpus written in a different language than the
 * query. Coarse (topic-level, not a real word alignment) but fully traceable
 * to real data and cheap to build — a few dozen topics, tokenized once.
 */
export function buildQueryExpansionGlossary(topics: TitledEntry[]): Map<string, Set<string>> {
  const glossary = new Map<string, Set<string>>()

  for (const topic of topics) {
    const byLang = {
      ru: significantTokens(topic.title.ru),
      ro: significantTokens(topic.title.ro),
      en: significantTokens(topic.title.en),
    }
    const all = [...byLang.ru, ...byLang.ro, ...byLang.en]
    for (const lang of ['ru', 'ro', 'en'] as const) {
      const own = byLang[lang]
      if (own.length === 0) continue
      const others = all.filter((t) => !own.includes(t))
      if (others.length === 0) continue
      for (const term of own) {
        const set = glossary.get(term) ?? new Set<string>()
        for (const e of others) if (e !== term) set.add(e)
        if (set.size > 0) glossary.set(term, set)
      }
    }
  }
  return glossary
}

/**
 * Expands query text with cross-language topic vocabulary for the LEXICAL
 * (BM25) branch only. The vector branch is already multilingual via bge-m3, so
 * expanding it too would just add noise to a space that doesn't need it — see
 * RetrieveOptions.queryExpansionGlossary in retrieve.ts for where this plugs in.
 */
export function expandQueryForLexical(queryText: string, glossary: Map<string, Set<string>>): string {
  const tokens = tokenize(queryText)
  const extra = new Set<string>()
  for (const t of tokens) {
    const expansions = glossary.get(t)
    if (expansions) for (const e of expansions) extra.add(e)
  }
  return extra.size === 0 ? queryText : `${queryText} ${[...extra].join(' ')}`
}
