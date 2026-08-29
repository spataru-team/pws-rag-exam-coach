# LLM Providers

The app uses a provider-neutral adapter built around the OpenAI-compatible chat
shape. Providers are configuration (`LLMProviderConfig`), and a single
`OpenAICompatibleAdapter` serves every HTTP provider; the mock provider is
separate.

## `LLMProviderConfig`

(`src/llm/types.ts`)

| field | meaning |
|-------|---------|
| `id`, `kind`, `name` | identity |
| `baseUrl` | endpoint base (empty for mock) |
| `apiKeyMode` | `none \| user_key \| proxy` |
| `model` | model name |
| `supportsStreaming`, `supportsJsonMode` | capabilities |
| `locality` | `local \| cloud` — drives the cloud warning |

## Built-in presets

(`src/llm/presets.ts`)

| id | name | baseUrl | key mode | locality |
|----|------|---------|----------|----------|
| `mock` | Mock (offline demo) | — | none | local |
| `worker` | OpenAI-compatible (cloud) | `/api/v1` (same-origin proxy) | proxy | cloud |
| `ollama` | Ollama (local) | `http://localhost:11434/v1` | none | local |
| `lmstudio` | LM Studio (local) | `http://localhost:1234/v1` | none | local |
| `openvino` | OpenVINO (local, OVMS) | `http://localhost:8000/v3` | none | local |
| `openai` | OpenAI (your key) | `https://api.openai.com/v1` | user_key | cloud |
| `openrouter` | OpenRouter (cloud) | `https://openrouter.ai/api/v1` | user_key | cloud |

`worker` proxies to the Cloudflare Pages Function in `functions/api/` (chat →
OpenAI, embeddings/rerank → Workers AI), which injects the server-side keys — so
it only exists on the deployed site or under `npm run cf:dev`.

### First-run default — capability-aware, not a single constant

Onboarding does **not** hard-code one default. A fresh session starts on
**`mock`** — deterministic, grounded, on-device (it cites the chunk ids in the
prompt and refuses when no context is present), so the app is fully functional
offline and in tests. `src/screens/Onboarding.tsx` then runs a lightweight
non-generative probe (`src/llm/proxyProbe.ts` → `GET /api/v1/health`) and pulls
the initial selection up to **`worker`** *only* when a configured same-origin
proxy actually answers:

| how it's run | `/api/v1/health` | initial provider |
|---|---|---|
| `npm run dev` / `npm run preview` (this repo) | no Function → 404 | **`mock`** |
| `npm run build && npm run cf:dev` **without** `.dev.vars` | `{ available: true, configured: false }` | **`mock`** |
| `npm run build && npm run cf:dev` **with** `.dev.vars`, or the deployed site | `{ available: true, configured: true }` | **`worker`** (cloud warning shown) |

A provider the user selects by hand is never overridden by the probe. The
`DEFAULT_PROVIDER_ID = 'worker'` constant is only the store's pre-onboarding
fallback and the deployed default — not what a local first run lands on.

If a selected provider can't be reached, Practice shows a clear
"AI provider unavailable" notice (`TutorResponse.providerError`) — it never fails
silently.

## OpenVINO (optimized local inference)

OpenVINO support is built in at the architecture level for local inference via
**OpenVINO Model Server (OVMS)**, which can target Intel CPU, GPU or NPU. What has
actually been run, and on which hardware, is in
[INTEL_OPENVINO.md](./INTEL_OPENVINO.md):

- **Chat:** OVMS exposes an OpenAI-compatible API (`/v3/chat/completions`), so the
  `openvino` preset reuses `OpenAICompatibleAdapter` with **no dedicated adapter
  code**. Point `baseUrl` at your OVMS instance and set `model` to the served model.
- **Embeddings:** use `OpenAICompatibleEmbeddingProvider`
  (`src/rag/embeddings/openaiCompatible.ts`) against OVMS `/v3/embeddings`. The
  served model's output length must match the pack's `embeddingDim` (default
  1024, `bge-m3`), and packs must be seeded with that same model — not just the
  same dimension, see ARCHITECTURE.md §RAG
  (`resolveEmbeddingProvider({ mode: 'openai-compatible', openaiCompatible: {...} })`).

This is the same OpenAI-compatible embedding hook that also fits Cloudflare
Workers AI and OpenAI embeddings — no per-backend adapter needed.

**Run it:** a ready compose file + setup is in [`ovms/`](../ovms/README.md):

```bash
docker compose -f ovms/docker-compose.yml up -d
EMBED_MODE=openai-compatible EMBED_BASE_URL=http://localhost:8000/v3 \
EMBED_MODEL=bge-m3 npm run seed   # seed packs with OVMS embeddings
```

## Embeddings vs chat

These are independent — the chat provider above has no effect on which embedder
runs.

- **Chat** uses the providers above (`/chat/completions`, or OVMS `/v3/...`).
- **Embeddings** are chosen by `selectEmbedder` (`src/rag/embeddings/runtime.ts`)
  from the pack's own `embeddingModel` plus the Settings "Embeddings" backend:
  - a pack seeded with `deterministic-stub` (what `npm run seed` produces when no
    embedding backend is reachable) **always** uses the offline deterministic
    stub — no network, works for the Quick-Start clean-clone flow;
  - a real (e.g. `bge-m3`) pack uses the configured backend. That backend
    defaults to the **same-origin `/api/v1` proxy** (`DEFAULT_EMBEDDING_CONFIG`
    in `src/rag/embeddings/runtime.ts` — `{ backend: 'openai-compatible',
    baseUrl: '/api/v1' }`); Ollama's native `/api/embeddings` and any
    OpenAI-compatible `/embeddings` endpoint (OVMS / Workers AI) are the
    alternatives, selectable in Settings.

  So on a plain `npm run dev` with stub-seeded packs, retrieval works fully
  offline; a `bge-m3` pack there would need a reachable embeddings backend (it
  degrades to an "embedding service unavailable" notice otherwise). See
  ARCHITECTURE.md §RAG.

## Keys and safety

- `apiKeyMode: user_key` providers require a key, entered in Settings and stored
  only in local IndexedDB. Never hardcoded or committed.
- `validateProviderConfig` returns errors (bad/missing base URL or model) and
  warnings (cloud data egress, missing key). The UI surfaces both.
- Cloud providers display a visible warning before use.

## Prompting

- `promptTemplates/generic.ts` — shared grounding contract (cite `[#id]`, never
  invent facts/rules/dates, refuse on insufficient evidence, support language).
- `promptTemplates/subjects.ts` — per-subject rules (e.g. Romanian: explain in
  Russian but keep correct Romanian examples with diacritics; History/Biology:
  never invent facts/dates).
- `buildFeedbackPrompt` assembles system (generic + subject) + user (context +
  question + answer + task) messages. The prompt version is recorded on every
  `LearningEvent` and `ModelRunMetrics` for reproducibility.
