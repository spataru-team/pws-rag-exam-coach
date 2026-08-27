# Cloudflare Pages + OpenAI Proxy Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the grade-9 Romanian mock-exam pilot on Cloudflare Pages, with embeddings and barem grading served by OpenAI through a same-origin Pages Function proxy so the OpenAI key never reaches the browser.

**Architecture:** A Cloudflare Pages Function at `/api/*` proxies to OpenAI (key as a Pages secret), forcing `text-embedding-3-small`@768 for embeddings and an allowlisted chat model (default `gpt-5.4-mini`). The frontend defaults to a new `worker` provider preset (`apiKeyMode:'proxy'`, `baseUrl:'/api/v1'`) and an openai-compatible embedding backend at `/api/v1`. The Romanian pack is re-seeded with OpenAI embeddings so query and chunk vectors share a space. A local-Ollama probe lets a local run opt into Ollama for grading only.

**Tech Stack:** TypeScript, Vite PWA, vitest, Cloudflare Pages + Pages Functions, wrangler, OpenAI API.

**Spec:** `docs/superpowers/specs/2026-06-13-cloudflare-openai-deploy-design.md`

---

## File Structure

- Create: `src/server/openaiProxy.ts` — pure proxy handler `handleOpenAiProxy(request, env, deps?)` (testable, fetch injectable).
- Create: `src/server/openaiProxy.test.ts` — vitest unit tests for the handler.
- Create: `functions/api/[[path]].ts` — thin Cloudflare Pages Function wrapper calling the handler.
- Create: `src/llm/ollamaProbe.ts` — `isOllamaReachable()` probe.
- Create: `src/llm/ollamaProbe.test.ts` — probe tests.
- Create: `src/llm/presets.test.ts` — asserts the `worker` preset + default id.
- Modify: `src/rag/embeddings/openaiCompatible.ts` — add optional `dimensions` to the request.
- Modify: `src/rag/embeddings/index.ts` — thread `dimensions` through the factory.
- Modify: `scripts/seed-packs.ts` — read `EMBED_DIMENSIONS`.
- Modify: `src/llm/presets.ts` — add `worker` preset; `DEFAULT_PROVIDER_ID = 'worker'`.
- Modify: `src/llm/index.ts` — ensure `DEFAULT_PROVIDER_ID` is re-exported.
- Modify: `src/llm/validation.ts` — accept a relative (`/...`) baseUrl.
- Modify: `src/llm/validation.test.ts` — case for the relative baseUrl / worker preset.
- Modify: `src/app/store.ts` — default provider → `worker`.
- Modify: `src/rag/embeddings/runtime.ts` — `DEFAULT_EMBEDDING_CONFIG` → openai-compatible `/api/v1`.
- Modify: `src/rag/embeddings/runtime.test.ts` — assert the new default.
- Modify: `src/screens/Settings.tsx` — local-Ollama notice + one-click switch.
- Modify: `src/i18n/locales/{en,ru,ro}.json` — strings for the notice.
- Modify: `package.json` — `wrangler` devDep + `cf:dev` / `cf:deploy` scripts.
- Modify: `.gitignore` — ignore `.dev.vars`.
- Modify (generated, user-run): `public/packs/romanian.pack.json` — re-seeded with OpenAI embeddings.
- Create (user-run, docs): `docs/DEPLOY_CLOUDFLARE.md` — deploy runbook.

**Operational note:** Tasks 1–4 are fully code + tests (agent-implementable, no secrets). Task 5 (re-seed) needs the real OpenAI key; Task 6 (deploy) needs Cloudflare auth + the key. Those two are **user-run** with the exact commands provided.

---

## Task 1: OpenAI proxy handler + Pages Function

**Files:**
- Create: `src/server/openaiProxy.ts`
- Test: `src/server/openaiProxy.test.ts`
- Create: `functions/api/[[path]].ts`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Write the failing test**

