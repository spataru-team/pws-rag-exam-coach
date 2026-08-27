import { describe, it, expect } from 'vitest'
import { selectReranker } from './rerankRuntime'
import { CrossEncoderReranker } from './crossEncoderReranker'
import { LexicalReranker, defaultReranker } from './rerank'

describe('selectReranker', () => {
  it('picks a CrossEncoderReranker for the openai-compatible backend (OVMS/proxy)', () => {
    const r = selectReranker({ backend: 'openai-compatible', baseUrl: 'http://localhost:8000/v3' })
    expect(r).toBeInstanceOf(CrossEncoderReranker)
  })

  it('falls back to the offline LexicalReranker for the ollama backend (no rerank endpoint)', () => {
    const r = selectReranker({ backend: 'ollama' })
    expect(r).toBeInstanceOf(LexicalReranker)
  })

  it('defaults to the same reranker singleton the app used before this existed', () => {
    const r = selectReranker({ backend: 'ollama' })
    expect(r).toBe(defaultReranker)
  })
})
