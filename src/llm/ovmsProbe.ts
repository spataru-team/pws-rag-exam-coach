/**
 * Best-effort check for a local OpenVINO Model Server (OVMS). Used to offer
 * (not force) the local OpenVINO provider + matching embeddings backend on a
 * local run — mirrors isOllamaReachable. On a hosted HTTPS site this fails
 * (mixed-content / no host), which is the intended behavior.
 */
export async function isOvmsReachable(
  baseUrl = 'http://localhost:8000/v3',
  timeoutMs = 1200,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    // OVMS's health endpoint lives under /v2, one level up from the
    // OpenAI-compatible /v3 API surface this app otherwise talks to.
    const healthUrl = `${baseUrl.replace(/\/$/, '').replace(/\/v3$/, '')}/v2/health/ready`
    const res = await fetchImpl(healthUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}
