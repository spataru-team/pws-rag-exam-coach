const OPENAI_BASE = 'https://api.openai.com/v1'
// Workers AI's OpenAI-compatible REST API (see docs/DEPLOY_CLOUDFLARE.md). Same
// request/response shape as OpenAI's /embeddings, so the client-side
// OpenAICompatibleEmbeddingProvider needs no special-casing for this branch.
const CF_AI_BASE = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
// bge-m3: 1024-dim, multilingual (ru/ro/en) — see docs/ARCHITECTURE.md §RAG.
// Chosen over OpenAI's text-embedding-3-small specifically because query/chunk
// vectors from different models are never comparable even at equal dimensions,
// so the embedding model must be the same one used to build the packs.
const EMBED_MODEL = '@cf/baai/bge-m3'
// bge-reranker-base — same family CrossEncoderReranker also targets on OVMS
// (bge-reranker-v2-m3), so the hosted pilot and the offline demo run the same
// reranking step, just on different infrastructure.
const RERANK_MODEL = '@cf/baai/bge-reranker-base'
const CHAT_MODELS = new Set(['gpt-5.4-mini', 'gpt-5.4-nano'])
const DEFAULT_CHAT_MODEL = 'gpt-5.4-mini'
const MAX_OUTPUT_TOKENS = 512

export interface ProxyEnv {
  /** Chat completions only (OpenAI). */
  OPENAI_API_KEY?: string
  /** Embeddings and reranking (Cloudflare Workers AI). The token needs the
   * "Workers AI" scope; see docs/DEPLOY_CLOUDFLARE.md. */
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string
}
export interface ProxyDeps {
  fetch?: typeof fetch
}

/**
 * Same-origin proxy used by the Cloudflare Pages Function. Routes embeddings to
 * Workers AI (bge-m3, pinned) and chat to OpenAI (allowlisted model), injecting
 * the matching secret bearer key per branch so neither key is ever sent to the
 * wrong upstream. `fetch` is injectable for tests.
 */
export async function handleOpenAiProxy(
  request: Request,
  env: ProxyEnv,
  deps: ProxyDeps = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  // Same-origin guard: a browser only sends Origin cross-origin; reject mismatches.
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Forbidden origin' }, 403)
  }

  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')

  // Non-generative capability probe for the client's first-run provider
  // auto-selection (src/llm/proxyProbe.ts). It NEVER calls the upstream LLM,
  // creates no token usage, and echoes no secret value — only whether this
  // proxy route exists (`available`) and whether the chat key is present
  // (`configured`). A plain `npm run dev`/`preview` has no Function, so this
  // 404s and the client stays on the offline Mock provider.
  if (path === '/health') {
    return json({ available: true, configured: Boolean(env.OPENAI_API_KEY) }, 200)
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  let target: string
  let authKey: string | undefined
  let isRerank = false
  if (path === '/embeddings') {
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      return json({ error: 'Proxy misconfigured: CF_ACCOUNT_ID/CF_API_TOKEN not set' }, 500)
    }
    body.model = EMBED_MODEL
    // bge-m3 doesn't support OpenAI's `dimensions` truncation param; strip any
    // client-supplied value rather than send it upstream unchecked.
    delete body.dimensions
    target = `${CF_AI_BASE(env.CF_ACCOUNT_ID)}/embeddings`
    authKey = env.CF_API_TOKEN
  } else if (path === '/rerank') {
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      return json({ error: 'Proxy misconfigured: CF_ACCOUNT_ID/CF_API_TOKEN not set' }, 500)
    }
    // CrossEncoderReranker speaks the Cohere-ish shape {model, query, documents}
    // (also what OVMS's /v3/rerank expects); Workers AI's raw run endpoint wants
    // {query, contexts:[{text}]} and has no OpenAI/Cohere-compatible alias for
    // this model, so both directions get reshaped here.
    const documents = Array.isArray(body.documents) ? (body.documents as unknown[]) : []
    const cfBody = {
      query: typeof body.query === 'string' ? body.query : '',
      contexts: documents.map((d) => ({ text: String(d) })),
    }
    target = `${CF_AI_BASE(env.CF_ACCOUNT_ID).replace(/\/v1$/, '')}/run/${RERANK_MODEL}`
    authKey = env.CF_API_TOKEN
    isRerank = true
    body = cfBody
  } else if (path === '/chat/completions') {
    if (!env.OPENAI_API_KEY) {
      return json({ error: 'Proxy misconfigured: OPENAI_API_KEY not set' }, 500)
    }
    const requested = typeof body.model === 'string' ? body.model : ''
    body.model = CHAT_MODELS.has(requested) ? requested : DEFAULT_CHAT_MODEL
    // Cost controls for a public key-bearing proxy: force non-streaming (we read
    // the response as text), single completion, and a hard output-token cap.
    delete body.stream
    body.n = 1
    // GPT-5.x chat models use `max_completion_tokens` and REJECT `max_tokens`.
    // Accept either field from the client, clamp it, and emit only the new one.
    const requestedMax =
      typeof body.max_completion_tokens === 'number'
        ? body.max_completion_tokens
        : typeof body.max_tokens === 'number'
          ? body.max_tokens
          : MAX_OUTPUT_TOKENS
    delete body.max_tokens
    body.max_completion_tokens = Math.min(requestedMax, MAX_OUTPUT_TOKENS)
    target = `${OPENAI_BASE}/chat/completions`
    authKey = env.OPENAI_API_KEY
  } else {
    return json({ error: 'Not found' }, 404)
  }

  const upstream = await doFetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
    },
    body: JSON.stringify(body),
  })

  if (isRerank) {
    // Reshape Cloudflare's run-endpoint envelope { result: { response: [{index,
    // score}] }, success } into the Cohere shape { results: [{index,
    // relevance_score}] } CrossEncoderReranker parses uniformly, whichever
    // backend served the request.
    let payload: unknown
    try {
      payload = await upstream.json()
    } catch {
      return json({ error: 'Rerank upstream returned invalid JSON' }, 502)
    }
    const scores = extractRerankScores(payload)
    if (!upstream.ok || !scores) {
      return json({ error: 'Rerank upstream failed', upstream: payload }, upstream.ok ? 502 : upstream.status)
    }
    return json(
      { results: scores.map((s) => ({ index: s.index, relevance_score: s.score })) },
      200,
    )
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function extractRerankScores(payload: unknown): { index: number; score: number }[] | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const result = (payload as { result?: unknown }).result ?? payload
  if (typeof result !== 'object' || result === null) return undefined
  const response = (result as { response?: unknown }).response
  if (!Array.isArray(response)) return undefined
  // Workers AI's actual run-endpoint response uses `id`, not `index` (verified
  // against the live endpoint — the OpenAI/Cohere-style docs this was first
  // written from don't match). Accept either so a future Cloudflare response
  // shape change, or a different upstream using `index`, both still work.
  const scores: { index: number; score: number }[] = []
  for (const r of response) {
    if (typeof r !== 'object' || r === null) return undefined
    const idRaw = (r as { id?: unknown; index?: unknown }).id ?? (r as { index?: unknown }).index
    const score = (r as { score?: unknown }).score
    if (typeof idRaw !== 'number' || typeof score !== 'number') return undefined
    scores.push({ index: idRaw, score })
  }
  return scores
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
