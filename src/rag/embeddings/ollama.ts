import { DEFAULT_EMBEDDING_DIM } from '@/types'
import { assertEmbeddingDim, type EmbeddingProvider } from './types'

export interface OllamaEmbeddingOptions {
  /** Base host, default matches the existing corpus tooling. */
  baseUrl?: string
  model?: string
  /** Expected output vector length for `model`. Defaults to `bge-m3`'s 1024. */
  dim?: number
  timeoutMs?: number
}

/**
 * Real local embeddings via Ollama's native embeddings endpoint. Defaults to
 * `bge-m3` (1024-dim, multilingual) — the app's default embedding model, chosen
 * for strong ru/ro/en retrieval in one vector space. Pass `model`/`dim` to use a
 * different Ollama-served model (e.g. legacy `nomic-embed-text`, 768-dim).
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string
  readonly dim: number
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(opts: OllamaEmbeddingOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
    this.modelId = opts.model ?? 'bge-m3'
    this.dim = opts.dim ?? DEFAULT_EMBEDDING_DIM
    this.timeoutMs = opts.timeoutMs ?? 8000
  }

  async embed(text: string): Promise<number[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.modelId, prompt: text }),
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`Ollama embeddings HTTP ${res.status}`)
      }
      const data = (await res.json()) as { embedding?: number[] }
      if (!data.embedding) throw new Error('Ollama response missing embedding')
      assertEmbeddingDim(data.embedding, this.dim, 'ollama embedding')
      return data.embedding
    } finally {
      clearTimeout(timer)
    }
  }

  /** Lightweight reachability probe used by the factory fallback. */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
