/**
 * Capability probe for the same-origin Cloudflare Pages Function proxy
 * (`functions/api/[[path]].ts` → `src/server/openaiProxy.ts`).
 *
 * It hits the lightweight `GET /api/v1/health` route, which never invokes an
 * LLM, creates no token usage, and returns no secret value — only which
 * capabilities the deployment has enabled.
 *
 * On a plain `npm run dev` / `npm run preview` there is no Function, so the
 * request 404s (or the SPA fallback returns HTML) and this resolves to
 * "nothing available".
 */
export interface ProxyCapability {
  /** Transport check only: an `/api/v1` route answered with a valid JSON health
   * payload. NOT a capability — nothing selects a provider from this. */
  available: boolean
  /** Managed embeddings (Cloudflare Workers AI `bge-m3`) are configured. */
  embeddingsConfigured: boolean
  /** Managed chat (the team-side OpenAI key) is configured. Independent of
   * `embeddingsConfigured` and never inferred from it — the public deployment
   * runs embeddings ON and chat OFF. */
  chatConfigured: boolean
}

const UNAVAILABLE: ProxyCapability = {
  available: false,
  embeddingsConfigured: false,
  chatConfigured: false,
}

export async function checkProxyCapability(
  url = '/api/v1/health',
  timeoutMs = 1500,
  fetchImpl: typeof fetch = fetch,
): Promise<ProxyCapability> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok || !contentType.includes('application/json')) return UNAVAILABLE
    const data = (await res.json()) as Partial<ProxyCapability>
    return {
      available: data.available === true,
      embeddingsConfigured: data.embeddingsConfigured === true,
      chatConfigured: data.chatConfigured === true,
    }
  } catch {
    // Network error, 404 without a JSON body, timeout, malformed JSON — all mean
    // "no usable same-origin proxy here".
    return UNAVAILABLE
  }
}

/**
 * The provider onboarding pre-selects for a fresh session. Always **Mock** — the
 * offline, deterministic, zero-setup default for every run mode, including the
 * deployed site. Managed chat (`worker`) is never auto-selected; real cloud chat
 * is a deliberate BYOK choice, and managed embeddings power retrieval regardless
 * of the chat provider. This is the single place first-run chat policy lives.
 */
export function pickInitialProviderId(_cap: ProxyCapability): 'mock' {
  return 'mock'
}
