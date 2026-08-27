import { DEFAULT_EMBEDDING_DIM } from '@/types'
import { assertEmbeddingDim, type EmbeddingProvider } from './types'

export interface OpenAICompatibleEmbeddingOptions {
  /** Base URL exposing POST {baseUrl}/embeddings (OpenAI shape). */
  baseUrl: string
  model: string
  /** Optional bearer key (cloud providers); omit for local OVMS/Ollama. */
  apiKey?: string
  /** Sent as `dimensions` in the request body — OpenAI text-embedding-3-*
   * truncation only. Servers that don't support it (OVMS, bge-m3) ignore it if
   * sent, so it's safe to omit rather than a footgun to include. */
  dimensions?: number
  /** Expected output vector length, used to sanity-check the response so a
   * misconfigured endpoint fails loudly instead of silently poisoning the
   * vector space. Defaults to `dimensions` if set, else `DEFAULT_EMBEDDING_DIM`. */
  expectedDim?: number
  timeoutMs?: number
}

/**
 * Embeddings over any OpenAI-compatible `/embeddings` endpoint. This is the
 * architectural hook for optimized/cloud embedding backends without a bespoke
 * adapter each time:
 *   - OpenVINO Model Server (OVMS) — optimized local inference on Intel HW,
 *   - Cloudflare Workers AI, OpenAI, etc.
 * The served model's output length must match `expectedDim`, and the same model
 * must have produced the chunk vectors so the spaces match.
 */
export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string
  readonly dim: number
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly dimensions?: number
  private readonly timeoutMs: number

  constructor(opts: OpenAICompatibleEmbeddingOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.modelId = opts.model
    this.apiKey = opts.apiKey
    this.dimensions = opts.dimensions
    this.dim = opts.expectedDim ?? opts.dimensions ?? DEFAULT_EMBEDDING_DIM
    this.timeoutMs = opts.timeoutMs ?? 8000
  }

  async embed(text: string): Promise<number[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`

    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.modelId,
        input: text,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`Embeddings HTTP ${res.status}`)
    const data = (await res.json()) as { data?: { embedding?: number[] }[] }
    const embedding = data.data?.[0]?.embedding
    if (!embedding) throw new Error('Embeddings response missing data[0].embedding')
    assertEmbeddingDim(embedding, this.dim, 'openai-compatible embedding')
    return embedding
  }
}
