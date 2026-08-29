/**
 * Capability probe for the same-origin Cloudflare Pages Function proxy
 * (`functions/api/[[path]].ts` → `src/server/openaiProxy.ts`).
 *
 * Used ONLY to decide the first-run provider pre-selection in onboarding. It
 * hits the lightweight `GET /api/v1/health` route, which never invokes an LLM,
 * creates no token usage, and returns no secret value — just whether the proxy
 * route exists and whether the chat key is configured.
 *
 * On a plain `npm run dev` / `npm run preview` there is no Function, so the
 * request 404s (or the SPA fallback returns HTML) and this resolves to
 * "not available" → onboarding stays on the offline Mock provider.
 */
export interface ProxyCapability {
  /** An `/api/v1` proxy route responded with a valid health payload. */
  available: boolean
  /** ...and the chat proxy has its upstream key (a real chat request would work). */
  configured: boolean
}

const UNAVAILABLE: ProxyCapability = { available: false, configured: false }

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
      configured: data.configured === true,
    }
  } catch {
    // Network error, 404 without a JSON body, timeout, malformed JSON — all mean
    // "no usable same-origin proxy here".
    return UNAVAILABLE
  }
}

/**
 * The provider onboarding should pre-select for a fresh session. Mock unless a
 * *configured* same-origin cloud proxy is actually reachable (the deployed site,
 * or `npm run cf:dev` with `.dev.vars`). Never returns a local (Ollama/OVMS)
 * provider — those are opt-in.
 */
export function pickInitialProviderId(cap: ProxyCapability): 'mock' | 'worker' {
  return cap.available && cap.configured ? 'worker' : 'mock'
}