Create `src/server/openaiProxy.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleOpenAiProxy } from './openaiProxy'

function req(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.pages.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
const env = { OPENAI_API_KEY: 'sk-test' }
const okFetch = () =>
  vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

describe('handleOpenAiProxy', () => {
  it('forces embedding model + dimensions and adds the auth header', async () => {
    const fetchMock = okFetch()
    const res = await handleOpenAiProxy(
      req('/api/v1/embeddings', { model: 'evil', input: 'hi' }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(200)
    const [target, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe('https://api.openai.com/v1/embeddings')
    const sent = JSON.parse(opts.body as string)
    expect(sent.model).toBe('text-embedding-3-small')
    expect(sent.dimensions).toBe(768)
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('coerces an unknown chat model to the default', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-4o', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string).model).toBe('gpt-5.4-mini')
  })

  it('keeps an allowlisted chat model', async () => {
    const fetchMock = okFetch()
    await handleOpenAiProxy(
      req('/api/v1/chat/completions', { model: 'gpt-5.4-nano', messages: [] }),
      env,
      { fetch: fetchMock },
    )
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string).model).toBe('gpt-5.4-nano')
  })

  it('rejects a foreign Origin without calling upstream', async () => {
    const fetchMock = okFetch()
    const res = await handleOpenAiProxy(
      req('/api/v1/embeddings', {}, { Origin: 'https://evil.com' }),
      env,
      { fetch: fetchMock },
    )
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('500s when the key is missing', async () => {
    const res = await handleOpenAiProxy(req('/api/v1/embeddings', {}), {}, { fetch: vi.fn() })
    expect(res.status).toBe(500)
  })

  it('404s unknown paths', async () => {
    const res = await handleOpenAiProxy(req('/api/v1/nope', {}), env, { fetch: vi.fn() })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/server/openaiProxy.test.ts`
Expected: FAIL — `Failed to resolve import "./openaiProxy"`.

- [ ] **Step 3: Implement the handler**

Create `src/server/openaiProxy.ts`:

```ts
const OPENAI_BASE = 'https://api.openai.com/v1'
const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIMENSIONS = 768
const CHAT_MODELS = new Set(['gpt-5.4-mini', 'gpt-5.4-nano'])
const DEFAULT_CHAT_MODEL = 'gpt-5.4-mini'

export interface ProxyEnv {
  OPENAI_API_KEY?: string
}
export interface ProxyDeps {
  fetch?: typeof fetch
}

/**
 * Same-origin OpenAI proxy used by the Cloudflare Pages Function. Pins the
 * embedding model + dimensions (so vectors match the pack) and an allowlisted
 * chat model, and injects the secret bearer key. `fetch` is injectable for tests.
 */
export async function handleOpenAiProxy(
  request: Request,
  env: ProxyEnv,
  deps: ProxyDeps = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() })
  }

  // Same-origin guard: a browser only sends Origin cross-origin; reject mismatches.
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Forbidden origin' }, 403)
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!env.OPENAI_API_KEY) {
    return json({ error: 'Proxy misconfigured: OPENAI_API_KEY not set' }, 500)
  }

  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  let target: string
  if (path === '/embeddings') {
    body.model = EMBED_MODEL
    body.dimensions = EMBED_DIMENSIONS
    target = `${OPENAI_BASE}/embeddings`
  } else if (path === '/chat/completions') {
    const requested = typeof body.model === 'string' ? body.model : ''
    body.model = CHAT_MODELS.has(requested) ? requested : DEFAULT_CHAT_MODEL
    target = `${OPENAI_BASE}/chat/completions`
  } else {
    return json({ error: 'Not found' }, 404)
  }

  const upstream = await doFetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/server/openaiProxy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Create the Pages Function wrapper**

Create `functions/api/[[path]].ts` (lives outside `src/`, bundled by Cloudflare; not covered by `tsc -b`):

```ts
import { handleOpenAiProxy, type ProxyEnv } from '../../src/server/openaiProxy'

// Cloudflare Pages Function: catches /api/* and delegates to the pure handler.
export const onRequest = (context: {
  request: Request
  env: ProxyEnv
}): Promise<Response> => handleOpenAiProxy(context.request, context.env)
```

- [ ] **Step 6: Add wrangler tooling + ignore secrets**

Install wrangler as a dev dependency:

Run: `npm install -D wrangler`

In `package.json` `"scripts"`, add after `"preview": "vite preview",`:

```json
    "cf:dev": "wrangler pages dev dist",
    "cf:deploy": "wrangler pages deploy dist",
```

Append to `.gitignore`:

```
# Cloudflare local secrets
.dev.vars
.wrangler/
```

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add src/server/openaiProxy.ts src/server/openaiProxy.test.ts "functions/api/[[path]].ts" package.json package-lock.json .gitignore
git commit -m "feat: same-origin OpenAI proxy (Cloudflare Pages Function)"
```

---

## Task 2: Embedding `dimensions` support (for re-seeding)

