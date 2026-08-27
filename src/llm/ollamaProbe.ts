/**
 * Best-effort check for a local Ollama. Used to offer (not force) local grading
 * on a local run. On a hosted HTTPS site this fails (mixed-content / no host),
 * which is the intended behavior — the cloud proxy stays the default there.
 */
export async function isOllamaReachable(
  baseUrl = 'http://localhost:11434',
  timeoutMs = 1200,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}
