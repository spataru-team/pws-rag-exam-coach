import { DEFAULT_EMBEDDING_DIM } from '@/types'
import type { EmbeddingProvider } from './types'

/**
 * Offline, dependency-free embedding stub. It is NOT semantic — it maps text to
 * a stable pseudo-random unit vector so that:
 *   - identical text always yields the same vector (cache-friendly, testable),
 *   - lexically overlapping text shares dimensions (token-hashed bag-of-words),
 *   - retrieval works fully offline without Ollama.
 *
 * Replaced by OllamaEmbeddingProvider when a real model is available. Packs
 * built with this stub are tagged `deterministic-stub` so queries match. `dim`
 * is configurable so a stub-embedded pack can mirror any real model's shape
 * (defaults to `DEFAULT_EMBEDDING_DIM`, the app's default bge-m3 dimension).
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'deterministic-stub'
  readonly dim: number

  constructor(dim: number = DEFAULT_EMBEDDING_DIM) {
    this.dim = dim
  }

  async embed(text: string): Promise<number[]> {
    return Promise.resolve(embedDeterministic(text, this.dim))
  }
}

export function embedDeterministic(text: string, dim: number = DEFAULT_EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0)
  const tokens = tokenize(text)
  for (const token of tokens) {
    // Spread each token across a few dimensions for a denser signal.
    let h = hashString(token)
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(h) % dim
      const sign = (h & 1) === 0 ? 1 : -1
      vec[d] = (vec[d] as number) + sign
      h = hashString(token + ':' + k)
    }
  }
  return normalize(vec)
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** FNV-1a 32-bit hash — deterministic and fast. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h | 0
}

function normalize(vec: number[]): number[] {
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}
