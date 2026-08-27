/** Identifier recorded on packs so query embeddings use the same model. */
export type EmbeddingModelId = 'bge-m3' | 'nomic-embed-text' | 'deterministic-stub' | string

export interface EmbeddingProvider {
  readonly modelId: EmbeddingModelId
  /** Vector length this provider's model produces. Must match the pack's `embeddingDim`. */
  readonly dim: number
  /** Returns a vector of length `dim`. */
  embed(text: string): Promise<number[]>
}

/** Throws unless the vector has exactly `expectedDim` dimensions. */
export function assertEmbeddingDim(vec: number[], expectedDim: number, context = 'embedding'): void {
  if (vec.length !== expectedDim) {
    throw new Error(
      `${context}: expected ${expectedDim} dims, got ${vec.length}`,
    )
  }
}

/**
 * A pack's `embeddingModel` may carry a provider-qualified id recorded at
 * seed time for provenance (e.g. Cloudflare Workers AI's `@cf/baai/bge-m3`).
 * Local model servers (Ollama, OVMS) register the same model under its bare
 * family name — requesting the qualified id from them 400s. Strips down to
 * the last path segment; a no-op for already-bare ids like `bge-m3`.
 */
export function bareModelName(modelId: string): string {
  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}
