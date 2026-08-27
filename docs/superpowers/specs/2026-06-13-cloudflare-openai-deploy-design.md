# Cloudflare Pages + OpenAI proxy deployment — design

**Date:** 2026-06-13
**Status:** Approved (design)
**Goal:** Deploy the mock-exam pilot as a public Cloudflare Pages site whose embedding
and grading calls are backed by OpenAI through a same-origin Pages Function proxy, so
the OpenAI key never reaches the browser. Target: the grade-9 Romanian pilot (exam
15 Jun 2026).

## Problem & constraints

- The app is a static Vite PWA. Its retrieval needs query embeddings in the **same
  space** as the pack vectors, and barem grading needs an LLM. Both currently default to
  local Ollama (`http://localhost:11434`), which students hitting a hosted HTTPS site
  cannot reach (wrong host + mixed-content block).
- An OpenAI API key **must not** be shipped in static frontend code.
- The pack holds exactly **one** embedding space. Hosted students have no local
  embedder, so that space must be OpenAI. Therefore: **embeddings are always OpenAI;
  the "use local Ollama" option applies to the grading LLM only.**

## Chosen approach: Cloudflare Pages + Pages Functions proxy

Cloudflare **Pages Functions** (a Worker co-located with the Pages project) expose the
proxy at `/api/*` on the **same origin** as the static site — one `wrangler pages deploy`,
no CORS, no second URL to configure. The OpenAI key is a Pages project **secret**.

Rejected: a standalone Worker on its own subdomain (extra deploy + CORS/origin config for
no benefit here); key-in-build (exposes the key); per-user keys in Settings (students
would each need a key).

## Architecture — three units

### 1. Proxy — `functions/api/[[path]].ts` (Cloudflare Pages Function)
- Reads `OPENAI_API_KEY` from the Function environment (Pages secret); never returned to
  the client.
- `POST /api/v1/embeddings` → forwards to `https://api.openai.com/v1/embeddings`, forcing
  `model = "text-embedding-3-small"` and `dimensions = 768` (ignoring/overriding whatever
  the client sent), so every embedding matches the pack's 768-dim space.
- `POST /api/v1/chat/completions` → forwards to OpenAI, default model `gpt-5.4-mini`;
  only an allowlist `{gpt-5.4-mini, gpt-5.4-nano}` is accepted (else coerced to the
  default).
- Light abuse guard: reject requests whose `Origin` is not the site's own origin.
  Pass OpenAI's status/body through on error.
- Same-origin ⇒ no CORS headers needed for the app; an `OPTIONS` handler is included for
  safety.

### 2. Frontend config (defaults)
- New LLM preset in `src/llm/presets.ts`:
  `worker` → `{ kind: 'openai', apiKeyMode: 'proxy', baseUrl: '/api/v1',
  model: 'gpt-5.4-mini', locality: 'cloud', supportsJsonMode: true }`.
  Set `DEFAULT_PROVIDER_ID = 'worker'`.
- Default embedding runtime config → openai-compatible, `baseUrl: '/api/v1'`,
  `model: 'text-embedding-3-small'`. The relative URL resolves to the Pages origin in the
  browser; the Function injects `dimensions: 768`, so the existing
  `OpenAICompatibleEmbeddingProvider` needs no change.
- Because `apiKeyMode: 'proxy'`, the Settings screen shows no API-key field for this
  provider and no per-user key is required.

### 3. Re-seeded pack
- Re-embed `public/packs/romanian.pack.json` (17 curated + pr26 chunks) with
  `text-embedding-3-small` @ 768 dims; set `embeddingModel: 'text-embedding-3-small'`.
- Seeding runs locally against the same Function via `wrangler pages dev` (serves
  `functions/` with the secret from a gitignored `.dev.vars`):
  `EMBED_MODE=openai-compatible EMBED_BASE_URL=http://localhost:8788/api/v1
  EMBED_MODEL=text-embedding-3-small npm run seed -- romanian`.
  No key in the seed environment; the Function is the single source of truth for model +
  dimensions.

## Ollama detection (grading LLM only)

On app load / in Settings, probe a local Ollama (`GET http://localhost:11434/api/tags`,
short timeout, failure = absent). If reachable **and** the active provider is `worker`,
surface a one-time prompt: *"Local Ollama detected — use it for grading instead of the
cloud?"* Accepting switches `providerConfig` to the `ollama` preset (grading only) and
persists the choice; declining keeps `worker`. Embeddings are unaffected (stay on the
OpenAI proxy) to preserve retrieval-space consistency. On a hosted HTTPS site the probe
typically fails (mixed-content / no localhost), so the prompt is effectively a
local-run convenience.

## Data flow (grading)

answer → retrieve: embed query via `/api/v1/embeddings` (→ OpenAI @768) → top-4
subject-wide over the pack → build barem prompt → `gpt-5.4-mini` via
`/api/v1/chat/completions` → strict JSON parse. Any failure (proxy down, invalid JSON,
blank answer) degrades to the existing deterministic/self-assessment path, so the mock
never blocks.

## Error handling

- Proxy passes through OpenAI non-2xx status and body; network errors → 502.
- Embedding failure → retrieval returns `unavailable` (existing behavior; UI tells the
  user the service is unavailable rather than implying missing material).
- Grading failure → `selfResult` fallback (already implemented).

## Testing

- Unit (vitest, with a stubbed `fetch`): Function routing — embeddings request is rewritten
  to force model + `dimensions: 768`; chat model allowlist coercion; non-matching `Origin`
  rejected; upstream error status propagated.
- Unit: `worker` preset shape + `DEFAULT_PROVIDER_ID`; default embedding config points at
  `/api/v1` + `text-embedding-3-small`.
- Re-seed verification: regenerated pack has `embeddingModel: 'text-embedding-3-small'` and
  every `embedding.length === 768`.
- Ollama-detect: probe returns absent on fetch rejection; prompt only when provider is
  `worker` and probe succeeds.
- Manual E2E after deploy: load the Pages URL, run one mock-exam item, confirm grading
  returns a barem result (not self-fallback) and retrieval surfaces chunks.

## Operational prerequisites (user-performed)

- Cloudflare auth: `wrangler login` or a Cloudflare API token with Pages:Edit.
- Set the secret: `wrangler pages secret put OPENAI_API_KEY` (and `.dev.vars` locally for
  seeding/dev).
- Pages project name / domain is chosen at deploy; the app uses the relative `/api/v1`, so
  no domain is hardcoded.

## Out of scope

- A fully-local mode with Ollama/nomic **embeddings** (would need a second nomic-seeded
  pack). Deferred.
- Corpus import (separately deferred — source text corrupt; see
  `2026-06-13-romanian-corpus-import-design.md`).
- Rate limiting / auth beyond the origin check; usage dashboards.
- Other subjects; multi-region; custom domain setup.
