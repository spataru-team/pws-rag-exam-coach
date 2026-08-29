import type { LLMProviderConfig } from './types'

/** Built-in provider presets. baseUrls match the existing local stack. */
export const PROVIDER_PRESETS: Record<string, LLMProviderConfig> = {
  mock: {
    id: 'mock',
    kind: 'mock',
    name: 'Mock (offline demo)',
    baseUrl: '',
    apiKeyMode: 'none',
    model: 'mock-grounded',
    supportsStreaming: false,
    supportsJsonMode: true,
    locality: 'local',
  },
  ollama: {
    id: 'ollama',
    kind: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyMode: 'none',
    model: 'qwen3.6:27b',
    supportsStreaming: true,
    supportsJsonMode: true,
    locality: 'local',
  },
  lmstudio: {
    id: 'lmstudio',
    kind: 'lmstudio',
    name: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyMode: 'none',
    model: 'local-model',
    supportsStreaming: true,
    supportsJsonMode: false,
    locality: 'local',
  },
  openvino: {
    id: 'openvino',
    kind: 'openvino',
    // OpenVINO Model Server — optimized local inference on Intel CPU/GPU/NPU.
    // Serves an OpenAI-compatible API at /v3, so it works through the shared
    // OpenAICompatibleAdapter with no extra code. Set `model` to your served model.
    name: 'OpenVINO (local, OVMS)',
    baseUrl: 'http://localhost:8000/v3',
    apiKeyMode: 'none',
    // Must match the `name` OVMS's config.json registers the chat graph under
    // (see ovms/tools/ + ovms/README.md) — verified end-to-end against a real
    // export of OpenVINO/Qwen3-4B-int4-ov.
    model: 'ov-llm',
    supportsStreaming: true,
    supportsJsonMode: false,
    locality: 'local',
  },
  openai: {
    id: 'openai',
    kind: 'openai',
    name: 'OpenAI (свой ключ)',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMode: 'user_key',
    model: 'gpt-4o-mini',
    supportsStreaming: true,
    supportsJsonMode: true,
    locality: 'cloud',
  },
  worker: {
    id: 'worker',
    kind: 'openai',
    name: 'OpenAI-compatible (cloud)',
    baseUrl: '/api/v1',
    apiKeyMode: 'proxy',
    model: 'gpt-5.4-mini',
    supportsStreaming: false,
    supportsJsonMode: true,
    locality: 'cloud',
  },
  openrouter: {
    id: 'openrouter',
    kind: 'openrouter',
    name: 'OpenRouter (cloud)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyMode: 'user_key',
    model: 'openai/gpt-4o-mini',
    supportsStreaming: true,
    supportsJsonMode: true,
    locality: 'cloud',
  },
}

/**
 * Deployed / fallback default. It is what the store falls back to when no
 * provider is persisted yet, and what the deployed site's onboarding lands on.
 *
 * NOTE: onboarding is capability-aware (see `src/screens/Onboarding.tsx` +
 * `src/llm/proxyProbe.ts`): a fresh session starts on `mock` and only switches
 * to `worker` when a *configured* same-origin `/api/v1` proxy is detected. So on
 * a plain `npm run dev` / `npm run preview` the first-run provider is `mock`,
 * not this constant. Do not treat this as "the default the user always sees".
 */
export const DEFAULT_PROVIDER_ID = 'worker'
