import { describe, it, expect } from 'vitest'
import { selectEmbedder, DEFAULT_EMBEDDING_CONFIG, type EmbeddingRuntimeConfig } from './runtime'
import { DeterministicEmbeddingProvider } from './deterministic'
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'

describe('selectEmbedder', () => {
  it('uses the deterministic stub for stub or unknown pack model', () => {
    expect(selectEmbedder(undefined)).toBeInstanceOf(DeterministicEmbeddingProvider)
    expect(selectEmbedder('deterministic-stub')).toBeInstanceOf(
      DeterministicEmbeddingProvider,
    )
  })

  it('defaults to the OpenAI-compatible proxy for a real pack model, keeping the pack model name', () => {
    const e = selectEmbedder('bge-m3')
    expect(e).toBeInstanceOf(OpenAICompatibleEmbeddingProvider)
    expect(e.modelId).toBe('bge-m3')
  })

  it('uses the OpenAI-compatible provider (OVMS) when configured', () => {
    const config: EmbeddingRuntimeConfig = {
      backend: 'openai-compatible',
      baseUrl: 'http://localhost:8000/v3',
    }
    const e = selectEmbedder('bge-m3', config)
    expect(e).toBeInstanceOf(OpenAICompatibleEmbeddingProvider)
    // Model name still comes from the pack so the vector spaces match.
    expect(e.modelId).toBe('bge-m3')
  })

  it('never routes a stub pack to a network backend', () => {
    const config: EmbeddingRuntimeConfig = { backend: 'openai-compatible' }
    expect(selectEmbedder('deterministic-stub', config)).toBeInstanceOf(
      DeterministicEmbeddingProvider,
    )
  })

  it('defaults to the same-origin OpenAI-compatible proxy', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.backend).toBe('openai-compatible')
    expect(DEFAULT_EMBEDDING_CONFIG.baseUrl).toBe('/api/v1')
  })

  it('threads packDim through to the constructed provider so a mismatched backend fails loudly', () => {
    const stub = selectEmbedder(undefined, DEFAULT_EMBEDDING_CONFIG, 384)
    expect(stub.dim).toBe(384)
    const real = selectEmbedder('bge-m3', DEFAULT_EMBEDDING_CONFIG, 1024)
    expect(real.dim).toBe(1024)
  })

  it('defaults dim to DEFAULT_EMBEDDING_DIM (1024) when the pack predates the embeddingDim field', () => {
    expect(selectEmbedder('bge-m3').dim).toBe(1024)
  })
})
