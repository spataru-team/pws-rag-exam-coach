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
| `openai` | OpenAI-compatible (cloud) | `https://api.openai.com/v1` | user_key | cloud |
| `openrouter` | OpenRouter (cloud) | `https://openrouter.ai/api/v1` | user_key | cloud |

The **default** provider is `mock`, which produces deterministic, grounded
answers that cite the chunk ids embedded in the prompt and refuses when no
context is present — mirroring the grounding contract real providers must follow.
This keeps the app fully functional offline and in tests.

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

These are independent:

- **Chat** uses the providers above (`/chat/completions`, or OVMS `/v3/...`).
- **Embeddings** use `bge-m3` via Ollama's native `/api/embeddings`
  (`src/rag/embeddings/ollama.ts`), with a deterministic offline fallback, or any
  OpenAI-compatible `/embeddings` endpoint (OVMS / Workers AI / cloud) via
  `OpenAICompatibleEmbeddingProvider`. See ARCHITECTURE.md.

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