**Files:**
- Modify: `src/rag/embeddings/openaiCompatible.ts`
- Modify: `src/rag/embeddings/index.ts`
- Modify: `scripts/seed-packs.ts`
- Test: `src/rag/embeddings/openaiCompatible.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/rag/embeddings/openaiCompatible.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatible'

afterEach(() => vi.restoreAllMocks())

describe('OpenAICompatibleEmbeddingProvider', () => {
  it('sends `dimensions` in the request body when configured', async () => {
    const vec = Array(768).fill(0.1)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v1',
      model: 'text-embedding-3-small',
      dimensions: 768,
      apiKey: 'k',
    })
    const out = await provider.embed('hi')
    expect(out).toHaveLength(768)
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(opts.body as string)
    expect(sent.model).toBe('text-embedding-3-small')
    expect(sent.dimensions).toBe(768)
  })

  it('omits `dimensions` when not configured', async () => {
    const vec = Array(768).fill(0.2)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 }),
    )
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: 'https://x/v1',
      model: 'nomic-embed-text',
    })
    await provider.embed('hi')
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect('dimensions' in JSON.parse(opts.body as string)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/rag/embeddings/openaiCompatible.test.ts`
Expected: FAIL — first test sees no `dimensions` in body.

- [ ] **Step 3: Add `dimensions` to the provider**

In `src/rag/embeddings/openaiCompatible.ts`, add `dimensions` to the options interface (after `apiKey?: string`):

```ts
  /** Optional output dimensions (e.g. OpenAI text-embedding-3-* → 768). */
  dimensions?: number
```

Add a field and assign it in the constructor (after `this.apiKey = opts.apiKey`):

```ts
  private readonly dimensions?: number
```
```ts
    this.dimensions = opts.dimensions
```

Replace the request body line:

```ts
      body: JSON.stringify({ model: this.modelId, input: text }),
```

with:

```ts
      body: JSON.stringify({
        model: this.modelId,
        input: text,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      }),
```

- [ ] **Step 4: Thread `dimensions` through the factory**

In `src/rag/embeddings/index.ts`, change the `openaiCompatible` option type:

```ts
  /** For `openai-compatible` mode: OVMS / Workers AI / OpenAI embeddings. */
  openaiCompatible?: { baseUrl: string; model: string; apiKey?: string; dimensions?: number }
```

(The `resolveEmbeddingProvider` body already passes `opts.openaiCompatible` straight into the provider, so no other change is needed there.)

- [ ] **Step 5: Let the seed script pass `EMBED_DIMENSIONS`**

In `scripts/seed-packs.ts`, inside `factoryOptions`, extend the `openaiCompatible` object (after the `apiKey` spread line) with:

```ts
        ...(process.env.EMBED_DIMENSIONS
          ? { dimensions: Number(process.env.EMBED_DIMENSIONS) }
          : {}),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- src/rag/embeddings/openaiCompatible.test.ts`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/rag/embeddings/openaiCompatible.ts src/rag/embeddings/openaiCompatible.test.ts src/rag/embeddings/index.ts scripts/seed-packs.ts
git commit -m "feat: optional embedding dimensions for OpenAI text-embedding-3"
```

---

## Task 3: Frontend defaults — worker preset, relative baseUrl, embedding default

**Files:**
- Modify: `src/llm/presets.ts`, `src/llm/index.ts`, `src/llm/validation.ts`, `src/app/store.ts`, `src/rag/embeddings/runtime.ts`
- Test: `src/llm/presets.test.ts` (create), `src/llm/validation.test.ts`, `src/rag/embeddings/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/llm/presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID } from './presets'

describe('worker preset', () => {
  it('is the default and proxies to the same-origin /api/v1', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('worker')
    const w = PROVIDER_PRESETS.worker
    expect(w).toBeDefined()
    expect(w.kind).toBe('openai')
    expect(w.apiKeyMode).toBe('proxy')
    expect(w.baseUrl).toBe('/api/v1')
    expect(w.model).toBe('gpt-5.4-mini')
    expect(w.locality).toBe('cloud')
  })
})
```

In `src/llm/validation.test.ts`, add this case inside the existing top-level `describe` (use the real preset so it stays in sync):

```ts
  it('accepts a same-origin relative baseUrl (worker proxy preset)', () => {
    const result = validateProviderConfig(PROVIDER_PRESETS.worker)
    expect(result.errors).toEqual([])
  })
