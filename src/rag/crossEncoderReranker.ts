import type { ScoredChunk } from './retrieve'
import { type Reranker, defaultReranker } from './rerank'

/**
 * Cross-encoder reranker over a Cohere-shaped `/rerank` endpoint — the same
 * request/response contract OpenVINO Model Server's `/v3/rerank` and
 * Cloudflare Workers AI's `@cf/baai/bge-reranker-base` both speak:
 *   request  { model, query, documents: string[] }
 *   response { results: [{ index, relevance_score }] }
 *
 * Falls back to the deterministic LexicalReranker on any network error,
 * non-2xx response, timeout, or malformed body — a demo must never go blank
 * because a reranker server isn't reachable. The fallback is itself a valid
 * Reranker, so this class never throws.
 */
export interface CrossEncoderRerankerOptions {
  /** Base URL up to and including the version segment, e.g. `http://localhost:8000/v3`. */
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs?: number
  /** Injectable for tests / a second-choice backend; defaults to the offline LexicalReranker. */
  fallback?: Reranker
}

interface RerankApiResponse {
  results?: { index: number; relevance_score: number }[]
}

export class CrossEncoderReranker implements Reranker {
  private readonly baseUrl: string
  private readonly model: string
  private readonly apiKey?: string
  private readonly timeoutMs: number
  private readonly fallback: Reranker

  constructor(opts: CrossEncoderRerankerOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.model = opts.model
    this.apiKey = opts.apiKey
    this.timeoutMs = opts.timeoutMs ?? 4000
    this.fallback = opts.fallback ?? defaultReranker
  }

  async rerank(queryText: string, scored: ScoredChunk[], topN: number): Promise<ScoredChunk[]> {
    const n = Math.min(topN, scored.length)
    if (n <= 1) return scored

    const head = scored.slice(0, n)
    const tail = scored.slice(n)

    try {
      const reordered = await this.rerankViaApi(queryText, head)
      return [...reordered, ...tail]
    } catch {
      // Network down, non-2xx, timeout, or malformed body: degrade to the
      // offline reranker rather than surfacing an error to the student.
      return await this.fallback.rerank(queryText, scored, topN)
    }
  }

  private async rerankViaApi(queryText: string, head: ScoredChunk[]): Promise<ScoredChunk[]> {
    const res = await fetch(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        query: queryText,
        documents: head.map((sc) => sc.chunk.text),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`rerank endpoint returned ${res.status}`)

    const data = (await res.json()) as RerankApiResponse
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('rerank endpoint returned no results')
    }

    // relevance_score isn't cosine similarity, so it can't replace `similarity`
    // (the insufficient-evidence gate reads that field) — carry it separately
    // and reorder by it, keeping each chunk's own vector/lexical scores intact.
    const ordered = [...data.results]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => head[r.index])
      .filter((sc): sc is ScoredChunk => sc !== undefined)

    // Defensive: an incomplete/out-of-range index list must not silently drop
    // candidates — fall back rather than ship a truncated context.
    if (ordered.length !== head.length) throw new Error('rerank endpoint returned incomplete indices')
    return ordered
  }
}
