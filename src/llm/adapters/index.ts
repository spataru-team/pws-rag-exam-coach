import type { LLMAdapter, LLMProviderConfig } from '../types'
import { MockAdapter } from './mock'
import { OpenAICompatibleAdapter } from './openaiCompatible'

export { MockAdapter } from './mock'
export { OpenAICompatibleAdapter } from './openaiCompatible'

/** Builds the right adapter for a provider config. */
export function createAdapter(config: LLMProviderConfig): LLMAdapter {
  if (config.kind === 'mock') return new MockAdapter(config)
  return new OpenAICompatibleAdapter(config)
}