```

If `PROVIDER_PRESETS` / `validateProviderConfig` are not already imported at the top of `validation.test.ts`, add:

```ts
import { PROVIDER_PRESETS } from './presets'
```
(`validateProviderConfig` is already imported there as the unit under test.)

In `src/rag/embeddings/runtime.test.ts`, add inside the existing top-level `describe`:

```ts
  it('defaults to the same-origin OpenAI-compatible proxy', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.backend).toBe('openai-compatible')
    expect(DEFAULT_EMBEDDING_CONFIG.baseUrl).toBe('/api/v1')
  })
```

If `DEFAULT_EMBEDDING_CONFIG` is not imported there, add it to the existing import from `./runtime`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/llm/presets.test.ts src/llm/validation.test.ts src/rag/embeddings/runtime.test.ts`
Expected: FAIL (no `worker` preset; relative baseUrl rejected; default still ollama).

- [ ] **Step 3: Add the worker preset + default id**

In `src/llm/presets.ts`, add this entry to `PROVIDER_PRESETS` (after the `openai` entry):

```ts
  worker: {
    id: 'worker',
    kind: 'openai',
    name: 'Cloud (OpenAI via proxy)',
    baseUrl: '/api/v1',
    apiKeyMode: 'proxy',
    model: 'gpt-5.4-mini',
    supportsStreaming: false,
    supportsJsonMode: true,
    locality: 'cloud',
  },
```

Change the default line:

```ts
export const DEFAULT_PROVIDER_ID = 'ollama'
```

to:

```ts
export const DEFAULT_PROVIDER_ID = 'worker'
```

- [ ] **Step 4: Ensure `DEFAULT_PROVIDER_ID` is exported from the barrel**

Open `src/llm/index.ts`. If it does not already re-export presets (look for `export * from './presets'` or a named export of `DEFAULT_PROVIDER_ID`), add:

```ts
export { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID } from './presets'
```

(If `PROVIDER_PRESETS` is already exported there, just add `DEFAULT_PROVIDER_ID` to that existing export list.)

- [ ] **Step 5: Allow a relative baseUrl in validation**

In `src/llm/validation.ts`, replace:

```ts
    } else if (!/^https?:\/\//.test(config.baseUrl)) {
      errors.push('Base URL must start with http:// or https://')
    }
```

with:

```ts
    } else if (!/^https?:\/\//.test(config.baseUrl) && !config.baseUrl.startsWith('/')) {
      errors.push('Base URL must start with http://, https://, or / (same-origin proxy)')
    }
```

- [ ] **Step 6: Default the store + embedding config to the proxy**

In `src/app/store.ts`:
- Change the import `import { PROVIDER_PRESETS, type LLMProviderConfig } from '@/llm'` to also pull the default id:

```ts
import { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID, type LLMProviderConfig } from '@/llm'
```

- Replace the initial-state default (`providerConfig: PROVIDER_PRESETS.ollama as LLMProviderConfig,`) with:

```ts
  providerConfig: PROVIDER_PRESETS[DEFAULT_PROVIDER_ID] as LLMProviderConfig,
```

- Replace the load fallback (`(PROVIDER_PRESETS.ollama as LLMProviderConfig)`) with:

```ts
      (PROVIDER_PRESETS[DEFAULT_PROVIDER_ID] as LLMProviderConfig)
```

In `src/rag/embeddings/runtime.ts`, replace:

```ts
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingRuntimeConfig = { backend: 'ollama' }
```

with:

```ts
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingRuntimeConfig = {
  backend: 'openai-compatible',
  baseUrl: '/api/v1',
}
```

- [ ] **Step 7: Run the tests + full suite + typecheck**

