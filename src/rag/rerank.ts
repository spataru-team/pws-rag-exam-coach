import type { ScoredChunk } from './retrieve'
import { tokenize } from './lexical'

/**
 * Second-stage reranker over the first-stage top candidates. The lexical
 * implementation is deterministic and offline; the return type also allows a
 * Promise so a network-backed cross-encoder (see crossEncoderReranker.ts) can
 * implement the same interface without a parallel async-only type.
 */
export interface Reranker {
  rerank(
    queryText: string,
    scored: ScoredChunk[],
    topN: number,
  ): ScoredChunk[] | Promise<ScoredChunk[]>
}

const W_COVERAGE = 0.5
const W_PHRASE = 0.5

/**
 * Conservative reranker over the first `topN` candidates. It keeps the
 * first-stage order as a strong prior and only lets lexical evidence (query-term
 * coverage and exact normalized-phrase containment) promote a candidate — so a
 * strong vector hit is never demoted unless another chunk has clearly better
 * lexical match. Diacritics are folded via the shared tokenizer (RU/RO ↔ RO).
 * Deterministic; the remainder beyond `topN` is appended unchanged.
 */
export class LexicalReranker implements Reranker {
  rerank(queryText: string, scored: ScoredChunk[], topN: number): ScoredChunk[] {
    const n = Math.min(topN, scored.length)
    if (n <= 1) return scored

    const queryTerms = new Set(tokenize(queryText))
    const normQuery = tokenize(queryText).join(' ')

    const head = scored.slice(0, n)
    const tail = scored.slice(n)

    const featured = head.map((sc, index) => ({
      sc,
      index,
      // First-stage rank prior in [0,1] (1 = best) plus a bounded lexical boost.
      score:
        (n - index) / n + this.lexicalBoost(sc, queryTerms, normQuery),
    }))
    featured.sort((a, b) => b.score - a.score || a.index - b.index)

    return [...featured.map((f) => f.sc), ...tail]
  }

  /** Lexical boost in [0, 1]: term coverage + exact-phrase containment. */
  private lexicalBoost(
    sc: ScoredChunk,
    queryTerms: Set<string>,
    normQuery: string,
  ): number {
    const docTokens = tokenize(sc.chunk.text)
    const docSet = new Set(docTokens)
    const normDoc = docTokens.join(' ')

    let covered = 0
    for (const term of queryTerms) if (docSet.has(term)) covered++
    const coverage = queryTerms.size === 0 ? 0 : covered / queryTerms.size
    const phrase = normQuery.length > 0 && normDoc.includes(normQuery) ? 1 : 0

    return W_COVERAGE * coverage + W_PHRASE * phrase
  }
}

export const defaultReranker = new LexicalReranker()
