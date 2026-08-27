import { DEFAULT_EMBEDDING_DIM } from '@/types'
import { DeterministicEmbeddingProvider } from './deterministic'
import { OllamaEmbeddingProvider } from './ollama'
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'
import { bareModelName, type EmbeddingProvider } from './types'

/**
 * Runtime embedding backend chosen by the user in Settings. The *model name*
 * always comes from the downloaded pack (so query and chunk vectors share a
 * space); this only selects WHERE that model is served.
 */
export interface EmbeddingRuntimeConfig {
  backend: 'ollama' | 'openai-compatible'
  /** For `openai-compatible` (OVMS / Workers AI / OpenAI). */
  baseUrl?: string
  apiKey?: string
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingRuntimeConfig = {
  backend: 'openai-compatible',
  baseUrl: '/api/v1',
}
export const DEFAULT_OPENAI_EMBED_BASE_URL = 'http://localhost:8000/v3'

/**
 * Picks the query embedder. Deterministic-stub packs always use the offline
 * stub. Real packs use the configured backend with the pack's model name, so
 * the spaces match. `packDim` (the pack's recorded `embeddingDim`) is threaded
 * through so the provider validates its own output against it, catching a
 * misconfigured backend before it silently poisons the vector space. Pure (no
 * I/O) — unit-testable.
 */
export function selectEmbedder(
  packModel: string | undefined,
  config: EmbeddingRuntimeConfig = DEFAULT_EMBEDDING_CONFIG,
  packDim: number = DEFAULT_EMBEDDING_DIM,
): EmbeddingProvider {
  if (!packModel || packModel === 'deterministic-stub') {
    return new DeterministicEmbeddingProvider(packDim)
  }
  if (config.backend === 'openai-compatible') {
    return new OpenAICompatibleEmbeddingProvider({
      baseUrl: config.baseUrl ?? DEFAULT_OPENAI_EMBED_BASE_URL,
      model: bareModelName(packModel),
      expectedDim: packDim,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    })
  }
  return new OllamaEmbeddingProvider({ model: bareModelName(packModel), dim: packDim })
}