Run: `npm test -- src/llm/presets.test.ts src/llm/validation.test.ts src/rag/embeddings/runtime.test.ts`
Expected: PASS.
Run: `npm test`
Expected: all green (catches any test that assumed the old `ollama`/`ollama` defaults — if one fails because it hard-codes the old default, update that test's expectation to the new default and note it).
Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/llm/presets.ts src/llm/presets.test.ts src/llm/index.ts src/llm/validation.ts src/llm/validation.test.ts src/app/store.ts src/rag/embeddings/runtime.ts src/rag/embeddings/runtime.test.ts
git commit -m "feat: default to same-origin OpenAI proxy for grading + embeddings"
```

---

## Task 4: Local-Ollama probe + Settings opt-in (grading only)

**Files:**
- Create: `src/llm/ollamaProbe.ts`, `src/llm/ollamaProbe.test.ts`
- Modify: `src/screens/Settings.tsx`, `src/i18n/locales/{en,ru,ro}.json`

- [ ] **Step 1: Write the failing probe test**

Create `src/llm/ollamaProbe.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { isOllamaReachable } from './ollamaProbe'

describe('isOllamaReachable', () => {
  it('returns true when /api/tags responds ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await isOllamaReachable('http://localhost:11434', 500, fetchImpl)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.anything(),
    )
  })

  it('returns false when the request rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('refused'))
    expect(await isOllamaReachable('http://localhost:11434', 500, fetchImpl)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/llm/ollamaProbe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the probe**

Create `src/llm/ollamaProbe.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/llm/ollamaProbe.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add i18n strings**

In each of `src/i18n/locales/en.json`, `ru.json`, `ro.json`, add these keys inside the existing `"settings"` object (mind the trailing comma on the preceding key):

en.json:
```json
    "ollamaDetected": "Local Ollama detected. Use it for grading instead of the cloud?",
    "useOllamaForGrading": "Use local Ollama for grading"
```
ru.json:
```json
    "ollamaDetected": "Обнаружена локальная Ollama. Использовать её для оценки вместо облака?",
    "useOllamaForGrading": "Использовать локальную Ollama для оценки"
```
ro.json:
```json
    "ollamaDetected": "Ollama locală detectată. O folosești pentru evaluare în loc de cloud?",
    "useOllamaForGrading": "Folosește Ollama locală pentru evaluare"
```

- [ ] **Step 6: Wire the notice into Settings**

In `src/screens/Settings.tsx`:

Add `isOllamaReachable` to the `@/llm` import:

```ts
import {
  PROVIDER_PRESETS,
  isCloudProvider,
  validateProviderConfig,
  isOllamaReachable,
  type LLMProviderConfig,
} from '@/llm'
```

(Ensure `src/llm/index.ts` re-exports `isOllamaReachable` — add `export { isOllamaReachable } from './ollamaProbe'` there if missing.)

Add state + probe near the other hooks (after the `embCfg` state line):

```ts
  const [ollamaAvailable, setOllamaAvailable] = useState(false)
```

Add a probe effect after the existing `useEffect`:

```ts
  useEffect(() => {
    void isOllamaReachable().then(setOllamaAvailable)
  }, [])
```

In the LLM `<section>`, immediately after the provider-description `<p className="muted">…{providerConfig.model}</p>` line, insert:

```tsx
        {ollamaAvailable && providerConfig.id === 'worker' && (
          <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
            <span className="muted">{t('settings.ollamaDetected')}</span>
            <button
              type="button"
              onClick={() => void setProviderConfig(PROVIDER_PRESETS.ollama as LLMProviderConfig)}
            >
              {t('settings.useOllamaForGrading')}
            </button>
          </div>
        )}
```

- [ ] **Step 7: Run suite + typecheck + build**

Run: `npm test`
Expected: all green.
Run: `npm run typecheck`
Expected: exit 0.
Run: `npm run build`
Expected: build succeeds (confirms Settings JSX + i18n compile).

- [ ] **Step 8: Commit**

```bash
git add src/llm/ollamaProbe.ts src/llm/ollamaProbe.test.ts src/llm/index.ts src/screens/Settings.tsx src/i18n/locales/en.json src/i18n/locales/ru.json src/i18n/locales/ro.json
git commit -m "feat: detect local Ollama and offer it for grading"
```

---

## Task 5: Re-seed the Romanian pack with OpenAI embeddings (USER-RUN — needs OpenAI key)

This step calls OpenAI and needs the real key. Run it yourself (or supply the key to the executor). It rewrites `public/packs/romanian.pack.json` so its vectors live in the OpenAI 768-dim space.

**Files:**
- Modify (generated): `public/packs/romanian.pack.json`

- [ ] **Step 1: Re-seed via OpenAI directly (key in env, 768 dims)**

PowerShell (replace the key):

```powershell
$env:EMBED_MODE = "openai-compatible"
$env:EMBED_BASE_URL = "https://api.openai.com/v1"
$env:EMBED_MODEL = "text-embedding-3-small"
$env:EMBED_DIMENSIONS = "768"
$env:EMBED_API_KEY = "sk-...your key..."
npm run seed -- romanian
```

Expected: `[seed] embedding model: text-embedding-3-small (mode=openai-compatible)` then `[seed] wrote …/romanian.pack.json (N chunks)`.

- [ ] **Step 2: Verify the pack space + dimensions**

Run:

```bash
node -e "const p=require('./public/packs/romanian.pack.json');console.log('model',p.embeddingModel,'chunks',p.chunks.length,'allDims768',p.chunks.every(c=>c.embedding.length===768))"
```

Expected: `model text-embedding-3-small chunks 17 allDims768 true`. (Curated chunks only — the corpus import stays deferred.)

- [ ] **Step 3: Clear the env key (hygiene) and commit the pack**

```powershell
Remove-Item Env:EMBED_API_KEY
```

```bash
git add public/packs/romanian.pack.json
git commit -m "data: re-seed romanian pack with text-embedding-3-small@768"
```

---

## Task 6: Deploy to Cloudflare Pages (USER-RUN — needs Cloudflare auth + key)

**Files:**
- Create: `docs/DEPLOY_CLOUDFLARE.md`

- [ ] **Step 1: Write the deploy runbook**

Create `docs/DEPLOY_CLOUDFLARE.md`:

```markdown
# Deploy: Cloudflare Pages + OpenAI proxy

The app is a static Vite PWA; `/api/*` is served by a Cloudflare Pages Function
(`functions/api/[[path]].ts`) that proxies to OpenAI using a project secret.

## One-time setup
1. `npx wrangler login` (or set a `CLOUDFLARE_API_TOKEN` with Pages:Edit).
2. Build: `npm run build`.
3. First deploy (creates the Pages project; pick a name when prompted):
   `npm run cf:deploy`
4. Set the OpenAI key as a Pages **secret** (Production + Preview):
   `npx wrangler pages secret put OPENAI_API_KEY`
   Paste the key when prompted. (Dashboard: Pages → project → Settings →
   Environment variables/secrets also works.)
5. Re-deploy so the Function picks up the secret: `npm run build && npm run cf:deploy`.

## Local dev / re-seeding the proxy
- Create `.dev.vars` (gitignored) with: `OPENAI_API_KEY=sk-...`
- `npm run build && npm run cf:dev` serves the site + Functions at
  http://localhost:8788 (the proxy is at /api/v1).

## Verify after deploy
- Open the Pages URL, start the Romanian mock exam, submit one open item.
- Grading should return a barem result (not the self-assessment fallback) and the
  retrieved-sources panel should show chunks. If grading is self-only, check the
  Function logs (`npx wrangler pages deployment tail`) and that OPENAI_API_KEY is set.
```

- [ ] **Step 2: Deploy (user-run)**

Follow `docs/DEPLOY_CLOUDFLARE.md` steps 1–5. Confirm the site loads at the Pages URL and `/api/v1/chat/completions` returns 200 from the app (network tab) during a grade.

- [ ] **Step 3: Commit the runbook**

```bash
git add docs/DEPLOY_CLOUDFLARE.md
git commit -m "docs: Cloudflare Pages + OpenAI proxy deploy runbook"
```

---

## Self-Review Notes

- **Spec coverage:** proxy Function forcing model+dims + chat allowlist + origin guard (Task 1); embeddings always OpenAI via `/api/v1` (Task 3 embedding default + Task 1 proxy); `worker` preset `apiKeyMode:'proxy'` default (Task 3); relative baseUrl accepted (Task 3 validation); re-seed to text-embedding-3-small@768 (Task 5, enabled by Task 2 dimensions); Ollama detection grading-only (Task 4); graceful fallback unchanged (existing `selfResult`); operational prereqs (Task 6 runbook). All spec sections map to a task.
- **Key-never-in-browser:** key is only ever read in `functions/api` env (Task 1) and the seed env (Task 5, cleared after); `apiKeyMode:'proxy'` means the LLM adapter sends no key from the browser.
- **Type/name consistency:** `handleOpenAiProxy`, `ProxyEnv`, `isOllamaReachable`, `DEFAULT_PROVIDER_ID`, `DEFAULT_EMBEDDING_CONFIG`, preset id `worker`, models `gpt-5.4-mini`/`gpt-5.4-nano`/`text-embedding-3-small` are used identically across tasks.
- **Single embedding space:** Task 4's Ollama switch changes only `providerConfig` (grading); embeddings stay on `/api/v1`, so retrieval keeps matching the OpenAI-seeded pack.
```
