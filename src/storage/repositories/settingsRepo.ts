import { db } from '../db'

/**
 * Key-value settings. API keys are stored ONLY here (local IndexedDB) and never
 * committed, logged, or exported.
 */
export const settingsRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await db.settings.get(key)
    return row?.value as T | undefined
  },

  async set<T>(key: string, value: T): Promise<void> {
    await db.settings.put({ key, value })
  },

  async remove(key: string): Promise<void> {
    await db.settings.delete(key)
  },

  async all(): Promise<Record<string, unknown>> {
    const rows = await db.settings.toArray()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  },
}

export const SETTING_KEYS = {
  llmProviderConfig: 'llm.providerConfig',
  llmApiKey: 'llm.apiKey',
  embeddingMode: 'rag.embeddingMode',
  embeddingConfig: 'rag.embeddingConfig',
  packBaseUrl: 'packs.baseUrl',
  speech: 'a11y.speech',
} as const
