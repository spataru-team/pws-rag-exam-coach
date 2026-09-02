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
| `ollama` | Ollama (local) | `http://localhost:11434/v1` | none | local |
| `lmstudio` | LM Studio (local) | `http://localhost:1234/v1` | none | local |
| `openvino` | OpenVINO (local, OVMS) | `http://localhost:8000/v3` | none | local |
| `openai` | OpenAI (your key) | `https://api.openai.com/v1` | user_key | cloud |
| `openrouter` | OpenRouter (cloud) | `https://openrouter.ai/api/v1` | user_key | cloud |
| `worker` | OpenAI-compatible (cloud) | `/api/v1` (same-origin proxy) | proxy | cloud |

**Managed embeddings and managed chat are independent capabilities.** The
Cloudflare Pages Function proxy (`functions/api/`) has two separate branches:
`/api/v1/embeddings` (+ `/rerank`) → Workers AI, and `/api/v1/chat/completions` →
OpenAI. Each checks only its own secret. `GET /api/v1/health` reports them
separately: `{ available, embeddingsConfigured, chatConfigured }`.

`worker` is the **managed chat** provider. It stays in the codebase as an option
for a controlled / private deployment; it is shown in Onboarding and Settings
**only when `chatConfigured` is true**, and it is **never auto-selected**. The
public deployment runs with managed chat disabled (`OPENAI_API_KEY` unset), so
`worker` is hidden there and `/api/v1/chat/completions` returns a clean `503`.

### First-run default — always Mock

A fresh session always starts on **`mock`** — deterministic, grounded, on-device
(it cites the chunk ids in the prompt and refuses when no context is present), so
the whole diagnose → rubric → Rescue → forecast workflow is inspectable offline,
in tests, and on the deployed site with no key and no team-funded spend.
`src/screens/Onboarding.tsx` runs a lightweight non-generative probe
(`src/llm/proxyProbe.ts` → `GET /api/v1/health`) only to decide whether to
*offer* `worker`; it never changes the selection.

| how it's run | `/api/v1/health` | initial provider |
|---|---|---|
| `npm run dev` / `npm run preview` (this repo) | no Function → 404 | **`mock`** |
| `npm run build && npm run cf:dev` embeddings-only, or the public deployment | `{ embeddingsConfigured: true, chatConfigured: false }` | **`mock`** (`worker` not offered) |
| a private deployment with `OPENAI_API_KEY` set | `{ …, chatConfigured: true }` | **`mock`** (`worker` offered, still not auto-selected) |

Real public cloud chat is **BYOK** — `openai` / `openrouter` with the visitor's
own key, entered in Settings, stored only in local IndexedDB, behind the existing
cloud-egress warning. A provider the user selects by hand is never overridden by
the probe. `DEFAULT_PROVIDER_ID = 'mock'`.

> **Pending verification.** These providers make a cross-origin request with the
> user's key straight from the browser. OpenRouter documents browser/CORS
> support; a direct `api.openai.com` call from a Pages origin is **not yet
> verified**. Until a keyed deployed-browser check is recorded (see
> `docs/JUDGE_REPRODUCIBILITY.md` §"BYOK in the deployed browser"), treat
> **OpenRouter** as the supported in-browser BYOK path; an OpenAI key works with
> a local run or your own proxy. There is no team-funded managed-chat fallback.

A persisted `worker` selection from a deployment that no longer offers managed
chat resolves to `mock` for that session; the stored choice is left untouched and
reactivates on a deployment that has `chatConfigured`.

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

### What leaves the device

The chat prompt reaches an **external cloud provider** only when the user
explicitly selects a BYOK cloud provider (`openai` / `openrouter`). With local
providers such as **OpenVINO/OVMS** (or Ollama / LM Studio), prompts remain
within the local machine or the school network — a local OVMS request is **not**
external-cloud egress. With **Mock**, nothing leaves the device.

On the public deployment, managed chat is disabled, so no prompt reaches an
external chat model. **Managed embeddings send only the retrieval query text to
Workers AI** — the student's question in Practice, and the task prompt together
with the student's answer when retrieving grounding passages for grading. The
stored chunk vectors are already in the downloaded pack, so chunk text is not
sent at runtime.

### Public-endpoint request guardrails

The proxy validates the request shape, caps the proxied body at 32 KiB, applies a
20 s upstream timeout (`504` on exceed), forces the chat model allowlist,
`n: 1`, non-streaming and a 512-token output cap, and rejects cross-origin
calls. It logs no secret, IP, prompt or answer. This is the intended public
deployment architecture.

## Prompting

- `promptTemplates/generic.ts` — shared grounding contract (cite `[#id]`, never
  invent facts/rules/dates, refuse on insufficient evidence, support language).
- `promptTemplates/subjects.ts` — per-subject rules (e.g. Romanian: explain in
  Russian but keep correct Romanian examples with diacritics; History/Biology:
  never invent facts/dates).
- `buildFeedbackPrompt` assembles system (generic + subject) + user (context +
  question + answer + task) messages. The prompt version is recorded on every
  `LearningEvent` and `ModelRunMetrics` for reproducibility.
