import { DeterministicEmbeddingProvider } from './deterministic'
import { OllamaEmbeddingProvider } from './ollama'
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'
import type { EmbeddingProvider } from './types'

export * from './types'
export * from './runtime'
export { DeterministicEmbeddingProvider, embedDeterministic } from './deterministic'
export { OllamaEmbeddingProvider } from './ollama'
export { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'

export type EmbeddingMode = 'auto' | 'ollama' | 'deterministic' | 'openai-compatible'

export interface EmbeddingFactoryOptions {
  mode?: EmbeddingMode
  ollama?: { baseUrl?: string; model?: string; dim?: number }
  /** For `openai-compatible` mode: OVMS / Workers AI / OpenAI embeddings. */
  openaiCompatible?: {
    baseUrl: string
    model: string
    apiKey?: string
    dimensions?: number
    expectedDim?: number
  }
}

/**
 * Resolves an EmbeddingProvider. In `auto` mode it tries Ollama and falls back
 * to the deterministic stub when Ollama is unreachable, so the app always works.
 * `openai-compatible` targets an OVMS / cloud `/embeddings` endpoint. The chosen
 * provider's `modelId` must be recorded alongside any vectors it produces so
 * queries are embedded by the same model.
 */
export async function resolveEmbeddingProvider(
  opts: EmbeddingFactoryOptions = {},
): Promise<EmbeddingProvider> {
  const mode = opts.mode ?? 'auto'
  if (mode === 'deterministic') return new DeterministicEmbeddingProvider()

  if (mode === 'openai-compatible') {
    if (!opts.openaiCompatible) {
      throw new Error('openai-compatible mode requires openaiCompatible options')
    }
    return new OpenAICompatibleEmbeddingProvider(opts.openaiCompatible)
  }

  const ollama = new OllamaEmbeddingProvider(opts.ollama)
  if (mode === 'ollama') return ollama

  // auto: actually attempt an embedding so a running server *without* the
  // embedding model still falls back cleanly to the deterministic stub.
  try {
    await ollama.embed('probe')
    return ollama
  } catch {
    return new DeterministicEmbeddingProvider()
  }
}
