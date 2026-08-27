import type { LLMProviderConfig } from './types'

export interface ProviderValidationResult {
  valid: boolean
  errors: string[]
  /** Non-blocking notices, e.g. the cloud-data warning. */
  warnings: string[]
}

/** True when using this config will send prompts to an external service. */
export function isCloudProvider(config: LLMProviderConfig): boolean {
  return config.locality === 'cloud'
}

/**
 * Validates a provider config and surfaces the cloud warning. A cloud provider
 * in `user_key` mode requires a key to actually run, but the config itself can
 * be saved without one — the key is validated separately at call time.
 */
export function validateProviderConfig(
  config: LLMProviderConfig,
  apiKey?: string,
): ProviderValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!config.id) errors.push('Provider id is required.')
  if (!config.model) errors.push('Model is required.')

  if (config.kind !== 'mock') {
    if (!config.baseUrl) {
      errors.push('Base URL is required.')
    } else if (!/^https?:\/\//.test(config.baseUrl) && !config.baseUrl.startsWith('/')) {
      errors.push('Base URL must start with http://, https://, or / (same-origin proxy)')
    }
  }

  if (config.apiKeyMode === 'user_key' && !apiKey) {
    warnings.push(
      'This provider needs an API key. Add one in Settings; it is stored only on this device.',
    )
  }

  if (isCloudProvider(config)) {
    warnings.push(
      'Cloud provider: your prompts (including retrieved text) will be sent to an external service.',
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}
