/**
 * Pure metric helpers shared by the stats screen and the evaluation harness:
 * latency percentiles and retrieval quality (recall@k, MRR).
 */

/** Linear-interpolated percentile (p in [0,100]). Returns 0 for empty input. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]!
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  const frac = rank - lo
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac
}

/** Share of expected ids present in the first k retrieved ids ([0,1]). */
export function recallAtK(
  retrievedIds: string[],
  expectedIds: string[],
  k: number,
): number {
  if (expectedIds.length === 0) return 1
  const topK = new Set(retrievedIds.slice(0, k))
  const hits = expectedIds.filter((id) => topK.has(id)).length
  return hits / expectedIds.length
}

/** Mean reciprocal rank: 1/(rank of first expected id), else 0. */
export function mrr(retrievedIds: string[], expectedIds: string[]): number {
  const expected = new Set(expectedIds)
  for (let i = 0; i < retrievedIds.length; i++) {
    if (expected.has(retrievedIds[i]!)) return 1 / (i + 1)
  }
  return 0
}

/** Average of a numeric array; 0 for empty. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}
