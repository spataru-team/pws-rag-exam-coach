export type ApiKeyMode = 'none' | 'user_key' | 'proxy'

export type ProviderKind =
  | 'mock'
  | 'openai'
  | 'openrouter'
  | 'lmstudio'
  | 'ollama'
  // OpenVINO Model Server (OVMS) exposes an OpenAI-compatible API, so it reuses
  // the OpenAICompatibleAdapter — no dedicated adapter needed.
  | 'openvino'

/** Whether prompts leave the device when using this provider. */
export type DataLocality = 'local' | 'cloud'

/** LLMProvider — provider configuration (spec interface). */
export interface LLMProviderConfig {
  id: string
  kind: ProviderKind
  name: string
  baseUrl: string
  apiKeyMode: ApiKeyMode
  model: string
  supportsStreaming: boolean
  supportsJsonMode: boolean
  /** Where data goes; cloud providers must surface a warning before use. */
  locality: DataLocality
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  jsonMode?: boolean
  maxTokens?: number
}

export interface ChatUsage {
  tokensIn: number
  tokensOut: number
}

export interface ChatResponse {
  content: string
  usage: ChatUsage
  latencyMs: number
  provider: string
  model: string
}

/** Runtime adapter that talks to a provider. */
export interface LLMAdapter {
  readonly config: LLMProviderConfig
  chat(request: ChatRequest, apiKey?: string): Promise<ChatResponse>
}
