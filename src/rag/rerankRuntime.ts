import type { EmbeddingRuntimeConfig } from './embeddings/runtime'
import { DEFAULT_EMBEDDING_CONFIG, DEFAULT_OPENAI_EMBED_BASE_URL } from './embeddings/runtime'
import { CrossEncoderReranker } from './crossEncoderReranker'
import { defaultReranker, type Reranker } from './rerank'

/**
 * OVMS serves embeddings, reranking and chat off the same `/v3` base URL (see
 * ovms/README.md), and the Cloudflare proxy now exposes a matching `/rerank`
 * route on `/api/v1` (see src/server/openaiProxy.ts) — so the reranker reuses
 * the *same* EmbeddingRuntimeConfig the user already set in Settings rather
 * than needing a second backend/baseUrl picker. Ollama has no rerank endpoint,
 * so that backend keeps the offline LexicalReranker.
 */
export const RERANK_MODEL = 'bge-reranker-v2-m3'

export function selectReranker(config: EmbeddingRuntimeConfig = DEFAULT_EMBEDDING_CONFIG): Reranker {
  if (config.backend !== 'openai-compatible') return defaultReranker
  return new CrossEncoderReranker({
    baseUrl: config.baseUrl ?? DEFAULT_OPENAI_EMBED_BASE_URL,
    model: RERANK_MODEL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    fallback: defaultReranker,
  })
}
