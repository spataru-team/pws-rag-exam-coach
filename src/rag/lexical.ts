/**
 * Lexical scoring (BM25-lite) and Reciprocal Rank Fusion for hybrid retrieval.
 * Pure, dependency-free, deterministic — works offline and in CI.
 */

/**
 * Lowercase, then fold diacritics by NFKD-decomposing and REMOVING combining
 * marks (ă→a, â→a, ș→s, ț→t) before stripping punctuation. Removing the marks
 * (rather than replacing them with spaces) keeps words intact, so "hotărât" and
 * "hotarat" tokenize identically — letting RU/RO queries match RO chunks.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const BM25_K1 = 1.5
const BM25_B = 0.75

/**
 * BM25-lite score of each document against the query. Document frequencies and
 * average length are computed over the provided candidate set (`docTexts`), so
 * scores are relative to the current subject's chunks.
 */
export function lexicalScores(queryText: string, docTexts: string[]): number[] {
  const queryTokens = unique(tokenize(queryText))
  const docs = docTexts.map(tokenize)
  const n = docs.length
  if (n === 0 || queryTokens.length === 0) return new Array<number>(n).fill(0)

  const avgdl = docs.reduce((s, d) => s + d.length, 0) / n || 1

  // Document frequency per query term.
  const df = new Map<string, number>()
  for (const term of queryTokens) {
    let count = 0
    for (const doc of docs) if (doc.includes(term)) count++
    df.set(term, count)
  }
  const idf = new Map<string, number>()
  for (const term of queryTokens) {
    const d = df.get(term) ?? 0
    idf.set(term, Math.log(1 + (n - d + 0.5) / (d + 0.5)))
  }

  return docs.map((doc) => {
    const len = doc.length || 1
    const tf = new Map<string, number>()
    for (const tok of doc) tf.set(tok, (tf.get(tok) ?? 0) + 1)
    let score = 0
    for (const term of queryTokens) {
      const f = tf.get(term) ?? 0
      if (f === 0) continue
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * len) / avgdl)
      score += (idf.get(term) ?? 0) * ((f * (BM25_K1 + 1)) / denom)
    }
    return score
  })
}

/**
 * Reciprocal Rank Fusion. Each ranking is an ordered list of ids (best first).
 * Returns a fused score per id; higher is better. Robust to score scale because
 * it uses ranks, not raw scores.
 */
export function fuseRRF(rankings: string[][], k = 60): Map<string, number> {
  const fused = new Map<string, number>()
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1))
    })
  }
  return fused
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
